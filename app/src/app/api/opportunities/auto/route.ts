import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRequestContext, hasMinimumRole } from "@/lib/request-context";

interface ApplyCluster {
  title: string;
  description: string;
  productId?: string | null;
  feedbackItems: { id: string; title: string }[];
}

export async function POST(request: Request) {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(ctx.role, "editor")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await request.json();
    const clusters: ApplyCluster[] = body.clusters ?? [];

    if (clusters.length === 0) {
      return NextResponse.json({ message: "No clusters to apply.", created: 0, opportunities: [] });
    }

    const created = [];
    const allLinkedFeedbackIds = new Set<string>();

    for (const cluster of clusters) {
      const feedbackIds = (cluster.feedbackItems ?? []).map((f) => f.id).filter(Boolean);

      const validFeedback = await prisma.feedbackItem.findMany({
        where: { id: { in: feedbackIds }, organizationId: ctx.organizationId },
        select: { id: true },
      });
      const scopedFeedbackIds = validFeedback.map((f) => f.id);

      let scopedProductId: string | null = null;
      if (cluster.productId) {
        const product = await prisma.product.findFirst({ where: { id: cluster.productId, organizationId: ctx.organizationId }, select: { id: true } });
        scopedProductId = product?.id ?? null;
      }

      const ideas = scopedFeedbackIds.length
        ? await prisma.idea.findMany({
            where: { feedbackItemId: { in: scopedFeedbackIds }, organizationId: ctx.organizationId },
            select: { id: true },
          })
        : [];

      const opp = await prisma.opportunity.create({
        data: {
          organizationId: ctx.organizationId,
          title: cluster.title,
          description: cluster.description || null,
          productId: scopedProductId,
          ideaLinks: ideas.length
            ? { create: ideas.map((i) => ({ ideaId: i.id, organizationId: ctx.organizationId })) }
            : undefined,
        },
      });

      scopedFeedbackIds.forEach((id) => allLinkedFeedbackIds.add(id));
      created.push({ id: opp.id, title: opp.title, feedbackCount: ideas.length });
    }

    if (allLinkedFeedbackIds.size > 0) {
      await prisma.feedbackItem.updateMany({
        where: { id: { in: Array.from(allLinkedFeedbackIds) }, organizationId: ctx.organizationId },
        data: { status: "reviewed" },
      });
    }

    return NextResponse.json({
      message: `Created ${created.length} opportunities.`,
      created: created.length,
      opportunities: created,
    });
  } catch (error) {
    console.error("Error applying clusters:", error);
    return NextResponse.json({ error: "Apply failed" }, { status: 500 });
  }
}
