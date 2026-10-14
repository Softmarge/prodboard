import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { passwordProblem } from "@/lib/password";
import { rateLimit, tooMany, clientIp, LIMITS } from "@/lib/ratelimit";

export const runtime = "nodejs";

const Body = z.object({ token: z.string().min(10), password: z.string() });

export async function POST(req: Request) {
  const rl = await rateLimit("verify", clientIp(req), LIMITS.verify);
  if (!rl.ok) return tooMany(rl.retryAfter, "Too many attempts. Please wait a while and try again.");
  let data;
  try {
    data = Body.parse(await req.json());
  } catch {
    return error("Invalid reset request.");
  }
  const pwProblem = passwordProblem(data.password);
  if (pwProblem) return error(pwProblem);

  const tokenHash = crypto.createHash("sha256").update(data.token).digest("hex");
  const reset = await prisma.passwordReset.findUnique({ where: { tokenHash } });
  if (!reset || reset.usedAt || reset.expiresAt < new Date()) {
    return error("This reset link is invalid or has expired. Request a new one.", 400);
  }

  await prisma.$transaction(async (tx: any) => {
    await tx.user.update({ where: { id: reset.userId }, data: { passwordHash: await hashPassword(data.password) } });
    await tx.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } });
  });

  return json({ ok: true });
}
