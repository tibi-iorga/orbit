import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseScores, serializeScores, computeCombinedScore, type DimensionConfig } from "@/lib/score";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    const horizon = searchParams.get("horizon");
    const status = searchParams.get("status");

    const where: {
      productId?: string | null;
      horizon?: string | null;
      status?: string;
    } = {};
    if (productId) where.productId = productId;
    if (horizon && horizon !== "__unplanned__") where.horizon = horizon;
    if (horizon === "__unplanned__") where.horizon = null;
    if (status) where.status = status;

    const opportunities = await prisma.opportunity.findMany({
      where,
      include: { 
        _count: { select: { feedbackItems: true } },
        product: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

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

    const opportunitiesWithScores = opportunities.map((r) => {
      const scores = parseScores(r.scores);
      const combinedScore = computeCombinedScore(scores, dimConfig);
      let explanation: Record<string, string> = {};
      try {
        if (r.explanation) explanation = JSON.parse(r.explanation);
      } catch {}
      return {
        id: r.id,
        title: r.title,
        description: r.description,
        productId: r.productId,
        productName: r.product?.name ?? null,
        scores,
        explanation,
        reportSummary: r.reportSummary,
        horizon: r.horizon as "now" | "next" | "later" | null,
        quarter: r.quarter,
        status: r.status as "draft" | "under_review" | "approved" | "on_roadmap" | "rejected",
        feedbackCount: r._count.feedbackItems,
        combinedScore,
        createdAt: r.createdAt.toISOString(),
      };
    });

    return NextResponse.json(opportunitiesWithScores);
  } catch (error) {
    console.error("Error fetching opportunities:", error);
    return NextResponse.json({ error: "Failed to fetch opportunities" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const { title, description, productId } = body;
    if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
    const opp = await prisma.opportunity.create({ 
      data: { 
        title,
        description: description || null,
        productId: productId || null,
      } 
    });
    return NextResponse.json({
      id: opp.id,
      title: opp.title,
      description: opp.description,
      productId: opp.productId,
      horizon: opp.horizon,
      quarter: opp.quarter,
      status: opp.status as "draft" | "under_review" | "approved" | "on_roadmap" | "rejected",
      createdAt: opp.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("Error creating opportunity:", error);
    return NextResponse.json({ error: "Failed to create opportunity" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const { id, title, description, scores, explanation, horizon, quarter, reportSummary, status } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const data: { 
      title?: string; 
      description?: string | null;
      scores?: string;
      explanation?: string;
      horizon?: string | null;
      quarter?: string | null;
      reportSummary?: string | null;
      status?: string;
    } = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description === null || description === "" ? null : description;
    if (scores !== undefined) data.scores = serializeScores(scores);
    if (explanation !== undefined) data.explanation = JSON.stringify(explanation);
    if (horizon !== undefined) data.horizon = horizon === null || horizon === "" ? null : horizon;
    if (quarter !== undefined) data.quarter = quarter === null || quarter === "" ? null : quarter;
    if (reportSummary !== undefined) data.reportSummary = reportSummary === null || reportSummary === "" ? null : reportSummary;
    if (status !== undefined) data.status = status;
    const opp = await prisma.opportunity.update({ 
      where: { id }, 
      data,
      include: { 
        _count: { select: { feedbackItems: true } },
        product: { select: { name: true } },
      },
    });

    const parsedScores = parseScores(opp.scores);
    let parsedExplanation: Record<string, string> = {};
    try {
      if (opp.explanation) parsedExplanation = JSON.parse(opp.explanation);
    } catch {}

    return NextResponse.json({
      id: opp.id,
      title: opp.title,
      description: opp.description,
      productId: opp.productId,
      productName: opp.product?.name ?? null,
      scores: parsedScores,
      explanation: parsedExplanation,
      horizon: opp.horizon as "now" | "next" | "later" | null,
      quarter: opp.quarter,
      status: opp.status as "draft" | "under_review" | "approved" | "on_roadmap" | "rejected",
      reportSummary: opp.reportSummary,
      feedbackCount: opp._count.feedbackItems,
      createdAt: opp.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("Error updating opportunity:", error);
    return NextResponse.json({ error: "Failed to update opportunity" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    
    // Unassign all feedback items first
    await prisma.feedbackItem.updateMany({
      where: { opportunityId: id },
      data: { opportunityId: null },
    });
    
    await prisma.opportunity.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting opportunity:", error);
    return NextResponse.json({ error: "Failed to delete opportunity" }, { status: 500 });
  }
}
