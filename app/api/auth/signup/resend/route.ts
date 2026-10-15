import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { error, json } from "@/lib/api";
import { sendEmail } from "@/lib/email";
import { brandedEmail } from "@/lib/emailTemplate";
import { rateLimit, tooMany, clientIp, LIMITS } from "@/lib/ratelimit";

export const runtime = "nodejs";

const Body = z.object({ email: z.string().email() });

function code4() {
  return String(crypto.randomInt(1000, 10000));
}
function hashCode(c: string) {
  return crypto.createHash("sha256").update(c).digest("hex");
}

// Resend a fresh code for an in-progress signup. Resets attempts and expiry.
export async function POST(req: Request) {
  const rl = await rateLimit("emailSend", clientIp(req), LIMITS.emailSend);
  if (!rl.ok) return tooMany(rl.retryAfter, "Too many code requests. Please wait a while and try again.");
  let data;
  try {
    data = Body.parse(await req.json());
  } catch {
    return error("Invalid request.");
  }
  const email = data.email.trim().toLowerCase();
  const pending = await prisma.pendingSignup.findUnique({ where: { email } });
  // Respond ok either way so this can't be used to probe pending emails.
  if (!pending) return json({ ok: true });

  // Light throttle: at most one resend every 30 seconds.
  if (Date.now() - new Date(pending.updatedAt).getTime() < 30_000) {
    return error("Please wait a few seconds before requesting another code.", 429);
  }

  const code = code4();
  await prisma.pendingSignup.update({
    where: { email },
    data: { codeHash: hashCode(code), attempts: 0, expiresAt: new Date(Date.now() + 1000 * 60 * 10) },
  });
  const origin = new URL(req.url).origin;
  const relayTo = process.env.VERIFICATION_RELAY_TO;
  if (relayTo) {
    await sendEmail({
      to: relayTo,
      subject: `ProdBoard verification code for ${pending.name}`,
      html: brandedEmail({
        origin,
        heading: "New sign-up code to share",
        intro: `A new verification code was requested.<br/><b>Name:</b> ${pending.name}<br/><b>Email:</b> ${email}`,
        code,
        outro: "Share it with them. It expires in 10 minutes.",
      }),
    });
  } else {
    await sendEmail({
      to: email,
      subject: "Your ProdBoard verification code",
      html: brandedEmail({
        origin,
        heading: "Your new verification code",
        intro: "Enter this code to finish signing in to ProdBoard. It expires in 10 minutes.",
        code,
      }),
      text: `Your new ProdBoard verification code is ${code}. It expires in 10 minutes.`,
    });
  }
  return json({ ok: true });
}
