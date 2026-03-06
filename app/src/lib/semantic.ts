import OpenAI from "openai";
import { getOpenAIApiKey } from "@/lib/ai-settings";

export type SemanticCandidate = {
  id: string;
  label: string;
  description?: string | null;
  kind: "opportunity";
  score: number;
};

export function parseEmbedding(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const arr = value.map((v) => Number(v)).filter((v) => Number.isFinite(v));
  return arr.length > 0 ? arr : null;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function generateEmbedding(organizationId: string, text: string): Promise<number[] | null> {
  const apiKey = await getOpenAIApiKey(organizationId);
  if (!apiKey) return null;

  const openai = new OpenAI({ apiKey });
  try {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-large",
      input: text.slice(0, 8000),
    });
    const vector = response.data[0]?.embedding;
    if (!Array.isArray(vector) || vector.length === 0) return null;
    return vector.map((v) => Number(v));
  } catch (error) {
    console.error("Embedding generation failed:", error);
    return null;
  }
}

export async function adjudicateSemanticRoute(params: {
  organizationId: string;
  feedbackText: string;
  candidates: SemanticCandidate[];
}): Promise<{
  action: "link_opportunity" | "create_opportunity" | "hold";
  targetId: string | null;
  confidence: number;
  reasoning: string;
}> {
  const apiKey = await getOpenAIApiKey(params.organizationId);
  if (!apiKey) {
    return { action: "hold", targetId: null, confidence: 0.4, reasoning: "No AI key configured." };
  }
  if (params.candidates.length === 0) {
    return { action: "create_opportunity", targetId: null, confidence: 0.62, reasoning: "No similar candidates found." };
  }

  const openai = new OpenAI({ apiKey });
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'Decide the best routing for product feedback. Only link to an existing opportunity if the feedback describes the SAME specific feature — not just the same general topic or domain. Topically related but functionally distinct requests must be separated. Return JSON only: {"action":"link_opportunity|create_opportunity|hold","targetId":"id or null","confidence":0.0,"reasoning":"short"}',
        },
        {
          role: "user",
          content: `Feedback:\n${params.feedbackText}\n\nCandidates:\n${params.candidates
            .map((c, idx) => {
              const desc = c.description ? ` | "${c.description.slice(0, 120)}"` : "";
              return `${idx + 1}. [${c.kind}] ${c.id} | ${c.label}${desc} | similarity=${c.score.toFixed(3)}`;
            })
            .join("\n")}`,
        },
      ],
    });

    const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}") as {
      action?: string;
      targetId?: string | null;
      confidence?: number;
      reasoning?: string;
    };
    const allowed = new Set(["link_opportunity", "create_opportunity", "hold"]);
    const action = allowed.has(String(parsed.action)) ? (parsed.action as "link_opportunity" | "create_opportunity" | "hold") : "hold";
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5)));
    return {
      action,
      targetId: typeof parsed.targetId === "string" && parsed.targetId ? parsed.targetId : null,
      confidence,
      reasoning: String(parsed.reasoning ?? "").slice(0, 400),
    };
  } catch (error) {
    console.error("Semantic adjudication failed:", error);
    return { action: "hold", targetId: null, confidence: 0.45, reasoning: "Adjudication failed." };
  }
}
