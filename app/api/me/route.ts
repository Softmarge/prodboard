import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error } from "@/lib/api";
import { setSession } from "@/lib/auth";

export const runtime = "nodejs";

export const GET = withAuth(async (user) => {
  const org = await prisma.organization.findUnique({ where: { id: user.oid } });
  return json({
    user: { id: user.uid, name: user.name, email: user.email, role: user.role },
    organization: org ? { id: org.id, name: org.name } : null,
  });
});

const Patch = z.object({ name: z.string().min(1).max(120) });

// Change your own display name. Re-issues the session so name-based scoping
// (which products a PM manages) updates immediately.
export const PATCH = withAuth(async (user, req) => {
  let data;
  try {
    data = Patch.parse(await req.json());
  } catch {
    return error("Enter a name.");
  }
  const name = data.name.trim();
  if (!name) return error("Enter a name.");
  const updated = await prisma.user.update({ where: { id: user.uid }, data: { name } });
  await setSession({ uid: user.uid, oid: user.oid, role: user.role, name: updated.name, email: user.email });
  return json({ ok: true, name: updated.name });
});
