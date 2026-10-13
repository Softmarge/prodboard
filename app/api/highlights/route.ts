import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error } from "@/lib/api";

export const runtime = "nodejs";

const Body = z.object({ taskId: z.string().min(1), color: z.string().max(32).nullable() });

// Set or clear the current user's private highlight color on a task.
export const POST = withAuth(async (user, req) => {
  let data;
  try {
    data = Body.parse(await req.json());
  } catch {
    return error("Invalid highlight.");
  }
  const task = await prisma.task.findFirst({ where: { id: data.taskId, organizationId: user.oid }, select: { id: true } });
  if (!task) return error("Task not found.", 404);

  const color = (data.color || "").trim();
  if (!color) {
    await prisma.taskHighlight.deleteMany({ where: { userId: user.uid, taskId: task.id } });
    return json({ ok: true, taskId: task.id, color: null });
  }
  if (!/^#[0-9a-fA-F]{3,8}$/.test(color)) return error("Enter a valid color.");
  await prisma.taskHighlight.upsert({
    where: { userId_taskId: { userId: user.uid, taskId: task.id } },
    update: { color },
    create: { userId: user.uid, taskId: task.id, color },
  });
  return json({ ok: true, taskId: task.id, color });
});
