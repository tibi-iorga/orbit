import { NextResponse } from "next/server";
import { getRequestContext, hasMinimumRole } from "@/lib/request-context";
import { processPendingFeedbackForOrganization } from "@/lib/feedback-processor";

const inFlightByOrg = new Set<string>();

export async function POST() {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(ctx.role, "editor")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (inFlightByOrg.has(ctx.organizationId)) {
    return NextResponse.json({ ok: true, processed: 0, inFlight: true });
  }

  inFlightByOrg.add(ctx.organizationId);
  try {
    const processed = await processPendingFeedbackForOrganization({ organizationId: ctx.organizationId });
    return NextResponse.json({ ok: true, processed, inFlight: false });
  } catch (error) {
    console.error("Manual feedback processing run failed:", error);
    return NextResponse.json({ error: "Processing run failed" }, { status: 500 });
  } finally {
    inFlightByOrg.delete(ctx.organizationId);
  }
}
