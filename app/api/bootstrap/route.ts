import { prisma } from "@/lib/db";
import { withAuth, json } from "@/lib/api";
import { TEAM_BASE } from "@/lib/constants";

export const runtime = "nodejs";

// One call that loads everything the dashboard needs on open.
export const GET = withAuth(async (user) => {
  const [org, products, tasks, activity] = await Promise.all([
    prisma.organization.findUnique({ where: { id: user.oid } }),
    prisma.product.findMany({ where: { organizationId: user.oid }, orderBy: { name: "asc" } }),
    prisma.task.findMany({ where: { organizationId: user.oid }, orderBy: { createdAt: "desc" } }),
    prisma.activity.findMany({ where: { organizationId: user.oid }, orderBy: { ts: "desc" }, take: 1000 }),
  ]);
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
