import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import OpenAI from "openai";
import { parseScores, computeCombinedScore, type DimensionConfig } from "@/lib/score";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured" },
      { status: 500 }
    );
  }
  const openai = new OpenAI({ apiKey });

  const body = await request.json();
  const { opportunityId } = body;
  if (!opportunityId) return NextResponse.json({ error: "opportunityId required" }, { status: 400 });

  const opp = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    include: { feedbackItems: true },
  });
  if (!opp) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });

  const dimensions = await prisma.dimension.findMany({ orderBy: { order: "asc" } });
  const dimConfig: DimensionConfig[] = dimensions.map((d) => ({
    id: d.id,
    name: d.name,
    type: d.type as "yesno" | "scale",
    weight: d.weight,
    order: d.order,
    tag: d.tag,
  }));

  const scores = parseScores(opp.scores);
  const combined = computeCombinedScore(scores, dimConfig);

  const topItems = opp.feedbackItems
    .slice(0, 10)
    .map((f) => f.title);

  const prompt = `Summarize the change management implications of this feature opportunity in one short paragraph (3 to 5 sentences). Audience: healthcare leadership. Be concrete and avoid jargon. Do not use bullet points.

Opportunity title: ${opp.title}
Top feedback items: ${topItems.join("; ")}

Paragraph:`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4,
    max_tokens: 300,
  });

  const summary = completion.choices[0]?.message?.content?.trim() ?? "";
  await prisma.opportunity.update({
    where: { id: opportunityId },
    data: { reportSummary: summary },
  });

  return NextResponse.json({ reportSummary: summary });
}
