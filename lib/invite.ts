import crypto from "crypto";
import { prisma } from "@/lib/db";

export type InviteRole = "PM" | "VIEWER" | "TASK_OWNER" | "REVIEWER";

export function newInviteToken() {
  return crypto.randomBytes(18).toString("base64url");
}

export type ResolvedInvite = {
  linkId: string | null; // null for legacy org-wide tokens
  org: { id: string; name: string };
  role: InviteRole | null; // null = invitee chooses at signup
  firstName: string | null;
  surname: string | null;
  named: boolean; // a name was prefilled; named links are single-use
  used: boolean; // already consumed (only meaningful for named links)
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
    // A link can pin any non-admin role; anything else means the invitee chooses.
    const role: InviteRole | null =
      link.role === "VIEWER" || link.role === "PM" || link.role === "TASK_OWNER" || link.role === "REVIEWER"
        ? (link.role as InviteRole)
        : null;
    const firstName = link.firstName || null;
    const surname = link.surname || null;
    return {
      linkId: link.id,
      org: { id: link.organization.id, name: link.organization.name },
      role,
      firstName,
      surname,
      named: !!(firstName || surname),
      used: !!link.usedAt,
    };
  }
  const org = await prisma.organization.findUnique({ where: { inviteToken: token } });
  if (org) return { linkId: null, org: { id: org.id, name: org.name }, role: null, firstName: null, surname: null, named: false, used: false };
  return null;
}

// Mark a named link consumed so it cannot be reused.
export async function markInviteUsed(linkId: string) {
  await prisma.inviteLink.update({ where: { id: linkId }, data: { usedAt: new Date() } }).catch(() => {});
}

export const INVITE_USED_MESSAGE = "This invite link has already been used. Ask your colleague for a fresh one.";

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
