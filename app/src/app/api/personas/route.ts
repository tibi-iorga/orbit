import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRequestContext, hasMinimumRole } from "@/lib/request-context";

export async function GET() {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await prisma.persona.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: { name: "asc" },
    include: { products: { select: { productId: true } } },
  });

  const personas = raw.map(({ products, ...p }) => ({
    ...p,
    productIds: products.map((pp) => pp.productId),
  }));

  return NextResponse.json({ personas });
}

export async function POST(request: Request) {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(ctx.role, "admin"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const productIds: string[] = Array.isArray(body.productIds) ? body.productIds : [];

  const persona = await prisma.persona.create({
    data: {
      organizationId: ctx.organizationId,
      name,
      description: body.description?.trim() || null,
      products: productIds.length
        ? { create: productIds.map((productId) => ({ productId })) }
        : undefined,
    },
  });

  return NextResponse.json({ ...persona, productIds }, { status: 201 });
}
