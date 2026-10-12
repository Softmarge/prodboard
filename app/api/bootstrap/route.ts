import { prisma } from "@/lib/db";
import { withAuth, json } from "@/lib/api";
import { TEAM_BASE } from "@/lib/constants";

export const runtime = "nodejs";

// One call that loads everything the dashboard needs on open.
// A plain PM is scoped to the products they manage (product.pm matches their
// name); Admin (Lead PM) and Viewer see the whole organization.
export const GET = withAuth(async (user) => {
  const [org, allProducts, allTasks, allActivity] = await Promise.all([
    prisma.organization.findUnique({ where: { id: user.oid } }),
    prisma.product.findMany({ where: { organizationId: user.oid }, orderBy: { name: "asc" } }),
    prisma.task.findMany({ where: { organizationId: user.oid }, orderBy: { createdAt: "desc" } }),
    prisma.activity.findMany({ where: { organizationId: user.oid }, orderBy: { ts: "desc" }, take: 1000 }),
  ]);

  let products = allProducts;
  let tasks = allTasks;
  let activity = allActivity;

  if (user.role === "PM") {
    const mine = user.name.trim().toLowerCase();
    const myProductIds = new Set(
      allProducts.filter((p: any) => (p.pm || "").trim().toLowerCase() === mine).map((p: any) => p.id),
    );
    products = allProducts.filter((p: any) => myProductIds.has(p.id));
    tasks = allTasks.filter((t: any) => t.productId && myProductIds.has(t.productId));
    const myTaskIds = new Set(tasks.map((t: any) => t.id));
    activity = allActivity.filter((a: any) => a.taskId && myTaskIds.has(a.taskId));
  }

  const seen = new Set<string>();
  const teams: string[] = [];
  [...TEAM_BASE, ...(org?.teams ?? [])].forEach((t) => {
    if (t && !seen.has(t)) { seen.add(t); teams.push(t); }
  });
  return json({
    me: { id: user.uid, name: user.name, email: user.email, role: user.role },
    organization: org ? { id: org.id, name: org.name } : null,
    products,
    tasks,
    activity,
    teams,
  });
});
