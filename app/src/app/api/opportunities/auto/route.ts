import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

interface ApplyCluster {
  title: string;
  description: string;
  productId?: string | null;
  feedbackItems: { id: string; title: string }[];
}

/**
 * POST /api/opportunities/auto
 * Accepts a list of reviewed clusters (from the preview modal) and writes them to the DB.
 * No AI calls here — AI runs in /api/opportunities/preview.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

      const opp = await prisma.opportunity.create({
        data: {
          title: cluster.title,
          description: cluster.description || null,
          productId: cluster.productId || null,
          feedbackLinks: feedbackIds.length
            ? { create: feedbackIds.map((fid) => ({ feedbackItemId: fid })) }
            : undefined,
        },
      });

      feedbackIds.forEach((id) => allLinkedFeedbackIds.add(id));
      created.push({ id: opp.id, title: opp.title, feedbackCount: feedbackIds.length });
    }

    // Single bulk status update for all linked feedback items
    if (allLinkedFeedbackIds.size > 0) {
      await prisma.feedbackItem.updateMany({
        where: { id: { in: Array.from(allLinkedFeedbackIds) } },
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
