import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error } from "@/lib/api";

export const runtime = "nodejs";

const Body = z.object({ groupId: z.string().min(1).nullable() });

// Remember which group (or Main) the user is viewing, so it reopens on next login.
export const PATCH = withAuth(async (user, req) => {
  let data;
  try {
    data = Body.parse(await req.json());
  } catch {
    return error("Invalid selection.");
  }
  if (data.groupId) {
    const owned = await prisma.productGroup.findFirst({ where: { id: data.groupId, userId: user.uid }, select: { id: true } });
    if (!owned) return error("Group not found.", 404);
  }
  await prisma.user.update({ where: { id: user.uid }, data: { activeGroupId: data.groupId } });
  return json({ ok: true, activeGroupId: data.groupId });
});
