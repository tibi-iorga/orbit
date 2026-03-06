import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRequestContext, hasMinimumRole } from "@/lib/request-context";

export async function POST(request: Request) {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(ctx.role, "editor")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await request.json();
    const ids: string[] = body.ids ?? [];
    if (ids.length === 0) return NextResponse.json({ error: "ids required" }, { status: 400 });

    const scopedOpportunities = await prisma.opportunity.findMany({
      where: { id: { in: ids }, organizationId: ctx.organizationId },
      select: { id: true },
    });
    const scopedIds = scopedOpportunities.map((o) => o.id);
    if (scopedIds.length === 0) return NextResponse.json({ error: "No opportunities found" }, { status: 404 });

    const linkedIdeaLinks = await prisma.ideaOpportunity.findMany({
      where: { opportunityId: { in: scopedIds }, idea: { organizationId: ctx.organizationId } },
      select: { idea: { select: { feedbackItemId: true } } },
    });
    const linkedIds = Array.from(new Set(
      linkedIdeaLinks.map((l) => l.idea.feedbackItemId).filter(Boolean) as string[]
    ));

    await prisma.opportunity.deleteMany({ where: { id: { in: scopedIds }, organizationId: ctx.organizationId } });

    if (linkedIds.length > 0) {
      const stillLinked = await prisma.idea.findMany({
        where: {
          feedbackItemId: { in: linkedIds },
          organizationId: ctx.organizationId,
          opportunityLinks: { some: {} },
        },
        select: { feedbackItemId: true },
      });
      const stillLinkedIds = new Set(stillLinked.map((i) => i.feedbackItemId).filter(Boolean) as string[]);
      const toRevert = linkedIds.filter((fid) => !stillLinkedIds.has(fid));
      if (toRevert.length > 0) {
        await prisma.feedbackItem.updateMany({
          where: { id: { in: toRevert }, status: "reviewed", organizationId: ctx.organizationId },
          data: { status: "new" },
        });
      }
    }

    return NextResponse.json({ deleted: scopedIds.length });
  } catch (error) {
    console.error("Error bulk deleting opportunities:", error);
    return NextResponse.json({ error: "Bulk delete failed" }, { status: 500 });
  }
}
