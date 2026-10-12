import { json, error } from "@/lib/api";
import { resolveInvite } from "@/lib/invite";

export const runtime = "nodejs";

// Public: resolve an invite token to its organization name and the role it pins,
// so the signup page can show and lock both. Never exposes anything else.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const token = params.token;
  if (!token) return error("Invalid invite.", 400);
  const resolved = await resolveInvite(token);
  if (!resolved) return error("This invite link is invalid.", 404);
  return json({ organization: resolved.org.name, role: resolved.role });
}
