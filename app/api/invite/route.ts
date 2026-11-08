import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error, isAdmin } from "@/lib/api";
import { createInviteLink } from "@/lib/invite";
import { ledTeamIds } from "@/lib/teamAuth";

export const runtime = "nodejs";

const Post = z.object({
  role: z.enum(["PM", "VIEWER", "TASK_OWNER", "REVIEWER"]).nullable().optional(),
  firstName: z.string().max(80).optional(),
  surname: z.string().max(80).optional(),
  linkName: z.string().max(120).optional(),
  teamId: z.string().min(1).nullable().optional(),
});

// Only admins and team leads can create invites. An admin may pin any team (or
// none); a team lead's invite is tied to a team they lead, so the invitee lands
// in their team. Ordinary members cannot invite. Links can never grant admin.
export const POST = withAuth(async (user, req) => {
  let data: z.infer<typeof Post> = {};
  try {
    data = Post.parse(await req.json());
  } catch {
    return error("Could not create the invite link. Check the details and try again.");
  }

  const admin = isAdmin(user);
  const led = admin ? [] : await ledTeamIds(user.uid);
  if (!admin && led.length === 0) return error("Only team leads and admins can invite people.", 403);

  // Resolve the team the invitee will join. A lead must pin one of their teams;
  // an admin may pin any team in the org, or none.
  let teamId: string | null = null;
  let teamName: string | null = null;
  if (admin) {
    if (data.teamId) {
      const team = await prisma.team.findFirst({ where: { id: data.teamId, organizationId: user.oid }, select: { id: true, name: true } });
      if (!team) return error("That team was not found.", 404);
      teamId = team.id; teamName = team.name;
    }
  } else {
    const pick = data.teamId && led.includes(data.teamId) ? data.teamId : led[0];
    if (data.teamId && !led.includes(data.teamId)) return error("You can only invite people into a team you lead.", 403);
    const team = await prisma.team.findFirst({ where: { id: pick, organizationId: user.oid }, select: { id: true, name: true } });
    if (!team) return error("Your team was not found.", 404);
    teamId = team.id; teamName = team.name;
  }
  const link = await createInviteLink(user.oid, {
    role: data.role ?? null,
    // If linking to an existing free-text person, prefill the first name with that
    // label so the new account's display name matches and auto-links.
    firstName: data.firstName || (data.linkName ? data.linkName.split(/\s+/)[0] : undefined),
    surname: data.surname,
    linkName: data.linkName,
    teamId,
  });
  const origin = new URL(req.url).origin;
  return json({
    token: link.token,
    url: `${origin}/signup?invite=${link.token}`,
    role: link.role ?? null,
    firstName: link.firstName ?? null,
    surname: link.surname ?? null,
    linkName: (link as any).linkName ?? null,
    teamId,
    teamName,
  });
});
