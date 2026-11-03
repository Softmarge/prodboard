import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error, isAdmin } from "@/lib/api";

export const runtime = "nodejs";

function assertTeam(oid: string, id: string) {
  return prisma.team.findFirst({ where: { id, organizationId: oid } });
}
function assertUser(oid: string, userId: string) {
  return prisma.user.findFirst({ where: { id: userId, organizationId: oid } });
}
// Keep exactly one primary membership per user: make `teamId` their primary and
// clear the flag on every other team.
async function setPrimary(userId: string, teamId: string) {
  await prisma.$transaction([
    prisma.teamMembership.updateMany({ where: { userId, NOT: { teamId } }, data: { isPrimary: false } }),
    prisma.teamMembership.updateMany({ where: { userId, teamId }, data: { isPrimary: true } }),
  ]);
}
function ensureMembership(userId: string, teamId: string) {
  return prisma.teamMembership.upsert({
    where: { userId_teamId: { userId, teamId } },
    update: { status: "active" },
    create: { userId, teamId, status: "active", isPrimary: false },
  });
}

const Add = z.object({ userId: z.string().min(1), isPrimary: z.boolean().optional() });

// Add a person to a team.
export const POST = withAuth(async (user, req, params) => {
  if (!isAdmin(user)) return error("Only an admin can change team members.", 403);
  const team = await assertTeam(user.oid, params.id);
  if (!team) return error("Team not found.", 404);
  let data;
  try {
    data = Add.parse(await req.json());
  } catch {
    return error("Invalid member.");
  }
  const target = await assertUser(user.oid, data.userId);
  if (!target) return error("Member not found.", 404);

  const existingPrimary = await prisma.teamMembership.findFirst({ where: { userId: data.userId, isPrimary: true } });
  await ensureMembership(data.userId, team.id);
  if (data.isPrimary === true || !existingPrimary) await setPrimary(data.userId, team.id);
  return json({ ok: true });
});

const Patch = z.object({
  userId: z.string().min(1),
  isPrimary: z.literal(true).optional(),
  status: z.enum(["active", "pending"]).optional(),
  leadRank: z.number().int().min(1).max(3).nullable().optional(), // 1=Lead 1 (senior)..3; null removes lead
});

// Change a membership: approve a pending join, set the primary team, or toggle
// the team-lead flag (a lead is auto-made a member).
export const PATCH = withAuth(async (user, req, params) => {
  if (!isAdmin(user)) return error("Only an admin can change team members.", 403);
  const team = await assertTeam(user.oid, params.id);
  if (!team) return error("Team not found.", 404);
  let data;
  try {
    data = Patch.parse(await req.json());
  } catch {
    return error("Invalid change.");
  }
  const membership = await prisma.teamMembership.findUnique({ where: { userId_teamId: { userId: data.userId, teamId: team.id } } });
  if (!membership && data.leadRank === undefined && data.isPrimary !== true) {
    return error("That person isn't a member of this team.", 404);
  }

  if (data.status !== undefined && membership) {
    await prisma.teamMembership.update({ where: { userId_teamId: { userId: data.userId, teamId: team.id } }, data: { status: data.status } });
  }
  if (data.isPrimary === true) {
    await ensureMembership(data.userId, team.id);
    await setPrimary(data.userId, team.id);
  }
  if (data.leadRank != null) {
    // Make this person Lead <rank> on the team. A lead must be a member, and one
    // person holds each rank, so free the rank from anyone else first.
    await ensureMembership(data.userId, team.id);
    const hasPrimary = await prisma.teamMembership.findFirst({ where: { userId: data.userId, isPrimary: true } });
    if (!hasPrimary) await setPrimary(data.userId, team.id);
    await prisma.teamLead.deleteMany({ where: { teamId: team.id, rank: data.leadRank, NOT: { userId: data.userId } } });
    await prisma.teamLead.upsert({
      where: { userId_teamId: { userId: data.userId, teamId: team.id } },
      update: { rank: data.leadRank },
      create: { userId: data.userId, teamId: team.id, rank: data.leadRank },
    });
  } else if (data.leadRank === null) {
    await prisma.teamLead.deleteMany({ where: { userId: data.userId, teamId: team.id } });
  }
  return json({ ok: true });
});

// Remove a person from a team (also drops any lead role on it).
export const DELETE = withAuth(async (user, req, params) => {
  if (!isAdmin(user)) return error("Only an admin can change team members.", 403);
  const team = await assertTeam(user.oid, params.id);
  if (!team) return error("Team not found.", 404);
  const userId = new URL(req.url).searchParams.get("userId") || "";
  if (!userId) return error("Which member?");
  const membership = await prisma.teamMembership.findUnique({ where: { userId_teamId: { userId, teamId: team.id } } });
  if (!membership) return json({ ok: true });

  await prisma.$transaction([
    prisma.teamLead.deleteMany({ where: { userId, teamId: team.id } }),
    prisma.teamMembership.delete({ where: { userId_teamId: { userId, teamId: team.id } } }),
  ]);
  // If that was their primary, promote their earliest remaining membership.
  if (membership.isPrimary) {
    const next = await prisma.teamMembership.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } });
    if (next) await prisma.teamMembership.update({ where: { id: next.id }, data: { isPrimary: true } });
  }
  return json({ ok: true });
});
