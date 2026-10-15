import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error, canWrite } from "@/lib/api";

export const runtime = "nodejs";

const STATUSES = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "IN_REVIEW", "COMPLETE"] as const;

const Patch = z.object({
  title: z.string().min(1).max(240).optional(),
  context: z.string().max(4000).optional(),
  productId: z.string().optional(),
  team: z.string().min(1).max(80).optional(),
  owner: z.string().min(1).max(120).optional(),
  reviewer: z.string().max(120).optional(),
  priority: z.number().int().min(1).max(3).optional(),
  status: z.enum(STATUSES).optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  serviceRequest: z.string().max(160).optional(),
  blocker: z.string().max(400).optional(),
});

function toDate(s?: string): Date | null {
  if (!s) return null;
  const d = new Date(s + (s.length === 10 ? "T00:00:00" : ""));
  return isNaN(d.getTime()) ? null : d;
}

export const PATCH = withAuth(async (user, req, params) => {
  const existing = await prisma.task.findFirst({ where: { id: params.id, organizationId: user.oid } });
  if (!existing) return error("Task not found.", 404);
  // PMs/admins edit any task. The creator of a task may also edit the one they
  // authored (e.g. to fix a wrong product), but not change its status here.
  const selfCreated = existing.ownerUserId === user.uid && (existing.createdBy || "") === user.name;
  const ownerEdit = !canWrite(user) && selfCreated;
  if (!canWrite(user) && !ownerEdit) return error("You do not have permission to edit tasks.", 403);

  let data;
  try {
    data = Patch.parse(await req.json());
  } catch {
    return error("Invalid task update.");
  }

  // An owner editing their own task cannot change the owner or the status here.
  if (ownerEdit) { data.owner = undefined; data.status = undefined; }

  if (data.productId) {
    const product = await prisma.product.findFirst({
      where: { id: data.productId, organizationId: user.oid },
    });
    if (!product) return error("Pick a product in your organization.", 400);
  }

  // Work out the task's state after this patch so we can enforce the date rule:
  // a task that is not "Not started" must carry both a start date and a due date.
  const nextStatus = data.status ?? existing.status;
  const nextStart = data.startDate !== undefined ? toDate(data.startDate) : existing.startDate;
  const nextDue = data.dueDate !== undefined ? toDate(data.dueDate) : existing.dueDate;
  if (nextStatus !== "NOT_STARTED" && (!nextStart || !nextDue)) {
    return error("Set a start date and due date before moving this task out of Not started.");
  }
  const nextBlocker = data.blocker !== undefined ? data.blocker.trim() : (existing.blocker || "");
  if (nextStatus === "BLOCKED" && !nextBlocker) {
    return error("A blocked task needs a reason. Add a blocker before marking it Blocked.");
  }

  const patch: Record<string, unknown> = {};
  if (data.title !== undefined) patch.title = data.title.trim();
  if (data.context !== undefined) patch.context = data.context.trim() || null;
  if (data.productId !== undefined) patch.productId = data.productId;
  if (data.team !== undefined) patch.team = data.team.trim();
  if (data.owner !== undefined) {
    patch.owner = data.owner.trim();
    const { resolveOwnerUserId } = await import("@/lib/owner");
    patch.ownerUserId = await resolveOwnerUserId(user.oid, data.owner);
  }
  let newReviewerUserId: string | null | undefined;
  if (data.reviewer !== undefined) {
    const rv = data.reviewer.trim();
    patch.reviewer = rv || null;
    const { resolveOwnerUserId } = await import("@/lib/owner");
    newReviewerUserId = rv ? await resolveOwnerUserId(user.oid, rv) : null;
    patch.reviewerUserId = newReviewerUserId;
  }
  if (data.priority !== undefined) patch.priority = data.priority;
  if (data.status !== undefined) patch.status = data.status;
  if (data.startDate !== undefined) patch.startDate = toDate(data.startDate);
  if (data.dueDate !== undefined) patch.dueDate = toDate(data.dueDate);
  if (data.serviceRequest !== undefined) patch.serviceRequest = data.serviceRequest.trim() || null;
  if (data.blocker !== undefined) patch.blocker = data.blocker.trim() || null;

  // When the creator edits their own task, recompute pending by whether they
  // already work on the resulting product: an involved product goes live, a new
  // one needs a PM's approval again.
  let ownerPending: boolean | undefined;
  if (ownerEdit) {
    const nextProductId = (data.productId ?? existing.productId) as string | null;
    const mine = await prisma.task.findMany({ where: { organizationId: user.oid, OR: [{ ownerUserId: user.uid }, { reviewerUserId: user.uid }], NOT: { id: existing.id } }, select: { productId: true } });
    const involved = new Set(mine.map((t: any) => t.productId).filter(Boolean));
    ownerPending = !(nextProductId && involved.has(nextProductId));
    patch.pending = ownerPending;
  }

  const task = await prisma.task.update({ where: { id: existing.id }, data: patch });

  const statusChanged = data.status !== undefined && data.status !== existing.status;
  if (statusChanged) {
    await prisma.activity.create({
      data: {
        type: "status",
        taskId: task.id,
        fromStatus: existing.status,
        toStatus: data.status,
        author: user.name,
        organizationId: user.oid,
      },
    });
  }

  // Reviewer notifications: a newly assigned reviewer, and whenever a task enters review.
  const effectiveReviewerId = (task as any).reviewerUserId as string | null;
  const assignedReviewer = newReviewerUserId !== undefined && newReviewerUserId && newReviewerUserId !== existing.reviewerUserId;
  const enteredReview = statusChanged && data.status === "IN_REVIEW" && !!effectiveReviewerId;
  if (assignedReviewer || enteredReview) {
    const { notifyTask } = await import("@/lib/notify");
    if (assignedReviewer && newReviewerUserId !== user.uid) {
      await notifyTask(user.oid, { taskId: task.id, type: "review_assigned", text: `${user.name} added you as reviewer on “${task.title}”`, to: [newReviewerUserId] });
    }
    if (enteredReview && effectiveReviewerId !== user.uid) {
      await notifyTask(user.oid, { taskId: task.id, type: "review_ready", text: `“${task.title}” is ready for your review`, to: [effectiveReviewerId], excludeUserId: user.uid });
    }
  }

  // When the creator resubmits a still-pending edit, re-prompt the PM to approve.
  if (ownerEdit && ownerPending) {
    const { notifyTask } = await import("@/lib/notify");
    const prod = task.productId ? await prisma.product.findUnique({ where: { id: task.productId }, select: { name: true } }) : null;
    await notifyTask(user.oid, { taskId: task.id, type: "approval_request", text: `${user.name} updated “${task.title}”${prod ? ` under ${prod.name}` : ""}, awaiting your approval`, includePm: true, includeAdmins: true, excludeUserId: user.uid });
  }
  return json({ task });
});

export const DELETE = withAuth(async (user, _req, params) => {
  if (!canWrite(user)) return error("You do not have permission to delete tasks.", 403);
  const existing = await prisma.task.findFirst({ where: { id: params.id, organizationId: user.oid } });
  if (!existing) return error("Task not found.", 404);
  await prisma.task.delete({ where: { id: existing.id } });
  return json({ ok: true });
});
