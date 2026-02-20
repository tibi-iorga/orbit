import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const { sourceId, targetId } = body;
  if (!sourceId || !targetId) {
    return NextResponse.json({ error: "sourceId and targetId required" }, { status: 400 });
  }
  await prisma.feature.updateMany({
    where: { clusterId: sourceId },
    data: { clusterId: targetId },
  });
  await prisma.cluster.delete({ where: { id: sourceId } });
  const cluster = await prisma.cluster.findUnique({ where: { id: targetId } });
  return NextResponse.json(cluster);
}
