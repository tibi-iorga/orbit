import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
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
          features: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const importsWithStats = await Promise.all(
    imports.map(async (imp) => {
      const clusteredCount = await prisma.feature.count({
        where: {
          importId: imp.id,
          clusterId: { not: null },
        },
      });
      const scoredCount = await prisma.feature.count({
        where: {
          importId: imp.id,
          scores: { not: null },
        },
      });

      return {
        id: imp.id,
        filename: imp.filename,
        productId: imp.productId,
        productName: imp.product?.name || null,
        createdAt: imp.createdAt,
        featureCount: imp._count.features,
        clusteredCount,
        unclusteredCount: imp._count.features - clusteredCount,
        scoredCount,
        unscoredCount: imp._count.features - scoredCount,
      };
    })
  );

  return NextResponse.json(importsWithStats);
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.importRecord.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}
