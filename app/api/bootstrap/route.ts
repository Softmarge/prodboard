import { prisma } from "@/lib/db";
import { withAuth, json, isOwnerScoped } from "@/lib/api";
import { TEAM_BASE, HL_PRESET_DEFAULTS } from "@/lib/constants";

export const runtime = "nodejs";

// One call that loads everything the dashboard needs on open.
// A plain PM is scoped to the products they manage (product.pm matches their
// name); Admin (Lead PM) and Viewer see the whole organization.
export const GET = withAuth(async (user) => {
  const [org, allProducts, allTasks, allActivity, groups, me, highlightRows] = await Promise.all([
    prisma.organization.findUnique({ where: { id: user.oid } }),
    prisma.product.findMany({ where: { organizationId: user.oid }, orderBy: { name: "asc" } }),
    prisma.task.findMany({ where: { organizationId: user.oid }, orderBy: { createdAt: "desc" } }),
    prisma.activity.findMany({ where: { organizationId: user.oid }, orderBy: { ts: "desc" }, take: 1000 }),
    prisma.productGroup.findMany({ where: { userId: user.uid }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, productIds: true } }),
    prisma.user.findUnique({ where: { id: user.uid }, select: { activeGroupId: true, hlName1: true, hlColor1: true, hlName2: true, hlColor2: true } }),
    prisma.taskHighlight.findMany({ where: { userId: user.uid }, select: { taskId: true, color: true } }),
  ]);
  // Only honor an active group that still exists for this user.
  const activeGroupId = me?.activeGroupId && groups.some((g: any) => g.id === me.activeGroupId) ? me.activeGroupId : null;

  let products = allProducts;
  let tasks = allTasks;
  let activity = allActivity;

  if (user.role === "PM") {
    const mine = user.name.trim().toLowerCase();
    const myProductIds = new Set(
      allProducts.filter((p: any) => (p.pm || "").trim().toLowerCase() === mine).map((p: any) => p.id),
    );
    // A PM also sees tasks they personally own, even under another PM's product.
    const ownedProductIds = new Set(
      allTasks.filter((t: any) => t.ownerUserId === user.uid && t.productId).map((t: any) => t.productId),
    );
    products = allProducts.filter((p: any) => myProductIds.has(p.id) || ownedProductIds.has(p.id));
    tasks = allTasks.filter((t: any) => (t.productId && myProductIds.has(t.productId)) || t.ownerUserId === user.uid);
    const myTaskIds = new Set(tasks.map((t: any) => t.id));
    activity = allActivity.filter((a: any) => a.taskId && myTaskIds.has(a.taskId));
  } else if (isOwnerScoped(user)) {
    // Task owner / reviewer without the viewer add-on: only their own tasks, plus
    // the products those tasks belong to so names resolve. (Reviewed tasks join
    // here once the reviewer workflow lands.)
    tasks = allTasks.filter((t: any) => t.ownerUserId === user.uid);
    const myProductIds = new Set(tasks.filter((t: any) => t.productId).map((t: any) => t.productId));
    products = allProducts.filter((p: any) => myProductIds.has(p.id));
    const myTaskIds = new Set(tasks.map((t: any) => t.id));
    activity = allActivity.filter((a: any) => a.taskId && myTaskIds.has(a.taskId));
  }

  const seen = new Set<string>();
  const teams: string[] = [];
  [...TEAM_BASE, ...(org?.teams ?? [])].forEach((t) => {
    if (t && !seen.has(t)) { seen.add(t); teams.push(t); }
  });

  const highlights: Record<string, string> = {};
  highlightRows.forEach((h: any) => { highlights[h.taskId] = h.color; });
  const highlightPresets = [
    { name: me?.hlName1 || HL_PRESET_DEFAULTS[0].name, color: me?.hlColor1 || HL_PRESET_DEFAULTS[0].color },
    { name: me?.hlName2 || HL_PRESET_DEFAULTS[1].name, color: me?.hlColor2 || HL_PRESET_DEFAULTS[1].color },
  ];

  return json({
    me: { id: user.uid, name: user.name, email: user.email, role: user.role, viewAll: user.viewAll === true },
    organization: org ? { id: org.id, name: org.name } : null,
    products,
    tasks,
    activity,
    teams,
    groups,
    activeGroupId,
    highlights,
    highlightPresets,
  });
});
