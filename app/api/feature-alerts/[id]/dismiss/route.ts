import { prisma } from "@/lib/db";
import { withAuth, json, error } from "@/lib/api";

export const runtime = "nodejs";

// The current user dismisses an alert for themselves (idempotent).
export const POST = withAuth(async (user, _req, params) => {
  const alert = await prisma.featureAlert.findFirst({ where: { id: params.id, organizationId: user.oid } });
  if (!alert) return error("Alert not found.", 404);
  await prisma.featureAlertDismissal
    .create({ data: { alertId: alert.id, userId: user.uid } })
    .catch(() => {}); // unique([alertId,userId]) makes a repeat dismissal a no-op
  return json({ ok: true });
});
