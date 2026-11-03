import { prisma } from "@/lib/db";
import { withAuth, json } from "@/lib/api";

export const runtime = "nodejs";

// A plain list of the org's structured teams (id, name, parent), for pickers
// such as the invite form. Any signed-in member may read it; team names are not
// sensitive and this exposes nothing about their tasks.
export const GET = withAuth(async (user) => {
  const teams = await prisma.team.findMany({
    where: { organizationId: user.oid },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, parentTeamId: true },
  });
  return json({ teams });
});
