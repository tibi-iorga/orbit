import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRequestContext } from "@/lib/request-context";
import { generateOpportunityTitle } from "@/lib/opportunity-grouper";

export async function POST(request: Request) {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { opportunityIds?: string[] };
  const { opportunityIds } = body;

  if (!Array.isArray(opportunityIds) || opportunityIds.length < 2) {
    return NextResponse.json({ error: "At least 2 opportunityIds required" }, { status: 400 });
  }

  const opportunities = await prisma.opportunity.findMany({
    where: { id: { in: opportunityIds }, organizationId: ctx.organizationId },
    include: { ideaLinks: { select: { idea: { select: { text: true } } } } },
  });

  const sorted = [...opportunities].sort((a, b) => b.ideaLinks.length - a.ideaLinks.length);
  const fallback = sorted[0]?.title ?? "Merged opportunity";
  const allIdeas = opportunities.flatMap((o) => o.ideaLinks.map((l) => l.idea.text));

  const title = await generateOpportunityTitle({ organizationId: ctx.organizationId, ideas: allIdeas, fallback });

  return NextResponse.json({ title });
}
