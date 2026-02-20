import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseScores, computeCombinedScore, type DimensionConfig } from "@/lib/score";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id } = await params;
    const opportunity = await prisma.opportunity.findUnique({
      where: { id },
      include: {
        _count: { select: { feedbackItems: true } },
        product: { select: { name: true } },
      },
    });

    if (!opportunity) {
      return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
    }

    const dimensions = await prisma.dimension.findMany({ orderBy: { order: "asc" } });
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
    } catch {}

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
      status: opportunity.status as "draft" | "under_review" | "approved" | "on_roadmap" | "rejected",
      feedbackCount: opportunity._count.feedbackItems,
      combinedScore,
      createdAt: opportunity.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("Error fetching opportunity:", error);
    return NextResponse.json({ error: "Failed to fetch opportunity" }, { status: 500 });
  }
}
