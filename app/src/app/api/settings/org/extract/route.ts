import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getRequestContext, hasMinimumRole } from "@/lib/request-context";
import { getOpenAIApiKey } from "@/lib/ai-settings";

export async function POST(request: Request) {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(ctx.role, "admin"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const url: string = body.url?.trim();
  if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });

  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error();
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  // Fetch the page server-side
  let html: string;
  const fetchHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
  };
  try {
    const res = await fetch(parsedUrl.toString(), {
      headers: fetchHeaders,
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return NextResponse.json({ error: `The page returned an error (HTTP ${res.status}). Check the URL and try again.` }, { status: 422 });
    html = await res.text();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = msg.toLowerCase().includes("timeout") || msg.toLowerCase().includes("abort");
    return NextResponse.json(
      { error: isTimeout ? "The request timed out. The site may be slow or blocking automated access." : `Could not reach ${parsedUrl.hostname}. Make sure the URL is correct and the site is publicly accessible.` },
      { status: 422 }
    );
  }

  // Strip HTML to plain text (basic, good enough for most pages)
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000); // cap to avoid huge token bills

  // Ask OpenAI to summarize
  const apiKey = await getOpenAIApiKey(ctx.organizationId);
  if (!apiKey) return NextResponse.json({ error: "No AI key configured" }, { status: 422 });
  const openai = new OpenAI({ apiKey });

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You extract a concise 2–3 sentence description of a company or product from webpage text. Focus on what the organisation does, who it serves, and its main value proposition. Output only the description — no preamble, no quotes.",
        },
        { role: "user", content: text },
      ],
      max_tokens: 200,
      temperature: 0.3,
    });

    const description = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!description) return NextResponse.json({ error: "AI returned an empty result" }, { status: 422 });
    return NextResponse.json({ description });
  } catch {
    return NextResponse.json({ error: "AI extraction failed. Try writing it manually." }, { status: 500 });
  }
}
