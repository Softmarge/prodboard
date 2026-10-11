import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, setSession } from "@/lib/auth";
import { error, json } from "@/lib/api";
import { passwordProblem } from "@/lib/password";

export const runtime = "nodejs";

const Body = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  password: z.string().max(200),
  organization: z.string().min(1).max(120).optional(),
  role: z.enum(["PM", "VIEWER"]).optional(),
  inviteToken: z.string().min(1).optional(),
});

export async function POST(req: Request) {
  let data;
  try {
    data = Body.parse(await req.json());
  } catch {
    return error("Please fill in a name, a valid email, a password, and an organization.");
  }

  const pwProblem = passwordProblem(data.password);
  if (pwProblem) return error(pwProblem);

  const email = data.email.trim().toLowerCase();

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) return error("An account with that email already exists. Try signing in instead.", 409);

  // Joining via an invite link: the org is fixed by the token and the new
  // user is never an admin. Otherwise, find or create by name (first user of a
  // brand-new org becomes ADMIN).
  let invitedOrg = null;
  if (data.inviteToken) {
    invitedOrg = await prisma.organization.findUnique({ where: { inviteToken: data.inviteToken } });
    if (!invitedOrg) return error("This invite link is invalid. Ask your colleague for a fresh one.", 400);
  }
  const orgName = (data.organization || "").trim();
  if (!invitedOrg && !orgName) return error("Enter an organization name.");

  const existingOrg = invitedOrg ?? (await prisma.organization.findUnique({ where: { name: orgName } }));

  const result = await prisma.$transaction(async (tx: any) => {
    const org =
      existingOrg ??
      (await tx.organization.create({ data: { name: orgName } }));

    const isFirst = !existingOrg;
    const role = invitedOrg ? data.role ?? "PM" : isFirst ? "ADMIN" : data.role ?? "PM";

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
