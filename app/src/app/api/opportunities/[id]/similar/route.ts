import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRequestContext } from "@/lib/request-context";
import { parseEmbedding, cosineSimilarity } from "@/lib/semantic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const target = await prisma.opportunity.findFirst({
    where: { id, organizationId: ctx.organizationId },
    select: { semanticEmbedding: true },
  });

  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const targetEmbedding = parseEmbedding(target.semanticEmbedding);
  if (!targetEmbedding) return NextResponse.json({ similar: [] });

  const others = await prisma.opportunity.findMany({
    where: {
      organizationId: ctx.organizationId,
      id: { not: id },
      status: { not: "archived" },
    },
    select: {
      id: true,
      title: true,
      semanticEmbedding: true,
      _count: { select: { ideaLinks: true } },
    },
  });

  const scored = others
    .flatMap((o) => {
      const emb = parseEmbedding(o.semanticEmbedding);
      if (!emb) return [];
      const similarity = cosineSimilarity(targetEmbedding, emb);
      if (similarity < 0.6) return [];
      return [{ id: o.id, title: o.title, feedbackCount: o._count.ideaLinks, similarity }];
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 4);

  return NextResponse.json({ similar: scored });
}
