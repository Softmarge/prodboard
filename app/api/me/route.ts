import { prisma } from "@/lib/db";
import { withAuth, json } from "@/lib/api";

export const runtime = "nodejs";

export const GET = withAuth(async (user) => {
  const org = await prisma.organization.findUnique({ where: { id: user.oid } });
  return json({
    user: { id: user.uid, name: user.name, email: user.email, role: user.role },
    organization: org ? { id: org.id, name: org.name } : null,
  });
});
