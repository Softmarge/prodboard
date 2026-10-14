import { prisma } from "@/lib/db";
import { resolveOwnerUserId } from "@/lib/owner";

type NotifyOpts = {
  taskId?: string | null;
  type: string;
  text: string;
  to?: (string | null | undefined)[]; // explicit recipient user ids
  includePm?: boolean; // the task's product PM account
  includeAdmins?: boolean; // all org admins
  excludeUserId?: string; // never notify the actor
};

// Create notifications for the resolved set of recipients.
export async function notifyTask(organizationId: string, opts: NotifyOpts): Promise<void> {
  const ids = new Set<string>((opts.to || []).filter(Boolean) as string[]);
  if (opts.includeAdmins) {
    const admins = await prisma.user.findMany({ where: { organizationId, role: "ADMIN" }, select: { id: true } });
    admins.forEach((a: any) => ids.add(a.id));
  }
  if (opts.includePm && opts.taskId) {
    const t = await prisma.task.findUnique({ where: { id: opts.taskId }, select: { productId: true } });
    if (t?.productId) {
      const p = await prisma.product.findUnique({ where: { id: t.productId }, select: { pm: true } });
      if (p?.pm) { const pmId = await resolveOwnerUserId(organizationId, p.pm); if (pmId) ids.add(pmId); }
    }
  }
  if (opts.excludeUserId) ids.delete(opts.excludeUserId);
  const recipients = Array.from(ids);
  if (!recipients.length) return;
  await prisma.notification.createMany({
    data: recipients.map((uid) => ({ organizationId, userId: uid, type: opts.type, taskId: opts.taskId || null, text: opts.text })),
  });
}
