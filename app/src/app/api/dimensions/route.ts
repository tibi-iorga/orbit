import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dimensions = await prisma.dimension.findMany({ orderBy: { order: "asc" } });
  return NextResponse.json(dimensions);
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const { name, type, weight, order } = body;
  if (!name || !type) {
    return NextResponse.json({ error: "name and type required" }, { status: 400 });
  }
  const maxOrder = await prisma.dimension.aggregate({ _max: { order: true } });
  const dimension = await prisma.dimension.create({
    data: {
      name,
      type: type === "scale" ? "scale" : "yesno",
      weight: typeof weight === "number" ? weight : 1,
      order: typeof order === "number" ? order : (maxOrder._max.order ?? -1) + 1,
    },
  });
  return NextResponse.json(dimension);
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const { id, name, type, weight, order } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const data: { name?: string; type?: string; weight?: number; order?: number } = {};
  if (name !== undefined) data.name = name;
  if (type !== undefined) data.type = type === "scale" ? "scale" : "yesno";
  if (weight !== undefined) data.weight = weight;
  if (order !== undefined) data.order = order;
  const dimension = await prisma.dimension.update({ where: { id }, data });
  return NextResponse.json(dimension);
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.dimension.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
