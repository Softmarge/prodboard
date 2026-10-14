import { prisma } from "@/lib/db";

export function normName(s: string): string {
  return (s || "").trim().toLowerCase();
}

// Find the org account whose display name or owner-alias matches this owner label.
// Returns the user id to link, or null when the label is not a known account.
export async function resolveOwnerUserId(organizationId: string, ownerText: string): Promise<string | null> {
  const key = normName(ownerText);
  if (!key) return null;
  const users = await prisma.user.findMany({
    where: { organizationId },
    select: { id: true, name: true, ownerAliases: true },
  });
  for (const u of users as any[]) {
    if (normName(u.name) === key) return u.id;
    if ((u.ownerAliases || []).some((a: string) => normName(a) === key)) return u.id;
  }
  return null;
}
