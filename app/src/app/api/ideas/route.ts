import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRequestContext, hasMinimumRole } from "@/lib/request-context";
import { generateEmbedding } from "@/lib/semantic";
import { enqueueOpportunityGrouping } from "@/lib/opportunity-grouper";

export async function GET(request: Request) {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10)));
  const productId = searchParams.get("productId");
  const routed = searchParams.get("routed"); // "yes" | "all" (default "all")

  const opportunityId = searchParams.get("opportunityId");

  const where: {
    organizationId: string;
    feedbackItem?: { productId: string };
    opportunityLinks?: { some: Record<string, never> | { opportunityId: string } };
  } = { organizationId: ctx.organizationId };

  if (productId) {
    where.feedbackItem = { productId };
  }

  if (opportunityId) {
    where.opportunityLinks = { some: { opportunityId } };
  } else if (routed === "yes") {
    where.opportunityLinks = { some: {} };
  }

  const [ideas, total] = await Promise.all([
    prisma.idea.findMany({
      where,
      select: {
        id: true,
        text: true,
        source: true,
        index: true,
        createdAt: true,
        feedbackItemId: true,
        feedbackItem: {
          select: {
            title: true,
            status: true,
            productId: true,
            product: { select: { name: true } },
          },
        },
        opportunityLinks: {
          select: { opportunity: { select: { id: true, title: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.idea.count({ where }),
  ]);

  const payload = ideas.map((idea) => ({
    id: idea.id,
    text: idea.text,
    source: idea.source,
    index: idea.index,
    createdAt: idea.createdAt.toISOString(),
    feedbackItemId: idea.feedbackItemId,
    feedbackItemTitle: idea.feedbackItem?.title ?? null,
    feedbackItemStatus: idea.feedbackItem?.status ?? null,
    productId: idea.feedbackItem?.productId ?? null,
    productName: idea.feedbackItem?.product?.name ?? null,
    opportunities: idea.opportunityLinks.map((l) => ({ id: l.opportunity.id, title: l.opportunity.title })),
  }));

  return NextResponse.json({ ideas: payload, total, page, limit });
}

export async function POST(request: Request) {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(ctx.role, "editor")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { text, feedbackItemId } = body as { text?: string; feedbackItemId?: string };
  if (!text || text.trim().length === 0) return NextResponse.json({ error: "text required" }, { status: 400 });

  const normalizedText = text.replace(/\s+/g, " ").trim().slice(0, 1000);

  // Validate feedbackItemId if provided
  if (feedbackItemId) {
    const fb = await prisma.feedbackItem.findFirst({
      where: { id: feedbackItemId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!fb) return NextResponse.json({ error: "Feedback item not found" }, { status: 400 });
  }

  const embedding = await generateEmbedding(ctx.organizationId, normalizedText);

  const idea = await prisma.idea.create({
    data: {
      organizationId: ctx.organizationId,
      feedbackItemId: feedbackItemId ?? null,
      text: normalizedText,
      source: "manual",
      index: 0,
      ...(embedding ? { embedding } : {}),
    },
  });

  enqueueOpportunityGrouping(ctx.organizationId);

  return NextResponse.json({
    id: idea.id,
    text: idea.text,
    source: idea.source,
    index: idea.index,
    createdAt: idea.createdAt.toISOString(),
    feedbackItemId: idea.feedbackItemId,
    feedbackItemTitle: null,
    feedbackItemStatus: null,
    productId: null,
    productName: null,
    opportunities: [],
  });
}
