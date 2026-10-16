import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error } from "@/lib/api";
import { emailConfigured } from "@/lib/email";
import { EMAIL_EVENTS, EMAIL_EVENT_KEYS } from "@/lib/notifyEvents";

export const runtime = "nodejs";

// The signed-in user's email-notification preferences, plus the list of events
// they can choose from and whether email is configured on the server at all.
export const GET = withAuth(async (user) => {
  const u = (await prisma.user.findUnique({
    where: { id: user.uid },
    select: { emailDigest: true, emailMuted: true },
  })) as any;
  return json({
    emailDigest: u?.emailDigest === true,
    emailMuted: (u?.emailMuted || []) as string[],
    events: EMAIL_EVENTS,
    emailConfigured: emailConfigured(),
  });
});

const Patch = z.object({
  emailDigest: z.boolean().optional(),
  emailMuted: z.array(z.string()).max(50).optional(),
});

export const POST = withAuth(async (user, req) => {
  let data;
  try {
    data = Patch.parse(await req.json());
  } catch {
    return error("Invalid settings.");
  }
  const patch: Record<string, unknown> = {};
  if (data.emailDigest !== undefined) patch.emailDigest = data.emailDigest;
  if (data.emailMuted !== undefined) {
    // keep only recognised event keys, de-duplicated
    patch.emailMuted = Array.from(new Set(data.emailMuted.filter((k) => EMAIL_EVENT_KEYS.includes(k))));
  }
  if (!Object.keys(patch).length) return error("Nothing to update.");
  await prisma.user.update({ where: { id: user.uid }, data: patch as any });
  const u = (await prisma.user.findUnique({ where: { id: user.uid }, select: { emailDigest: true, emailMuted: true } })) as any;
  return json({ emailDigest: u?.emailDigest === true, emailMuted: (u?.emailMuted || []) as string[] });
});
