import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error, isAdmin } from "@/lib/api";
import { managedTeamIds } from "@/lib/teamAuth";

export const runtime = "nodejs";

// Structured teams (the new teams model), admin only. This is separate from the
// legacy free-text team list at /api/teams, which is retired in a later phase.

// List every team in the org with its members, leads and counts, plus the org's
// people so the admin UI can assign them without a second call.
export const GET = withAuth(async (user) => {
  const admin = isAdmin(user);
  let managed: Set<string> | null = null;
  if (!admin) {
    managed = await managedTeamIds(user.uid, user.oid);
    if (managed.size === 0) return error("Only an admin or a team lead can manage teams.", 403);
  }
  const teams = await prisma.team.findMany({
    where: admin ? { organizationId: user.oid } : { organizationId: user.oid, id: { in: [...managed!] } },
    orderBy: { createdAt: "asc" },
    include: {
      memberships: { select: { userId: true, isPrimary: true, status: true } },
      leads: { select: { userId: true, rank: true }, orderBy: { rank: "asc" } },
      _count: { select: { products: true, tasks: true } },
    },
  });
  // Admins pick from everyone in the org. A team lead only sees and manages the
  // people already in the teams they manage; new members arrive via the lead's
  // invites, not by adding arbitrary (or un-teamed) org users.
  const peopleSel = { id: true, name: true, email: true, role: true };
  let people;
  if (admin) {
    people = await prisma.user.findMany({ where: { organizationId: user.oid }, orderBy: { name: "asc" }, select: peopleSel });
  } else {
    const ids = Array.from(new Set(teams.flatMap((t: any) => t.memberships.map((m: any) => m.userId))));
    people = ids.length ? await prisma.user.findMany({ where: { organizationId: user.oid, id: { in: ids } }, orderBy: { name: "asc" }, select: peopleSel }) : [];
  }
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
