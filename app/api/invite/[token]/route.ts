import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api";

export const runtime = "nodejs";

// Public: resolve an invite token to its organization name, so the signup
// page can show and lock the organization field. Never exposes anything else.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const token = params.token;
  if (!token) return error("Invalid invite.", 400);
  const org = await prisma.organization.findUnique({ where: { inviteToken: token } });
  if (!org) return error("This invite link is invalid.", 404);
  return json({ organization: org.name });
}
