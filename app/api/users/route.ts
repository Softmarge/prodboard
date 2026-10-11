import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error, isAdmin } from "@/lib/api";

export const runtime = "nodejs";

export const GET = withAuth(async (user) => {
  if (!isAdmin(user)) return error("Only an admin can view members.", 403);
  const users = await prisma.user.findMany({
    where: { organizationId: user.oid },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });
  return json({ users });
});

const Patch = z.object({
  userId: z.string().min(1),
  role: z.enum(["ADMIN", "PM", "VIEWER"]),
});

export const PATCH = withAuth(async (user, req) => {
  if (!isAdmin(user)) return error("Only an admin can change roles.", 403);
  let data;
  try {
    data = Patch.parse(await req.json());
  } catch {
    return error("Invalid role change.");
  }
  const target = await prisma.user.findFirst({ where: { id: data.userId, organizationId: user.oid } });
  if (!target) return error("Member not found.", 404);

  // Prevent removing the last admin.
  if (target.role === "ADMIN" && data.role !== "ADMIN") {
    const admins = await prisma.user.count({ where: { organizationId: user.oid, role: "ADMIN" } });
    if (admins <= 1) return error("You can't remove the only admin. Promote someone else first.", 400);
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { role: data.role },
    select: { id: true, name: true, email: true, role: true },
  });
  return json({ user: updated });
});
