import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { withAuth, json, error } from "@/lib/api";
import { sendEmail, emailConfigured } from "@/lib/email";
import { domainAllowed } from "@/lib/domains";

export const runtime = "nodejs";

const Body = z.object({ newEmail: z.string().email().max(200) });
function code4() { return String(crypto.randomInt(1000, 10000)); }
function hashCode(c: string) { return crypto.createHash("sha256").update(c).digest("hex"); }

// Step 1 of an email change: validate the new address and email a code to it
// (so the user proves they own it).
export const POST = withAuth(async (user, req) => {
  let data;
  try {
    data = Body.parse(await req.json());
  } catch {
    return error("Enter a valid email.");
  }
  const newEmail = data.newEmail.trim().toLowerCase();
  if (newEmail === user.email.toLowerCase()) return error("That is already your email.");
  if (!emailConfigured()) return error("Email is not configured on the server yet. Contact your admin.", 503);

  const taken = await prisma.user.findUnique({ where: { email: newEmail } });
  if (taken) return error("An account with that email already exists.", 409);

  const org = await prisma.organization.findUnique({ where: { id: user.oid }, select: { allowedDomains: true } });
  if (org && !domainAllowed(newEmail, org.allowedDomains)) {
    return error(`Your new email must use an allowed domain (${org.allowedDomains.join(", ")}).`, 403);
  }

  const code = code4();
  await prisma.pendingEmailChange.upsert({
    where: { userId: user.uid },
    update: { newEmail, codeHash: hashCode(code), attempts: 0, expiresAt: new Date(Date.now() + 1000 * 60 * 10) },
    create: { userId: user.uid, newEmail, codeHash: hashCode(code), attempts: 0, expiresAt: new Date(Date.now() + 1000 * 60 * 10) },
  });

  const sent = await sendEmail({
    to: newEmail,
    subject: "Confirm your new ProdBoard email",
    html: `<p>Use this code to confirm <b>${newEmail}</b> as your ProdBoard email:</p>` +
      `<p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p>` +
      `<p>It expires in 10 minutes. If you did not request this, you can ignore this email.</p>`,
    text: `Your ProdBoard email change code is ${code} (expires in 10 minutes).`,
  });
  if (!sent) return error("Could not send the code to that address. Check it and try again.", 502);
  return json({ ok: true });
});
