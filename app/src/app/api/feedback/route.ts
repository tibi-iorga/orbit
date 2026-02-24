import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function getAllDescendantProductIds(parentId: string): Promise<string[]> {
  const descendants: string[] = [];
  const queue: string[] = [parentId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const children = await prisma.product.findMany({
      where: { parentId: currentId },
      select: { id: true },
    });
    for (const child of children) {
      descendants.push(child.id);
      queue.push(child.id);
    }
  }

  return descendants;
}

function formatFeedbackItem(item: {
  id: string;
  title: string;
  description: string | null;
  metadata: unknown;
  status: string;
  productId: string | null;
  createdAt: Date;
  product: { name: string } | null;
  import: { filename: string } | null;
  opportunityLinks: { opportunity: { id: string; title: string } }[];
}) {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    metadata: (item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata))
      ? (item.metadata as Record<string, string>)
      : null,
    status: item.status,
    opportunities: item.opportunityLinks.map((l) => ({ id: l.opportunity.id, title: l.opportunity.title })),
    productId: item.productId,
    productName: item.product?.name ?? null,
    sourceName: item.import?.filename ?? null,
    createdAt: item.createdAt.toISOString(),
  };
}

const feedbackInclude = {
  product: { select: { name: true } },
  opportunityLinks: { include: { opportunity: { select: { id: true, title: true } } } },
  import: { select: { filename: true } },
} as const;


/**
 * Full-text search via tsvector index.
 * Returns IDs ranked by relevance so we can re-fetch with full relations,
 * or falls back to trigram ILIKE for very short queries (< 3 chars aren't
 * valid for tsquery but work fine with ILIKE + trgm index).
 */
async function ftsSearch(params: {
  search: string;
  status: string | null;
  productIds: string[];
  includeUnassignedProduct: boolean;
  opportunityId: string | null;
  sortDir: "asc" | "desc";
  skip: number;
  take: number;
}): Promise<{ ids: string[]; total: number }> {
  const { search, status, productIds, includeUnassignedProduct, opportunityId, sortDir, skip, take } = params;

  // IMPORTANT: Prisma's tagged-template $queryRaw`` cannot nest Prisma.sql fragments that
  // contain their own parameters — it breaks the $1/$2/… numbering.
  // The correct approach is to build the entire query as Prisma.sql and call
  // prisma.$queryRaw(fragment) as a regular function (not tagged template).
  const { Prisma } = await import("@prisma/client");

  // Check once whether the FTS column exists (migration may not have been applied yet)
  const colCheck = await prisma.$queryRaw<{ exists: boolean }[]>(
    Prisma.sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'FeedbackItem' AND column_name = 'search_vector'
      ) AS exists
    `
  );
  const hasFtsColumn = colCheck[0]?.exists ?? false;

  const conditions: ReturnType<typeof Prisma.sql>[] = [];

  if (hasFtsColumn) {
    conditions.push(Prisma.sql`f.search_vector @@ plainto_tsquery('english', ${search})`);
  } else {
    // Fallback: ILIKE on title + description (uses trgm index if available, otherwise seq scan)
    const like = `%${search}%`;
    conditions.push(Prisma.sql`(f.title ILIKE ${like} OR f.description ILIKE ${like})`);
  }

  if (status) {
    conditions.push(Prisma.sql`f.status = ${status}`);
  }

  if (productIds.length > 0 && includeUnassignedProduct) {
    conditions.push(Prisma.sql`(f."productId" = ANY(${productIds}::text[]) OR f."productId" IS NULL)`);
  } else if (productIds.length > 0) {
    conditions.push(Prisma.sql`f."productId" = ANY(${productIds}::text[])`);
  } else if (includeUnassignedProduct) {
    conditions.push(Prisma.sql`f."productId" IS NULL`);
  }

  if (opportunityId === "__unassigned__") {
    conditions.push(Prisma.sql`NOT EXISTS (SELECT 1 FROM "FeedbackItemOpportunity" fio WHERE fio."feedbackItemId" = f.id)`);
  } else if (opportunityId) {
    conditions.push(Prisma.sql`EXISTS (SELECT 1 FROM "FeedbackItemOpportunity" fio WHERE fio."feedbackItemId" = f.id AND fio."opportunityId" = ${opportunityId})`);
  }

  const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;

  // Build full queries as Prisma.sql objects, then call $queryRaw(sql) — NOT as tagged template
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
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const productIds = searchParams.getAll("productId");
    const opportunityId = searchParams.get("opportunityId");
    const status = searchParams.get("status");
    const search = searchParams.get("search")?.trim() || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "50", 10);
    const skip = (page - 1) * pageSize;
    const sortDir: "asc" | "desc" = searchParams.get("sortDir") === "asc" ? "asc" : "desc";

    // Resolve product hierarchy
    const hasUnassigned = productIds.includes("__unassigned__");
    const regularProductIds = productIds.filter((id) => id !== "__unassigned__");
    let allProductIds: string[] = [];
    for (const pid of regularProductIds) {
      allProductIds.push(pid, ...(await getAllDescendantProductIds(pid)));
    }

    type FeedbackItemWithRelations = Awaited<ReturnType<typeof prisma.feedbackItem.findMany<{ include: typeof feedbackInclude }>>>[number];
    let feedbackItems: FeedbackItemWithRelations[];
    let totalCount: number;

    if (search.length >= 2) {
      // ── Full-text search path (uses tsvector index) ───────────────────────
      const { ids, total } = await ftsSearch({
        search,
        status: status || null,
        productIds: allProductIds,
        includeUnassignedProduct: hasUnassigned,
        opportunityId: opportunityId || null,
        sortDir,
        skip,
        take: pageSize,
      });

      totalCount = total;

      if (ids.length === 0) {
        feedbackItems = [];
      } else {
        // Fetch full rows with relations, preserving rank order
        const rows = await prisma.feedbackItem.findMany({
          where: { id: { in: ids } },
          include: feedbackInclude,
        });
        // Re-sort to match rank order returned by FTS
        const orderMap = new Map(ids.map((id, i) => [id, i]));
        feedbackItems = rows.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0));
      }
    } else {
      // ── Normal Prisma path (no search) ────────────────────────────────────
      const where: {
        productId?: string | { in: string[] } | null;
        status?: string;
        opportunityLinks?: { some: { opportunityId: string } } | { none: Record<string, never> };
      } = {};

      if (status) where.status = status;

      if (allProductIds.length > 0 && hasUnassigned) {
        // needsCombinedQuery — handled below
      } else if (allProductIds.length > 0) {
        where.productId = { in: allProductIds };
      } else if (hasUnassigned) {
        where.productId = null;
      }

      if (opportunityId === "__unassigned__") {
        where.opportunityLinks = { none: {} };
      } else if (opportunityId) {
        where.opportunityLinks = { some: { opportunityId } };
      }

      const needsCombinedQuery = allProductIds.length > 0 && hasUnassigned;

      if (needsCombinedQuery) {
        const opportunityWhere = where.opportunityLinks !== undefined ? { opportunityLinks: where.opportunityLinks } : {};
        const statusWhere = status ? { status } : {};
        const [assignedItems, unassignedItems, assignedCount, unassignedCount] = await Promise.all([
          prisma.feedbackItem.findMany({
            where: { ...statusWhere, ...opportunityWhere, productId: { in: allProductIds } },
            include: feedbackInclude,
            orderBy: { createdAt: sortDir },
          }),
          prisma.feedbackItem.findMany({
            where: { ...statusWhere, ...opportunityWhere, productId: null },
            include: feedbackInclude,
            orderBy: { createdAt: sortDir },
          }),
          prisma.feedbackItem.count({ where: { ...statusWhere, ...opportunityWhere, productId: { in: allProductIds } } }),
          prisma.feedbackItem.count({ where: { ...statusWhere, ...opportunityWhere, productId: null } }),
        ]);

        const combined = [...assignedItems, ...unassignedItems].sort(
          (a, b) => sortDir === "desc"
            ? b.createdAt.getTime() - a.createdAt.getTime()
            : a.createdAt.getTime() - b.createdAt.getTime()
        );
        totalCount = assignedCount + unassignedCount;
        feedbackItems = combined.slice(skip, skip + pageSize);
      } else {
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
    }

    const [totalUnassigned, newCount] = await Promise.all([
      prisma.feedbackItem.count({ where: { opportunityLinks: { none: {} } } }),
      prisma.feedbackItem.count({ where: { status: "new" } }),
    ]);

    const products = await prisma.product.findMany({
      include: { _count: { select: { feedbackItems: true } } },
      orderBy: { name: "asc" },
    });

    const productsWithAggregatedCounts = await Promise.all(
      products.map(async (p) => {
        const descendantIds = await getAllDescendantProductIds(p.id);
        const allIds = [p.id, ...descendantIds];
        const aggregatedFeedbackCount = await prisma.feedbackItem.count({
          where: { productId: { in: allIds } },
        });
        return { id: p.id, name: p.name, parentId: p.parentId, feedbackCount: aggregatedFeedbackCount };
      })
    );

    const opportunities = await prisma.opportunity.findMany({
      include: { _count: { select: { feedbackLinks: true } } },
      orderBy: { title: "asc" },
    });

    return NextResponse.json({
      feedbackItems: feedbackItems.map(formatFeedbackItem),
      opportunities: opportunities.map((r) => ({
        id: r.id,
        title: r.title,
        feedbackCount: r._count.feedbackLinks,
      })),
      products: productsWithAggregatedCounts,
      totalUnassigned,
      newCount,
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
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    const { id, ids, opportunityId, title, description, productId, status } = body;

    // Bulk update
    if (ids && Array.isArray(ids) && ids.length > 0) {
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
          // Link all selected items to the opportunity
          await prisma.$transaction(
            ids.map((itemId: string) =>
              prisma.feedbackItemOpportunity.upsert({
                where: { feedbackItemId_opportunityId: { feedbackItemId: itemId, opportunityId: resolvedOpportunityId } },
                create: { feedbackItemId: itemId, opportunityId: resolvedOpportunityId },
                update: {},
              })
            )
          );
          await prisma.feedbackItem.updateMany({
            where: { id: { in: ids } },
            data: { status: "reviewed" },
          });
        }
        return NextResponse.json({ updated: ids.length });
      }

      await prisma.feedbackItem.updateMany({
        where: { id: { in: ids } },
        data: bulkData,
      });

      return NextResponse.json({ updated: ids.length });
    }

    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description === null || description === "" ? null : description;
    if (productId !== undefined) {
      data.productId = productId === null || productId === "" ? null : productId;
    }
    if (status !== undefined) {
      const validStatuses = ["new", "reviewed", "rejected"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      data.status = status;
    }

    // Handle opportunityId as link/unlink in join table
    if (opportunityId !== undefined) {
      const resolvedOpportunityId = opportunityId === null || opportunityId === "" ? null : opportunityId;
      if (resolvedOpportunityId) {
        await prisma.feedbackItemOpportunity.upsert({
          where: { feedbackItemId_opportunityId: { feedbackItemId: id, opportunityId: resolvedOpportunityId } },
          create: { feedbackItemId: id, opportunityId: resolvedOpportunityId },
          update: {},
        });
        data.status = "reviewed";
      } else {
        // null means unlink from ALL opportunities (legacy behaviour for single-unlink)
        // This path is only hit from old single-item unlink; we now use DELETE for targeted unlink
        await prisma.feedbackItemOpportunity.deleteMany({ where: { feedbackItemId: id } });
        const existing = await prisma.feedbackItem.findUnique({ where: { id }, select: { status: true } });
        if (existing?.status === "reviewed") data.status = "new";
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
