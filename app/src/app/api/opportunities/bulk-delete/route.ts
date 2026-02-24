import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * POST /api/opportunities/bulk-delete
 * Body: { ids: string[] }
 * Deletes the given opportunities and reverts linked feedback items to "new"
 * if they have no remaining opportunity links.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const ids: string[] = body.ids ?? [];
    if (ids.length === 0) return NextResponse.json({ error: "ids required" }, { status: 400 });

    // Collect all feedback items linked to these opportunities
    const linkedItems = await prisma.feedbackItemOpportunity.findMany({
      where: { opportunityId: { in: ids } },
      select: { feedbackItemId: true },
    });
    const linkedIds = Array.from(new Set(linkedItems.map((l) => l.feedbackItemId)));

    // Delete all opportunities (join rows cascade via schema)
    await prisma.opportunity.deleteMany({ where: { id: { in: ids } } });

    // Revert feedback items that now have no remaining opportunity links
    if (linkedIds.length > 0) {
      const stillLinked = await prisma.feedbackItemOpportunity.findMany({
        where: { feedbackItemId: { in: linkedIds } },
        select: { feedbackItemId: true },
      });
      const stillLinkedIds = new Set(stillLinked.map((l) => l.feedbackItemId));
      const toRevert = linkedIds.filter((fid) => !stillLinkedIds.has(fid));
      if (toRevert.length > 0) {
        await prisma.feedbackItem.updateMany({
          where: { id: { in: toRevert }, status: "reviewed" },
          data: { status: "new" },
        });
      }
    }

    return NextResponse.json({ deleted: ids.length });
  } catch (error) {
    console.error("Error bulk deleting opportunities:", error);
    return NextResponse.json({ error: "Bulk delete failed" }, { status: 500 });
  }
}
