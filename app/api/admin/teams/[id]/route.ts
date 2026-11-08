import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error, isAdmin } from "@/lib/api";
import { managedTeamIds } from "@/lib/teamAuth";

export const runtime = "nodejs";

const Patch = z.object({
  name: z.string().min(1).max(60).optional(),
  kind: z.enum(["PRODUCT", "PROJECT"]).optional(),
  parentTeamId: z.string().min(1).nullable().optional(),
  memberVisibility: z.enum(["ALL", "OWN"]).optional(),
  membersSeeSubteams: z.boolean().optional(),
  defaultReviewerId: z.string().min(1).nullable().optional(),
});

export const PATCH = withAuth(async (user, req, params) => {
  const admin = isAdmin(user);
  const team = await prisma.team.findFirst({ where: { id: params.id, organizationId: user.oid } });
  if (!team) return error("Team not found.", 404);
  if (!admin) {
    const managed = await managedTeamIds(user.uid, user.oid);
    if (!managed.has(team.id)) return error("You can only manage a team you lead.", 403);
  }
  let data;
  try {
    data = Patch.parse(await req.json());
  } catch {
    return error("Invalid team change.");
  }
  // A team lead can change a team's settings, but not its structure (name, kind,
  // parent) or create/delete teams: that stays with admins.
  if (!admin && (data.name !== undefined || data.kind !== undefined || data.parentTeamId !== undefined)) {
    return error("Renaming, retyping or moving a team is an admin action.", 403);
  }

  if (data.name !== undefined) {
    const name = data.name.trim();
    if (!name) return error("Give the team a name.");
    const dupe = await prisma.team.findFirst({ where: { organizationId: user.oid, name, NOT: { id: team.id } } });
    if (dupe) return error(`A team called "${name}" already exists.`, 409);
  }

  if (data.parentTeamId !== undefined && data.parentTeamId !== null) {
    if (data.parentTeamId === team.id) return error("A team can't be its own parent.", 400);
    const parent = await prisma.team.findFirst({ where: { id: data.parentTeamId, organizationId: user.oid } });
    if (!parent) return error("That parent team was not found.", 404);
    if (parent.parentTeamId) return error("Teams nest two levels deep. Pick a top-level team as the parent.", 400);
    const kids = await prisma.team.count({ where: { parentTeamId: team.id } });
    if (kids > 0) return error("This team has sub-teams, so it can't sit under a parent too. Move its sub-teams first.", 400);
  }

  if (data.defaultReviewerId !== undefined && data.defaultReviewerId !== null) {
    const rev = await prisma.user.findFirst({ where: { id: data.defaultReviewerId, organizationId: user.oid } });
    if (!rev) return error("That reviewer was not found.", 404);
  }

  const updated = await prisma.team.update({
    where: { id: team.id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.kind !== undefined ? { kind: data.kind } : {}),
      ...(data.parentTeamId !== undefined ? { parentTeamId: data.parentTeamId } : {}),
      ...(data.memberVisibility !== undefined ? { memberVisibility: data.memberVisibility } : {}),
      ...(data.membersSeeSubteams !== undefined ? { membersSeeSubteams: data.membersSeeSubteams } : {}),
      ...(data.defaultReviewerId !== undefined ? { defaultReviewerId: data.defaultReviewerId } : {}),
    },
  });
  return json({ id: updated.id });
});

export const DELETE = withAuth(async (user, req, params) => {
  if (!isAdmin(user)) return error("Only an admin can delete teams.", 403);
  const team = await prisma.team.findFirst({ where: { id: params.id, organizationId: user.oid } });
  if (!team) return error("Team not found.", 404);
  const kids = await prisma.team.count({ where: { parentTeamId: team.id } });
  if (kids > 0) return error("Delete or move this team's sub-teams first.", 400);
  // Memberships and leads cascade. Products and tasks are kept but lose their
  // team (teamId -> null), so nothing is destroyed.
  await prisma.team.delete({ where: { id: team.id } });
  return json({ ok: true });
});
