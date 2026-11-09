import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error, isAdmin } from "@/lib/api";

export const runtime = "nodejs";

const Body = z.object({
  userIds: z.array(z.string().min(1)).min(1).max(500),
  action: z.enum(["allow", "require"]),
});

// Reconcile users against the email-domain rule. "allow" grandfathers the
// selected users (exempt from the rule). "require" forces them to change their
// email before using the app. Admins are never forced.
export const POST = withAuth(async (user, req) => {
  if (!isAdmin(user)) return error("Only an admin can do this.", 403);
  let data;
  try {
    data = Body.parse(await req.json());
  } catch {
    return error("Invalid request.");
  }
  const targets = await prisma.user.findMany({
    where: { id: { in: data.userIds }, organizationId: user.oid },
    select: { id: true, role: true },
  });
  const ids = targets.filter((t: any) => data.action === "allow" || t.role !== "ADMIN").map((t: any) => t.id);
  if (!ids.length) return json({ ok: true, count: 0 });
  if (data.action === "allow") {
    await prisma.user.updateMany({ where: { id: { in: ids } }, data: { domainExempt: true, mustChangeEmail: false } });
  } else {
    await prisma.user.updateMany({ where: { id: { in: ids } }, data: { mustChangeEmail: true, domainExempt: false } });
  }
  return json({ ok: true, count: ids.length });
});
