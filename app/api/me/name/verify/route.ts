import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { withAuth, json, error } from "@/lib/api";
import { setSession } from "@/lib/auth";
import { nameTaken } from "@/lib/names";

export const runtime = "nodejs";

const MAX_ATTEMPTS = 6;
const Body = z.object({ code: z.string().regex(/^\d{4}$/) });
function hashCode(c: string) { return crypto.createHash("sha256").update(c).digest("hex"); }

export const POST = withAuth(async (user, req) => {
  let data;
  try {
    data = Body.parse(await req.json());
  } catch {
    return error("Enter the 4-digit code.");
  }
  const pending = await prisma.pendingNameChange.findUnique({ where: { userId: user.uid } });
  if (!pending) return error("Start the name change again; nothing is pending.", 400);
  if (pending.expiresAt < new Date()) {
    await prisma.pendingNameChange.delete({ where: { userId: user.uid } }).catch(() => {});
    return error("That code has expired. Start again.", 400);
  }
  if (pending.attempts >= MAX_ATTEMPTS) {
    await prisma.pendingNameChange.delete({ where: { userId: user.uid } }).catch(() => {});
    return error("Too many incorrect attempts. Start again.", 429);
  }
  if (hashCode(data.code) !== pending.codeHash) {
    await prisma.pendingNameChange.update({ where: { userId: user.uid }, data: { attempts: { increment: 1 } } });
    const left = MAX_ATTEMPTS - (pending.attempts + 1);
    return error(left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.` : "Too many incorrect attempts. Start again.", 400);
  }
  // Re-check uniqueness at the last moment.
  if (await nameTaken(user.oid, pending.newName, user.uid)) {
    await prisma.pendingNameChange.delete({ where: { userId: user.uid } }).catch(() => {});
    return error(`The display name “${pending.newName}” was just taken. Try another.`, 409);
  }

  const updated = await prisma.user.update({ where: { id: user.uid }, data: { name: pending.newName, firstName: pending.newName } });
  await prisma.pendingNameChange.delete({ where: { userId: user.uid } }).catch(() => {});
  await setSession({ uid: user.uid, oid: user.oid, role: user.role, name: updated.name, email: user.email, viewAll: user.viewAll === true });
  return json({ ok: true, name: updated.name });
});
