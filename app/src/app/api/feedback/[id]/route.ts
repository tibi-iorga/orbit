import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRequestContext } from "@/lib/request-context";
import { enqueueFeedbackProcessing } from "@/lib/feedback-processor";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  enqueueFeedbackProcessing(ctx.organizationId);

  const item = await prisma.feedbackItem.findFirst({
    where: { id: params.id, organizationId: ctx.organizationId },
    include: {
      product: { select: { name: true } },
      ideas: {
        select: {
          text: true,
          index: true,
          source: true,
          opportunityLinks: { select: { opportunity: { select: { id: true, title: true } } } },
        },
        orderBy: { index: "asc" },
      },
      import: { select: { filename: true } },
    },
  });

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Deduplicate opportunities across all ideas
  const oppMap = new Map<string, { id: string; title: string }>();
  for (const idea of item.ideas) {
    for (const link of idea.opportunityLinks) {
      oppMap.set(link.opportunity.id, { id: link.opportunity.id, title: link.opportunity.title });
    }
  }

  return NextResponse.json({
    id: item.id,
    title: item.title,
    description: item.description,
    metadata: item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
      ? (item.metadata as Record<string, string>)
      : null,
    status: item.status,
    processingStatus: item.processingStatus,
    feedbackInsights: {
      chunks: item.ideas.map((i) => i.text),
      opportunities: Array.from(oppMap.values()),
    },
    opportunities: Array.from(oppMap.values()),
    productId: item.productId,
    productName: item.product?.name ?? null,
    sourceName: item.import?.filename ?? null,
    createdAt: item.createdAt.toISOString(),
  });
}
