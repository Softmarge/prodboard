import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error, canWrite } from "@/lib/api";
import { normName } from "@/lib/owner";

export const runtime = "nodejs";

const Body = z.object({ userId: z.string().min(1).nullable() });

// A PM links (or unlinks) a task's owner to a real account, even when the typed
// owner name differs from the account's display name.
export const POST = withAuth(async (user, req, params) => {
  if (!canWrite(user)) return error("Only a PM can assign a task owner.", 403);
  const task = await prisma.task.findFirst({ where: { id: params.id, organizationId: user.oid } });
  if (!task) return error("Task not found.", 404);

  let data;
  try { data = Body.parse(await req.json()); } catch { return error("Invalid assignment."); }

  if (!data.userId) {
    await prisma.task.update({ where: { id: task.id }, data: { ownerUserId: null } });
    return json({ ok: true, ownerUserId: null });
  }
  const target = await prisma.user.findFirst({ where: { id: data.userId, organizationId: user.oid }, select: { id: true, name: true, ownerAliases: true } });
  if (!target) return error("Pick a member of your organization.", 404);

  const aliases = new Set((target.ownerAliases || []).map((a: string) => a));
  if (task.owner && normName(task.owner) !== normName(target.name || "")) aliases.add(task.owner.trim());

  await prisma.$transaction(async (tx: any) => {
    await tx.task.update({ where: { id: task.id }, data: { ownerUserId: target.id } });
    await tx.user.update({ where: { id: target.id }, data: { ownerAliases: Array.from(aliases) } });
  });
  if (target.id !== user.uid) {
    const { notifyTask } = await import("@/lib/notify");
    await notifyTask(user.oid, { taskId: task.id, type: "assigned", text: `${user.name} assigned you “${task.title}”`, to: [target.id] });
  }
  return json({ ok: true, ownerUserId: target.id });
});
