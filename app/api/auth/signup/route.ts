import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, setSession } from "@/lib/auth";
import { error, json } from "@/lib/api";

export const runtime = "nodejs";

const Body = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  organization: z.string().min(1).max(120),
  role: z.enum(["PM", "VIEWER"]).optional(),
});

export async function POST(req: Request) {
  let data;
  try {
    data = Body.parse(await req.json());
  } catch {
    return error("Please fill in a name, a valid email, a password of at least 8 characters, and an organization.");
  }

  const email = data.email.trim().toLowerCase();
  const orgName = data.organization.trim();

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) return error("An account with that email already exists. Try signing in instead.", 409);

  // Find or create the organization. First user of a new org becomes ADMIN.
  const existingOrg = await prisma.organization.findUnique({ where: { name: orgName } });

  const result = await prisma.$transaction(async (tx: any) => {
    const org =
      existingOrg ??
      (await tx.organization.create({ data: { name: orgName } }));

    const isFirst = !existingOrg;
    const role = isFirst ? "ADMIN" : data.role ?? "PM";

    const user = await tx.user.create({
      data: {
        name: data.name.trim(),
        email,
        passwordHash: await hashPassword(data.password),
        role,
        organizationId: org.id,
      },
    });
    return { org, user };
  });

  await setSession({
    uid: result.user.id,
    oid: result.org.id,
    role: result.user.role,
    name: result.user.name,
    email: result.user.email,
  });

  return json({
    ok: true,
    user: { id: result.user.id, name: result.user.name, role: result.user.role },
    organization: { id: result.org.id, name: result.org.name },
  });
}
