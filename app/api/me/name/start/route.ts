import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { withAuth, json, error } from "@/lib/api";
import { sendEmail, emailConfigured } from "@/lib/email";
import { nameTaken } from "@/lib/names";

export const runtime = "nodejs";

const Body = z.object({ name: z.string().min(1).max(120) });
function code4() { return String(crypto.randomInt(1000, 10000)); }
function hashCode(c: string) { return crypto.createHash("sha256").update(c).digest("hex"); }

// Step 1 of a self name change: validate + uniqueness, then email a code.
export const POST = withAuth(async (user, req) => {
  let data;
  try {
    data = Body.parse(await req.json());
  } catch {
    return error("Enter a name.");
  }
  const name = data.name.trim();
  if (!name) return error("Enter a name.");
  if (name === user.name) return error("That is already your name.");
  if (!emailConfigured()) return error("Email verification is not configured on the server yet. Contact your admin.", 503);
  if (await nameTaken(user.oid, name, user.uid)) {
    return error(`The display name “${name}” is already taken in your organization.`, 409);
  }

  const code = code4();
  await prisma.pendingNameChange.upsert({
    where: { userId: user.uid },
    update: { newName: name, codeHash: hashCode(code), attempts: 0, expiresAt: new Date(Date.now() + 1000 * 60 * 10) },
    create: { userId: user.uid, newName: name, codeHash: hashCode(code), attempts: 0, expiresAt: new Date(Date.now() + 1000 * 60 * 10) },
  });

  const relayTo = process.env.VERIFICATION_RELAY_TO;
  const to = relayTo || user.email;
  const sent = await sendEmail({
    to,
    subject: `ProdBoard name change code${relayTo ? ` for ${user.name}` : ""}`,
    html: `<p>${relayTo ? `<b>${user.name}</b> (${user.email}) is changing their display name to <b>${name}</b>.` : `You asked to change your display name to <b>${name}</b>.`}</p>
           <p>Verification code:</p>
           <p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p>
           <p>It expires in 10 minutes.</p>`,
  });
  if (!sent) return error("Could not send the verification code. Try again shortly.", 502);
  return json({ ok: true, relayed: !!relayTo });
});
