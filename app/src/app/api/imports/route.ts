import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRequestContext, hasMinimumRole } from "@/lib/request-context";

export async function GET() {
  try {
    const ctx = await getRequestContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const imports = await prisma.importRecord.findMany({
      where: { organizationId: ctx.organizationId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            feedbackItems: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const importsWithStats = imports.map((imp) => ({
      id: imp.id,
      filename: imp.filename,
      productId: imp.productId,
      productName: imp.product?.name || null,
      createdAt: imp.createdAt,
      feedbackCount: imp._count.feedbackItems,
    }));

    return NextResponse.json(importsWithStats);
  } catch (error) {
    console.error("Error fetching imports:", error);
    return NextResponse.json({ error: "Failed to fetch imports" }, { status: 500 });
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

    const target = await prisma.importRecord.findFirst({ where: { id, organizationId: ctx.organizationId } });
    if (!target) {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }

    if (target.filename === "Manual entry") {
      return NextResponse.json({ error: "The Manual entry record cannot be deleted." }, { status: 403 });
    }

    await prisma.importRecord.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }
    console.error("Error deleting import:", error);
    return NextResponse.json({ error: "Failed to delete import" }, { status: 500 });
  }
}
