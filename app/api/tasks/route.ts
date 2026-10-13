import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error, canWrite } from "@/lib/api";
import { isScopedPM, managedProductIds } from "@/lib/scope";

export const runtime = "nodejs";

const STATUSES = ["NOT_STARTED", "IN_PROGRESS", "IN_REVIEW", "COMPLETE"] as const;

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
  if (!canWrite(user)) return error("You do not have permission to create tasks.", 403);
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

  // Make sure the product belongs to this org.
  const product = await prisma.product.findFirst({
    where: { id: data.productId, organizationId: user.oid },
  });
  if (!product) return error("Pick a product in your organization.", 400);

  const task = await prisma.task.create({
    data: {
      title: data.title.trim(),
      context: data.context?.trim() || null,
      productId: product.id,
      team: data.team.trim(),
      owner: data.owner.trim(),
      priority: data.priority,
      status: data.status,
      startDate: start,
      dueDate: due,
      serviceRequest: data.serviceRequest?.trim() || null,
      blocker: data.blocker?.trim() || null,
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
  return json({ task });
});
