import OpenAI from "openai";
import { prisma } from "@/lib/db";
import { getOpenAIApiKey } from "@/lib/ai-settings";
import { cosineSimilarity, generateEmbedding, parseEmbedding } from "@/lib/semantic";

// Cosine similarity threshold to add an idea to an existing opportunity
const OPPORTUNITY_MATCH_THRESHOLD = 0.55;

const inFlightByOrg = new Set<string>();

const GENERIC_PREFIXES = ["enhance", "improve", "streamline", "integrated", "better", "comprehensive"];

function buildOpportunityTitle(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim().replace(/[.?!]+$/, "");
  return clean.split(" ").slice(0, 8).join(" ").slice(0, 90) || "New opportunity";
}

function isGenericTitle(title: string): boolean {
  const normalized = title.toLowerCase().trim();
  if (normalized.length < 16) return true;
  if (GENERIC_PREFIXES.some((p) => normalized.startsWith(p))) return true;
  return normalized.split(/\s+/).length < 3;
}

async function classifyOpportunityProduct(params: {
  organizationId: string;
  opportunityTitle: string;
  ideas: string[];
  products: { id: string; name: string; description: string | null }[];
}): Promise<string | null> {
  if (params.products.length === 0) return null;
  const apiKey = await getOpenAIApiKey(params.organizationId);
  if (!apiKey) return null;

  const openai = new OpenAI({ apiKey });
  try {
    const productList = params.products
      .map((p, i) => `${i + 1}. id=${p.id} | ${p.name}${p.description ? ` — ${p.description}` : ""}`)
      .join("\n");
    const ideaSnippet = params.ideas.slice(0, 5).map((t, i) => `${i + 1}. ${t}`).join("\n");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'You are a product manager. Given an opportunity and customer ideas, pick the BEST matching product from the list, or "none" if nothing fits well. Return JSON only: {"productId":"<id or none>"}',
        },
        {
          role: "user",
          content: `Opportunity: "${params.opportunityTitle}"\n\nIdeas:\n${ideaSnippet}\n\nProducts:\n${productList}`,
        },
      ],
    });
    const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}") as { productId?: string };
    const pid = (parsed.productId ?? "").trim();
    if (!pid || pid === "none") return null;
    return params.products.some((p) => p.id === pid) ? pid : null;
  } catch {
    return null;
  }
}

export async function generateOpportunityTitle(params: {
  organizationId: string;
  ideas: string[];
  fallback: string;
}): Promise<string> {
  const apiKey = await getOpenAIApiKey(params.organizationId);
  if (!apiKey) return params.fallback;

  const openai = new OpenAI({ apiKey });
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'You are a product manager naming a customer opportunity. Write a title that describes who has what problem or need — specific, no filler words, no solution prescriptions, max 150 characters. Use plain language. Return JSON only: {"title":"..."}',
        },
        {
          role: "user",
          content: params.ideas
            .slice(0, 6)
            .map((t, i) => `${i + 1}. ${t}`)
            .join("\n"),
        },
      ],
    });
    const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}") as { title?: string };
    const title = (parsed.title ?? "").trim().slice(0, 150);
    return title && !isGenericTitle(title) ? title : params.fallback;
  } catch {
    return params.fallback;
  }
}

type PendingOpp = {
  vector: number[];
  ideaIds: string[];
  ideaTexts: string[];
};

export async function groupNewIdeasIntoOpportunities(organizationId: string): Promise<void> {
  // Fetch ideas that haven't been assigned to any opportunity yet
  const unroutedIdeas = await prisma.idea.findMany({
    where: { organizationId, opportunityLinks: { none: {} } },
    select: { id: true, text: true, embedding: true, feedbackItemId: true },
  });

  if (unroutedIdeas.length === 0) return;

  // Load products for classification
  const products = await prisma.product.findMany({
    where: { organizationId },
    select: { id: true, name: true, description: true },
  });

  // Load active (not archived) opportunities with embeddings
  const activeOpportunities = await prisma.opportunity.findMany({
    where: { organizationId, status: { not: "archived" } },
    select: { id: true, title: true, semanticEmbedding: true },
  });

  // Unified vector list for matching — existing opps have a real DB id, pending ones use a negative index sentinel
  type VectorEntry = { kind: "existing"; id: string; vector: number[] } | { kind: "pending"; idx: number; vector: number[] };
  const vectorList: VectorEntry[] = activeOpportunities
    .map((o) => {
      const vector = parseEmbedding(o.semanticEmbedding);
      return vector ? ({ kind: "existing" as const, id: o.id, vector }) : null;
    })
    .filter((o): o is VectorEntry & { kind: "existing" } => Boolean(o));

  // Ideas matched to pre-existing opportunities
  const existingOppLinks = new Map<string, string[]>();
  // New opportunities buffered in memory — NOT written to DB yet
  const pendingOpps: PendingOpp[] = [];

  // Generate missing embeddings in small parallel batches to avoid exhausting the DB connection pool
  const EMBED_BATCH = 5;
  for (let i = 0; i < unroutedIdeas.length; i += EMBED_BATCH) {
    const batch = unroutedIdeas.slice(i, i + EMBED_BATCH);
    await Promise.all(
      batch.map(async (idea) => {
        if (!parseEmbedding(idea.embedding)) {
          const vector = await generateEmbedding(organizationId, idea.text);
          if (vector) {
            idea.embedding = vector as unknown as typeof idea.embedding;
            await prisma.idea.update({ where: { id: idea.id }, data: { embedding: vector } });
          }
        }
      })
    );
  }

  // Assign each idea to the best matching opportunity (sequential — order matters for clustering)
  for (const idea of unroutedIdeas) {
    const vector = parseEmbedding(idea.embedding);
    if (!vector) continue;

    // Find the best match across existing and pending opportunities
    let bestEntry: VectorEntry | null = null;
    let bestScore = 0;
    for (const entry of vectorList) {
      const score = cosineSimilarity(vector, entry.vector);
      if (score > bestScore) {
        bestScore = score;
        bestEntry = entry;
      }
    }

    if (bestEntry && bestScore >= OPPORTUNITY_MATCH_THRESHOLD) {
      if (bestEntry.kind === "existing") {
        const arr = existingOppLinks.get(bestEntry.id) ?? [];
        arr.push(idea.id);
        existingOppLinks.set(bestEntry.id, arr);
      } else {
        pendingOpps[bestEntry.idx].ideaIds.push(idea.id);
        pendingOpps[bestEntry.idx].ideaTexts.push(idea.text);
      }
    } else {
      // Buffer a new pending opportunity — no DB write yet
      const idx = pendingOpps.length;
      pendingOpps.push({ vector, ideaIds: [idea.id], ideaTexts: [idea.text] });
      vectorList.push({ kind: "pending", idx, vector });
    }
  }

  // Persist links to pre-existing opportunities
  for (const [oppId, ideaIds] of Array.from(existingOppLinks.entries())) {
    await prisma.ideaOpportunity.createMany({
      data: ideaIds.map((ideaId) => ({ ideaId, opportunityId: oppId, organizationId })),
      skipDuplicates: true,
    });
  }

  // Generate titles + classify products in small parallel batches to stay within DB connection limits
  const AI_BATCH = 5;
  const resolvedPending: Array<PendingOpp & { title: string; productId: string | null }> = [];
  for (let i = 0; i < pendingOpps.length; i += AI_BATCH) {
    const batch = pendingOpps.slice(i, i + AI_BATCH);
    const results = await Promise.all(
      batch.map(async (pending) => {
        const fallback = buildOpportunityTitle(pending.ideaTexts[0]);
        const title = await generateOpportunityTitle({ organizationId, ideas: pending.ideaTexts, fallback });
        const productId = products.length > 0
          ? await classifyOpportunityProduct({ organizationId, opportunityTitle: title, ideas: pending.ideaTexts, products })
          : null;
        return { ...pending, title, productId };
      })
    );
    resolvedPending.push(...results);
  }

  // Write all new opportunities to DB now that titles are ready
  for (const resolved of resolvedPending) {
    await prisma.opportunity.create({
      data: {
        organizationId,
        title: resolved.title,
        status: "not_on_roadmap",
        confidence: Math.min(1, 0.35 + resolved.ideaIds.length * 0.1),
        semanticEmbedding: resolved.vector,
        productId: resolved.productId ?? null,
        ideaLinks: { create: resolved.ideaIds.map((ideaId) => ({ ideaId, organizationId })) },
      },
    });
  }

  // Refresh title + confidence for pre-existing opportunities that received new ideas
  if (existingOppLinks.size === 0) return;

  const existingImpacted = await prisma.opportunity.findMany({
    where: { organizationId, id: { in: Array.from(existingOppLinks.keys()) } },
    select: {
      id: true,
      title: true,
      productId: true,
      ideaLinks: { select: { idea: { select: { text: true } } } },
    },
  });

  for (let i = 0; i < existingImpacted.length; i += AI_BATCH) {
    const batch = existingImpacted.slice(i, i + AI_BATCH);
    await Promise.all(
      batch.map(async (opp) => {
        const ideaTexts = opp.ideaLinks.map((l) => l.idea.text);
        const nextTitle = await generateOpportunityTitle({ organizationId, ideas: ideaTexts, fallback: opp.title });

        let productId: string | null | undefined = undefined;
        if (!opp.productId && products.length > 0) {
          productId = await classifyOpportunityProduct({ organizationId, opportunityTitle: nextTitle, ideas: ideaTexts, products });
        }

        await prisma.opportunity.update({
          where: { id: opp.id },
          data: {
            title: nextTitle,
            confidence: Math.min(1, 0.35 + ideaTexts.length * 0.1),
            ...(productId !== undefined ? { productId } : {}),
          },
        });
      })
    );
  }
}

export function enqueueOpportunityGrouping(organizationId: string): void {
  if (inFlightByOrg.has(organizationId)) return;
  inFlightByOrg.add(organizationId);
  setTimeout(async () => {
    try {
      await groupNewIdeasIntoOpportunities(organizationId);
    } catch (error) {
      console.error("Opportunity grouping failed:", error);
    } finally {
      inFlightByOrg.delete(organizationId);
    }
  }, 0);
}
