import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import OpenAI from "openai";

export async function POST() {
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

  const unassigned = await prisma.feature.findMany({
    where: { clusterId: null },
    select: { id: true, title: true, description: true },
    take: 1000,
  });

  if (unassigned.length === 0) {
    return NextResponse.json(
      { error: "No unassigned features to cluster" },
      { status: 400 }
    );
  }

  if (unassigned.length > 500) {
    return NextResponse.json(
      { error: `Too many unassigned features (${unassigned.length}). Please cluster in batches of 500 or fewer.` },
      { status: 400 }
    );
  }

  const itemsText = unassigned
    .map(
      (f) =>
        `- id: ${f.id}\n  title: ${f.title}\n  description: ${f.description ?? ""}`
    )
    .join("\n");

  const prompt = `You are grouping feature requests into 5 to 8 thematic clusters. For each feature, assign exactly one cluster. Reply with valid JSON only, no markdown or explanation.

Format:
{
  "clusters": [ { "id": "short-id", "name": "Human-readable cluster name" }, ... ],
  "assignments": [ { "featureId": "<feature id>", "clusterId": "<cluster id>" }, ... ]
}

Features to cluster:
${itemsText}`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
  });

  const raw = completion.choices[0]?.message?.content?.trim() ?? "";
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  if (!parsed?.clusters?.length || !parsed?.assignments?.length) {
    return NextResponse.json(
      { error: "Invalid clustering response from AI" },
      { status: 500 }
    );
  }

  // Create all clusters in one batch, then map AI temp IDs to real DB IDs
  const clusterIdMap: Record<string, string> = {};
  await Promise.all(
    parsed.clusters.map(async (c: { id: string; name: string }) => {
      const created = await prisma.cluster.create({ data: { name: c.name } });
      clusterIdMap[c.id] = created.id;
    })
  );

  // Group assignments by real cluster ID, then run one updateMany per cluster
  const byCluster: Record<string, string[]> = {};
  for (const a of parsed.assignments) {
    const clusterId = clusterIdMap[a.clusterId];
    if (clusterId) {
      (byCluster[clusterId] ??= []).push(a.featureId);
    }
  }

  await Promise.all(
    Object.entries(byCluster).map(([clusterId, featureIds]) =>
      prisma.feature.updateMany({
        where: { id: { in: featureIds } },
        data: { clusterId },
      })
    )
  );

  const clusters = await prisma.cluster.findMany({
    include: { _count: { select: { features: true } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    clusters: clusters.map((c) => ({
      id: c.id,
      name: c.name,
      featureCount: c._count.features,
    })),
  });
}
