import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRequestContext, hasMinimumRole } from "@/lib/request-context";

export async function GET() {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const org = await prisma.organization.findUnique({
    where: { id: ctx.organizationId },
    select: { id: true, name: true, description: true, strategicGoal: true },
  });

  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(org);
}

export async function PATCH(request: Request) {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(ctx.role, "admin"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const data: { description?: string; strategicGoal?: string } = {};

  if (typeof body.description === "string") data.description = body.description.trim() || null as unknown as string;
  if (typeof body.strategicGoal === "string") data.strategicGoal = body.strategicGoal.trim() || null as unknown as string;

  if (Object.keys(data).length === 0)
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const org = await prisma.organization.update({
    where: { id: ctx.organizationId },
    data,
    select: { id: true, name: true, description: true, strategicGoal: true },
  });

  return NextResponse.json(org);
}
