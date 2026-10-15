import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api";
import { sendEmail } from "@/lib/email";
import { brandedEmail } from "@/lib/emailTemplate";
import { rateLimit, tooMany, clientIp, LIMITS } from "@/lib/ratelimit";

export const runtime = "nodejs";

const Body = z.object({ email: z.string().email() });

// Always responds the same way whether or not the email exists, so the form
// never reveals which addresses have accounts.
export async function POST(req: Request) {
  const rl = await rateLimit("emailSend", clientIp(req), LIMITS.emailSend);
  if (!rl.ok) return tooMany(rl.retryAfter, "Too many reset requests. Please wait a while and try again.");
  let data;
  try {
    data = Body.parse(await req.json());
  } catch {
    return error("Enter a valid email.");
  }
  const email = data.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  if (user) {
    // Invalidate any outstanding resets for this user, then issue a fresh one.
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour
    await prisma.passwordReset.deleteMany({ where: { userId: user.id, usedAt: null } });
    await prisma.passwordReset.create({ data: { userId: user.id, tokenHash, expiresAt } });

    const origin = new URL(req.url).origin;
    const link = `${origin}/reset?token=${token}`;
    const relayTo = process.env.VERIFICATION_RELAY_TO;
    if (relayTo) {
      // No verified sending domain yet: relay the reset link to the admin inbox,
      // tagged with who requested it, so they can pass it on.
      await sendEmail({
        to: relayTo,
        subject: `ProdBoard password reset for ${user.name}`,
        html: brandedEmail({
          origin,
          heading: "Password reset to share",
          intro: `A ProdBoard password reset was requested.<br/><b>Name:</b> ${user.name}<br/><b>Email:</b> ${email}`,
          button: { label: "Open reset link", url: link },
          outro: "Share this link with them. It expires in one hour.",
        }),
      });
    } else {
      await sendEmail({
        to: email,
        subject: "Reset your ProdBoard password",
        html: brandedEmail({
          origin,
          heading: "Reset your password",
          intro: "We received a request to reset your ProdBoard password. This link expires in one hour.",
          button: { label: "Choose a new password", url: link },
        }),
        text: `Reset your ProdBoard password: ${link} (expires in one hour). If you did not request this, ignore this email.`,
      });
    }
  }

  return json({ ok: true });
}
