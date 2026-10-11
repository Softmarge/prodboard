import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";

const Body = z.object({ email: z.string().email() });

// Always responds the same way whether or not the email exists, so the form
// never reveals which addresses have accounts.
export async function POST(req: Request) {
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
    await sendEmail({
      to: email,
      subject: "Reset your ProdBoard password",
      html: `<p>We received a request to reset your ProdBoard password.</p>
             <p><a href="${link}">Choose a new password</a>. This link expires in one hour.</p>
             <p>If you did not request this, you can ignore this email.</p>`,
    });
  }

  return json({ ok: true });
}
