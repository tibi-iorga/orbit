import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRequestContext, hasMinimumRole } from "@/lib/request-context";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(ctx.role, "admin"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const data: { name?: string; description?: string | null } = {};
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    data.name = name;
  }
  if (typeof body.description === "string") data.description = body.description.trim() || null;

  const result = await prisma.persona.updateMany({
    where: { id: params.id, organizationId: ctx.organizationId },
    data,
  });

  if (result.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (Array.isArray(body.productIds)) {
    const productIds: string[] = body.productIds;
    await prisma.personaProduct.deleteMany({ where: { personaId: params.id } });
    if (productIds.length) {
      await prisma.personaProduct.createMany({
        data: productIds.map((productId) => ({ personaId: params.id, productId })),
        skipDuplicates: true,
      });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(ctx.role, "admin"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.persona.deleteMany({
    where: { id: params.id, organizationId: ctx.organizationId },
  });

  return NextResponse.json({ ok: true });
}
