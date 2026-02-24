import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import OpenAI from "openai";
import { getSystemPrompt, getOpenAIApiKey } from "@/lib/ai-settings";

const MAX_ITEMS = 400;

export interface PreviewCluster {
  title: string;
  description: string;
  productId?: string | null;
  feedbackItems: { id: string; title: string }[];
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const selectedIds: string[] | undefined =
      Array.isArray(body.ids) && body.ids.length > 0 ? body.ids : undefined;

    // Resolve API key and system prompt from DB (with env fallback)
    const [apiKey, systemPrompt, allProducts] = await Promise.all([
      getOpenAIApiKey(),
      getSystemPrompt(),
      prisma.product.findMany({ select: { id: true, name: true, description: true } }),
    ]);

    if (!apiKey) {
      return NextResponse.json(
        { error: "No OpenAI API key configured. Add one in Settings → Auto-group feedback." },
        { status: 400 }
      );
    }

    const openai = new OpenAI({ apiKey });

    // Fetch feedback items — either the selected subset or all unassigned
    const unassigned = await prisma.feedbackItem.findMany({
      where: selectedIds
        ? { id: { in: selectedIds } }
        : { opportunityLinks: { none: {} } },
      select: { id: true, title: true, description: true },
      orderBy: { createdAt: "desc" },
      take: MAX_ITEMS,
    });

    if (unassigned.length === 0) {
      return NextResponse.json({ message: "No unassigned feedback to cluster.", clusters: [] });
    }

    const itemList = unassigned
      .map((item, i) => {
        const desc = item.description ? ` — ${item.description.slice(0, 150)}` : "";
        return `[${i}] ${item.title}${desc}`;
      })
      .join("\n");

    // Build optional product context section
    const productSection = allProducts.length > 0
      ? `\nAvailable products — assign each opportunity to the best-fit productId, or null if none fits:\n${allProducts
          .map((p) => `- "${p.id}": ${p.name}${p.description ? ` — ${p.description}` : ""}`)
          .join("\n")}\n`
      : "";

    const productIdField = allProducts.length > 0
      ? `\n      "productId": "<product id from the list above, or null>",`
      : "";

    const userPrompt = `Here are ${unassigned.length} unassigned customer feedback items (format: [index] title — description):

${itemList}
${productSection}
Group them into opportunity themes. Respond with this exact JSON structure:
{
  "opportunities": [
    {
      "title": "Short opportunity title",
      "description": "1-2 sentence description of the theme",${productIdField}
      "feedbackIndices": [0, 3, 7, 12]
    }
  ]
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: { opportunities?: { title: string; description: string; productId?: string | null; feedbackIndices: number[] }[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("Failed to parse OpenAI response:", raw);
      return NextResponse.json({ error: "AI returned invalid JSON" }, { status: 500 });
    }

    const rawClusters = parsed.opportunities ?? [];
    const validProductIds = new Set(allProducts.map((p) => p.id));

    // Resolve indices → actual feedback items (no DB writes)
    const clusters: PreviewCluster[] = rawClusters.map((cluster) => {
      const validIndices = (cluster.feedbackIndices ?? []).filter(
        (i) => typeof i === "number" && i >= 0 && i < unassigned.length
      );
      const seen = new Set<string>();
      const feedbackItems = validIndices
        .map((i) => ({ id: unassigned[i].id, title: unassigned[i].title }))
        .filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });

      // Only accept productId if it's a valid known product
      const productId =
        cluster.productId && validProductIds.has(cluster.productId)
          ? cluster.productId
          : null;

      return {
        title: cluster.title,
        description: cluster.description || "",
        productId,
        feedbackItems,
      };
    });

    return NextResponse.json({
      clusters,
      totalFeedback: unassigned.length,
    });
  } catch (error) {
    console.error("Error in preview-cluster:", error);
    return NextResponse.json({ error: "Preview failed" }, { status: 500 });
  }
}
