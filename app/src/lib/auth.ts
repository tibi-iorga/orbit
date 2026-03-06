import { NextAuthOptions } from "next-auth";
import Auth0Provider from "next-auth/providers/auth0";
import AzureADProvider from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";
import { MembershipRole } from "@prisma/client";
import { prisma } from "./db";

const bootstrapOrgName = process.env.BOOTSTRAP_ORG_NAME || "My Organisation";
const bootstrapOrgSlug = process.env.BOOTSTRAP_ORG_SLUG || "my-organisation";
const bootstrapOwnerEmail = (process.env.BOOTSTRAP_OWNER_EMAIL || "admin@example.com").toLowerCase();

const rolePriority: MembershipRole[] = ["owner", "admin", "editor", "viewer"];

function getEmailDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() || "";
}

function pickPrimaryMembership<T extends { role: MembershipRole }>(memberships: T[]): T | null {
  if (memberships.length === 0) return null;
  return [...memberships].sort((a, b) => rolePriority.indexOf(a.role) - rolePriority.indexOf(b.role))[0] ?? null;
}

async function ensureBootstrapOwnerMembership(userId: string, email: string) {
  if (email.toLowerCase() !== bootstrapOwnerEmail) return;

  const org = await prisma.organization.upsert({
    where: { slug: bootstrapOrgSlug },
    update: { name: bootstrapOrgName },
    create: { name: bootstrapOrgName, slug: bootstrapOrgSlug },
  });

  await prisma.membership.upsert({
    where: { userId_organizationId: { userId, organizationId: org.id } },
    update: { role: "owner" },
    create: { userId, organizationId: org.id, role: "owner" },
  });
}

async function acceptPendingInvites(userId: string, email: string): Promise<void> {
  const invitations = await prisma.invitation.findMany({
    where: {
      email: email.toLowerCase(),
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  if (invitations.length === 0) return;

  await prisma.$transaction(
    invitations.map((invite) =>
      prisma.membership.upsert({
        where: {
          userId_organizationId: {
            userId,
            organizationId: invite.organizationId,
          },
        },
        update: { role: invite.role },
        create: {
          userId,
          organizationId: invite.organizationId,
          role: invite.role,
        },
      })
    )
  );

  await prisma.invitation.updateMany({
    where: { id: { in: invitations.map((i) => i.id) } },
    data: { acceptedAt: new Date() },
  });
}

async function ensureDomainMappedMembership(userId: string, email: string): Promise<void> {
  const domain = getEmailDomain(email);
  if (!domain) return;

  const mappedProviders = await prisma.organizationIdentityProvider.findMany({
    where: {
      enabled: true,
      domains: { has: domain },
    },
    select: { organizationId: true },
  });

  if (mappedProviders.length === 0) return;

  const organizationIds = Array.from(new Set(mappedProviders.map((p) => p.organizationId)));

  await prisma.$transaction(
    organizationIds.map((organizationId) =>
      prisma.membership.upsert({
        where: { userId_organizationId: { userId, organizationId } },
        update: {},
        create: { userId, organizationId, role: "editor" },
      })
    )
  );
}

async function canSignInEmail(email: string): Promise<boolean> {
  const normalizedEmail = email.toLowerCase();
  if (normalizedEmail === bootstrapOwnerEmail) return true;

  const domain = getEmailDomain(normalizedEmail);

  const [existingMembership, pendingInvite, mappedDomain] = await Promise.all([
    prisma.membership.findFirst({
      where: { user: { email: normalizedEmail } },
      select: { userId: true },
    }),
    prisma.invitation.findFirst({
      where: {
        email: normalizedEmail,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    }),
    domain
      ? prisma.organizationIdentityProvider.findFirst({
          where: { enabled: true, domains: { has: domain } },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  return Boolean(existingMembership || pendingInvite || mappedDomain);
}

async function resolveDbUser(identity: { email: string; name?: string | null }): Promise<string> {
  const normalizedEmail = identity.email.toLowerCase();

  const dbUser = await prisma.user.upsert({
    where: { email: normalizedEmail },
    update: { name: identity.name ?? undefined },
    create: {
      email: normalizedEmail,
      name: identity.name ?? null,
    },
  });

  await ensureBootstrapOwnerMembership(dbUser.id, normalizedEmail);
  await acceptPendingInvites(dbUser.id, normalizedEmail);
  await ensureDomainMappedMembership(dbUser.id, normalizedEmail);

  return dbUser.id;
}

async function getPrimaryMembership(userId: string) {
  const memberships = await prisma.membership.findMany({ where: { userId } });
  return pickPrimaryMembership(memberships);
}

const providers: NextAuthOptions["providers"] = [];

// Dev-only credentials bypass — never runs in production
if (process.env.NODE_ENV === "development" && process.env.DEV_AUTH_EMAIL) {
  providers.push(
    CredentialsProvider({
      id: "credentials",
      name: "Dev Login",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (
          credentials?.email === process.env.DEV_AUTH_EMAIL &&
          credentials?.password === process.env.DEV_AUTH_PASSWORD
        ) {
          return { id: "dev", email: process.env.DEV_AUTH_EMAIL, name: "Dev User" };
        }
        return null;
      },
    })
  );
}

if (process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET && process.env.AZURE_AD_TENANT_ID) {
  providers.push(
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
      tenantId: process.env.AZURE_AD_TENANT_ID,
    })
  );
}

if (process.env.AUTH0_CLIENT_ID && process.env.AUTH0_CLIENT_SECRET && process.env.AUTH0_ISSUER_BASE_URL) {
  providers.push(
    Auth0Provider({
      clientId: process.env.AUTH0_CLIENT_ID,
      clientSecret: process.env.AUTH0_CLIENT_SECRET,
      issuer: process.env.AUTH0_ISSUER_BASE_URL,
    })
  );
}

if (process.env.AUTH_OIDC_ISSUER && process.env.AUTH_OIDC_CLIENT_ID && process.env.AUTH_OIDC_CLIENT_SECRET) {
  providers.push({
    id: "oidc",
    name: process.env.AUTH_OIDC_NAME || "SSO",
    type: "oauth",
    wellKnown: `${process.env.AUTH_OIDC_ISSUER.replace(/\/$/, "")}/.well-known/openid-configuration`,
    clientId: process.env.AUTH_OIDC_CLIENT_ID,
    clientSecret: process.env.AUTH_OIDC_CLIENT_SECRET,
    authorization: { params: { scope: "openid email profile" } },
    idToken: true,
    checks: ["pkce", "state"],
    profile(profile: Record<string, unknown>) {
      return {
        id: String(profile.sub ?? ""),
        email: String(profile.email ?? profile.preferred_username ?? ""),
        name: String(profile.name ?? profile.preferred_username ?? ""),
      };
    },
  } as never);
}

export const authOptions: NextAuthOptions = {
  providers,
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ user, account, profile }) {
      const profileEmail = (profile as Record<string, unknown> | undefined)?.preferred_username;
      const candidateEmail = user.email || String(profile?.email ?? profileEmail ?? "").toLowerCase();
      if (!candidateEmail) return false;

      if (account?.provider === "credentials") {
        return process.env.NODE_ENV === "development";
      }

      if (account?.provider === "oidc" || account?.provider === "azure-ad" || account?.provider === "auth0") {
        return canSignInEmail(candidateEmail);
      }

      return false;
    },
    async jwt({ token, user, profile }) {
      const profileEmail = (profile as Record<string, unknown> | undefined)?.preferred_username;
      const identityEmail = (user?.email || String(profile?.email ?? profileEmail ?? "")).toLowerCase();

      if (identityEmail) {
        const userId = await resolveDbUser({ email: identityEmail, name: user?.name ?? null });
        token.id = userId;

        const membership = await getPrimaryMembership(userId);
        token.organizationId = membership?.organizationId;
        token.role = membership?.role;
      } else if (typeof token.id === "string" && (!token.organizationId || !token.role)) {
        const membership = await getPrimaryMembership(token.id);
        token.organizationId = membership?.organizationId;
        token.role = membership?.role;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string | undefined;
        session.user.organizationId = token.organizationId as string | undefined;
        session.user.role = token.role as MembershipRole | undefined;
      }
      return session;
    },
  },
};

declare module "next-auth" {
  interface User {
    id?: string;
    email?: string | null;
    name?: string | null;
    organizationId?: string;
    role?: MembershipRole;
  }

  interface Session {
    user: User & { id?: string; organizationId?: string; role?: MembershipRole };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    organizationId?: string;
    role?: MembershipRole;
  }
}
