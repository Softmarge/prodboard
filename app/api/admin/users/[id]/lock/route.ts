import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error, isAdmin } from "@/lib/api";

export const runtime = "nodejs";

const Body = z.object({ locked: z.boolean() });

// Lock or unlock a user. Admin only. You can't lock yourself. A locked account
// is blocked from every authenticated request from its next action onward.
export const POST = withAuth(async (user, req, params) => {
  if (!isAdmin(user)) return error("Only an admin can lock accounts.", 403);
  let data;
  try {
    data = Body.parse(await req.json());
  } catch {
    return error("Invalid request.");
  }
  if (params.id === user.uid) return error("You can't lock your own account.", 400);
  const target = await prisma.user.findFirst({ where: { id: params.id, organizationId: user.oid }, select: { id: true } });
  if (!target) return error("User not found.", 404);
  await prisma.user.update({ where: { id: target.id }, data: { lockedAt: data.locked ? new Date() : null } });
  return json({ ok: true, locked: data.locked });
});
