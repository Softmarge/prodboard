import { prisma } from "@/lib/db";

// Display names are unique within an organization (case-insensitive).
export async function nameTaken(orgId: string, name: string, exceptUserId?: string): Promise<boolean> {
  const n = name.trim().toLowerCase();
  const users = await prisma.user.findMany({ where: { organizationId: orgId } });
  return users.some((u: any) => u.name.trim().toLowerCase() === n && u.id !== exceptUserId);
}
