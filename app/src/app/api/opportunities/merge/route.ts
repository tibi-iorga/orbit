import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRequestContext, hasMinimumRole } from "@/lib/request-context";
import { generateEmbedding } from "@/lib/semantic";
import { generateOpportunityTitle, enqueueOpportunityGrouping } from "@/lib/opportunity-grouper";

// Multi-way merge: accepts opportunityIds[] (≥2), merges all into the one with most ideas
export async function POST(request: Request) {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(ctx.role, "editor")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await request.json();
    const { opportunityIds, title: providedTitle } = body as { opportunityIds?: string[]; title?: string };

    if (!Array.isArray(opportunityIds) || opportunityIds.length < 2) {
      return NextResponse.json({ error: "At least 2 opportunityIds required" }, { status: 400 });
    }

    const opportunities = await prisma.opportunity.findMany({
      where: { id: { in: opportunityIds }, organizationId: ctx.organizationId },
      include: { _count: { select: { ideaLinks: true } } },
    });

    if (opportunities.length !== opportunityIds.length) {
      return NextResponse.json({ error: "One or more opportunities not found" }, { status: 404 });
    }

    // Target = opportunity with most ideas; sources = the rest
    opportunities.sort((a, b) => b._count.ideaLinks - a._count.ideaLinks);
    const target = opportunities[0];
    const sourceIds = opportunities.slice(1).map((o) => o.id);

    // Get all idea IDs from source opportunities
    const sourceLinks = await prisma.ideaOpportunity.findMany({
      where: { opportunityId: { in: sourceIds }, idea: { organizationId: ctx.organizationId } },
      select: { ideaId: true, organizationId: true },
    });
    const ideaIds = Array.from(new Set(sourceLinks.map((l) => l.ideaId)));

    // Move ideas to target
    for (const ideaId of ideaIds) {
      await prisma.ideaOpportunity.upsert({
        where: { ideaId_opportunityId: { ideaId, opportunityId: target.id } },
        create: { ideaId, opportunityId: target.id, organizationId: ctx.organizationId },
        update: {},
      });
    }

    // Delete source opportunities (cascades their IdeaOpportunity records)
    await prisma.opportunity.deleteMany({
      where: { id: { in: sourceIds }, organizationId: ctx.organizationId },
    });

    // Reload target with all ideas for title recalculation
    const updatedTarget = await prisma.opportunity.findUnique({
      where: { id: target.id },
      include: { ideaLinks: { select: { idea: { select: { text: true } } } } },
    });
    if (!updatedTarget) return NextResponse.json({ error: "Target opportunity missing after merge" }, { status: 500 });

    const ideaTexts = updatedTarget.ideaLinks.map((l) => l.idea.text);
    const newTitle = providedTitle?.trim()
      || await generateOpportunityTitle({ organizationId: ctx.organizationId, ideas: ideaTexts, fallback: target.title });
    const embedding = await generateEmbedding(ctx.organizationId, newTitle);

    await prisma.opportunity.update({
      where: { id: target.id },
      data: {
        title: newTitle,
        confidence: Math.min(1, 0.35 + updatedTarget.ideaLinks.length * 0.1),
        ...(embedding ? { semanticEmbedding: embedding } : {}),
      },
    });

    enqueueOpportunityGrouping(ctx.organizationId);

    return NextResponse.json({ ok: true, targetId: target.id, title: newTitle });
  } catch (error) {
    console.error("Error merging opportunities:", error);
    return NextResponse.json({ error: "Failed to merge opportunities" }, { status: 500 });
  }
}
