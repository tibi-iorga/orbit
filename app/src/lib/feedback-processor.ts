import OpenAI from "openai";
import { prisma } from "@/lib/db";
import { getOpenAIApiKey } from "@/lib/ai-settings";
import { generateEmbedding } from "@/lib/semantic";
import { enqueueOpportunityGrouping } from "@/lib/opportunity-grouper";

const PROCESS_BATCH_SIZE = 30;

type ProcessedChunk = {
  text: string;
  confidence: number;
};

const inFlightByOrg = new Set<string>();

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function buildFallbackSummary(title: string, description: string | null): string {
  const source = normalizeText(`${title}${description ? ` - ${description}` : ""}`);
  return source.slice(0, 280);
}

async function extractChunksWithAI(params: {
  organizationId: string;
  row: { id: string; title: string; description: string | null };
}): Promise<ProcessedChunk[]> {
  const apiKey = await getOpenAIApiKey(params.organizationId);
  if (!apiKey) return [];

  const openai = new OpenAI({ apiKey });
  const inputText = buildFallbackSummary(params.row.title, params.row.description);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'You extract atomic product feedback points for a product team. Each point may be a feature request, bug report, complaint, improvement suggestion, or pain point. Extract each distinct idea as a separate chunk. Return one chunk per atomic idea — if the feedback contains one idea return one chunk, if it contains three return three. Keep each chunk concrete and specific, no generic wording. Return JSON only: {"chunks":[{"text":"...","confidence":0.0}]}',
        },
        {
          role: "user",
          content: `Extract each distinct product feedback point (feature request, bug, complaint, improvement, or pain point) from this feedback. Keep them specific — no generic wording.\n\n${inputText}`,
        },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as {
      chunks?: Array<{ text?: string; confidence?: number }>;
    };

    const chunks: ProcessedChunk[] = (parsed.chunks ?? [])
      .map((c) => ({
        text: normalizeText(String(c.text ?? "")).slice(0, 1000),
        confidence: Math.max(0, Math.min(1, Number(c.confidence ?? 0.6))),
      }))
      .filter((c) => c.text.length > 0);

    return chunks;
  } catch (error) {
    console.error("Feedback chunk extraction failed:", error);
    return [];
  }
}

export async function processPendingFeedbackForOrganization(params: {
  organizationId: string;
  feedbackIds?: string[];
}): Promise<number> {
  const { organizationId, feedbackIds } = params;
  let processed = 0;

  while (true) {
    const where = {
      organizationId,
      status: "new",
      processingStatus: "not_processed",
      ...(feedbackIds && feedbackIds.length > 0 ? { id: { in: feedbackIds } } : {}),
    };

    const batch = await prisma.feedbackItem.findMany({
      where,
      select: { id: true, title: true, description: true },
      orderBy: { createdAt: "asc" },
      take: PROCESS_BATCH_SIZE,
    });

    if (batch.length === 0) break;

    const selectedIds = batch.map((row) => row.id);
    await prisma.feedbackItem.updateMany({
      where: { organizationId, id: { in: selectedIds }, processingStatus: "not_processed" },
      data: { processingStatus: "processing", processingError: null },
    });
    const claimedRows = await prisma.feedbackItem.findMany({
      where: { organizationId, id: { in: selectedIds }, processingStatus: "processing", status: "new" },
      select: { id: true },
    });
    const claimedIds = new Set(claimedRows.map((row) => row.id));
    if (claimedIds.size === 0) continue;

    const claimedBatch = batch.filter((row) => claimedIds.has(row.id));
    const processedAt = new Date();

    for (const row of claimedBatch) {
      const aiChunks = await extractChunksWithAI({ organizationId, row });
      const chunks: ProcessedChunk[] =
        aiChunks.length > 0
          ? aiChunks
          : [{ text: buildFallbackSummary(row.title, row.description), confidence: 0.45 }];

      // Delete any stale ideas from a previous failed attempt
      await prisma.idea.deleteMany({ where: { feedbackItemId: row.id } });

      // Embed each idea and collect for bulk insert
      const ideaRows: Array<{
        organizationId: string;
        feedbackItemId: string;
        text: string;
        embedding?: number[];
        index: number;
        source: string;
      }> = [];
      for (let i = 0; i < chunks.length; i++) {
        const embedding = await generateEmbedding(organizationId, chunks[i].text);
        ideaRows.push({
          organizationId,
          feedbackItemId: row.id,
          text: chunks[i].text,
          ...(embedding ? { embedding } : {}),
          index: i,
          source: "ai_extracted",
        });
      }

      await prisma.idea.createMany({ data: ideaRows });

      // Keep processedSummary on FeedbackItem as the first chunk for display purposes
      const primaryText = chunks[0].text;
      const avgConfidence = chunks.reduce((sum, c) => sum + c.confidence, 0) / chunks.length;

      const result = await prisma.feedbackItem.updateMany({
        where: { id: row.id, organizationId, processingStatus: "processing", status: "new" },
        data: {
          processingStatus: "processed",
          processedSummary: primaryText,
          processedConfidence: avgConfidence,
          processedAt,
          processingError: null,
        },
      });
      if (result.count > 0) processed += 1;
    }
  }

  return processed;
}

export function enqueueFeedbackProcessing(organizationId: string, feedbackIds?: string[]): void {
  if (inFlightByOrg.has(organizationId)) return;
  inFlightByOrg.add(organizationId);

  setTimeout(async () => {
    try {
      const processed = await processPendingFeedbackForOrganization({ organizationId, feedbackIds });
      if (processed > 0) enqueueOpportunityGrouping(organizationId);
    } catch (error) {
      console.error("Feedback processing failed:", error);
      try {
        await prisma.feedbackItem.updateMany({
          where: {
            organizationId,
            processingStatus: "processing",
            ...(feedbackIds && feedbackIds.length > 0 ? { id: { in: feedbackIds } } : {}),
          },
          data: {
            processingStatus: "failed",
            processingError: error instanceof Error ? error.message.slice(0, 500) : "Processing failed",
          },
        });
      } catch (innerError) {
        console.error("Failed to mark feedback as failed:", innerError);
      }
    } finally {
      inFlightByOrg.delete(organizationId);
    }
  }, 0);
}
