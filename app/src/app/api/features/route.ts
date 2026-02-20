import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  parseScores,
  computeCombinedScore,
  type DimensionConfig,
} from "@/lib/score";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dimensions = await prisma.dimension.findMany({ orderBy: { order: "asc" } });
  const dimConfig: DimensionConfig[] = dimensions.map((d) => ({
    id: d.id,
    name: d.name,
    type: d.type as "yesno" | "scale",
    weight: d.weight,
    order: d.order,
  }));
  const { searchParams } = new URL(request.url);
  const clusterId = searchParams.get("clusterId");
  const productId = searchParams.get("productId");
  const page = parseInt(searchParams.get("page") || "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") || "50", 10);
  const skip = (page - 1) * pageSize;

  const where: {
    clusterId?: string | null;
    productId?: string | null;
  } = {};
  
  if (clusterId) {
    where.clusterId = clusterId === "__unassigned__" ? null : clusterId;
  }
  
  if (productId) {
    where.productId = productId === "__unassigned__" ? null : productId;
  }

  const [features, totalCount] = await Promise.all([
    prisma.feature.findMany({
      where,
      include: {
        cluster: { select: { name: true } },
        product: { select: { name: true } },
      },
      orderBy: [{ clusterId: "asc" }, { title: "asc" }],
      skip,
      take: pageSize,
    }),
    prisma.feature.count({ where }),
  ]);

  const rows = features.map((f) => {
    const scores = parseScores(f.scores);
    const combinedScore = computeCombinedScore(scores, dimConfig);
    let explanation: Record<string, string> = {};
    try {
      if (f.explanation) explanation = JSON.parse(f.explanation);
    } catch {}
    return {
      id: f.id,
      title: f.title,
      description: f.description,
      clusterId: f.clusterId,
      clusterName: f.cluster?.name ?? null,
      productId: f.productId,
      productName: f.product?.name ?? null,
      scores,
      explanation,
      combinedScore,
    };
  });

  const clusters = await prisma.cluster.findMany({
    include: { _count: { select: { features: true } } },
    orderBy: { name: "asc" },
  });

  const products = await prisma.product.findMany({
    include: { _count: { select: { features: true } } },
    orderBy: { name: "asc" },
  });

  const totalUnassigned = await prisma.feature.count({
    where: { clusterId: null },
  });

  return NextResponse.json({
    features: rows,
    dimensions: dimConfig,
    clusters: clusters.map((c) => ({
      id: c.id,
      name: c.name,
      featureCount: c._count.features,
      reportSummary: c.reportSummary,
    })),
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      featureCount: p._count.features,
    })),
    totalUnassigned,
    pagination: {
      page,
      pageSize,
      total: totalCount,
      totalPages: Math.ceil(totalCount / pageSize),
    },
  });
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const { id, scores, explanation, clusterId } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const data: { scores?: string; explanation?: string; clusterId?: string | null } = {};
  if (scores !== undefined) data.scores = JSON.stringify(scores);
  if (explanation !== undefined) data.explanation = JSON.stringify(explanation);
  if (clusterId !== undefined) data.clusterId = clusterId || null;
  const feature = await prisma.feature.update({ where: { id }, data });
  return NextResponse.json(feature);
}
