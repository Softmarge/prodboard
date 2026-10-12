import { prisma } from "@/lib/db";
import { withAuth, json } from "@/lib/api";
import { isScopedPM, managedProductIds } from "@/lib/scope";

export const runtime = "nodejs";

export const GET = withAuth(async (user) => {
  let activity = await prisma.activity.findMany({
    where: { organizationId: user.oid },
    orderBy: { ts: "desc" },
    take: 1000,
  });
  if (isScopedPM(user)) {
    const ids = await managedProductIds(user);
    const tasks = await prisma.task.findMany({ where: { organizationId: user.oid } });
    const myTaskIds = new Set(tasks.filter((t: any) => t.productId && ids.has(t.productId)).map((t: any) => t.id));
    activity = activity.filter((a: any) => a.taskId && myTaskIds.has(a.taskId));
  }
  return json({ activity });
});
