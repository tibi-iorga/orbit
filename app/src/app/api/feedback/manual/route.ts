import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { title, description, productId } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    if (productId && typeof productId === "string") {
      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product) {
        return NextResponse.json({ error: "Product not found" }, { status: 400 });
      }
    }

    // Find-or-create the persistent "Manual entry" ImportRecord
    let manualImport = await prisma.importRecord.findFirst({
      where: { filename: "Manual entry" },
    });
    if (!manualImport) {
      manualImport = await prisma.importRecord.create({
        data: { filename: "Manual entry", productId: null },
      });
    }

    const feedbackItem = await prisma.feedbackItem.create({
      data: {
        title: title.trim(),
        description:
          description && typeof description === "string" && description.trim()
            ? description.trim()
            : null,
        importId: manualImport.id,
        productId: productId && typeof productId === "string" ? productId : null,
      },
      include: {
        product: { select: { name: true } },
        import: { select: { filename: true } },
      },
    });

    return NextResponse.json({
      id: feedbackItem.id,
      title: feedbackItem.title,
      description: feedbackItem.description,
      status: feedbackItem.status,
      opportunities: [],
      productId: feedbackItem.productId,
      productName: feedbackItem.product?.name ?? null,
      sourceName: feedbackItem.import?.filename ?? null,
      createdAt: feedbackItem.createdAt.toISOString(),
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }
    console.error("Error creating manual feedback item:", error);
    return NextResponse.json({ error: "Failed to create feedback item" }, { status: 500 });
  }
}
