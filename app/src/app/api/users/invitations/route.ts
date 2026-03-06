import { randomBytes } from "crypto";
import { MembershipRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRequestContext, hasMinimumRole } from "@/lib/request-context";

const ALLOWED_INVITE_ROLES: MembershipRole[] = ["admin", "editor", "viewer"];
const ALLOWED_MEMBER_ROLES: MembershipRole[] = ["owner", "admin", "editor", "viewer"];

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function GET() {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(ctx.role, "admin")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [memberships, invitations] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId: ctx.organizationId },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
    }),
    prisma.invitation.findMany({
      where: { organizationId: ctx.organizationId, acceptedAt: null },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return NextResponse.json({
    members: memberships.map((m) => ({
      userId: m.userId,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
      createdAt: m.createdAt,
    })),
    invitations: invitations.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
      token: i.token,
    })),
  });
}

export async function POST(request: Request) {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(ctx.role, "admin")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const role = String(body.role || "viewer") as MembershipRole;
  const ttlDays = Number.isFinite(Number(body.ttlDays)) ? Number(body.ttlDays) : 7;

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  if (!ALLOWED_INVITE_ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const existingMembership = await prisma.membership.findFirst({
    where: {
      organizationId: ctx.organizationId,
      user: { email },
    },
    select: { id: true },
  });

  if (existingMembership) {
    return NextResponse.json({ error: "This person already has access" }, { status: 409 });
  }

  await prisma.invitation.deleteMany({
    where: {
      organizationId: ctx.organizationId,
      email,
      acceptedAt: null,
    },
  });

  const expiresAt = new Date(Date.now() + Math.max(1, ttlDays) * 24 * 60 * 60 * 1000);
  const token = randomBytes(32).toString("hex");

  const invitation = await prisma.invitation.create({
    data: {
      email,
      role,
      organizationId: ctx.organizationId,
      invitedByUserId: ctx.userId,
      token,
      expiresAt,
    },
  });

  return NextResponse.json({
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    token: invitation.token,
    expiresAt: invitation.expiresAt,
  });
}

export async function PATCH(request: Request) {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(ctx.role, "admin")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const targetType = String(body.targetType || "");
  const role = String(body.role || "") as MembershipRole;

  if (!ALLOWED_MEMBER_ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  if (targetType === "member") {
    const userId = String(body.userId || "");
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    const membership = await prisma.membership.findFirst({
      where: { organizationId: ctx.organizationId, userId },
      select: { role: true, userId: true },
    });
    if (!membership) return NextResponse.json({ error: "Member not found" }, { status: 404 });

    if (membership.role === "owner" && role !== "owner") {
      const ownerCount = await prisma.membership.count({
        where: { organizationId: ctx.organizationId, role: "owner" },
      });
      if (ownerCount <= 1) {
        return NextResponse.json({ error: "At least one owner is required" }, { status: 400 });
      }
    }

    await prisma.membership.update({
      where: { userId_organizationId: { userId, organizationId: ctx.organizationId } },
      data: { role },
    });

    return NextResponse.json({ ok: true });
  }

  if (targetType === "invitation") {
    const invitationId = String(body.invitationId || "");
    if (!invitationId) return NextResponse.json({ error: "invitationId required" }, { status: 400 });

    if (!ALLOWED_INVITE_ROLES.includes(role)) {
      return NextResponse.json({ error: "Invalid role for invite" }, { status: 400 });
    }

    const updated = await prisma.invitation.updateMany({
      where: { id: invitationId, organizationId: ctx.organizationId, acceptedAt: null },
      data: { role },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "targetType must be member or invitation" }, { status: 400 });
}

export async function DELETE(request: Request) {
  const ctx = await getRequestContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasMinimumRole(ctx.role, "admin")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const invitationId = searchParams.get("invitationId");
  const userId = searchParams.get("userId");

  if (invitationId) {
    const deleted = await prisma.invitation.deleteMany({
      where: { id: invitationId, organizationId: ctx.organizationId, acceptedAt: null },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  }

  if (userId) {
    if (userId === ctx.userId) {
      return NextResponse.json({ error: "You cannot remove your own access" }, { status: 400 });
    }

    const membership = await prisma.membership.findFirst({
      where: { organizationId: ctx.organizationId, userId },
      select: { role: true },
    });
    if (!membership) return NextResponse.json({ error: "Member not found" }, { status: 404 });

    if (membership.role === "owner") {
      const ownerCount = await prisma.membership.count({
        where: { organizationId: ctx.organizationId, role: "owner" },
      });
      if (ownerCount <= 1) {
        return NextResponse.json({ error: "At least one owner is required" }, { status: 400 });
      }
    }

    await prisma.membership.delete({
      where: { userId_organizationId: { userId, organizationId: ctx.organizationId } },
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "invitationId or userId required" }, { status: 400 });
}
