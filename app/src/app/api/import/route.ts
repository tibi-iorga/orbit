import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  parse as dateFnsParse,
  parseISO,
  isValid,
} from "date-fns";

/**
 * Attempts to parse a date string in a variety of common formats.
 * Returns a valid Date or undefined if nothing matched.
 *
 * Formats tried (in order):
 *  1. ISO 8601 / RFC 3339 — e.g. "2026-02-19T16:42:05+00:00", "2026-02-19"
 *  2. ISO without T        — e.g. "2026-02-19 16:42:05"
 *  3. US month-first       — e.g. "02/19/2026", "2/19/2026"
 *  4. EU day-first         — e.g. "19/02/2026", "19.02.2026", "19-02-2026"
 *  5. Long-form            — e.g. "Feb 19, 2026", "February 19 2026"
 *  6. Unix timestamp (ms)  — e.g. "1708358400000"
 *  7. Unix timestamp (s)   — e.g. "1708358400"
 */
function parseDate(raw: string): Date | undefined {
  const s = raw.trim();
  if (!s) return undefined;

  // 1. ISO 8601 (handles timezone offsets correctly)
  const iso = parseISO(s);
  if (isValid(iso)) return iso;

  // date-fns format strings to try in order
  const formats = [
    // ISO without T separator
    "yyyy-MM-dd HH:mm:ss",
    "yyyy-MM-dd HH:mm",
    "yyyy-MM-dd",
    // US month-first
    "MM/dd/yyyy HH:mm:ss",
    "MM/dd/yyyy HH:mm",
    "MM/dd/yyyy",
    "M/d/yyyy",
    // EU day-first slash
    "dd/MM/yyyy HH:mm:ss",
    "dd/MM/yyyy HH:mm",
    "dd/MM/yyyy",
    "d/M/yyyy",
    // EU day-first dot
    "dd.MM.yyyy HH:mm:ss",
    "dd.MM.yyyy HH:mm",
    "dd.MM.yyyy",
    // EU day-first dash (avoids collision with ISO — only try after ISO fails)
    "dd-MM-yyyy HH:mm:ss",
    "dd-MM-yyyy",
    // Long-form
    "MMM d, yyyy",
    "MMMM d, yyyy",
    "MMM d yyyy",
    "MMMM d yyyy",
    "d MMM yyyy",
    "d MMMM yyyy",
  ];

  const ref = new Date(); // reference date required by date-fns parse
  for (const fmt of formats) {
    const d = dateFnsParse(s, fmt, ref);
    if (isValid(d)) return d;
  }

  // Unix timestamp (numeric string)
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    // Distinguish ms (13 digits) from seconds (10 digits)
    const d = new Date(n > 1e12 ? n : n * 1000);
    if (isValid(d)) return d;
  }

  return undefined;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const { filename, rows, titleColumn, descriptionColumn, dateColumn, productId } = body;
  if (!filename || !Array.isArray(rows) || titleColumn == null) {
    return NextResponse.json(
      { error: "filename, rows, and titleColumn required" },
      { status: 400 }
    );
  }

  if (productId && typeof productId === "string") {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 400 });
    }
  }

  const importRecord = await prisma.importRecord.create({
    data: {
      filename,
      productId: productId && typeof productId === "string" ? productId : null,
    },
  });

  const descCol = descriptionColumn != null ? String(descriptionColumn) : null;
  const titleCol = String(titleColumn);
  const dateCol = dateColumn != null ? String(dateColumn) : null;

  const mappedCols = new Set([titleCol, ...(descCol ? [descCol] : []), ...(dateCol ? [dateCol] : [])]);

  const feedbackItemsToCreate = rows
    .map((row) => {
      const title = row[titleCol] != null ? String(row[titleCol]).trim() : "";
      if (!title) return null;
      const description = descCol != null && row[descCol] != null
        ? String(row[descCol]).trim()
        : null;

      // Parse original date from the mapped date column (if any)
      const createdAt = dateCol && row[dateCol]
        ? parseDate(String(row[dateCol]))
        : undefined;

      // Collect all columns that weren't mapped to title, description, or date
      const metadata: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        if (!mappedCols.has(key) && value != null && String(value).trim() !== "") {
          metadata[key] = String(value).trim();
        }
      }

      return {
        importId: importRecord.id,
        productId: productId && typeof productId === "string" ? productId : null,
        title,
        description: description || undefined,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        ...(createdAt ? { createdAt } : {}),
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

  const BATCH_SIZE = 500;
  for (let i = 0; i < feedbackItemsToCreate.length; i += BATCH_SIZE) {
    const batch = feedbackItemsToCreate.slice(i, i + BATCH_SIZE);
    await prisma.feedbackItem.createMany({ data: batch });
  }

  return NextResponse.json({ id: importRecord.id, filename: importRecord.filename });
}
