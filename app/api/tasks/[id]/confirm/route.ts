import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error, canWrite } from "@/lib/api";

export const runtime = "nodejs";

const Body = z.object({ note: z.string().max(1000).optional() });

// A PM confirms an owner's completion: the task becomes Complete.
export const POST = withAuth(async (user, req, params) => {
  if (!canWrite(user)) return error("Only a PM can confirm completion.", 403);
  const task = await prisma.task.findFirst({ where: { id: params.id, organizationId: user.oid } });
  if (!task) return error("Task not found.", 404);

  let data: z.infer<typeof Body> = {};
  try { data = Body.parse(await req.json()); } catch { data = {}; }
  const note = (data.note || "").trim();

  await prisma.$transaction(async (tx: any) => {
    await tx.task.update({ where: { id: task.id }, data: { status: "COMPLETE", ownerDoneAt: null, ownerDoneBy: null } });
    await tx.activity.create({ data: { type: "status", taskId: task.id, fromStatus: task.status, toStatus: "COMPLETE", author: user.name, organizationId: user.oid } });
    if (note) await tx.activity.create({ data: { type: "note", taskId: task.id, content: `Confirmed complete. ${note}`, author: user.name, organizationId: user.oid } });
  });
  if (task.ownerUserId) {
    const { notifyTask } = await import("@/lib/notify");
    await notifyTask(user.oid, { taskId: task.id, type: "confirm", text: `${user.name} confirmed “${task.title}” as complete`, to: [task.ownerUserId], excludeUserId: user.uid });
  }
  const updated = await prisma.task.findUnique({ where: { id: task.id } });
  return json({ task: updated });
});
