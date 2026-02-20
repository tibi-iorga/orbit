import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

interface ProductWithCounts {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
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

  // Create nodes
  products.forEach((p) => {
    productMap.set(p.id, { ...p, children: [] });
  });

  // Build tree
  products.forEach((p) => {
    const node = productMap.get(p.id)!;
    if (p.parentId) {
      const parent = productMap.get(p.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        // Parent not found, treat as root
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  });

  // Sort children recursively
  function sortTree(nodes: ProductNode[]): ProductNode[] {
    return nodes
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((node) => ({
        ...node,
        children: sortTree(node.children),
      }));
  }

  return sortTree(roots);
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const products = await prisma.product.findMany({
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
      feedbackCount: p._count.feedbackItems,
      opportunityCount: p._count.opportunities,
      importCount: p._count.imports,
      createdAt: p.createdAt,
    }));

    // Return both flat list (for compatibility) and tree structure
    return NextResponse.json({
      flat: flatProducts,
      tree: buildProductTree(flatProducts),
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}

async function checkCircularReference(productId: string, newParentId: string | null): Promise<boolean> {
  if (!newParentId) return false;
  if (productId === newParentId) return true;
  
  let currentId: string | null = newParentId;
  const visited = new Set<string>();
  
  while (currentId) {
    if (visited.has(currentId)) return true; // Cycle detected
    if (currentId === productId) return true; // Would create cycle
    visited.add(currentId);
    
    const parent: { parentId: string | null } | null = await prisma.product.findUnique({
      where: { id: currentId },
      select: { parentId: true },
    });

    currentId = parent?.parentId || null;
  }
  
  return false;
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    const { name, description, parentId } = body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }

    // Validate parentId if provided
    if (parentId !== undefined && parentId !== null) {
      if (typeof parentId !== "string") {
        return NextResponse.json({ error: "parentId must be a string or null" }, { status: 400 });
      }
      const parentExists = await prisma.product.findUnique({ where: { id: parentId } });
      if (!parentExists) {
        return NextResponse.json({ error: "Parent product not found" }, { status: 404 });
      }
    }

    const product = await prisma.product.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        parentId: parentId || null,
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
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    const { id, name, description, parentId } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const data: { name?: string; description?: string | null; parentId?: string | null } = {};
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
      // Check for circular reference
      const wouldCreateCycle = await checkCircularReference(id, parentId);
      if (wouldCreateCycle) {
        return NextResponse.json({ error: "Cannot set parent: would create circular reference" }, { status: 400 });
      }
      // Validate parent exists if provided
      if (parentId) {
        const parentExists = await prisma.product.findUnique({ where: { id: parentId } });
        if (!parentExists) {
          return NextResponse.json({ error: "Parent product not found" }, { status: 404 });
        }
      }
      data.parentId = parentId;
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
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    // Check if product has children
    const childCount = await prisma.product.count({ where: { parentId: id } });
    if (childCount > 0) {
      return NextResponse.json(
        { error: "Cannot delete product: it has child products. Delete or reassign children first." },
        { status: 400 }
      );
    }

    await prisma.product.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }
    console.error("Error deleting product:", error);
    return NextResponse.json({ error: "Failed to delete product" }, { status: 500 });
  }
}
