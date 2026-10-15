import { prisma } from "@/lib/db";
import { withAuth, json, error, canWrite, isAdmin } from "@/lib/api";
import { normName } from "@/lib/owner";

export const runtime = "nodejs";

// A PM (of the product) or an admin approves an owner-created pending task, making
// it visible to everyone.
export const POST = withAuth(async (user, _req, params) => {
  if (!canWrite(user)) return error("Only a PM can approve a task.", 403);
  const task = await prisma.task.findFirst({ where: { id: params.id, organizationId: user.oid } });
  if (!task) return error("Task not found.", 404);
  if (!task.pending) return json({ task });

  const product = task.productId ? await prisma.product.findUnique({ where: { id: task.productId }, select: { pm: true, name: true } }) : null;
  const manages = isAdmin(user) || (product?.pm && normName(product.pm) === normName(user.name));
  if (!manages) return error("Only the product's PM or an admin can approve this task.", 403);

  await prisma.$transaction(async (tx: any) => {
    await tx.task.update({ where: { id: task.id }, data: { pending: false } });
    await tx.activity.create({ data: { type: "note", taskId: task.id, content: `Approved by ${user.name}`, author: user.name, organizationId: user.oid } });
  });

  const { notifyTask } = await import("@/lib/notify");
  if (task.ownerUserId && task.ownerUserId !== user.uid) {
    await notifyTask(user.oid, { taskId: task.id, type: "approved", text: `${user.name} approved your task “${task.title}”`, to: [task.ownerUserId] });
  }
  // Now that it is visible, let the reviewer know they are on it.
  if (task.reviewerUserId && task.reviewerUserId !== user.uid && task.reviewerUserId !== task.ownerUserId) {
    await notifyTask(user.oid, { taskId: task.id, type: "review_assigned", text: `You are the reviewer on “${task.title}”`, to: [task.reviewerUserId] });
  }
  const updated = await prisma.task.findUnique({ where: { id: task.id } });
  return json({ task: updated });
});
