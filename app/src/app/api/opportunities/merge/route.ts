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
    await prisma.feedbackItem.updateMany({
      where: { opportunityId: sourceId },
      data: { opportunityId: targetId },
    });
    await prisma.opportunity.delete({ where: { id: sourceId } });
    const opp = await prisma.opportunity.findUnique({ where: { id: targetId } });
    return NextResponse.json(opp);
  } catch (error) {
    console.error("Error merging opportunities:", error);
    return NextResponse.json({ error: "Failed to merge opportunities" }, { status: 500 });
  }
}
