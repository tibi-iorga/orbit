import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseScores, serializeScores, computeCombinedScore, type DimensionConfig } from "@/lib/score";

async function getDimConfig(): Promise<DimensionConfig[]> {
  const dimensions = await prisma.dimension.findMany({ orderBy: { order: "asc" } });
  return dimensions.map((d) => ({
    id: d.id,
    name: d.name,
    type: d.type as "yesno" | "scale",
    weight: d.weight,
    order: d.order,
    tag: d.tag,
    direction: (d.direction ?? "benefit") as "benefit" | "cost",
  }));
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    const horizon = searchParams.get("horizon");
    const status = searchParams.get("status");
    const search = searchParams.get("search")?.trim() || "";

    let opportunities;

    if (search.length >= 2) {
      // ── Full-text search path ─────────────────────────────────────────────
      const { Prisma } = await import("@prisma/client");

      // Check whether the FTS column exists (migration may not have been applied yet)
      const colCheck = await prisma.$queryRaw<{ exists: boolean }[]>(
        Prisma.sql`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'Opportunity' AND column_name = 'search_vector'
          ) AS exists
        `
      );
      const hasFtsColumn = colCheck[0]?.exists ?? false;

      const conditions: ReturnType<typeof Prisma.sql>[] = [];
      if (hasFtsColumn) {
        conditions.push(Prisma.sql`o.search_vector @@ plainto_tsquery('english', ${search})`);
      } else {
        const like = `%${search}%`;
        conditions.push(Prisma.sql`(o.title ILIKE ${like} OR o.description ILIKE ${like})`);
      }
      if (productId) conditions.push(Prisma.sql`o."productId" = ${productId}`);
      if (horizon && horizon !== "__unplanned__") conditions.push(Prisma.sql`o.horizon = ${horizon}`);
      if (horizon === "__unplanned__") conditions.push(Prisma.sql`o.horizon IS NULL`);
      if (status) conditions.push(Prisma.sql`o.status = ${status}`);

      const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;

      const rankQuery = hasFtsColumn
        ? Prisma.sql`
            SELECT o.id,
                   ts_rank(o.search_vector, plainto_tsquery('english', ${search})) AS rank
            FROM   "Opportunity" o
            ${whereClause}
            ORDER  BY rank DESC, o."createdAt" DESC
          `
        : Prisma.sql`
            SELECT o.id, 0::float AS rank
            FROM   "Opportunity" o
            ${whereClause}
            ORDER  BY o."createdAt" DESC
          `;

      const ids = await prisma.$queryRaw<{ id: string }[]>(rankQuery);

      if (ids.length === 0) {
        opportunities = [];
      } else {
        const orderedIds = ids.map((r) => r.id);
        const rows = await prisma.opportunity.findMany({
          where: { id: { in: orderedIds } },
          include: { _count: { select: { feedbackLinks: true } }, product: { select: { name: true } } },
        });
        const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
        opportunities = rows.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
      }
    } else {
      // ── Normal Prisma path ────────────────────────────────────────────────
      const where: {
        productId?: string | null;
        horizon?: string | null;
        status?: string;
      } = {};
      if (productId) where.productId = productId;
      if (horizon && horizon !== "__unplanned__") where.horizon = horizon;
      if (horizon === "__unplanned__") where.horizon = null;
      if (status) where.status = status;

      opportunities = await prisma.opportunity.findMany({
        where,
        include: {
          _count: { select: { feedbackLinks: true } },
          product: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    }

    const dimConfig = await getDimConfig();

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
        feedbackCount: r._count.feedbackLinks,
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
    const { title, description, productId, feedbackItemIds } = body;
    if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
    const opp = await prisma.opportunity.create({
      data: {
        title,
        description: description || null,
        productId: productId || null,
        feedbackLinks: feedbackItemIds?.length
          ? { create: feedbackItemIds.map((fid: string) => ({ feedbackItemId: fid })) }
          : undefined,
      },
    });
    // Mark linked feedback as reviewed
    if (feedbackItemIds?.length) {
      await prisma.feedbackItem.updateMany({
        where: { id: { in: feedbackItemIds } },
        data: { status: "reviewed" },
      });
    }
    return NextResponse.json({
      id: opp.id,
      title: opp.title,
      description: opp.description,
      productId: opp.productId,
      horizon: opp.horizon,
      quarter: opp.quarter,
      status: opp.status as "draft" | "under_review" | "approved" | "on_roadmap" | "rejected",
      feedbackCount: feedbackItemIds?.length ?? 0,
      combinedScore: 0,
      scores: {},
      explanation: {},
      reportSummary: null,
      productName: null,
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
        _count: { select: { feedbackLinks: true } },
        product: { select: { name: true } },
      },
    });

    const dimConfig = await getDimConfig();
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
      feedbackCount: opp._count.feedbackLinks,
      combinedScore: computeCombinedScore(parsedScores, dimConfig),
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

    // feedbackLinks cascade delete via schema; revert reviewed items with no remaining links
    const linkedItems = await prisma.feedbackItemOpportunity.findMany({
      where: { opportunityId: id },
      select: { feedbackItemId: true },
    });
    const linkedIds = linkedItems.map((l) => l.feedbackItemId);

    await prisma.opportunity.delete({ where: { id } });

    // For each previously linked item, if it now has no opportunity links, revert to "new"
    if (linkedIds.length > 0) {
      const stillLinked = await prisma.feedbackItemOpportunity.findMany({
        where: { feedbackItemId: { in: linkedIds } },
        select: { feedbackItemId: true },
      });
      const stillLinkedIds = new Set(stillLinked.map((l) => l.feedbackItemId));
      const toRevert = linkedIds.filter((fid) => !stillLinkedIds.has(fid));
      if (toRevert.length > 0) {
        await prisma.feedbackItem.updateMany({
          where: { id: { in: toRevert }, status: "reviewed" },
          data: { status: "new" },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting opportunity:", error);
    return NextResponse.json({ error: "Failed to delete opportunity" }, { status: 500 });
  }
}
