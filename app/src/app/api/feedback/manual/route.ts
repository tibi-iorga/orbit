import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRequestContext, hasMinimumRole } from "@/lib/request-context";
import { enqueueFeedbackProcessing } from "@/lib/feedback-processor";

export async function POST(request: Request) {
  try {
    const ctx = await getRequestContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasMinimumRole(ctx.role, "editor")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const { title, description, productId } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    if (productId && typeof productId === "string") {
      const product = await prisma.product.findFirst({ where: { id: productId, organizationId: ctx.organizationId } });
      if (!product) {
        return NextResponse.json({ error: "Product not found" }, { status: 400 });
      }
    }

    let manualImport = await prisma.importRecord.findFirst({
      where: { filename: "Manual entry", organizationId: ctx.organizationId },
    });

    if (!manualImport) {
      manualImport = await prisma.importRecord.create({
        data: { filename: "Manual entry", productId: null, organizationId: ctx.organizationId },
      });
    }

    const feedbackItem = await prisma.feedbackItem.create({
      data: {
        organizationId: ctx.organizationId,
        title: title.trim(),
        description: description && typeof description === "string" && description.trim() ? description.trim() : null,
        importId: manualImport.id,
        productId: productId && typeof productId === "string" ? productId : null,
        processingStatus: "not_processed",
      },
      include: {
        product: { select: { name: true } },
        import: { select: { filename: true } },
      },
    });

    enqueueFeedbackProcessing(ctx.organizationId, [feedbackItem.id]);

    return NextResponse.json({
      id: feedbackItem.id,
      title: feedbackItem.title,
      description: feedbackItem.description,
      status: feedbackItem.status,
      processingStatus: feedbackItem.processingStatus,
      feedbackInsights: {
        improvedSummary: null,
        likelyDestination: null,
        confidence: null,
        reasonSignals: [],
      },
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
