import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRequestContext, hasMinimumRole } from "@/lib/request-context";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(ctx.role, "admin"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const data: { title?: string; description?: string | null; departmentId?: string | null; status?: string } = {};

  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    data.title = title;
  }
  if (typeof body.description === "string") data.description = body.description.trim() || null;
  if ("departmentId" in body) data.departmentId = body.departmentId || null;
  if (typeof body.status === "string") data.status = body.status;

  const result = await prisma.goal.updateMany({
    where: { id: params.id, organizationId: ctx.organizationId },
    data,
  });

  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(ctx.role, "admin"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.goal.deleteMany({
    where: { id: params.id, organizationId: ctx.organizationId },
  });

  return NextResponse.json({ ok: true });
}
