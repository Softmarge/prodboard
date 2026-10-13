import { prisma } from "@/lib/db";
import { withAuth, json } from "@/lib/api";
import { ONLINE_WINDOW_MS } from "@/lib/constants";

export const runtime = "nodejs";

// Heartbeat: mark the current user as seen now.
export const POST = withAuth(async (user) => {
  await prisma.user.update({ where: { id: user.uid }, data: { lastSeenAt: new Date() } });
  return json({ ok: true });
});

// Who is in this organization, who is online now, and when each was last seen.
// Available to every role so viewers can see activity too.
export const GET = withAuth(async (user) => {
  const rows = await prisma.user.findMany({
    where: { organizationId: user.oid },
    select: { id: true, name: true, role: true, lastSeenAt: true },
    orderBy: { name: "asc" },
  });
  const cutoff = Date.now() - ONLINE_WINDOW_MS;
  const members = rows.map((u: any) => ({
    id: u.id,
    name: u.name,
    role: u.role,
    lastSeenAt: u.lastSeenAt ? u.lastSeenAt.toISOString() : null,
    online: !!u.lastSeenAt && new Date(u.lastSeenAt).getTime() >= cutoff,
  }));
  return json({ members, onlineCount: members.filter((m: any) => m.online).length });
});
