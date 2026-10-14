import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error } from "@/lib/api";

export const runtime = "nodejs";

// The signed-in user's notifications (newest first) and the unread count.
export const GET = withAuth(async (user) => {
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId: user.uid }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, type: true, taskId: true, text: true, read: true, createdAt: true } }),
    prisma.notification.count({ where: { userId: user.uid, read: false } }),
  ]);
  return json({ items, unread });
});

const Patch = z.object({ id: z.string().optional() });

// Mark one notification read, or all when no id is given.
export const POST = withAuth(async (user, req) => {
  let data: z.infer<typeof Patch> = {};
  try { data = Patch.parse(await req.json()); } catch { data = {}; }
  if (data.id) await prisma.notification.updateMany({ where: { id: data.id, userId: user.uid }, data: { read: true } });
  else await prisma.notification.updateMany({ where: { userId: user.uid, read: false }, data: { read: true } });
  return json({ ok: true });
});
