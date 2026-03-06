import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getOpenAIApiKey } from "@/lib/ai-settings";
import { getRequestContext, hasMinimumRole } from "@/lib/request-context";

const MAX_INPUT_CHARS = 30000;
const MAX_ITEMS = 150;

const SYSTEM_PROMPT = `You convert raw user research text into structured feedback items for a product feedback inbox.

Return strict JSON only with this shape:
{
  "items": [
    { "title": "short feedback title", "description": "optional supporting detail" }
  ]
}

Rules:
- Extract concrete product feedback, requests, complaints, and pain points.
- Keep each title concise and specific (5-14 words).
- Avoid duplicates and near-duplicates.
- Skip non-feedback text, greetings, and irrelevant chatter.
- If the text contains many points, prioritize the clearest and most actionable ones.
- Cap the output at 150 items.
- Do not include markdown or extra keys.`;

interface ExtractedItem {
  title: string;
  description?: string;
}

function normalizeItem(item: unknown): ExtractedItem | null {
  if (!item || typeof item !== "object") return null;

  const rawTitle = "title" in item ? String(item.title ?? "").trim() : "";
  if (!rawTitle) return null;

  const rawDescription = "description" in item ? String(item.description ?? "").trim() : "";

  return {
    title: rawTitle.slice(0, 280),
    description: rawDescription.slice(0, 2000),
  };
}

export async function POST(request: Request) {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(ctx.role, "editor")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const text = String(body.text ?? "").trim();

  if (!text) {
    return NextResponse.json({ error: "No text provided" }, { status: 400 });
  }

  const apiKey = await getOpenAIApiKey(ctx.organizationId);
  if (!apiKey) {
    return NextResponse.json({ error: "No OpenAI API key configured. Add one in Settings -> Auto-group feedback." }, { status: 400 });
  }

  const openai = new OpenAI({ apiKey });

  try {
    const clippedText = text.slice(0, MAX_INPUT_CHARS);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Extract feedback items from this text:\n\n${clippedText}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: { items?: unknown[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "AI returned invalid JSON" }, { status: 500 });
    }

    const seen = new Set<string>();
    const items = (parsed.items ?? [])
      .map(normalizeItem)
      .filter((item): item is ExtractedItem => item !== null)
      .filter((item) => {
        const key = `${item.title.toLowerCase()}|${(item.description ?? "").toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, MAX_ITEMS);

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error extracting feedback from free text:", error);
    return NextResponse.json({ error: "Failed to extract feedback items" }, { status: 500 });
  }
}
