import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parse as dateFnsParse, parseISO, isValid } from "date-fns";
import { getRequestContext, hasMinimumRole } from "@/lib/request-context";
import { enqueueFeedbackProcessing } from "@/lib/feedback-processor";

function parseDate(raw: string): Date | undefined {
  const s = raw.trim();
  if (!s) return undefined;

  const iso = parseISO(s);
  if (isValid(iso)) return iso;

  const formats = [
    "yyyy-MM-dd HH:mm:ss",
    "yyyy-MM-dd HH:mm",
    "yyyy-MM-dd",
    "MM/dd/yyyy HH:mm:ss",
    "MM/dd/yyyy HH:mm",
    "MM/dd/yyyy",
    "M/d/yyyy",
    "dd/MM/yyyy HH:mm:ss",
    "dd/MM/yyyy HH:mm",
    "dd/MM/yyyy",
    "d/M/yyyy",
    "dd.MM.yyyy HH:mm:ss",
    "dd.MM.yyyy HH:mm",
    "dd.MM.yyyy",
    "dd-MM-yyyy HH:mm:ss",
    "dd-MM-yyyy",
    "MMM d, yyyy",
    "MMMM d, yyyy",
    "MMM d yyyy",
    "MMMM d yyyy",
    "d MMM yyyy",
    "d MMMM yyyy",
  ];

  const ref = new Date();
  for (const fmt of formats) {
    const d = dateFnsParse(s, fmt, ref);
    if (isValid(d)) return d;
  }

  if (/^\d+$/.test(s)) {
    const n = Number(s);
    const d = new Date(n > 1e12 ? n : n * 1000);
    if (isValid(d)) return d;
  }

  return undefined;
}

export async function POST(request: Request) {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(ctx.role, "editor")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { filename, rows, titleColumn, descriptionColumn, dateColumn, productId } = body;
  if (!filename || !Array.isArray(rows) || titleColumn == null) {
    return NextResponse.json({ error: "filename, rows, and titleColumn required" }, { status: 400 });
  }

  if (productId && typeof productId === "string") {
    const product = await prisma.product.findFirst({ where: { id: productId, organizationId: ctx.organizationId } });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 400 });
    }
  }

  const importRecord = await prisma.importRecord.create({
    data: {
      filename,
      organizationId: ctx.organizationId,
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
      const description = descCol != null && row[descCol] != null ? String(row[descCol]).trim() : null;
      const createdAt = dateCol && row[dateCol] ? parseDate(String(row[dateCol])) : undefined;

      const metadata: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        if (!mappedCols.has(key) && value != null && String(value).trim() !== "") {
          metadata[key] = String(value).trim();
        }
      }

      return {
        importId: importRecord.id,
        organizationId: ctx.organizationId,
        productId: productId && typeof productId === "string" ? productId : null,
        title,
        description: description || undefined,
        metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
        processingStatus: "not_processed",
        ...(createdAt ? { createdAt } : {}),
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null);

  const BATCH_SIZE = 500;
  for (let i = 0; i < feedbackItemsToCreate.length; i += BATCH_SIZE) {
    const batch = feedbackItemsToCreate.slice(i, i + BATCH_SIZE);
    await prisma.feedbackItem.createMany({ data: batch });
  }

  enqueueFeedbackProcessing(ctx.organizationId);

  return NextResponse.json({ id: importRecord.id, filename: importRecord.filename });
}
