import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error, isAdmin } from "@/lib/api";

export const runtime = "nodejs";

export const GET = withAuth(async (user) => {
  if (!isAdmin(user)) return error("Only an admin can view members.", 403);
  const users = await prisma.user.findMany({
    where: { organizationId: user.oid },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, role: true, viewAll: true, capPm: true, capOwner: true, capReviewer: true, createdAt: true },
  });
  return json({ users });
});

const Patch = z.object({
  userId: z.string().min(1),
  role: z.enum(["ADMIN", "PM", "VIEWER", "TASK_OWNER", "REVIEWER"]).optional(),
  viewAll: z.boolean().optional(),
  capPm: z.boolean().optional(),
  capOwner: z.boolean().optional(),
  capReviewer: z.boolean().optional(),
  name: z.string().min(1).max(120).optional(),
});

export const PATCH = withAuth(async (user, req) => {
  if (!isAdmin(user)) return error("Only an admin can change members.", 403);
  let data;
  try {
    data = Patch.parse(await req.json());
  } catch {
    return error("Invalid member change.");
  }
  const target = await prisma.user.findFirst({ where: { id: data.userId, organizationId: user.oid } });
  if (!target) return error("Member not found.", 404);

  if (data.name !== undefined) {
    const { nameTaken } = await import("@/lib/names");
    if (await nameTaken(user.oid, data.name, target.id)) {
      return error(`The display name “${data.name.trim()}” is already taken in this organization.`, 409);
    }
  }

  // Prevent removing the last admin.
  if (data.role !== undefined && target.role === "ADMIN" && data.role !== "ADMIN") {
    const admins = await prisma.user.count({ where: { organizationId: user.oid, role: "ADMIN" } });
    if (admins <= 1) return error("You can't remove the only admin. Promote someone else first.", 400);
  }

  // Normalize the capability set against the resulting primary role: a capability
  // that the primary role already is, or that an admin always has, is redundant.
  const resultingRole = data.role !== undefined ? data.role : target.role;
  const isAdminRole = resultingRole === "ADMIN";
  const want = (key: "viewAll" | "capPm" | "capOwner" | "capReviewer", cur: boolean) =>
    data[key] !== undefined ? data[key]! : cur;
  const norm = {
    viewAll: isAdminRole || resultingRole === "VIEWER" ? false : want("viewAll", target.viewAll),
    capPm: isAdminRole || resultingRole === "PM" ? false : want("capPm", (target as any).capPm === true),
    capOwner: isAdminRole || resultingRole === "TASK_OWNER" ? false : want("capOwner", (target as any).capOwner === true),
    capReviewer: isAdminRole || resultingRole === "REVIEWER" ? false : want("capReviewer", (target as any).capReviewer === true),
  };
  const touchesCaps = data.role !== undefined || data.viewAll !== undefined || data.capPm !== undefined || data.capOwner !== undefined || data.capReviewer !== undefined;

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: {
      ...(data.role !== undefined ? { role: data.role } : {}),
      ...(touchesCaps ? norm : {}),
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
    },
    select: { id: true, name: true, email: true, role: true, viewAll: true, capPm: true, capOwner: true, capReviewer: true },
  });
  return json({ user: updated });
});
