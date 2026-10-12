import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { error, json } from "@/lib/api";
import { passwordProblem } from "@/lib/password";
import { sendEmail, emailConfigured } from "@/lib/email";

export const runtime = "nodejs";

const Body = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(200),
  password: z.string().max(200),
  organization: z.string().min(1).max(120).optional(),
  role: z.enum(["PM", "VIEWER"]).optional(),
  inviteToken: z.string().min(1).optional(),
});

function code4() {
  return String(crypto.randomInt(1000, 10000)); // 1000-9999
}
function hashCode(c: string) {
  return crypto.createHash("sha256").update(c).digest("hex");
}

// Step 1 of signup: validate, stash a pending record, and email a 4-digit code.
// No account is created until the code is verified.
export async function POST(req: Request) {
  let data;
  try {
    data = Body.parse(await req.json());
  } catch {
    return error("Please fill in a name, a valid email, a password, and an organization.");
  }
  const pwProblem = passwordProblem(data.password);
  if (pwProblem) return error(pwProblem);

  if (!emailConfigured()) {
    return error("Email verification is not configured on the server yet. Contact your admin.", 503);
  }

  const email = data.email.trim().toLowerCase();

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) return error("An account with that email already exists. Try signing in instead.", 409);

  // Validate the invite (if any) up front so the user is not asked for a code
  // only to fail later.
  if (data.inviteToken) {
    const org = await prisma.organization.findUnique({ where: { inviteToken: data.inviteToken } });
    if (!org) return error("This invite link is invalid. Ask your colleague for a fresh one.", 400);
  } else if (!(data.organization || "").trim()) {
    return error("Enter an organization name.");
  }

  const code = code4();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 10); // 10 minutes
  const payload = {
    email,
    name: data.name.trim(),
    passwordHash: await hashPassword(data.password),
    organization: data.inviteToken ? null : (data.organization || "").trim(),
    role: data.role ?? "PM",
    inviteToken: data.inviteToken ?? null,
    codeHash: hashCode(code),
    attempts: 0,
    expiresAt,
  };
  await prisma.pendingSignup.upsert({ where: { email }, update: payload, create: payload });

  const sent = await sendEmail({
    to: email,
    subject: "Your ProdBoard verification code",
    html: `<p>Your ProdBoard verification code is:</p>
           <p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p>
           <p>It expires in 10 minutes. If you did not request this, you can ignore this email.</p>`,
  });
  if (!sent) return error("Could not send the verification email. Try again shortly.", 502);

  return json({ ok: true, email });
}
