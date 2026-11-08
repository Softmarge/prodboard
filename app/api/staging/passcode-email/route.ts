import { prisma } from "@/lib/db";
import { withAuth, json, error } from "@/lib/api";
import { sendEmail, emailConfigured } from "@/lib/email";
import { stagingGateOn } from "@/lib/staging";

export const runtime = "nodejs";

// Email the current staging passcode to the organisation's admin(s). The
// passcode is never shown on screen; it only reaches the admin inbox, and the
// admin shares it with whoever should test on staging.
export const POST = withAuth(async (user) => {
  if (!stagingGateOn()) return error("Not available here.", 400);
  const pass = process.env.STAGING_PASSCODE;
  if (!pass) return error("The staging passcode is not set up yet.", 503);
  if (!emailConfigured()) return error("Email is not configured on staging.", 503);

  const admins = await prisma.user.findMany({ where: { organizationId: user.oid, role: "ADMIN" }, select: { email: true } });
  const recipients = admins.map((a: any) => a.email).filter(Boolean);
  if (!recipients.length) return error("No admin email was found for your organisation.", 404);

  const html = `<p>The ProdBoard <b>staging</b> passcode is:</p>` +
    `<p style="font-size:22px;font-weight:700;letter-spacing:3px">${pass}</p>` +
    `<p>Share it only with people you want testing on staging. They enter it on the staging banner to get in. Real work still happens on prodboard.app.</p>`;
  const text = `The ProdBoard staging passcode is: ${pass}\nShare it only with people you want testing on staging.`;

  let sent = 0;
  for (const to of recipients) {
    if (await sendEmail({ to, subject: "ProdBoard staging passcode", html, text })) sent++;
  }
  if (!sent) return error("Could not send the email just now. Try again shortly.", 502);
  return json({ ok: true });
});
