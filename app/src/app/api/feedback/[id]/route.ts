import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const item = await prisma.feedbackItem.findUnique({
    where: { id: params.id },
    include: {
      product: { select: { name: true } },
      opportunityLinks: { include: { opportunity: { select: { id: true, title: true } } } },
      import: { select: { filename: true } },
    },
  });

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
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
  });
}
