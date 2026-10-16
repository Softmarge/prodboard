import { json, error } from "@/lib/api";
import { resolveInvite, INVITE_USED_MESSAGE } from "@/lib/invite";

export const runtime = "nodejs";

// Public: resolve an invite token to its organization name, the role it pins
// (if any), and any prefilled name, so the signup page can show them. Never
// exposes anything else about the organization.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const token = params.token;
  if (!token) return error("Invalid invite.", 400);
  const resolved = await resolveInvite(token);
  if (!resolved) return error("This invite link is invalid.", 404);
  if (resolved.named && resolved.used) return error(INVITE_USED_MESSAGE, 410);
  return json({
    organization: resolved.org.name,
    role: resolved.role,
    firstName: resolved.firstName,
    surname: resolved.surname,
    linkName: resolved.linkName,
  });
}
