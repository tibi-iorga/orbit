import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRequestContext, hasMinimumRole } from "@/lib/request-context";

export async function GET(request: Request) {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const departmentId = searchParams.get("departmentId");

  const goals = await prisma.goal.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...(departmentId ? { departmentId } : {}),
    },
    include: {
      department: { select: { id: true, name: true } },
      _count: { select: { opportunities: true } },
    },
    orderBy: [{ status: "asc" }, { title: "asc" }],
  });

  return NextResponse.json({ goals });
}

export async function POST(request: Request) {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(ctx.role, "admin"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const title = body.title?.trim();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const goal = await prisma.goal.create({
    data: {
      organizationId: ctx.organizationId,
      title,
      description: body.description?.trim() || null,
      departmentId: body.departmentId || null,
      status: body.status ?? "active",
    },
    include: {
      department: { select: { id: true, name: true } },
      _count: { select: { opportunities: true } },
    },
  });

  return NextResponse.json(goal, { status: 201 });
}
