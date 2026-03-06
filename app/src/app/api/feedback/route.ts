import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRequestContext, hasMinimumRole } from "@/lib/request-context";
import { enqueueFeedbackProcessing } from "@/lib/feedback-processor";


function formatFeedbackItem(item: {
  id: string;
  title: string;
  description: string | null;
  metadata: unknown;
  status: string;
  processingStatus: string;
  processedSummary: string | null;
  productId: string | null;
  createdAt: Date;
  product: { name: string } | null;
  import: { filename: string } | null;
  ideas: { text: string; opportunityLinks: { opportunity: { id: string; title: string } }[] }[];
}) {
  const allOpportunities = item.ideas.flatMap((idea) =>
    idea.opportunityLinks.map((l) => ({ id: l.opportunity.id, title: l.opportunity.title }))
  );
  const uniqueOpportunities = Array.from(new Map(allOpportunities.map((o) => [o.id, o])).values());

  return {
    id: item.id,
    title: item.title,
    description: item.description,
    metadata: item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
      ? (item.metadata as Record<string, string>)
      : null,
    status: item.status,
    processingStatus: item.processingStatus,
    feedbackInsights: {
      chunks: item.processedSummary ? [item.processedSummary] : [],
      signals: [],
      proposals: [],
    },
    ideas: item.ideas.map((i) => i.text),
    opportunities: uniqueOpportunities,
    productId: item.productId,
    productName: item.product?.name ?? null,
    sourceName: item.import?.filename ?? null,
    createdAt: item.createdAt.toISOString(),
  };
}

const feedbackInclude = {
  product: { select: { name: true } },
  ideas: {
    select: {
      text: true,
      opportunityLinks: { select: { opportunity: { select: { id: true, title: true } } } },
    },
  },
  import: { select: { filename: true } },
} as const;

async function ftsSearch(params: {
  organizationId: string;
  search: string;
  status: string | null;
  sortDir: "asc" | "desc";
  skip: number;
  take: number;
}): Promise<{ ids: string[]; total: number }> {
  const { organizationId, search, status, sortDir, skip, take } = params;

  const { Prisma } = await import("@prisma/client");

  const colCheck = await prisma.$queryRaw<{ exists: boolean }[]>(
    Prisma.sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'FeedbackItem' AND column_name = 'search_vector'
      ) AS exists
    `
  );
  const hasFtsColumn = colCheck[0]?.exists ?? false;

  const conditions: ReturnType<typeof Prisma.sql>[] = [Prisma.sql`f."organizationId" = ${organizationId}`];

  if (hasFtsColumn) {
    conditions.push(Prisma.sql`f.search_vector @@ plainto_tsquery('english', ${search})`);
  } else {
    const like = `%${search}%`;
    conditions.push(Prisma.sql`(f.title ILIKE ${like} OR f.description ILIKE ${like})`);
  }

  if (status === "active") {
    conditions.push(Prisma.sql`f.status != 'rejected'`);
  } else if (status) {
    conditions.push(Prisma.sql`f.status = ${status}`);
  }

  const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
  const dateOrder = sortDir === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;

  const rankQuery = hasFtsColumn
    ? Prisma.sql`
        SELECT f.id,
               ts_rank(f.search_vector, plainto_tsquery('english', ${search})) AS rank
        FROM   "FeedbackItem" f
        ${whereClause}
        ORDER  BY rank DESC, f."createdAt" ${dateOrder}
        LIMIT  ${take} OFFSET ${skip}
      `
    : Prisma.sql`
        SELECT f.id, 0::float AS rank
        FROM   "FeedbackItem" f
        ${whereClause}
        ORDER  BY f."createdAt" ${dateOrder}
        LIMIT  ${take} OFFSET ${skip}
      `;

  const countQuery = Prisma.sql`
    SELECT COUNT(*) AS count
    FROM   "FeedbackItem" f
    ${whereClause}
  `;

  const [rows, countRows] = await Promise.all([
    prisma.$queryRaw<{ id: string }[]>(rankQuery),
    prisma.$queryRaw<{ count: bigint }[]>(countQuery),
  ]);

  return {
    ids: rows.map((r) => r.id),
    total: Number(countRows[0]?.count ?? 0),
  };
}

export async function GET(request: Request) {
  try {
    const ctx = await getRequestContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    enqueueFeedbackProcessing(ctx.organizationId);

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search")?.trim() || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "50", 10);
    const skip = (page - 1) * pageSize;
    const sortDir: "asc" | "desc" = searchParams.get("sortDir") === "asc" ? "asc" : "desc";

    type FeedbackItemWithRelations = Awaited<
      ReturnType<typeof prisma.feedbackItem.findMany<{ include: typeof feedbackInclude }>>
    >[number];
    let feedbackItems: FeedbackItemWithRelations[];
    let totalCount: number;

    if (search.length >= 2) {
      const { ids, total } = await ftsSearch({
        organizationId: ctx.organizationId,
        search,
        status: status || null,
        sortDir,
        skip,
        take: pageSize,
      });

      totalCount = total;

      if (ids.length === 0) {
        feedbackItems = [];
      } else {
        const rows = await prisma.feedbackItem.findMany({
          where: { id: { in: ids }, organizationId: ctx.organizationId },
          include: feedbackInclude,
        });
        const orderMap = new Map(ids.map((id, i) => [id, i]));
        feedbackItems = rows.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
      }
    } else {
      const where: import("@prisma/client").Prisma.FeedbackItemWhereInput = {
        organizationId: ctx.organizationId,
      };

      if (status === "active") {
        where.status = { not: "rejected" };
      } else if (status) {
        where.status = status;
      }

      const [items, count] = await Promise.all([
        prisma.feedbackItem.findMany({
          where,
          include: feedbackInclude,
          orderBy: { createdAt: sortDir },
          skip,
          take: pageSize,
        }),
        prisma.feedbackItem.count({ where }),
      ]);
      feedbackItems = items;
      totalCount = count;
    }

    return NextResponse.json({
      feedbackItems: feedbackItems.map(formatFeedbackItem),
      pagination: {
        page,
        pageSize,
        total: totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    });
  } catch (error) {
    console.error("Error fetching feedback items:", error);
    return NextResponse.json({ error: "Failed to fetch feedback items" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await getRequestContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasMinimumRole(ctx.role, "editor")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const { id, ids, opportunityId, title, description, productId, status } = body;

    if (ids && Array.isArray(ids) && ids.length > 0) {
      const scopedItems = await prisma.feedbackItem.findMany({
        where: { id: { in: ids }, organizationId: ctx.organizationId },
        select: { id: true },
      });
      const scopedIds = scopedItems.map((item) => item.id);
      if (scopedIds.length === 0) return NextResponse.json({ updated: 0 });

      const bulkData: Record<string, unknown> = {};

      if (status !== undefined) {
        const validStatuses = ["new", "reviewed", "rejected"];
        if (!validStatuses.includes(status)) {
          return NextResponse.json({ error: "Invalid status" }, { status: 400 });
        }
        bulkData.status = status;
      }

      if (opportunityId !== undefined) {
        const resolvedOpportunityId = opportunityId === null || opportunityId === "" ? null : opportunityId;
        if (resolvedOpportunityId) {
          const opportunity = await prisma.opportunity.findFirst({
            where: { id: resolvedOpportunityId, organizationId: ctx.organizationId },
            select: { id: true },
          });
          if (!opportunity) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });

          for (const itemId of scopedIds) {
            const existingIdea = await prisma.idea.findFirst({
              where: { feedbackItemId: itemId },
              orderBy: { index: "asc" },
              select: { id: true },
            });
            let ideaId = existingIdea?.id;
            if (!ideaId) {
              const item = await prisma.feedbackItem.findFirst({ where: { id: itemId }, select: { title: true, description: true } });
              const newIdea = await prisma.idea.create({
                data: { organizationId: ctx.organizationId, feedbackItemId: itemId, text: `${item?.title ?? ""}${item?.description ? ` - ${item.description}` : ""}`, source: "manual", index: 0 },
              });
              ideaId = newIdea.id;
            }
            await prisma.ideaOpportunity.upsert({
              where: { ideaId_opportunityId: { ideaId, opportunityId: resolvedOpportunityId } },
              create: { ideaId, opportunityId: resolvedOpportunityId, organizationId: ctx.organizationId },
              update: {},
            });
          }

          await prisma.feedbackItem.updateMany({
            where: { id: { in: scopedIds }, organizationId: ctx.organizationId },
            data: { status: "reviewed" },
          });
        }
        return NextResponse.json({ updated: scopedIds.length });
      }

      await prisma.feedbackItem.updateMany({
        where: { id: { in: scopedIds }, organizationId: ctx.organizationId },
        data: bulkData,
      });

      return NextResponse.json({ updated: scopedIds.length });
    }

    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const existing = await prisma.feedbackItem.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true, status: true } });
    if (!existing) return NextResponse.json({ error: "Feedback item not found" }, { status: 404 });

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description === null || description === "" ? null : description;

    if (productId !== undefined) {
      const resolvedProductId = productId === null || productId === "" ? null : productId;
      if (resolvedProductId) {
        const product = await prisma.product.findFirst({ where: { id: resolvedProductId, organizationId: ctx.organizationId }, select: { id: true } });
        if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
      }
      data.productId = resolvedProductId;
    }

    if (status !== undefined) {
      const validStatuses = ["new", "reviewed", "rejected"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      data.status = status;
    }

    if (opportunityId !== undefined) {
      const resolvedOpportunityId = opportunityId === null || opportunityId === "" ? null : opportunityId;
      if (resolvedOpportunityId) {
        const opportunity = await prisma.opportunity.findFirst({
          where: { id: resolvedOpportunityId, organizationId: ctx.organizationId },
          select: { id: true },
        });
        if (!opportunity) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });

        const existingIdea = await prisma.idea.findFirst({
          where: { feedbackItemId: id },
          orderBy: { index: "asc" },
          select: { id: true },
        });
        let ideaId = existingIdea?.id;
        if (!ideaId) {
          const feedbackForIdea = await prisma.feedbackItem.findFirst({ where: { id }, select: { title: true, description: true } });
          const newIdea = await prisma.idea.create({
            data: { organizationId: ctx.organizationId, feedbackItemId: id, text: `${feedbackForIdea?.title ?? ""}${feedbackForIdea?.description ? ` - ${feedbackForIdea.description}` : ""}`, source: "manual", index: 0 },
          });
          ideaId = newIdea.id;
        }
        await prisma.ideaOpportunity.upsert({
          where: { ideaId_opportunityId: { ideaId, opportunityId: resolvedOpportunityId } },
          create: { ideaId, opportunityId: resolvedOpportunityId, organizationId: ctx.organizationId },
          update: {},
        });
        data.status = "reviewed";
      } else {
        await prisma.ideaOpportunity.deleteMany({
          where: { idea: { feedbackItemId: id }, organizationId: ctx.organizationId },
        });
        if (existing.status === "reviewed") data.status = "new";
      }
    }

    const feedbackItem = await prisma.feedbackItem.update({
      where: { id },
      data,
      include: feedbackInclude,
    });

    return NextResponse.json(formatFeedbackItem(feedbackItem));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Feedback item not found" }, { status: 404 });
    }
    console.error("Error updating feedback item:", error);
    return NextResponse.json({ error: "Failed to update feedback item" }, { status: 500 });
  }
}
