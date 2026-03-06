import { MembershipRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export type RequestContext = {
  userId: string;
  organizationId: string;
  role: MembershipRole;
};

const roleOrder: Record<MembershipRole, number> = {
  owner: 4,
  admin: 3,
  editor: 2,
  viewer: 1,
};

export async function getRequestContext(): Promise<RequestContext | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.organizationId || !session.user.role) {
    return null;
  }

  return {
    userId: session.user.id,
    organizationId: session.user.organizationId,
    role: session.user.role,
  };
}

export function hasMinimumRole(actual: MembershipRole, required: MembershipRole): boolean {
  return roleOrder[actual] >= roleOrder[required];
}
