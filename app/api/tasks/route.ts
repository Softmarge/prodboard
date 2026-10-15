import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error, canWrite, isOwnerOrReviewer } from "@/lib/api";
import { isScopedPM, managedProductIds } from "@/lib/scope";

export const runtime = "nodejs";

const STATUSES = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "IN_REVIEW", "COMPLETE"] as const;

export const GET = withAuth(async (user) => {
  let tasks = await prisma.task.findMany({
    where: { organizationId: user.oid },
    orderBy: { createdAt: "desc" },
  });
  if (isScopedPM(user)) {
    const ids = await managedProductIds(user);
    tasks = tasks.filter((t: any) => t.productId && ids.has(t.productId));
  }
  return json({ tasks });
});

const Create = z.object({
  title: z.string().min(1).max(240),
  context: z.string().max(4000).optional().default(""),
  productId: z.string().min(1),
  team: z.string().min(1).max(80),
  owner: z.string().min(1).max(120),
  reviewer: z.string().max(120).optional().default(""),
  priority: z.number().int().min(1).max(3).optional().default(2),
  status: z.enum(STATUSES).default("IN_PROGRESS"),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  serviceRequest: z.string().max(160).optional().default(""),
  blocker: z.string().max(400).optional().default(""),
});

function toDate(s?: string): Date | null {
  if (!s) return null;
  const d = new Date(s + (s.length === 10 ? "T00:00:00" : ""));
  return isNaN(d.getTime()) ? null : d;
}

export const POST = withAuth(async (user, req) => {
  // PMs/admins create freely. A task owner / reviewer may also create a task they
  // own: on a product they already work on it goes live; on a product new to them
  // it is created pending a PM's approval.
  const privileged = canWrite(user);
  let mayCreate = privileged || isOwnerOrReviewer(user);
  if (!mayCreate) {
    // A viewer who nonetheless owns or reviews a task counts as an owner here.
    const cnt = await prisma.task.count({ where: { organizationId: user.oid, OR: [{ ownerUserId: user.uid }, { reviewerUserId: user.uid }] } });
    mayCreate = cnt > 0;
  }
  if (!mayCreate) return error("You do not have permission to create tasks.", 403);

  let data;
  try {
    data = Create.parse(await req.json());
  } catch {
    return error("A task needs a title, product, owner and due date.");
  }
  const start = toDate(data.startDate);
  const due = toDate(data.dueDate);
  // Dates are optional only while the task is Not started; any active status needs both.
  if (data.status !== "NOT_STARTED" && (!start || !due)) {
    return error("A start date and due date are required unless the task is Not started.");
  }
  if (data.status === "BLOCKED" && !(data.blocker || "").trim()) {
    return error("A blocked task needs a reason. Fill in the blocker.");
  }

  // Make sure the product belongs to this org.
  const product = await prisma.product.findFirst({
    where: { id: data.productId, organizationId: user.oid },
  });
  if (!product) return error("Pick a product in your organization.", 400);

  const { resolveOwnerUserId } = await import("@/lib/owner");
  const reviewerName = (data.reviewer || "").trim();
  const reviewerUserId = reviewerName ? await resolveOwnerUserId(user.oid, reviewerName) : null;

  // Owner/reviewer self-create: lock the owner to themselves; decide pending by
  // whether they already work on this product (own or review a task on it).
  let ownerName = data.owner.trim();
  let ownerUserId = await resolveOwnerUserId(user.oid, data.owner);
  let pending = false;
  if (!privileged) {
    ownerName = user.name;
    ownerUserId = user.uid;
    const mine = await prisma.task.findMany({ where: { organizationId: user.oid, OR: [{ ownerUserId: user.uid }, { reviewerUserId: user.uid }] }, select: { productId: true } });
    const involved = new Set(mine.map((t: any) => t.productId).filter(Boolean));
    pending = !involved.has(product.id);
  }

  const task = await prisma.task.create({
    data: {
      title: data.title.trim(),
      context: data.context?.trim() || null,
      productId: product.id,
      team: data.team.trim(),
      owner: ownerName,
      ownerUserId,
      reviewer: reviewerName || null,
      reviewerUserId,
      priority: data.priority,
      status: data.status,
      startDate: start,
      dueDate: due,
      serviceRequest: data.serviceRequest?.trim() || null,
      blocker: data.blocker?.trim() || null,
      pending,
      createdBy: user.name,
      organizationId: user.oid,
    },
  });
  await prisma.activity.create({
    data: {
      type: "created",
      taskId: task.id,
      taskTitle: task.title,
      toStatus: task.status,
      author: user.name,
      organizationId: user.oid,
    },
  });

  const { notifyTask } = await import("@/lib/notify");
  if (!privileged && pending) {
    // Awaiting approval: tell the product's PM and the admins, not the reviewer yet.
    await notifyTask(user.oid, { taskId: task.id, type: "approval_request", text: `${user.name} proposed a new task “${task.title}” under ${product.name}, awaiting your approval`, includePm: true, includeAdmins: true, excludeUserId: user.uid });
  } else {
    if (!privileged) {
      await notifyTask(user.oid, { taskId: task.id, type: "owner_created", text: `${user.name} added a task “${task.title}” under ${product.name}`, includePm: true, excludeUserId: user.uid });
    }
    // Let the reviewer know they are on the task (only once it is visible).
    if (reviewerUserId && reviewerUserId !== user.uid) {
      await notifyTask(user.oid, { taskId: task.id, type: "review_assigned", text: `${user.name} added you as reviewer on “${task.title}”`, to: [reviewerUserId] });
    }
  }
  return json({ task });
});
