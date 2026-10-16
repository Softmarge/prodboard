import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api";
import { sendEmail, emailConfigured } from "@/lib/email";
import { digestEmail } from "@/lib/emailTemplate";
import { EMAIL_EVENTS, isEmailable, eventKeyForType } from "@/lib/notifyEvents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// How long a notification waits before it can go out, so related events in the
// same window batch into one email.
const MATURE_MS = 15 * 60 * 1000;

function appOrigin(): string {
  return (process.env.APP_ORIGIN || "https://prodboard.app").replace(/\/$/, "");
}

// Is the caller allowed? A shared secret in CRON_SECRET, passed either as
// ?key=... or an Authorization: Bearer header. Keeps the endpoint private so
// only the scheduler can trigger sends.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  if (key && key === secret) return true;
  const auth = req.headers.get("authorization") || "";
  return auth === `Bearer ${secret}` || auth === secret;
}

async function runDigest(req: Request) {
  if (!process.env.CRON_SECRET) return error("Digest cron is not configured (set CRON_SECRET).", 503);
  if (!authorized(req)) return error("Unauthorized.", 401);
  if (!emailConfigured()) return json({ ok: true, skipped: "email-not-configured", usersEmailed: 0 });

  const origin = appOrigin();
  const now = Date.now();
  const users = (await prisma.user.findMany({
    where: { emailDigest: true } as any,
    select: { id: true, name: true, email: true, emailMuted: true },
  })) as any[];

  let usersEmailed = 0;
  let notificationsSent = 0;

  for (const u of users) {
    const muted: string[] = u.emailMuted || [];
    const pending = (await prisma.notification.findMany({
      where: { userId: u.id, emailedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, type: true, text: true, createdAt: true },
    })) as any[];
    if (!pending.length) continue;

    const emailable = pending.filter((n) => isEmailable(n.type, muted));

    // Nothing this user wants emailed: clear any matured rows so we stop
    // rescanning them, and move on.
    if (!emailable.length) {
      const stale = pending.filter((n) => now - new Date(n.createdAt).getTime() >= MATURE_MS).map((n) => n.id);
      if (stale.length) await prisma.notification.updateMany({ where: { id: { in: stale } }, data: { emailedAt: new Date() } });
      continue;
    }

    // Wait until the oldest wanted notification has matured, so siblings batch.
    const oldest = new Date(emailable[0].createdAt).getTime();
    if (now - oldest < MATURE_MS) continue;

    // Group the wanted notifications by event label, in a stable order.
    const groups = EMAIL_EVENTS.map((ev) => ({
      label: ev.label,
      lines: emailable.filter((n) => eventKeyForType(n.type) === ev.key).map((n) => n.text),
    })).filter((g) => g.lines.length);

    const total = emailable.length;
    const { html, text } = digestEmail({
      origin,
      name: u.name,
      groups,
      button: { label: "Open ProdBoard", url: `${origin}/dashboard` },
    });
    const ok = await sendEmail({
      to: u.email,
      subject: `${total} update${total === 1 ? "" : "s"} on ProdBoard`,
      html,
      text,
    });
    if (!ok) continue; // leave them unsent so the next sweep retries

    // Clear the whole pending queue for this user (wanted + muted) so nothing lingers.
    await prisma.notification.updateMany({ where: { id: { in: pending.map((n) => n.id) } }, data: { emailedAt: new Date() } });
    usersEmailed++;
    notificationsSent += total;
  }

  return json({ ok: true, usersEmailed, notificationsSent, consideredUsers: users.length });
}

export async function GET(req: Request) { return runDigest(req); }
export async function POST(req: Request) { return runDigest(req); }
