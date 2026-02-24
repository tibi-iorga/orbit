import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import OpenAI from "openai";
import { getOpenAIApiKey } from "@/lib/ai-settings";

const SYSTEM_PROMPT = `You are an experienced product manager helping to write clear, concise product goal statements.

When given rough notes or a draft goal, rewrite it as 1-2 crisp sentences that:
- Describe what the product helps users accomplish (outcome-focused, not feature-focused)
- Mention who the users are if that context is available
- Are specific and actionable, not vague marketing language
- Sound professional but human — not corporate jargon

Respond with ONLY the improved text. No preamble, no explanation, no quotes.`;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const text: string = body.text?.trim() ?? "";

  if (!text) {
    return NextResponse.json({ error: "No text provided" }, { status: 400 });
  }

  const apiKey = await getOpenAIApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "No OpenAI API key configured." },
      { status: 400 }
    );
  }

  const openai = new OpenAI({ apiKey });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Improve this product goal:\n\n${text}` },
    ],
    temperature: 0.4,
    max_tokens: 200,
  });

  const improved = completion.choices[0]?.message?.content?.trim() ?? text;
  return NextResponse.json({ improved });
}
