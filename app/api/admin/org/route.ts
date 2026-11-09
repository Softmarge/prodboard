import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error, isAdmin } from "@/lib/api";
import { normalizeDomains } from "@/lib/domains";

export const runtime = "nodejs";

export const GET = withAuth(async (user) => {
  if (!isAdmin(user)) return error("Only an admin can view org settings.", 403);
  const org = await prisma.organization.findUnique({ where: { id: user.oid }, select: { allowedDomains: true } });
  return json({ allowedDomains: org?.allowedDomains ?? [] });
});

const Patch = z.object({ allowedDomains: z.array(z.string().max(255)).max(50) });

export const PATCH = withAuth(async (user, req) => {
  if (!isAdmin(user)) return error("Only an admin can change org settings.", 403);
  let data;
  try {
    data = Patch.parse(await req.json());
  } catch {
    return error("Invalid domains.");
  }
  const allowedDomains = normalizeDomains(data.allowedDomains);
  await prisma.organization.update({ where: { id: user.oid }, data: { allowedDomains } });
  return json({ ok: true, allowedDomains });
});
