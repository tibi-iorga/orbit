import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const imports = await prisma.importRecord.findMany({
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

    const importsWithStats = await Promise.all(
      imports.map(async (imp) => {
        return {
          id: imp.id,
          filename: imp.filename,
          productId: imp.productId,
          productName: imp.product?.name || null,
          createdAt: imp.createdAt,
          feedbackCount: imp._count.feedbackItems,
        };
      })
    );

    return NextResponse.json(importsWithStats);
  } catch (error) {
    console.error("Error fetching imports:", error);
    return NextResponse.json({ error: "Failed to fetch imports" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    await prisma.importRecord.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Import not found" }, { status: 404 });
    }
    console.error("Error deleting import:", error);
    return NextResponse.json({ error: "Failed to delete import" }, { status: 500 });
  }
}
