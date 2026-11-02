import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error } from "@/lib/api";
import { groupableProductIds } from "@/lib/scope";

export const runtime = "nodejs";

const Body = z.object({
  name: z.string().min(1).max(80),
  productIds: z.array(z.string().min(1)).max(1000).optional().default([]),
  ownerNames: z.array(z.string().min(1).max(120)).max(200).optional().default([]),
  taskIds: z.array(z.string().min(1)).max(2000).optional().default([]),
});

// List the current user's own groups.
export const GET = withAuth(async (user) => {
  const groups = await prisma.productGroup.findMany({
    where: { userId: user.uid },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, productIds: true, ownerNames: true, taskIds: true },
  });
  return json({ groups });
});

// Create a smart group. It can gather tasks by product, by owner (dynamic), and
// by individually pinned task. At least one of the three is required. A PM may
// only include products they manage; owners and task ids are view filters over
// tasks the user already sees, so they are stored as given.
export const POST = withAuth(async (user, req) => {
  let data;
  try {
    data = Body.parse(await req.json());
  } catch {
    return error("Give the group a name and pick products, owners, or tasks.");
  }
  const name = data.name.trim();
  if (!name) return error("Give the group a name.");

  const allowed = await groupableProductIds(user);
  const productIds = Array.from(new Set(data.productIds)).filter((id) => allowed.has(id));
  const ownerNames = Array.from(new Set(data.ownerNames.map((s) => s.trim()).filter(Boolean)));
  const taskIds = Array.from(new Set(data.taskIds));
  if (!productIds.length && !ownerNames.length && !taskIds.length) {
    return error("Pick at least one product, owner, or task for the group.");
  }

  const group = await prisma.productGroup.create({
    data: { name, productIds, ownerNames, taskIds, userId: user.uid, organizationId: user.oid },
    select: { id: true, name: true, productIds: true, ownerNames: true, taskIds: true },
  });
  return json({ group });
});
