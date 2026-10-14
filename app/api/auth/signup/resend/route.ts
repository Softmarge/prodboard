import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { error, json } from "@/lib/api";
import { sendEmail } from "@/lib/email";
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
  const relayTo = process.env.VERIFICATION_RELAY_TO;
  if (relayTo) {
    await sendEmail({
      to: relayTo,
      subject: `ProdBoard verification code for ${pending.name}`,
      html: `<p>New verification code requested for a ProdBoard sign-up.</p>
             <p><b>Name:</b> ${pending.name}<br/><b>Email:</b> ${email}</p>
             <p>Verification code:</p>
             <p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p>
             <p>Share it with them. It expires in 10 minutes.</p>`,
    });
  } else {
    await sendEmail({
      to: email,
      subject: "Your ProdBoard verification code",
      html: `<p>Your new ProdBoard verification code is:</p>
             <p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p>
             <p>It expires in 10 minutes.</p>`,
    });
  }
  return json({ ok: true });
}
