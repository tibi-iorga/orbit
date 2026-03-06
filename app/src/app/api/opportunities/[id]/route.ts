import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseScores, computeCombinedScore, type DimensionConfig } from "@/lib/score";
import { getRequestContext, hasMinimumRole } from "@/lib/request-context";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const opportunity = await prisma.opportunity.findFirst({
      where: { id, organizationId: ctx.organizationId },
      include: {
        _count: { select: { ideaLinks: true } },
        product: { select: { name: true } },
      },
    });

    if (!opportunity) {
      return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
    }

    const dimensions = await prisma.dimension.findMany({
      where: { organizationId: ctx.organizationId, archived: false, name: { not: "" } },
      orderBy: { order: "asc" },
    });

    const dimConfig: DimensionConfig[] = dimensions.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type as "yesno" | "scale",
      weight: d.weight,
      order: d.order,
      tag: d.tag,
      direction: (d.direction ?? "benefit") as "benefit" | "cost",
    }));

    const scores = parseScores(opportunity.scores);
    const combinedScore = computeCombinedScore(scores, dimConfig);
    let explanation: Record<string, string> = {};
    try {
      if (opportunity.explanation) explanation = JSON.parse(opportunity.explanation);
    } catch {
      explanation = {};
    }

    return NextResponse.json({
      id: opportunity.id,
      title: opportunity.title,
      description: opportunity.description,
      productId: opportunity.productId,
      productName: opportunity.product?.name ?? null,
      scores,
      explanation,
      reportSummary: opportunity.reportSummary,
      horizon: opportunity.horizon as "now" | "next" | "later" | null,
      quarter: opportunity.quarter,
      status: opportunity.status as "not_on_roadmap" | "on_roadmap" | "archived",
      feedbackCount: opportunity._count.ideaLinks,
      combinedScore,
      createdAt: opportunity.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("Error fetching opportunity:", error);
    return NextResponse.json({ error: "Failed to fetch opportunity" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(ctx.role, "editor")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const feedbackItemId = searchParams.get("feedbackItemId");
    if (!feedbackItemId) return NextResponse.json({ error: "feedbackItemId required" }, { status: 400 });

    // Find idea-opportunity links for this feedback item + opportunity
    const ideaLinks = await prisma.ideaOpportunity.findMany({
      where: {
        opportunityId: id,
        idea: { feedbackItemId, organizationId: ctx.organizationId },
      },
      select: { ideaId: true },
    });
    if (ideaLinks.length === 0) return NextResponse.json({ error: "Link not found" }, { status: 404 });

    await prisma.ideaOpportunity.deleteMany({
      where: { opportunityId: id, ideaId: { in: ideaLinks.map((l) => l.ideaId) } },
    });

    const remaining = await prisma.ideaOpportunity.count({
      where: { idea: { feedbackItemId, organizationId: ctx.organizationId } },
    });

    if (remaining === 0) {
      await prisma.feedbackItem.updateMany({
        where: { id: feedbackItemId, status: "reviewed", organizationId: ctx.organizationId },
        data: { status: "new" },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error unlinking feedback:", error);
    return NextResponse.json({ error: "Failed to unlink feedback" }, { status: 500 });
  }
}
