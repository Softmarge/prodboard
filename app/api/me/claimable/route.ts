import { prisma } from "@/lib/db";
import { withAuth, json } from "@/lib/api";
import { normName } from "@/lib/owner";

export const runtime = "nodejs";

function looseMatch(ownerText: string, candidates: string[]): boolean {
  const o = normName(ownerText);
  if (!o) return false;
  for (const c of candidates) {
    const n = normName(c);
    if (!n) continue;
    if (o === n) return true;
    if (o.length >= 3 && (o.includes(n) || n.includes(o))) return true;
    if (o.length >= 4 && n.length >= 4 && o.slice(0, 4) === n.slice(0, 4)) return true; // Richard / Richie
  }
  return false;
}

// Unlinked tasks the user might own. Default returns likely matches (by name
// overlap); ?all=1 returns every unlinked task so they can find a mismatch.
export const GET = withAuth(async (user, req) => {
  const all = new URL(req.url).searchParams.get("all") === "1";
  const me = await prisma.user.findUnique({ where: { id: user.uid }, select: { name: true, firstName: true, surname: true, ownerAliases: true } });
  const candidates = [me?.name, me?.firstName, me?.surname, ...((me?.ownerAliases as string[]) || [])].filter(Boolean) as string[];

  const rows = await prisma.task.findMany({
    where: { organizationId: user.oid, ownerUserId: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, owner: true, productId: true },
  });
  const tasks = all ? rows : rows.filter((t: any) => looseMatch(t.owner || "", candidates));
  return json({ tasks, totalUnlinked: rows.length });
});
