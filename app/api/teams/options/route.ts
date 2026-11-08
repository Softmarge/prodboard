import { prisma } from "@/lib/db";
import { withAuth, json, isAdmin } from "@/lib/api";
import { ledTeamIds } from "@/lib/teamAuth";

export const runtime = "nodejs";

// Teams a user may invite people into, for the invite form's picker. An admin
// sees every team and may leave it blank; a team lead sees only the teams they
// lead and must pick one. `mustPick` tells the form which rule applies.
export const GET = withAuth(async (user) => {
  const sel = { id: true, name: true, parentTeamId: true };
  if (isAdmin(user)) {
    const teams = await prisma.team.findMany({ where: { organizationId: user.oid }, orderBy: { createdAt: "asc" }, select: sel });
    return json({ teams, mustPick: false });
  }
  const led = await ledTeamIds(user.uid);
  const teams = led.length
    ? await prisma.team.findMany({ where: { organizationId: user.oid, id: { in: led } }, orderBy: { createdAt: "asc" }, select: sel })
    : [];
  return json({ teams, mustPick: true });
});
