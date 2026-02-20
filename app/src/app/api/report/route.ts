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
  const { clusterId } = body;
  if (!clusterId) return NextResponse.json({ error: "clusterId required" }, { status: 400 });

  const cluster = await prisma.cluster.findUnique({
    where: { id: clusterId },
    include: { features: true },
  });
  if (!cluster) return NextResponse.json({ error: "Cluster not found" }, { status: 404 });

  const dimensions = await prisma.dimension.findMany({ orderBy: { order: "asc" } });
  const dimConfig: DimensionConfig[] = dimensions.map((d) => ({
    id: d.id,
    name: d.name,
    type: d.type as "yesno" | "scale",
    weight: d.weight,
    order: d.order,
  }));

  const featuresWithScores = cluster.features.map((f) => {
    const scores = parseScores(f.scores);
    const combined = computeCombinedScore(scores, dimConfig);
    return { title: f.title, description: f.description, combinedScore: combined, scores };
  });

  const topItems = featuresWithScores
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .slice(0, 10)
    .map((f) => f.title);

  const prompt = `Summarize the change management implications of this feature cluster in one short paragraph (3 to 5 sentences). Audience: healthcare leadership. Be concrete and avoid jargon. Do not use bullet points.

Cluster name: ${cluster.name}
Top features by score: ${topItems.join("; ")}

Paragraph:`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4,
    max_tokens: 300,
  });

  const summary = completion.choices[0]?.message?.content?.trim() ?? "";
  await prisma.cluster.update({
    where: { id: clusterId },
    data: { reportSummary: summary },
  });

  return NextResponse.json({ reportSummary: summary });
}
