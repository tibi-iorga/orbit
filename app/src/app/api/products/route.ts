import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRequestContext, hasMinimumRole } from "@/lib/request-context";

interface ProductWithCounts {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  departmentId: string | null;
  feedbackCount: number;
  opportunityCount: number;
  importCount: number;
  createdAt: Date;
}

interface ProductNode extends ProductWithCounts {
  children: ProductNode[];
}

function buildProductTree(products: ProductWithCounts[]): ProductNode[] {
  const productMap = new Map<string, ProductNode>();
  const roots: ProductNode[] = [];

  products.forEach((p) => {
    productMap.set(p.id, { ...p, children: [] });
  });

  products.forEach((p) => {
    const node = productMap.get(p.id)!;
    if (p.parentId) {
      const parent = productMap.get(p.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  });

  function sortTree(nodes: ProductNode[]): ProductNode[] {
    return nodes
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((node) => ({ ...node, children: sortTree(node.children) }));
  }

  return sortTree(roots);
}

export async function GET() {
  try {
    const ctx = await getRequestContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const products = await prisma.product.findMany({
      where: { organizationId: ctx.organizationId },
      include: {
        _count: {
          select: {
            feedbackItems: true,
            opportunities: true,
            imports: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    const flatProducts: ProductWithCounts[] = products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      parentId: p.parentId,
      departmentId: p.departmentId,
      feedbackCount: p._count.feedbackItems,
      opportunityCount: p._count.opportunities,
      importCount: p._count.imports,
      createdAt: p.createdAt,
    }));

    return NextResponse.json({
      flat: flatProducts,
      tree: buildProductTree(flatProducts),
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}

async function checkCircularReference(productId: string, newParentId: string | null, organizationId: string): Promise<boolean> {
  if (!newParentId) return false;
  if (productId === newParentId) return true;

  let currentId: string | null = newParentId;
  const visited = new Set<string>();

  while (currentId) {
    if (visited.has(currentId)) return true;
    if (currentId === productId) return true;
    visited.add(currentId);

    const parent: { parentId: string | null } | null = await prisma.product.findFirst({
      where: { id: currentId, organizationId },
      select: { parentId: true },
    });

    currentId = parent?.parentId || null;
  }

  return false;
}

export async function POST(request: Request) {
  try {
    const ctx = await getRequestContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasMinimumRole(ctx.role, "editor")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const { name, description, parentId, departmentId } = body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }

    if (parentId !== undefined && parentId !== null) {
      if (typeof parentId !== "string") {
        return NextResponse.json({ error: "parentId must be a string or null" }, { status: 400 });
      }
      const parentExists = await prisma.product.findFirst({ where: { id: parentId, organizationId: ctx.organizationId } });
      if (!parentExists) {
        return NextResponse.json({ error: "Parent product not found" }, { status: 404 });
      }
    }

    if (departmentId) {
      const deptExists = await prisma.department.findFirst({ where: { id: departmentId, organizationId: ctx.organizationId } });
      if (!deptExists) return NextResponse.json({ error: "Department not found" }, { status: 404 });
    }

    const product = await prisma.product.create({
      data: {
        organizationId: ctx.organizationId,
        name: name.trim(),
        description: description?.trim() || null,
        parentId: parentId || null,
        departmentId: departmentId || null,
      },
      include: {
        _count: {
          select: {
            feedbackItems: true,
            opportunities: true,
            imports: true,
          },
        },
      },
    });

    return NextResponse.json({
      id: product.id,
      name: product.name,
      description: product.description,
      parentId: product.parentId,
      departmentId: product.departmentId,
      feedbackCount: product._count.feedbackItems,
      opportunityCount: product._count.opportunities,
      importCount: product._count.imports,
      createdAt: product.createdAt,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }
    console.error("Error creating product:", error);
    return NextResponse.json({ error: "Failed to create product" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await getRequestContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasMinimumRole(ctx.role, "editor")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const { id, name, description, parentId, departmentId } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const existing = await prisma.product.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    const data: { name?: string; description?: string | null; parentId?: string | null; departmentId?: string | null } = {};
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
      }
      data.name = name.trim();
    }
    if (description !== undefined) {
      data.description = description === null || description === "" ? null : String(description).trim();
    }
    if (parentId !== undefined) {
      if (parentId !== null && typeof parentId !== "string") {
        return NextResponse.json({ error: "parentId must be a string or null" }, { status: 400 });
      }
      const wouldCreateCycle = await checkCircularReference(id, parentId, ctx.organizationId);
      if (wouldCreateCycle) {
        return NextResponse.json({ error: "Cannot set parent: would create circular reference" }, { status: 400 });
      }
      if (parentId) {
        const parentExists = await prisma.product.findFirst({ where: { id: parentId, organizationId: ctx.organizationId } });
        if (!parentExists) {
          return NextResponse.json({ error: "Parent product not found" }, { status: 404 });
        }
      }
      data.parentId = parentId;
    }
    if ("departmentId" in body) {
      if (departmentId) {
        const deptExists = await prisma.department.findFirst({ where: { id: departmentId, organizationId: ctx.organizationId } });
        if (!deptExists) return NextResponse.json({ error: "Department not found" }, { status: 404 });
      }
      data.departmentId = departmentId || null;
    }

    const product = await prisma.product.update({
      where: { id },
      data,
      include: {
        _count: {
          select: {
            feedbackItems: true,
            opportunities: true,
            imports: true,
          },
        },
      },
    });

    return NextResponse.json({
      id: product.id,
      name: product.name,
      description: product.description,
      parentId: product.parentId,
      departmentId: product.departmentId,
      feedbackCount: product._count.feedbackItems,
      opportunityCount: product._count.opportunities,
      importCount: product._count.imports,
      createdAt: product.createdAt,
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    console.error("Error updating product:", error);
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await getRequestContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasMinimumRole(ctx.role, "editor")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const existing = await prisma.product.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    const childCount = await prisma.product.count({ where: { parentId: id, organizationId: ctx.organizationId } });
    if (childCount > 0) {
      return NextResponse.json(
        { error: "Cannot delete product: it has child products. Delete or reassign children first." },
        { status: 400 }
      );
    }

    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    console.error("Error deleting product:", error);
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
  }
}
