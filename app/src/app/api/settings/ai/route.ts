import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getSystemPrompt,
  getApiKeySource,
  maskApiKey,
  DEFAULT_SYSTEM_PROMPT,
} from "@/lib/ai-settings";

// GET — return current prompt + masked key info
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [prompt, keySource] = await Promise.all([
    getSystemPrompt(),
    getApiKeySource(),
  ]);

  // Get masked key for display
  let maskedKey: string | null = null;
  if (keySource === "db") {
    const row = await prisma.appSetting.findUnique({ where: { key: "openai_api_key" } });
    if (row?.value) maskedKey = maskApiKey(row.value);
  } else if (keySource === "env" && process.env.OPENAI_API_KEY) {
    maskedKey = maskApiKey(process.env.OPENAI_API_KEY);
  }

  // Whether the stored prompt differs from the default
  const isCustomPrompt = prompt !== DEFAULT_SYSTEM_PROMPT;

  return NextResponse.json({
    prompt,
    isCustomPrompt,
    defaultPrompt: DEFAULT_SYSTEM_PROMPT,
    keySource,       // "db" | "env" | "none"
    maskedKey,       // e.g. "sk-...abcd" or null
  });
}

// PATCH — save prompt and/or API key
export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));

  const updates: Promise<unknown>[] = [];

  // Update system prompt
  if (typeof body.prompt === "string") {
    const value = body.prompt.trim() || DEFAULT_SYSTEM_PROMPT;
    updates.push(
      prisma.appSetting.upsert({
        where: { key: "autogroup_system_prompt" },
        update: { value },
        create: { key: "autogroup_system_prompt", value },
      })
    );
  }

  // Update API key — empty string means "clear the DB key (fall back to env)"
  if (typeof body.apiKey === "string") {
    const value = body.apiKey.trim();
    if (value === "") {
      // Delete the DB override so it falls back to env
      updates.push(
        prisma.appSetting.deleteMany({ where: { key: "openai_api_key" } })
      );
    } else {
      updates.push(
        prisma.appSetting.upsert({
          where: { key: "openai_api_key" },
          update: { value },
          create: { key: "openai_api_key", value },
        })
      );
    }
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  await Promise.all(updates);
  return NextResponse.json({ ok: true });
}
