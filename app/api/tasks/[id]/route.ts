import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error, canWrite } from "@/lib/api";

export const runtime = "nodejs";

const STATUSES = ["NOT_STARTED", "IN_PROGRESS", "IN_REVIEW", "COMPLETE"] as const;

const Patch = z.object({
  title: z.string().min(1).max(240).optional(),
  productId: z.string().optional(),
  team: z.string().min(1).max(80).optional(),
  owner: z.string().min(1).max(120).optional(),
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
  if (!canWrite(user)) return error("You do not have permission to edit tasks.", 403);
  const existing = await prisma.task.findFirst({ where: { id: params.id, organizationId: user.oid } });
  if (!existing) return error("Task not found.", 404);

  let data;
  try {
    data = Patch.parse(await req.json());
  } catch {
    return error("Invalid task update.");
  }

  if (data.productId) {
    const product = await prisma.product.findFirst({
      where: { id: data.productId, organizationId: user.oid },
    });
    if (!product) return error("Pick a product in your organization.", 400);
  }

  const patch: Record<string, unknown> = {};
  if (data.title !== undefined) patch.title = data.title.trim();
  if (data.productId !== undefined) patch.productId = data.productId;
  if (data.team !== undefined) patch.team = data.team.trim();
  if (data.owner !== undefined) patch.owner = data.owner.trim();
  if (data.priority !== undefined) patch.priority = data.priority;
  if (data.status !== undefined) patch.status = data.status;
  if (data.startDate !== undefined) patch.startDate = toDate(data.startDate);
  if (data.dueDate !== undefined) {
    const d = toDate(data.dueDate);
    if (!d) return error("Due date must be valid.");
    patch.dueDate = d;
  }
  if (data.serviceRequest !== undefined) patch.serviceRequest = data.serviceRequest.trim() || null;
  if (data.blocker !== undefined) patch.blocker = data.blocker.trim() || null;

  const task = await prisma.task.update({ where: { id: existing.id }, data: patch });

  if (data.status !== undefined && data.status !== existing.status) {
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
  return json({ task });
});

export const DELETE = withAuth(async (user, _req, params) => {
  if (!canWrite(user)) return error("You do not have permission to delete tasks.", 403);
  const existing = await prisma.task.findFirst({ where: { id: params.id, organizationId: user.oid } });
  if (!existing) return error("Task not found.", 404);
  await prisma.task.delete({ where: { id: existing.id } });
  return json({ ok: true });
});
