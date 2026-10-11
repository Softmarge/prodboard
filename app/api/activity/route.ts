import { prisma } from "@/lib/db";
import { withAuth, json } from "@/lib/api";

export const runtime = "nodejs";

export const GET = withAuth(async (user) => {
  const activity = await prisma.activity.findMany({
    where: { organizationId: user.oid },
    orderBy: { ts: "desc" },
    take: 1000,
  });
  return json({ activity });
});
