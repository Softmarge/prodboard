import { prisma } from "@/lib/db";
import { SessionUser } from "@/lib/auth";

// Product ids a plain PM manages (product.pm matches their display name).
// Admin and Viewer are not scoped by this; callers check role first.
export async function managedProductIds(user: SessionUser): Promise<Set<string>> {
  const products = await prisma.product.findMany({ where: { organizationId: user.oid } });
  const mine = user.name.trim().toLowerCase();
  return new Set(products.filter((p: any) => (p.pm || "").trim().toLowerCase() === mine).map((p: any) => p.id));
}

export function isScopedPM(user: SessionUser): boolean {
  return user.role === "PM";
}
