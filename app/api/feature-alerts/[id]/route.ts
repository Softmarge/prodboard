import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error, isAdmin } from "@/lib/api";

export const runtime = "nodejs";

const Patch = z.object({ active: z.boolean() });

// Toggle an alert active/inactive (admin only).
export const PATCH = withAuth(async (user, req, params) => {
  if (!isAdmin(user)) return error("Only an admin can change feature alerts.", 403);
  const alert = await prisma.featureAlert.findFirst({ where: { id: params.id, organizationId: user.oid } });
  if (!alert) return error("Alert not found.", 404);
  let data;
  try { data = Patch.parse(await req.json()); } catch { return error("Invalid change."); }
  await prisma.featureAlert.update({ where: { id: alert.id }, data: { active: data.active } });
  return json({ ok: true });
});

// Delete an alert (admin only).
export const DELETE = withAuth(async (user, _req, params) => {
  if (!isAdmin(user)) return error("Only an admin can delete feature alerts.", 403);
  const alert = await prisma.featureAlert.findFirst({ where: { id: params.id, organizationId: user.oid } });
  if (!alert) return error("Alert not found.", 404);
  await prisma.featureAlert.delete({ where: { id: alert.id } });
  return json({ ok: true });
});
