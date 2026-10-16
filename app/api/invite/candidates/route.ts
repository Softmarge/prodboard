import { prisma } from "@/lib/db";
import { withAuth, json } from "@/lib/api";
import { normName } from "@/lib/owner";

export const runtime = "nodejs";

// Helps the inviter avoid duplicates and link a new account to existing work:
// - `users`: people already on ProdBoard (to warn before inviting a duplicate).
// - `unlinked`: free-text owner/reviewer labels on tasks that are not yet a user
//   (and not an alias of one), i.e. people from the sheets who have not joined.
export const GET = withAuth(async (user) => {
  const [users, tasks] = await Promise.all([
    prisma.user.findMany({ where: { organizationId: user.oid }, select: { name: true, ownerAliases: true } }),
    prisma.task.findMany({ where: { organizationId: user.oid }, select: { owner: true, reviewer: true } }),
  ]);

  const known = new Set<string>();
  users.forEach((u: any) => {
    if (u.name) known.add(normName(u.name));
    (u.ownerAliases || []).forEach((a: string) => known.add(normName(a)));
  });

  // Distinct free-text labels not matching any account, with a task count.
  const counts = new Map<string, { label: string; count: number }>();
  const add = (raw?: string | null) => {
    const label = (raw || "").trim();
    if (!label) return;
    const key = normName(label);
    if (!key || known.has(key)) return;
    const cur = counts.get(key);
    if (cur) cur.count++;
    else counts.set(key, { label, count: 1 });
  };
  tasks.forEach((t: any) => { add(t.owner); add(t.reviewer); });

  const unlinked = Array.from(counts.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return json({
    users: users.map((u: any) => u.name).filter(Boolean).sort((a: string, b: string) => a.localeCompare(b)),
    unlinked,
  });
});
