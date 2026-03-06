import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRequestContext, hasMinimumRole } from "@/lib/request-context";

export async function GET() {
  try {
    const ctx = await getRequestContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const dimensions = await prisma.dimension.findMany({
      where: { organizationId: ctx.organizationId, archived: false },
      orderBy: { order: "asc" },
    });
    return NextResponse.json(dimensions);
  } catch (error) {
    console.error("Error fetching dimensions:", error);
    return NextResponse.json({ error: "Failed to fetch dimensions" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await getRequestContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasMinimumRole(ctx.role, "editor")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const { name, type, weight, order, tag, direction } = body;
    if (!type) {
      return NextResponse.json({ error: "type required" }, { status: 400 });
    }

    const maxOrder = await prisma.dimension.aggregate({
      where: { organizationId: ctx.organizationId },
      _max: { order: true },
    });

    const dimension = await prisma.dimension.create({
      data: {
        organizationId: ctx.organizationId,
        name: name || "",
        type: type === "scale" ? "scale" : "yesno",
        weight: typeof weight === "number" ? weight : 1,
        order: typeof order === "number" ? order : (maxOrder._max.order ?? -1) + 1,
        tag: tag || "",
        direction: direction === "cost" ? "cost" : "benefit",
        archived: false,
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
    const ctx = await getRequestContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasMinimumRole(ctx.role, "editor")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const { id, name, type, weight, order, tag, direction, archived } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const existing = await prisma.dimension.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Dimension not found" }, { status: 404 });

    const data: {
      name?: string;
      type?: string;
      weight?: number;
      order?: number;
      tag?: string;
      direction?: string;
      archived?: boolean;
    } = {};

    if (name !== undefined) data.name = name;
    if (type !== undefined) data.type = type === "scale" ? "scale" : "yesno";
    if (weight !== undefined) data.weight = weight;
    if (order !== undefined) data.order = order;
    if (tag !== undefined) data.tag = tag;
    if (direction !== undefined) data.direction = direction === "cost" ? "cost" : "benefit";
    if (archived !== undefined) data.archived = Boolean(archived);

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
    const ctx = await getRequestContext();
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!hasMinimumRole(ctx.role, "editor")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const dimension = await prisma.dimension.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { id: true } });
    if (!dimension) return NextResponse.json({ error: "Dimension not found" }, { status: 404 });

    const scoredCount = await prisma.opportunity.count({
      where: { organizationId: ctx.organizationId, scores: { contains: id } },
    });

    let confirmed = false;
    try {
      const body = await request.json();
      confirmed = body.confirmed === true;
    } catch {
      confirmed = false;
    }

    if (!confirmed) {
      return NextResponse.json({ error: "confirmation required", scoredCount }, { status: 400 });
    }

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
