import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { error, json } from "@/lib/api";
import { passwordProblem } from "@/lib/password";
import { sendEmail, emailConfigured } from "@/lib/email";
import { brandedEmail } from "@/lib/emailTemplate";
import { rateLimit, tooMany, clientIp, LIMITS } from "@/lib/ratelimit";

export const runtime = "nodejs";

const Body = z.object({
  firstName: z.string().min(1).max(80),
  surname: z.string().min(1).max(80),
  email: z.string().email().max(200),
  password: z.string().max(200),
  organization: z.string().min(1).max(120).optional(),
  role: z.enum(["PM", "VIEWER", "TASK_OWNER", "REVIEWER"]).optional(),
  inviteToken: z.string().min(1).optional(),
  acceptedTerms: z.boolean().optional(),
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
  const rl = await rateLimit("signup", clientIp(req), LIMITS.signup);
  if (!rl.ok) return tooMany(rl.retryAfter, "Too many sign-up attempts. Please wait a while and try again.");
  let data;
  try {
    data = Body.parse(await req.json());
  } catch {
    return error("Please fill in your first name, surname, a valid email, a password, and an organization.");
  }
  const pwProblem = passwordProblem(data.password);
  if (pwProblem) return error(pwProblem);

  if (data.acceptedTerms !== true) return error("Please accept the Terms of Service and Privacy Policy to continue.");

  if (!emailConfigured()) {
    return error("Email verification is not configured on the server yet. Contact your admin.", 503);
  }

  const email = data.email.trim().toLowerCase();
  const firstName = data.firstName.trim();
  const surname = data.surname.trim();
  const displayName = firstName; // display name is the first name

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) return error("An account with that email already exists. Try signing in instead.", 409);

  // Resolve the target org up front so we can check display-name uniqueness and
  // not ask for a code only to fail at the end. When joining by invite, the role
  // is pinned by the link (set by the admin), not by anything the client sends.
  let targetOrg = null;
  let invitedRole: "PM" | "VIEWER" | "TASK_OWNER" | "REVIEWER" | null = null;
  if (data.inviteToken) {
    const { resolveInvite, INVITE_USED_MESSAGE } = await import("@/lib/invite");
    const resolved = await resolveInvite(data.inviteToken);
    if (!resolved) return error("This invite link is invalid. Ask your colleague for a fresh one.", 400);
    if (resolved.named && resolved.used) return error(INVITE_USED_MESSAGE, 410);
    targetOrg = { id: resolved.org.id };
    invitedRole = resolved.role;
  } else {
    const orgName = (data.organization || "").trim();
    if (!orgName) return error("Enter an organization name.");
    targetOrg = await prisma.organization.findUnique({ where: { name: orgName } });
  }
  if (targetOrg) {
    const { nameTaken } = await import("@/lib/names");
    if (await nameTaken(targetOrg.id, displayName)) {
      return error(`The display name “${displayName}” is already taken in this organization. Add an initial or use a different first name.`, 409);
    }
  }

  const code = code4();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 10); // 10 minutes
  const payload = {
    email,
    name: displayName,
    firstName,
    surname,
    passwordHash: await hashPassword(data.password),
    organization: data.inviteToken ? null : (data.organization || "").trim(),
    role: invitedRole ?? data.role ?? "PM",
    inviteToken: data.inviteToken ?? null,
    codeHash: hashCode(code),
    attempts: 0,
    expiresAt,
  };
  await prisma.pendingSignup.upsert({ where: { email }, update: payload, create: payload });

  // While there is no verified sending domain, Resend can only deliver to the
  // account owner. VERIFICATION_RELAY_TO routes every code to that one inbox,
  // tagged with who is signing up, so an admin can relay it.
  const origin = new URL(req.url).origin;
  const relayTo = process.env.VERIFICATION_RELAY_TO;
  const relayed = !!relayTo;
  const sent = relayed
    ? await sendEmail({
        to: relayTo!,
        subject: `ProdBoard verification code for ${payload.name}`,
        html: brandedEmail({
          origin,
          heading: "Sign-up code to share",
          intro: `A new ProdBoard sign-up is awaiting verification.<br/><b>Name:</b> ${payload.name}<br/><b>Email:</b> ${email}`,
          code,
          outro: "Share this code with them so they can finish signing up. It expires in 10 minutes.",
        }),
      })
    : await sendEmail({
        to: email,
        subject: "Your ProdBoard verification code",
        html: brandedEmail({
          origin,
          heading: "Verify your email",
          intro: "Enter this code to finish creating your ProdBoard account. It expires in 10 minutes.",
          code,
        }),
        text: `Your ProdBoard verification code is ${code}. It expires in 10 minutes. If you did not request this, ignore this email.`,
      });
  if (!sent) return error("Could not send the verification email. Try again shortly.", 502);

  return json({ ok: true, email, relayed });
}
