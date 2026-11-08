import { prisma } from "@/lib/db";

// Team ids a non-admin may MANAGE: the teams they lead plus those teams' direct
// sub-teams. An admin manages everything (checked separately with isAdmin).
export async function managedTeamIds(userId: string, oid: string): Promise<Set<string>> {
  const leads = await prisma.teamLead.findMany({ where: { userId }, select: { teamId: true } });
  const led = leads.map((l: any) => l.teamId);
  if (!led.length) return new Set<string>();
  const subs = await prisma.team.findMany({ where: { organizationId: oid, parentTeamId: { in: led } }, select: { id: true } });
  return new Set<string>([...led, ...subs.map((s: any) => s.id)]);
}

// Team ids a user directly leads (used to tie their invites to a team).
export async function ledTeamIds(userId: string): Promise<string[]> {
  const leads = await prisma.teamLead.findMany({ where: { userId }, select: { teamId: true } });
  return leads.map((l: any) => l.teamId);
}
