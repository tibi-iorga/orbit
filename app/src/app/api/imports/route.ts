import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [imports, clusteredGroups, scoredGroups] = await Promise.all([
    prisma.importRecord.findMany({
      include: {
        product: { select: { id: true, name: true } },
        _count: { select: { features: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.feature.groupBy({
      by: ["importId"],
      where: { clusterId: { not: null }, importId: { not: null } },
      _count: { id: true },
    }),
    prisma.feature.groupBy({
      by: ["importId"],
      where: { scores: { not: null }, importId: { not: null } },
      _count: { id: true },
    }),
  ]);

  const clusteredByImport = Object.fromEntries(
    clusteredGroups.map((g) => [g.importId!, g._count.id])
  );
  const scoredByImport = Object.fromEntries(
    scoredGroups.map((g) => [g.importId!, g._count.id])
  );

  const result = imports.map((imp) => {
    const clusteredCount = clusteredByImport[imp.id] ?? 0;
    const scoredCount = scoredByImport[imp.id] ?? 0;
    return {
      id: imp.id,
      filename: imp.filename,
      productId: imp.productId,
      productName: imp.product?.name ?? null,
      createdAt: imp.createdAt,
      featureCount: imp._count.features,
      clusteredCount,
      unclusteredCount: imp._count.features - clusteredCount,
      scoredCount,
      unscoredCount: imp._count.features - scoredCount,
    };
  });

  return NextResponse.json(result);
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
