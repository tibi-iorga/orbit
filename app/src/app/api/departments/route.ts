import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRequestContext, hasMinimumRole } from "@/lib/request-context";

export async function GET() {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const departments = await prisma.department.findMany({
    where: { organizationId: ctx.organizationId },
    include: { _count: { select: { products: true, goals: true } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ departments });
}

export async function POST(request: Request) {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(ctx.role, "admin"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const department = await prisma.department.create({
    data: {
      organizationId: ctx.organizationId,
      name,
      description: body.description?.trim() || null,
    },
    include: { _count: { select: { products: true, goals: true } } },
  });

  return NextResponse.json(department, { status: 201 });
}
