import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error } from "@/lib/api";
import { groupableProductIds } from "@/lib/scope";

export const runtime = "nodejs";

const Body = z.object({
  name: z.string().min(1).max(80),
  productIds: z.array(z.string().min(1)).max(500),
});

// List the current user's own groups.
export const GET = withAuth(async (user) => {
  const groups = await prisma.productGroup.findMany({
    where: { userId: user.uid },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, productIds: true },
  });
  return json({ groups });
});

// Create a group. A PM may only include products they manage.
export const POST = withAuth(async (user, req) => {
  let data;
  try {
    data = Body.parse(await req.json());
  } catch {
    return error("Give the group a name and pick at least one product.");
  }
  const name = data.name.trim();
  if (!name) return error("Give the group a name.");
  const allowed = await groupableProductIds(user);
  const productIds = Array.from(new Set(data.productIds)).filter((id) => allowed.has(id));
  if (!productIds.length) return error("Pick at least one product you can access.");

  const group = await prisma.productGroup.create({
    data: { name, productIds, userId: user.uid, organizationId: user.oid },
    select: { id: true, name: true, productIds: true },
  });
  return json({ group });
});
