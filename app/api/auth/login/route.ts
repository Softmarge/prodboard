import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword, setSession } from "@/lib/auth";
import { error, json } from "@/lib/api";

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
  });
  return json({ ok: true, user: { id: user.id, name: user.name, role: user.role } });
}
