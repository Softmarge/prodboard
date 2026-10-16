import { z } from "zod";
import { withAuth, json, error } from "@/lib/api";
import { createInviteLink } from "@/lib/invite";

export const runtime = "nodejs";

const Post = z.object({
  role: z.enum(["PM", "VIEWER", "TASK_OWNER", "REVIEWER"]).nullable().optional(),
  firstName: z.string().max(80).optional(),
  surname: z.string().max(80).optional(),
  linkName: z.string().max(120).optional(),
});

// Any signed-in member can create an invite link. Role and name are all
// optional: a link with no role lets the invitee choose, and a link with a
// prefilled name saves them typing it. Links can never grant admin.
export const POST = withAuth(async (user, req) => {
  let data: z.infer<typeof Post> = {};
  try {
    data = Post.parse(await req.json());
  } catch {
    return error("Could not create the invite link. Check the details and try again.");
  }
  const link = await createInviteLink(user.oid, {
    role: data.role ?? null,
    // If linking to an existing free-text person, prefill the first name with that
    // label so the new account's display name matches and auto-links.
    firstName: data.firstName || (data.linkName ? data.linkName.split(/\s+/)[0] : undefined),
    surname: data.surname,
    linkName: data.linkName,
  });
  const origin = new URL(req.url).origin;
  return json({
    token: link.token,
    url: `${origin}/signup?invite=${link.token}`,
    role: link.role ?? null,
    firstName: link.firstName ?? null,
    surname: link.surname ?? null,
    linkName: (link as any).linkName ?? null,
  });
});
