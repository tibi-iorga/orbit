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

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    
    const { searchParams } = new URL(request.url);
    const productIds = searchParams.getAll("productId");
    const opportunityId = searchParams.get("opportunityId");
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "50", 10);
    const skip = (page - 1) * pageSize;

    const where: {
      productId?: string | { in: string[] } | null;
      opportunityId?: string | null;
      status?: string;
    } = {};

    if (status) {
      where.status = status;
    }
    
    let needsCombinedQuery = false;
    let allProductIds: string[] = [];
    
    if (productIds.length > 0) {
      const hasUnassigned = productIds.includes("__unassigned__");
      const regularProductIds = productIds.filter((id) => id !== "__unassigned__");
      
      if (regularProductIds.length > 0) {
        for (const productId of regularProductIds) {
          allProductIds.push(productId, ...(await getAllDescendantProductIds(productId)));
        }
      }
      
      if (hasUnassigned && regularProductIds.length > 0) {
        // Both unassigned and specific products - need OR query
        needsCombinedQuery = true;
      } else if (hasUnassigned) {
        // Only unassigned
        where.productId = null;
      } else {
        // Only specific products
        where.productId = { in: allProductIds };
      }
    }

    if (opportunityId === "__unassigned__") {
      where.opportunityId = null;
    } else if (opportunityId) {
      where.opportunityId = opportunityId;
    }

    let feedbackItems;
    let totalCount;
    
    if (needsCombinedQuery) {
      // Fetch both assigned and unassigned, then combine
      const opportunityWhere = where.opportunityId !== undefined ? { opportunityId: where.opportunityId } : {};
      const [assignedItems, unassignedItems, assignedCount, unassignedCount] = await Promise.all([
        allProductIds.length > 0
          ? prisma.feedbackItem.findMany({
              where: { ...opportunityWhere, productId: { in: allProductIds } },
              include: {
                product: { select: { name: true } },
                opportunity: { select: { title: true } },
                import: { select: { filename: true } },
              },
              orderBy: { createdAt: "desc" },
            })
          : [],
        prisma.feedbackItem.findMany({
          where: { ...opportunityWhere, productId: null },
          include: {
            product: { select: { name: true } },
            opportunity: { select: { title: true } },
            import: { select: { filename: true } },
          },
          orderBy: { createdAt: "desc" },
        }),
        allProductIds.length > 0
          ? prisma.feedbackItem.count({ where: { ...opportunityWhere, productId: { in: allProductIds } } })
          : 0,
        prisma.feedbackItem.count({ where: { ...opportunityWhere, productId: null } }),
      ]);
      
      const combined = [...assignedItems, ...unassignedItems]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      
      totalCount = assignedCount + unassignedCount;
      feedbackItems = combined.slice(skip, skip + pageSize);
    } else {
      const [items, count] = await Promise.all([
        prisma.feedbackItem.findMany({
          where,
          include: {
            product: { select: { name: true } },
            opportunity: { select: { title: true } },
            import: { select: { filename: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: pageSize,
        }),
        prisma.feedbackItem.count({ where }),
      ]);
      feedbackItems = items;
      totalCount = count;
    }
    
    const [totalUnassigned, newCount] = await Promise.all([
      prisma.feedbackItem.count({ where: { opportunityId: null } }),
      prisma.feedbackItem.count({ where: { status: "new" } }),
    ]);

    const items = feedbackItems.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      status: item.status,
      opportunityId: item.opportunityId,
      opportunityTitle: item.opportunity?.title ?? null,
      productId: item.productId,
      productName: item.product?.name ?? null,
      sourceName: item.import?.filename ?? null,
      createdAt: item.createdAt.toISOString(),
    }));

    const products = await prisma.product.findMany({
      include: { _count: { select: { feedbackItems: true } } },
      orderBy: { name: "asc" },
    });

    const productsWithAggregatedCounts = await Promise.all(
      products.map(async (p) => {
        const descendantIds = await getAllDescendantProductIds(p.id);
        const allProductIds = [p.id, ...descendantIds];
        const aggregatedFeedbackCount = await prisma.feedbackItem.count({
          where: { productId: { in: allProductIds } },
        });
        return {
          id: p.id,
          name: p.name,
          parentId: p.parentId,
          feedbackCount: aggregatedFeedbackCount,
        };
      })
    );

    const opportunities = await prisma.opportunity.findMany({
      include: { _count: { select: { feedbackItems: true } } },
      orderBy: { title: "asc" },
    });

    return NextResponse.json({
      feedbackItems: items,
      opportunities: opportunities.map((r) => ({
        id: r.id,
        title: r.title,
        feedbackCount: r._count.feedbackItems,
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

    // Bulk update: { ids: [...], status: "rejected" | ... , opportunityId: ... }
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
        bulkData.opportunityId = opportunityId === null || opportunityId === "" ? null : opportunityId;
        if (bulkData.opportunityId) {
          bulkData.status = "reviewed";
        }
      }

      await prisma.feedbackItem.updateMany({
        where: { id: { in: ids } },
        data: bulkData,
      });

      return NextResponse.json({ updated: ids.length });
    }

    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    
    const data: Record<string, unknown> = {};
    if (opportunityId !== undefined) {
      const resolvedOpportunityId = opportunityId === null || opportunityId === "" ? null : opportunityId;
      data.opportunityId = resolvedOpportunityId;
      // Auto-revert to "new" when opportunity is removed from a reviewed item
      if (!resolvedOpportunityId) {
        const existing = await prisma.feedbackItem.findUnique({ where: { id }, select: { status: true } });
        if (existing?.status === "reviewed") {
          data.status = "new";
        }
      }
    }
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
    
    const feedbackItem = await prisma.feedbackItem.update({ 
      where: { id }, 
      data,
      include: {
        product: { select: { name: true } },
        opportunity: { select: { title: true } },
        import: { select: { filename: true } },
      },
    });
    return NextResponse.json({
      id: feedbackItem.id,
      title: feedbackItem.title,
      description: feedbackItem.description,
      status: feedbackItem.status,
      opportunityId: feedbackItem.opportunityId,
      opportunityTitle: feedbackItem.opportunity?.title ?? null,
      productId: feedbackItem.productId,
      productName: feedbackItem.product?.name ?? null,
      sourceName: feedbackItem.import?.filename ?? null,
      createdAt: feedbackItem.createdAt.toISOString(),
    });
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
