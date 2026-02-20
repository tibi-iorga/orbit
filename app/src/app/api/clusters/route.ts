import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const clusters = await prisma.cluster.findMany({
    include: { _count: { select: { features: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(
    clusters.map((c) => ({
      id: c.id,
      name: c.name,
      featureCount: c._count.features,
      reportSummary: c.reportSummary,
    }))
  );
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const { name } = body;
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const cluster = await prisma.cluster.create({ data: { name } });
  return NextResponse.json(cluster);
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const { id, name, reportSummary } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const data: { name?: string; reportSummary?: string | null } = {};
  if (name !== undefined) data.name = name;
  if (reportSummary !== undefined) data.reportSummary = reportSummary;
  const cluster = await prisma.cluster.update({ where: { id }, data });
  return NextResponse.json(cluster);
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.cluster.update({
    where: { id },
    data: { features: { set: [] } },
  });
  await prisma.cluster.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
