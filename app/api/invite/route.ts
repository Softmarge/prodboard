import { z } from "zod";
import { withAuth, json, error } from "@/lib/api";
import { createInviteLink } from "@/lib/invite";

export const runtime = "nodejs";

const Post = z.object({
  role: z.enum(["PM", "VIEWER"]).nullable().optional(),
  firstName: z.string().max(80).optional(),
  surname: z.string().max(80).optional(),
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
    firstName: data.firstName,
    surname: data.surname,
  });
  const origin = new URL(req.url).origin;
  return json({
    token: link.token,
    url: `${origin}/signup?invite=${link.token}`,
    role: link.role ?? null,
    firstName: link.firstName ?? null,
    surname: link.surname ?? null,
  });
});
