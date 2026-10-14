import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error, canWrite } from "@/lib/api";

export const runtime = "nodejs";

const STATUSES = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "IN_REVIEW", "COMPLETE"] as const;

// Post a progress update: optional status change, optional note, optional blocker edit.
const Body = z.object({
  status: z.enum(STATUSES).optional(),
  note: z.string().max(1000).optional(),
  blocker: z.string().max(400).optional(),
});

export const POST = withAuth(async (user, req, params) => {
  const task = await prisma.task.findFirst({ where: { id: params.id, organizationId: user.oid } });
  if (!task) return error("Task not found.", 404);
  // PMs/admins can do anything; the task owner may post notes and edit the blocker
  // on their own task even if their role is Viewer, but cannot change status.
  const owns = task.ownerUserId === user.uid;
  if (!canWrite(user) && !owns) return error("You do not have permission to update tasks.", 403);

  let data;
  try {
    data = Body.parse(await req.json());
  } catch {
    return error("Invalid update.");
  }
  if (!canWrite(user)) data.status = undefined; // owners cannot change status here

  const note = data.note?.trim() || "";
  const blockerChanged = data.blocker !== undefined && (data.blocker.trim() || "") !== (task.blocker || "");
  const statusChanged = data.status !== undefined && data.status !== task.status;

  if (!statusChanged && !note && !blockerChanged) {
    return error("Nothing to post, change the status, add a note, or edit the blocker.");
  }

  // Moving a task out of Not started requires a start date and a due date.
  if (statusChanged && data.status !== "NOT_STARTED" && (!task.startDate || !task.dueDate)) {
    return error("Set a start date and due date first (use Edit details) before moving this task out of Not started.");
  }
  // A blocked task must carry a reason (the blocker).
  const resultingBlocker = data.blocker !== undefined ? data.blocker.trim() : (task.blocker || "");
  if (data.status === "BLOCKED" && !resultingBlocker) {
    return error("A blocked task needs a reason. Add a blocker before marking it Blocked.");
  }

  const patch: Record<string, unknown> = {};
  if (statusChanged) patch.status = data.status;
  if (blockerChanged) patch.blocker = data.blocker!.trim() || null;

  await prisma.$transaction(async (tx: any) => {
    if (Object.keys(patch).length) {
      await tx.task.update({ where: { id: task.id }, data: patch });
    }
    if (statusChanged) {
      await tx.activity.create({
        data: {
          type: "status",
          taskId: task.id,
          fromStatus: task.status,
          toStatus: data.status,
          author: user.name,
          organizationId: user.oid,
        },
      });
    }
    if (note) {
      await tx.activity.create({
        data: { type: "note", taskId: task.id, content: note, author: user.name, organizationId: user.oid },
      });
    }
  });

  const updated = await prisma.task.findUnique({ where: { id: task.id } });
  return json({ task: updated });
});
