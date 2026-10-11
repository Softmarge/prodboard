import crypto from "crypto";
import { prisma } from "@/lib/db";
import { withAuth, json, error, isAdmin } from "@/lib/api";

export const runtime = "nodejs";

function newToken() {
  return crypto.randomBytes(18).toString("base64url");
}

// Any signed-in member can get their organization's invite link.
export const GET = withAuth(async (user, req) => {
  let org = await prisma.organization.findUnique({ where: { id: user.oid } });
  if (!org) return error("Organization not found.", 404);
  if (!org.inviteToken) {
    org = await prisma.organization.update({ where: { id: org.id }, data: { inviteToken: newToken() } });
  }
  const origin = new URL(req.url).origin;
  return json({ token: org.inviteToken, url: `${origin}/signup?invite=${org.inviteToken}`, organization: org.name });
});

// Admins can rotate the link (invalidates the old one).
export const POST = withAuth(async (user, req) => {
  if (!isAdmin(user)) return error("Only an admin can regenerate the invite link.", 403);
  const org = await prisma.organization.update({ where: { id: user.oid }, data: { inviteToken: newToken() } });
  const origin = new URL(req.url).origin;
  return json({ token: org.inviteToken, url: `${origin}/signup?invite=${org.inviteToken}`, organization: org.name });
});
