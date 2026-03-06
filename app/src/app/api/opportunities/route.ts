import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseScores, serializeScores, computeCombinedScore, type DimensionConfig } from "@/lib/score";
import { getRequestContext, hasMinimumRole } from "@/lib/request-context";
import { generateEmbedding } from "@/lib/semantic";
import { groupNewIdeasIntoOpportunities } from "@/lib/opportunity-grouper";
import type { Prisma } from "@prisma/client";

async function getDimConfig(organizationId: string): Promise<DimensionConfig[]> {
  const dimensions = await prisma.dimension.findMany({
    where: { organizationId, archived: false, name: { not: "" } },
    orderBy: { order: "asc" },
  });

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
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    const horizon = searchParams.get("horizon");
    const status = searchParams.get("status");
    const search = searchParams.get("search")?.trim() || "";

    const opportunityInclude = {
      _count: { select: { ideaLinks: true } },
      product: { select: { name: true } },
      goal: { select: { id: true, title: true } },
    } as const;

    type OpportunityWithRelations = Awaited<
      ReturnType<typeof prisma.opportunity.findMany<{ include: typeof opportunityInclude }>>
    >[number];

    let opportunities: OpportunityWithRelations[];

    if (search.length >= 2) {
      const { Prisma } = await import("@prisma/client");

      const colCheck = await prisma.$queryRaw<{ exists: boolean }[]>(
        Prisma.sql`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'Opportunity' AND column_name = 'search_vector'
          ) AS exists
        `
      );
      const hasFtsColumn = colCheck[0]?.exists ?? false;

      const conditions: ReturnType<typeof Prisma.sql>[] = [
        Prisma.sql`o."organizationId" = ${ctx.organizationId}`,
      ];

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
          where: { id: { in: orderedIds }, organizationId: ctx.organizationId },
          include: opportunityInclude,
        });
        const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
        opportunities = rows.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
      }
    } else {
      const where: {
        organizationId: string;
        productId?: string | null;
        horizon?: string | null;
        status?: string;
      } = { organizationId: ctx.organizationId };

      if (productId) where.productId = productId;
      if (horizon && horizon !== "__unplanned__") where.horizon = horizon;
      if (horizon === "__unplanned__") where.horizon = null;
      if (status) where.status = status;

      opportunities = await prisma.opportunity.findMany({
        where,
        include: opportunityInclude,
        orderBy: { createdAt: "desc" },
      });
    }

    const dimConfig = await getDimConfig(ctx.organizationId);

    const opportunitiesWithScores = opportunities.map((r) => {
      const scores = parseScores(r.scores);
      const combinedScore = computeCombinedScore(scores, dimConfig);
      let explanation: Record<string, string> = {};
      try {
        if (r.explanation) explanation = JSON.parse(r.explanation);
      } catch {
        explanation = {};
      }

      return {
        id: r.id,
        title: r.title,
        description: r.description,
        productId: r.productId,
        productName: r.product?.name ?? null,
        goalId: r.goalId,
        goalTitle: r.goal?.title ?? null,
        scores,
        explanation,
        reportSummary: r.reportSummary,
        horizon: r.horizon as "now" | "next" | "later" | null,
        quarter: r.quarter,
        status: r.status as "not_on_roadmap" | "on_roadmap" | "archived",
        feedbackCount: r._count.ideaLinks,
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
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(ctx.role, "editor")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await request.json();

    // Trigger AI grouping of unrouted ideas into opportunities
    if (body.action === "group") {
      await groupNewIdeasIntoOpportunities(ctx.organizationId);
      return NextResponse.json({ ok: true });
    }

    const { title, description, productId, feedbackItemIds } = body;
    if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });

    let scopedProductId: string | null = null;
    if (productId) {
      const product = await prisma.product.findFirst({ where: { id: productId, organizationId: ctx.organizationId }, select: { id: true } });
      if (!product) return NextResponse.json({ error: "Product not found" }, { status: 400 });
      scopedProductId = product.id;
    }

    const scopedFeedbackIds: string[] = feedbackItemIds?.length
      ? (
          await prisma.feedbackItem.findMany({
            where: { id: { in: feedbackItemIds }, organizationId: ctx.organizationId },
            select: { id: true },
          })
        ).map((f) => f.id)
      : [];

    // Find ideas for the given feedback items to link via IdeaOpportunity
    const scopedIdeas = scopedFeedbackIds.length
      ? await prisma.idea.findMany({
          where: { feedbackItemId: { in: scopedFeedbackIds }, organizationId: ctx.organizationId },
          select: { id: true },
        })
      : [];

    const opp = await prisma.opportunity.create({
      data: {
        organizationId: ctx.organizationId,
        title,
        description: description || null,
        productId: scopedProductId,
        semanticEmbedding:
          (await generateEmbedding(ctx.organizationId, `${title}${description ? ` - ${description}` : ""}`)) ?? undefined,
        ideaLinks: scopedIdeas.length
          ? { create: scopedIdeas.map((i) => ({ ideaId: i.id, organizationId: ctx.organizationId })) }
          : undefined,
      },
    });

    if (scopedFeedbackIds.length) {
      await prisma.feedbackItem.updateMany({
        where: { id: { in: scopedFeedbackIds }, organizationId: ctx.organizationId },
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
      status: opp.status as "not_on_roadmap" | "on_roadmap" | "archived",
      feedbackCount: scopedIdeas.length,
      combinedScore: 0,
      scores: {},
      explanation: {},
      reportSummary: null,
      productName: null,
      goalId: null,
      goalTitle: null,
      confidence: opp.confidence,
      createdAt: opp.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("Error creating opportunity:", error);
    return NextResponse.json({ error: "Failed to create opportunity" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(ctx.role, "editor")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await request.json();
    const { id, title, description, scores, explanation, horizon, quarter, reportSummary, status, goalId, productId } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const existing = await prisma.opportunity.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });

    const data: {
      title?: string;
      description?: string | null;
      scores?: string;
      explanation?: string;
      horizon?: string | null;
      quarter?: string | null;
      reportSummary?: string | null;
      status?: string;
      goalId?: string | null;
      productId?: string | null;
      semanticEmbedding?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
    } = {};

    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description === null || description === "" ? null : description;
    if (scores !== undefined) data.scores = serializeScores(scores);
    if (explanation !== undefined) data.explanation = JSON.stringify(explanation);
    if (horizon !== undefined) data.horizon = horizon === null || horizon === "" ? null : horizon;
    if (quarter !== undefined) data.quarter = quarter === null || quarter === "" ? null : quarter;
    if (reportSummary !== undefined) data.reportSummary = reportSummary === null || reportSummary === "" ? null : reportSummary;
    if (status !== undefined) data.status = status;
    if ("goalId" in body) data.goalId = goalId || null;
    if ("productId" in body) data.productId = productId || null;
    if (title !== undefined || description !== undefined) {
      const nextTitle = title ?? (await prisma.opportunity.findUnique({ where: { id }, select: { title: true } }))?.title ?? "";
      const nextDescription =
        description !== undefined
          ? description === null || description === "" ? null : String(description)
          : (await prisma.opportunity.findUnique({ where: { id }, select: { description: true } }))?.description ?? null;
      data.semanticEmbedding =
        (await generateEmbedding(ctx.organizationId, `${nextTitle}${nextDescription ? ` - ${nextDescription}` : ""}`)) ?? undefined;
    }

    const opp = await prisma.opportunity.update({
      where: { id },
      data,
      include: {
        _count: { select: { ideaLinks: true } },
        product: { select: { name: true } },
        goal: { select: { id: true, title: true } },
      },
    });

    const dimConfig = await getDimConfig(ctx.organizationId);
    const parsedScores = parseScores(opp.scores);
    let parsedExplanation: Record<string, string> = {};
    try {
      if (opp.explanation) parsedExplanation = JSON.parse(opp.explanation);
    } catch {
      parsedExplanation = {};
    }

    return NextResponse.json({
      id: opp.id,
      title: opp.title,
      description: opp.description,
      productId: opp.productId,
      productName: opp.product?.name ?? null,
      goalId: opp.goalId,
      goalTitle: opp.goal?.title ?? null,
      scores: parsedScores,
      explanation: parsedExplanation,
      horizon: opp.horizon as "now" | "next" | "later" | null,
      quarter: opp.quarter,
      status: opp.status as "not_on_roadmap" | "on_roadmap" | "archived",
      reportSummary: opp.reportSummary,
      feedbackCount: opp._count.ideaLinks,
      combinedScore: computeCombinedScore(parsedScores, dimConfig),
      createdAt: opp.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("Error updating opportunity:", error);
    return NextResponse.json({ error: "Failed to update opportunity" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(ctx.role, "editor")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const opportunity = await prisma.opportunity.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true } });
    if (!opportunity) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });

    // Get feedback items affected by ideas linked to this opportunity
    const linkedIdeaLinks = await prisma.ideaOpportunity.findMany({
      where: { opportunityId: id, idea: { organizationId: ctx.organizationId } },
      select: { idea: { select: { feedbackItemId: true } } },
    });
    const linkedFeedbackIds = Array.from(new Set(
      linkedIdeaLinks.map((l) => l.idea.feedbackItemId).filter(Boolean) as string[]
    ));

    await prisma.opportunity.delete({ where: { id } });

    if (linkedFeedbackIds.length > 0) {
      const stillLinked = await prisma.idea.findMany({
        where: {
          feedbackItemId: { in: linkedFeedbackIds },
          organizationId: ctx.organizationId,
          opportunityLinks: { some: {} },
        },
        select: { feedbackItemId: true },
      });
      const stillLinkedIds = new Set(stillLinked.map((i) => i.feedbackItemId).filter(Boolean) as string[]);
      const toRevert = linkedFeedbackIds.filter((fid) => !stillLinkedIds.has(fid));
      if (toRevert.length > 0) {
        await prisma.feedbackItem.updateMany({
          where: { id: { in: toRevert }, status: "reviewed", organizationId: ctx.organizationId },
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
