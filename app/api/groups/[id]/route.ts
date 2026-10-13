import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error } from "@/lib/api";
import { groupableProductIds } from "@/lib/scope";

export const runtime = "nodejs";

const Patch = z.object({
  name: z.string().min(1).max(80).optional(),
  productIds: z.array(z.string().min(1)).max(500).optional(),
});

// Edit a group (owner only).
export const PATCH = withAuth(async (user, req, params) => {
  const group = await prisma.productGroup.findFirst({ where: { id: params.id, userId: user.uid } });
  if (!group) return error("Group not found.", 404);
  let data;
  try {
    data = Patch.parse(await req.json());
  } catch {
    return error("Invalid group change.");
  }
  const update: { name?: string; productIds?: string[] } = {};
  if (data.name !== undefined) {
    const name = data.name.trim();
    if (!name) return error("Give the group a name.");
    update.name = name;
  }
  if (data.productIds !== undefined) {
    const allowed = await groupableProductIds(user);
    const productIds = Array.from(new Set(data.productIds)).filter((id) => allowed.has(id));
    if (!productIds.length) return error("Pick at least one product you can access.");
    update.productIds = productIds;
  }
  const updated = await prisma.productGroup.update({
    where: { id: group.id },
    data: update,
    select: { id: true, name: true, productIds: true },
  });
  return json({ group: updated });
});

// Delete a group (owner only). If it was the active selection, fall back to Main.
export const DELETE = withAuth(async (user, _req, params) => {
  const group = await prisma.productGroup.findFirst({ where: { id: params.id, userId: user.uid } });
  if (!group) return error("Group not found.", 404);
  await prisma.productGroup.delete({ where: { id: group.id } });
  await prisma.user.updateMany({ where: { id: user.uid, activeGroupId: group.id }, data: { activeGroupId: null } });
  return json({ ok: true });
});
