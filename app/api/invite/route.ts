import { z } from "zod";
import { withAuth, json, error, isAdmin } from "@/lib/api";
import { ensureInviteLink, rotateInviteLink, type InviteRole } from "@/lib/invite";

export const runtime = "nodejs";

function parseRole(v: string | null): InviteRole {
  return v === "VIEWER" ? "VIEWER" : "PM";
}

// Any signed-in member can fetch a link for a given role (defaults to PM).
export const GET = withAuth(async (user, req) => {
  const role = parseRole(new URL(req.url).searchParams.get("role"));
  const link = await ensureInviteLink(user.oid, role);
  const origin = new URL(req.url).origin;
  return json({ token: link.token, url: `${origin}/signup?invite=${link.token}`, role });
});

const Post = z.object({ role: z.enum(["PM", "VIEWER"]) });

// Admins rotate the link for a role (invalidates the old one for that role).
export const POST = withAuth(async (user, req) => {
  if (!isAdmin(user)) return error("Only an admin can regenerate invite links.", 403);
  let role: InviteRole = "PM";
  try {
    role = Post.parse(await req.json()).role;
  } catch {
    return error("Choose PM or Viewer.");
  }
  const link = await rotateInviteLink(user.oid, role);
  const origin = new URL(req.url).origin;
  return json({ token: link.token, url: `${origin}/signup?invite=${link.token}`, role });
});
