import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const dimensions = await prisma.dimension.findMany({ orderBy: { order: "asc" } });
    return NextResponse.json(dimensions);
  } catch (error) {
    console.error("Error fetching dimensions:", error);
    return NextResponse.json({ error: "Failed to fetch dimensions" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    const { name, type, weight, order, tag } = body;
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
        tag: tag || "General",
      },
    });
    return NextResponse.json(dimension);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }
    console.error("Error creating dimension:", error);
    return NextResponse.json({ error: "Failed to create dimension" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    const { id, name, type, weight, order, tag } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const data: { name?: string; type?: string; weight?: number; order?: number; tag?: string } = {};
    if (name !== undefined) data.name = name;
    if (type !== undefined) data.type = type === "scale" ? "scale" : "yesno";
    if (weight !== undefined) data.weight = weight;
    if (order !== undefined) data.order = order;
    if (tag !== undefined) data.tag = tag;
    const dimension = await prisma.dimension.update({ where: { id }, data });
    return NextResponse.json(dimension);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Dimension not found" }, { status: 404 });
    }
    console.error("Error updating dimension:", error);
    return NextResponse.json({ error: "Failed to update dimension" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await prisma.dimension.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
      return NextResponse.json({ error: "Dimension not found" }, { status: 404 });
    }
    console.error("Error deleting dimension:", error);
    return NextResponse.json({ error: "Failed to delete dimension" }, { status: 500 });
  }
}
