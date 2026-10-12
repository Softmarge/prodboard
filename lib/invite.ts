import crypto from "crypto";
import { prisma } from "@/lib/db";

export type InviteRole = "PM" | "VIEWER";

export function newInviteToken() {
  return crypto.randomBytes(18).toString("base64url");
}

export type ResolvedInvite = {
  org: { id: string; name: string };
  role: InviteRole | null; // null = invitee chooses at signup
  firstName: string | null;
  surname: string | null;
};

// Resolve an invite token to its organization plus whatever the creator pinned.
// New links carry an optional role and optional prefilled name. Legacy single
// org tokens fall back to a plain PM invite with no prefill.
export async function resolveInvite(token: string): Promise<ResolvedInvite | null> {
  const link = await prisma.inviteLink.findUnique({
    where: { token },
    include: { organization: true },
  });
  if (link) {
    const role: InviteRole | null = link.role === "VIEWER" ? "VIEWER" : link.role === "PM" ? "PM" : null;
    return {
      org: { id: link.organization.id, name: link.organization.name },
      role,
      firstName: link.firstName || null,
      surname: link.surname || null,
    };
  }
  const org = await prisma.organization.findUnique({ where: { inviteToken: token } });
  if (org) return { org: { id: org.id, name: org.name }, role: null, firstName: null, surname: null };
  return null;
}

// Create a fresh invite link carrying optional role and optional prefilled name.
export async function createInviteLink(
  organizationId: string,
  opts: { role?: InviteRole | null; firstName?: string | null; surname?: string | null }
) {
  return prisma.inviteLink.create({
    data: {
      organizationId,
      token: newInviteToken(),
      role: opts.role ?? null,
      firstName: opts.firstName?.trim() || null,
      surname: opts.surname?.trim() || null,
    },
  });
}
