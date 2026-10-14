import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error } from "@/lib/api";

export const runtime = "nodejs";

const Body = z.object({ note: z.string().max(1000).optional() });

// The task's owner marks their part done. Status is unchanged; the task now
// awaits PM confirmation. Captured in the progress note / history.
export const POST = withAuth(async (user, req, params) => {
  const task = await prisma.task.findFirst({ where: { id: params.id, organizationId: user.oid } });
  if (!task) return error("Task not found.", 404);
  if (task.ownerUserId !== user.uid) return error("Only the task owner can mark this done.", 403);

  let data: z.infer<typeof Body> = {};
  try { data = Body.parse(await req.json()); } catch { data = {}; }
  const note = (data.note || "").trim();

  await prisma.$transaction(async (tx: any) => {
    await tx.task.update({ where: { id: task.id }, data: { ownerDoneAt: new Date(), ownerDoneBy: user.name } });
    await tx.activity.create({ data: { type: "note", taskId: task.id, content: note ? `Marked done (awaiting confirmation). ${note}` : "Marked done (awaiting confirmation).", author: user.name, organizationId: user.oid } });
  });
  const { notifyTask } = await import("@/lib/notify");
  await notifyTask(user.oid, { taskId: task.id, type: "owner_done", text: `${user.name} marked “${task.title}” done, awaiting confirmation`, includePm: true, includeAdmins: true, excludeUserId: user.uid });
  const updated = await prisma.task.findUnique({ where: { id: task.id } });
  return json({ task: updated });
});
