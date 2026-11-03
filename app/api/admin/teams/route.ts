import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error, isAdmin } from "@/lib/api";

export const runtime = "nodejs";

// Structured teams (the new teams model), admin only. This is separate from the
// legacy free-text team list at /api/teams, which is retired in a later phase.

// List every team in the org with its members, leads and counts, plus the org's
// people so the admin UI can assign them without a second call.
export const GET = withAuth(async (user) => {
  if (!isAdmin(user)) return error("Only an admin can manage teams.", 403);
  const [teams, people] = await Promise.all([
    prisma.team.findMany({
      where: { organizationId: user.oid },
      orderBy: { createdAt: "asc" },
      include: {
        memberships: { select: { userId: true, isPrimary: true, status: true } },
        leads: { select: { userId: true, rank: true }, orderBy: { rank: "asc" } },
        _count: { select: { products: true, tasks: true } },
      },
    }),
    prisma.user.findMany({
      where: { organizationId: user.oid },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true },
    }),
  ]);
  return json({
    teams: teams.map((t: any) => ({
      id: t.id,
      name: t.name,
      kind: t.kind,
      parentTeamId: t.parentTeamId,
      memberVisibility: t.memberVisibility,
      membersSeeSubteams: t.membersSeeSubteams,
      defaultReviewerId: t.defaultReviewerId,
      members: t.memberships,
      leads: t.leads.map((l: any) => ({ userId: l.userId, rank: l.rank })),
      productCount: t._count.products,
      taskCount: t._count.tasks,
    })),
    people,
  });
});

const Create = z.object({
  name: z.string().min(1).max(60),
  kind: z.enum(["PRODUCT", "PROJECT"]).optional(),
  parentTeamId: z.string().min(1).nullable().optional(),
});

export const POST = withAuth(async (user, req) => {
  if (!isAdmin(user)) return error("Only an admin can create teams.", 403);
  let data;
  try {
    data = Create.parse(await req.json());
  } catch {
    return error("Give the team a name.");
  }
  const name = data.name.trim();
  if (!name) return error("Give the team a name.");

  const dupe = await prisma.team.findFirst({ where: { organizationId: user.oid, name } });
  if (dupe) return error(`A team called "${name}" already exists.`, 409);

  // Two levels only: a parent must itself be a top-level team in this org.
  let parentTeamId: string | null = null;
  if (data.parentTeamId) {
    const parent = await prisma.team.findFirst({ where: { id: data.parentTeamId, organizationId: user.oid } });
    if (!parent) return error("That parent team was not found.", 404);
    if (parent.parentTeamId) return error("Teams nest two levels deep. Pick a top-level team as the parent.", 400);
    parentTeamId = parent.id;
  }

  const team = await prisma.team.create({
    data: {
      name,
      kind: data.kind ?? "PRODUCT",
      parentTeamId,
      organizationId: user.oid,
      createdBy: user.name,
    },
  });
  return json({ id: team.id });
});
