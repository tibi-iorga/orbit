import { prisma } from "@/lib/db";

export const DEFAULT_SYSTEM_PROMPT = `You are a senior product manager with deep expertise in synthesising customer feedback into strategic product opportunities.

Your task is to identify meaningful opportunity themes from a set of customer feedback items.

An opportunity represents a clear job customers are trying to do, or a recurring pain they experience. Good opportunities are outcome-oriented and actionable — not topic labels. Prefer titles in the form "Ability to X" or "Better X when Y" over generic noun phrases.

Guidelines:
- Only create an opportunity if at least 2–3 feedback items clearly share the same underlying need. A single data point is not a theme.
- Do not force every item into a group. If a feedback item is too vague, unique, or doesn't clearly fit a theme, leave it unassigned (omit it from all opportunities).
- Let the data determine the number of opportunities. Do not target a specific count.
- Each opportunity should be specific and actionable. Do NOT create broad buckets like "General improvements", "Miscellaneous", or "UX issues".
- If a theme grows very large (30+ items), consider whether it should be split into more distinct needs.
- A feedback item may belong to multiple opportunities if it genuinely touches multiple distinct needs.
- Give each opportunity a concise title (3–7 words) and a 1–2 sentence description explaining the underlying customer need.
- Respond ONLY with valid JSON, no markdown, no explanation.`;

/** Retrieve the active system prompt — DB value if set, else default */
export async function getSystemPrompt(): Promise<string> {
  const row = await prisma.appSetting.findUnique({
    where: { key: "autogroup_system_prompt" },
  });
  return row?.value?.trim() || DEFAULT_SYSTEM_PROMPT;
}

/** Retrieve the active OpenAI API key — DB value if set, else env var */
export async function getOpenAIApiKey(): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({
    where: { key: "openai_api_key" },
  });
  return row?.value?.trim() || process.env.OPENAI_API_KEY || null;
}

/** Returns where the key is sourced from */
export async function getApiKeySource(): Promise<"db" | "env" | "none"> {
  const row = await prisma.appSetting.findUnique({
    where: { key: "openai_api_key" },
  });
  if (row?.value?.trim()) return "db";
  if (process.env.OPENAI_API_KEY) return "env";
  return "none";
}

/** Mask an API key for display: sk-...abcd */
export function maskApiKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 3) + "..." + key.slice(-4);
}
