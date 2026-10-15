import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error, canWrite, isAdmin } from "@/lib/api";
import { normName } from "@/lib/owner";

export const runtime = "nodejs";

const Body = z.object({ comment: z.string().min(1).max(1000) });

// A PM (of the product) or an admin sends an owner-created pending task back with
// a comment. It stays pending (hidden from others) so the creator can fix and resubmit.
export const POST = withAuth(async (user, req, params) => {
  if (!canWrite(user)) return error("Only a PM can send a task back.", 403);
  const task = await prisma.task.findFirst({ where: { id: params.id, organizationId: user.oid } });
  if (!task) return error("Task not found.", 404);
  if (!task.pending) return error("This task is not awaiting approval.", 400);

  const product = task.productId ? await prisma.product.findUnique({ where: { id: task.productId }, select: { pm: true } }) : null;
  const manages = isAdmin(user) || (product?.pm && normName(product.pm) === normName(user.name));
  if (!manages) return error("Only the product's PM or an admin can review this task.", 403);

  let data;
  try { data = Body.parse(await req.json()); } catch { return error("Add a comment explaining what is needed."); }
  const comment = data.comment.trim();
  if (!comment) return error("Add a comment explaining what is needed.");

  await prisma.activity.create({ data: { type: "note", taskId: task.id, content: `Sent back by ${user.name}: ${comment}`, author: user.name, organizationId: user.oid } });

  if (task.ownerUserId && task.ownerUserId !== user.uid) {
    const { notifyTask } = await import("@/lib/notify");
    await notifyTask(user.oid, { taskId: task.id, type: "sendback", text: `${user.name} sent “${task.title}” back: ${comment}`, to: [task.ownerUserId] });
  }
  const updated = await prisma.task.findUnique({ where: { id: task.id } });
  return json({ task: updated });
});
