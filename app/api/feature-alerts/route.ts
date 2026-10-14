import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error, isAdmin } from "@/lib/api";
import { userAudienceKeys, alertMatches, ALERT_AUDIENCES } from "@/lib/alerts";

export const runtime = "nodejs";

// GET: the active alerts targeted to this user that they have not dismissed.
// With ?manage=1 (admin only): every alert in the org with its dismissal count.
export const GET = withAuth(async (user, req) => {
  const manage = new URL(req.url).searchParams.get("manage") === "1";
  if (manage) {
    if (!isAdmin(user)) return error("Only an admin can manage feature alerts.", 403);
    const alerts = await prisma.featureAlert.findMany({
      where: { organizationId: user.oid },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { dismissals: true } } },
    });
    return json({
      alerts: alerts.map((a: any) => ({
        id: a.id, title: a.title, body: a.body, linkUrl: a.linkUrl, linkLabel: a.linkLabel,
        audience: a.audience, active: a.active, createdBy: a.createdBy, createdAt: a.createdAt,
        dismissals: a._count?.dismissals ?? 0,
      })),
    });
  }

  const alerts = await prisma.featureAlert.findMany({
    where: { organizationId: user.oid, active: true },
    orderBy: { createdAt: "desc" },
  });
  const keys = userAudienceKeys(user);
  const targeted = alerts.filter((a: any) => alertMatches(a.audience, keys));
  if (!targeted.length) return json({ items: [] });
  const dismissed = await prisma.featureAlertDismissal.findMany({
    where: { userId: user.uid, alertId: { in: targeted.map((a: any) => a.id) } },
    select: { alertId: true },
  });
  const dset = new Set(dismissed.map((d: any) => d.alertId));
  const items = targeted
    .filter((a: any) => !dset.has(a.id))
    .map((a: any) => ({ id: a.id, title: a.title, body: a.body, linkUrl: a.linkUrl, linkLabel: a.linkLabel, createdAt: a.createdAt }));
  return json({ items });
});

const Post = z.object({
  title: z.string().min(1).max(160),
  body: z.string().min(1).max(2000),
  linkUrl: z.string().max(500).optional(),
  linkLabel: z.string().max(80).optional(),
  audience: z.array(z.enum(ALERT_AUDIENCES)).optional().default([]),
});

// Create an alert (admin only).
export const POST = withAuth(async (user, req) => {
  if (!isAdmin(user)) return error("Only an admin can post feature alerts.", 403);
  let data;
  try { data = Post.parse(await req.json()); } catch { return error("An alert needs a title and a message."); }

  const url = (data.linkUrl || "").trim();
  // Only allow safe absolute links.
  if (url && !/^https?:\/\//i.test(url)) return error("A link must start with http:// or https://.");
  // "all" overrides any specific audiences.
  const audience = data.audience.includes("all") ? ["all"] : Array.from(new Set(data.audience));

  const alert = await prisma.featureAlert.create({
    data: {
      organizationId: user.oid,
      title: data.title.trim(),
      body: data.body.trim(),
      linkUrl: url || null,
      linkLabel: (data.linkLabel || "").trim() || null,
      audience,
      createdBy: user.name,
    },
  });
  return json({ alert: { id: alert.id } });
});
