import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const { filename, rows, titleColumn, descriptionColumn, productId } = body;
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

  const feedbackItemsToCreate = rows
    .map((row) => {
      const title = row[titleCol] != null ? String(row[titleCol]).trim() : "";
      if (!title) return null;
      const description = descCol != null && row[descCol] != null
        ? String(row[descCol]).trim()
        : null;
      return {
        importId: importRecord.id,
        productId: productId && typeof productId === "string" ? productId : null,
        title,
        description: description || undefined,
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
