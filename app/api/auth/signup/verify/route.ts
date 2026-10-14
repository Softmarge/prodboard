import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { setSession } from "@/lib/auth";
import { error, json } from "@/lib/api";

export const runtime = "nodejs";

const MAX_ATTEMPTS = 6;

const Body = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{4}$/, "Enter the 4-digit code."),
});

function hashCode(c: string) {
  return crypto.createHash("sha256").update(c).digest("hex");
}

// Step 2 of signup: check the code, then create the organization (if needed),
// the user, and the session. The pending record is consumed on success.
export async function POST(req: Request) {
  let data;
  try {
    data = Body.parse(await req.json());
  } catch {
    return error("Enter the 4-digit code sent to your email.");
  }
  const email = data.email.trim().toLowerCase();

  const pending = await prisma.pendingSignup.findUnique({ where: { email } });
  if (!pending) return error("Start the sign-up again; no pending verification was found.", 400);
  if (pending.expiresAt < new Date()) {
    await prisma.pendingSignup.delete({ where: { email } }).catch(() => {});
    return error("That code has expired. Start the sign-up again.", 400);
  }
  if (pending.attempts >= MAX_ATTEMPTS) {
    await prisma.pendingSignup.delete({ where: { email } }).catch(() => {});
    return error("Too many incorrect attempts. Start the sign-up again.", 429);
  }
  if (hashCode(data.code) !== pending.codeHash) {
    await prisma.pendingSignup.update({ where: { email }, data: { attempts: { increment: 1 } } });
    const left = MAX_ATTEMPTS - (pending.attempts + 1);
    return error(left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.` : "Too many incorrect attempts. Start the sign-up again.", 400);
  }

  // Code is correct. Guard against a race where the email got taken meanwhile.
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    await prisma.pendingSignup.delete({ where: { email } }).catch(() => {});
    return error("An account with that email already exists. Try signing in instead.", 409);
  }

  let invitedOrg = null;
  let resolvedInvite: Awaited<ReturnType<typeof import("@/lib/invite").resolveInvite>> = null;
  if (pending.inviteToken) {
    const { resolveInvite, INVITE_USED_MESSAGE } = await import("@/lib/invite");
    resolvedInvite = await resolveInvite(pending.inviteToken);
    if (!resolvedInvite) return error("The invite link is no longer valid. Ask your colleague for a fresh one.", 400);
    if (resolvedInvite.named && resolvedInvite.used) return error(INVITE_USED_MESSAGE, 410);
    invitedOrg = await prisma.organization.findUnique({ where: { id: resolvedInvite.org.id } });
    if (!invitedOrg) return error("The invite link is no longer valid. Ask your colleague for a fresh one.", 400);
  }
  const orgName = (pending.organization || "").trim();
  const existingOrg = invitedOrg ?? (orgName ? await prisma.organization.findUnique({ where: { name: orgName } }) : null);

  // Final display-name uniqueness check (an org existing here means a race is possible).
  if (existingOrg) {
    const { nameTaken } = await import("@/lib/names");
    if (await nameTaken(existingOrg.id, pending.name)) {
      return error(`The display name “${pending.name}” was just taken in this organization. Start again with a different first name.`, 409);
    }
  }

  const result = await prisma.$transaction(async (tx: any) => {
    const org = existingOrg ?? (await tx.organization.create({ data: { name: orgName } }));
    const isFirst = !existingOrg;
    type JoinRole = "PM" | "VIEWER" | "TASK_OWNER" | "REVIEWER";
    const role = invitedOrg ? (pending.role as JoinRole) : isFirst ? "ADMIN" : (pending.role as JoinRole);
    const user = await tx.user.create({
      data: { name: pending.name, firstName: pending.firstName, surname: pending.surname, email, passwordHash: pending.passwordHash, role, organizationId: org.id },
    });
    await tx.pendingSignup.delete({ where: { email } });
    return { org, user };
  });

  // A named link is single-use: consume it so a reuse attempt is refused.
  if (resolvedInvite?.linkId && resolvedInvite.named) {
    const { markInviteUsed } = await import("@/lib/invite");
    await markInviteUsed(resolvedInvite.linkId);
  }

  await setSession({
    uid: result.user.id,
    oid: result.org.id,
    role: result.user.role,
    name: result.user.name,
    email: result.user.email,
    viewAll: (result.user as any).viewAll === true,
    capPm: (result.user as any).capPm === true,
    capOwner: (result.user as any).capOwner === true,
    capReviewer: (result.user as any).capReviewer === true,
  });
  return json({ ok: true });
}
