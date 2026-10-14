import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error, canWrite } from "@/lib/api";

export const runtime = "nodejs";

const Body = z.object({ comment: z.string().min(1).max(1000) });

// A PM sends an owner's completion back for more work. A comment is required,
// and is captured in the progress note / history.
export const POST = withAuth(async (user, req, params) => {
  if (!canWrite(user)) return error("Only a PM can send a task back.", 403);
  const task = await prisma.task.findFirst({ where: { id: params.id, organizationId: user.oid } });
  if (!task) return error("Task not found.", 404);

  let data;
  try { data = Body.parse(await req.json()); } catch { return error("Add a comment explaining what is needed."); }
  const comment = data.comment.trim();
  if (!comment) return error("Add a comment explaining what is needed.");

  await prisma.$transaction(async (tx: any) => {
    await tx.task.update({ where: { id: task.id }, data: { ownerDoneAt: null, ownerDoneBy: null } });
    await tx.activity.create({ data: { type: "note", taskId: task.id, content: `Sent back by ${user.name}: ${comment}`, author: user.name, organizationId: user.oid } });
  });
  const updated = await prisma.task.findUnique({ where: { id: task.id } });
  return json({ task: updated });
});
