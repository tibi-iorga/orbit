import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const { sourceId, targetId } = body;
    if (!sourceId || !targetId) {
      return NextResponse.json({ error: "sourceId and targetId required" }, { status: 400 });
    }

    // Get all feedback items linked to the source opportunity
    const sourceLinks = await prisma.feedbackItemOpportunity.findMany({
      where: { opportunityId: sourceId },
      select: { feedbackItemId: true },
    });

    // Upsert links to target (some items may already be linked to target)
    for (const link of sourceLinks) {
      await prisma.feedbackItemOpportunity.upsert({
        where: {
          feedbackItemId_opportunityId: {
            feedbackItemId: link.feedbackItemId,
            opportunityId: targetId,
          },
        },
        create: { feedbackItemId: link.feedbackItemId, opportunityId: targetId },
        update: {},
      });
    }

    // Delete source (cascade deletes its feedbackLinks)
    await prisma.opportunity.delete({ where: { id: sourceId } });

    const opp = await prisma.opportunity.findUnique({
      where: { id: targetId },
      include: { _count: { select: { feedbackLinks: true } } },
    });
    return NextResponse.json(opp);
  } catch (error) {
    console.error("Error merging opportunities:", error);
    return NextResponse.json({ error: "Failed to merge opportunities" }, { status: 500 });
  }
}
