import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSystemPrompt, getApiKeySource, maskApiKey, DEFAULT_SYSTEM_PROMPT } from "@/lib/ai-settings";
import { getRequestContext, hasMinimumRole } from "@/lib/request-context";

export async function GET() {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [prompt, keySource] = await Promise.all([
    getSystemPrompt(ctx.organizationId),
    getApiKeySource(ctx.organizationId),
  ]);

  let maskedKey: string | null = null;
  if (keySource === "db") {
    const row = await prisma.appSetting.findUnique({
      where: { organizationId_key: { organizationId: ctx.organizationId, key: "openai_api_key" } },
    });
    if (row?.value) maskedKey = maskApiKey(row.value);
  } else if (keySource === "env" && process.env.OPENAI_API_KEY) {
    maskedKey = maskApiKey(process.env.OPENAI_API_KEY);
  }

  const isCustomPrompt = prompt !== DEFAULT_SYSTEM_PROMPT;

  return NextResponse.json({
    prompt,
    isCustomPrompt,
    defaultPrompt: DEFAULT_SYSTEM_PROMPT,
    keySource,
    maskedKey,
  });
}

export async function PATCH(request: Request) {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(ctx.role, "admin")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const updates: Promise<unknown>[] = [];

  if (typeof body.prompt === "string") {
    const value = body.prompt.trim() || DEFAULT_SYSTEM_PROMPT;
    updates.push(
      prisma.appSetting.upsert({
        where: { organizationId_key: { organizationId: ctx.organizationId, key: "autogroup_system_prompt" } },
        update: { value },
        create: { organizationId: ctx.organizationId, key: "autogroup_system_prompt", value },
      })
    );
  }

  if (typeof body.apiKey === "string") {
    const value = body.apiKey.trim();
    if (value === "") {
      updates.push(
        prisma.appSetting.deleteMany({
          where: { organizationId: ctx.organizationId, key: "openai_api_key" },
        })
      );
    } else {
      updates.push(
        prisma.appSetting.upsert({
          where: { organizationId_key: { organizationId: ctx.organizationId, key: "openai_api_key" } },
          update: { value },
          create: { organizationId: ctx.organizationId, key: "openai_api_key", value },
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
