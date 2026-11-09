import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { withAuth, json, error } from "@/lib/api";
import { setSession } from "@/lib/auth";
import { domainAllowed } from "@/lib/domains";

export const runtime = "nodejs";

const MAX_ATTEMPTS = 6;
const Body = z.object({ code: z.string().regex(/^\d{4}$/) });
function hashCode(c: string) { return crypto.createHash("sha256").update(c).digest("hex"); }

// Step 2 of an email change: verify the code, swap the email, re-issue the
// session, and leave an audit trail for admins.
export const POST = withAuth(async (user, req) => {
  let data;
  try {
    data = Body.parse(await req.json());
  } catch {
    return error("Enter the 4-digit code.");
  }
  const pending = await prisma.pendingEmailChange.findUnique({ where: { userId: user.uid } });
  if (!pending) return error("Start the email change again; nothing is pending.", 400);
  if (pending.expiresAt < new Date()) {
    await prisma.pendingEmailChange.delete({ where: { userId: user.uid } }).catch(() => {});
    return error("That code has expired. Start again.", 400);
  }
  if (pending.attempts >= MAX_ATTEMPTS) {
    await prisma.pendingEmailChange.delete({ where: { userId: user.uid } }).catch(() => {});
    return error("Too many incorrect attempts. Start again.", 429);
  }
  if (hashCode(data.code) !== pending.codeHash) {
    await prisma.pendingEmailChange.update({ where: { userId: user.uid }, data: { attempts: { increment: 1 } } });
    const left = MAX_ATTEMPTS - (pending.attempts + 1);
    return error(left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.` : "Too many incorrect attempts. Start again.", 400);
  }

  const newEmail = pending.newEmail;
  // Last-moment re-checks: the address could have been taken or the rule
  // changed while the code was outstanding.
  const taken = await prisma.user.findFirst({ where: { email: newEmail, NOT: { id: user.uid } } });
  if (taken) {
    await prisma.pendingEmailChange.delete({ where: { userId: user.uid } }).catch(() => {});
    return error("That email was just taken. Try another.", 409);
  }
  const org = await prisma.organization.findUnique({ where: { id: user.oid }, select: { allowedDomains: true } });
  if (org && !domainAllowed(newEmail, org.allowedDomains)) {
    await prisma.pendingEmailChange.delete({ where: { userId: user.uid } }).catch(() => {});
    return error("That email no longer meets the domain rule.", 403);
  }

  const oldEmail = user.email;
  await prisma.user.update({ where: { id: user.uid }, data: { email: newEmail, mustChangeEmail: false } });
  await prisma.pendingEmailChange.delete({ where: { userId: user.uid } }).catch(() => {});
  await setSession({ uid: user.uid, oid: user.oid, role: user.role, name: user.name, email: newEmail, viewAll: user.viewAll === true, capPm: user.capPm === true, capOwner: user.capOwner === true, capReviewer: user.capReviewer === true });

  // Audit: an activity entry and a notification to every admin.
  await prisma.activity.create({
    data: { type: "email_changed", content: `${user.name} changed their email from ${oldEmail} to ${newEmail}.`, author: user.name, organizationId: user.oid },
  }).catch(() => {});
  const admins = await prisma.user.findMany({ where: { organizationId: user.oid, role: "ADMIN" }, select: { id: true } });
  if (admins.length) {
    await prisma.notification.createMany({
      data: admins.map((a: any) => ({ userId: a.id, organizationId: user.oid, type: "email_changed", text: `${user.name} changed their email to ${newEmail}.` })),
    });
  }
  return json({ ok: true, email: newEmail });
});
