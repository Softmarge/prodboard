import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword, setSession } from "@/lib/auth";
import { error, json } from "@/lib/api";
import { rateLimit, tooMany, clientIp, LIMITS } from "@/lib/ratelimit";

export const runtime = "nodejs";

const Body = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  let data;
  try {
    data = Body.parse(await req.json());
  } catch {
    return error("Enter your email and password.");
  }
  const email = data.email.trim().toLowerCase();
  const ip = clientIp(req);
  // Blunt password guessing: cap attempts per email+ip and per ip overall.
  const byEmail = await rateLimit("login", `${ip}:${email}`, LIMITS.login);
  if (!byEmail.ok) return tooMany(byEmail.retryAfter, "Too many sign-in attempts. Please wait and try again, or reset your password.");
  const byIp = await rateLimit("login-ip", ip, LIMITS.loginIp);
  if (!byIp.ok) return tooMany(byIp.retryAfter, "Too many sign-in attempts from this network. Please wait and try again.");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(data.password, user.passwordHash))) {
    return error("Email or password is incorrect.", 401);
  }
  await setSession({
    uid: user.id,
    oid: user.organizationId,
    role: user.role,
    name: user.name,
    email: user.email,
    viewAll: (user as any).viewAll === true,
    capPm: (user as any).capPm === true,
    capOwner: (user as any).capOwner === true,
    capReviewer: (user as any).capReviewer === true,
  });
  return json({ ok: true, user: { id: user.id, name: user.name, role: user.role } });
}
