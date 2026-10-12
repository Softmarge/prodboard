import crypto from "crypto";
import { prisma } from "@/lib/db";

export type InviteRole = "PM" | "VIEWER";

export function newInviteToken() {
  return crypto.randomBytes(18).toString("base64url");
}

// Resolve an invite token to its organization and the role it pins.
// New per-role links win; legacy single org tokens fall back to PM.
export async function resolveInvite(
  token: string
): Promise<{ org: { id: string; name: string }; role: InviteRole } | null> {
  const link = await prisma.inviteLink.findUnique({
    where: { token },
    include: { organization: true },
  });
  if (link) {
    const role: InviteRole = link.role === "VIEWER" ? "VIEWER" : "PM";
    return { org: { id: link.organization.id, name: link.organization.name }, role };
  }
  const org = await prisma.organization.findUnique({ where: { inviteToken: token } });
  if (org) return { org: { id: org.id, name: org.name }, role: "PM" };
  return null;
}

// Return the org's link for a role, creating it on demand.
export async function ensureInviteLink(organizationId: string, role: InviteRole) {
  const existing = await prisma.inviteLink.findUnique({
    where: { organizationId_role: { organizationId, role } },
  });
  if (existing) return existing;
  return prisma.inviteLink.create({
    data: { organizationId, role, token: newInviteToken() },
  });
}

// Rotate (regenerate) the org's link for a role.
export async function rotateInviteLink(organizationId: string, role: InviteRole) {
  const token = newInviteToken();
  return prisma.inviteLink.upsert({
    where: { organizationId_role: { organizationId, role } },
    update: { token },
    create: { organizationId, role, token },
  });
}
