import { prisma } from "@/lib/db";
import { withAuth, json, error } from "@/lib/api";
import { normName } from "@/lib/owner";

export const runtime = "nodejs";

// The signed-in user claims an unlinked task as theirs (the Richard/Richie case).
// Links the task and remembers the owner label as an alias so future tasks
// typed with that label auto-link to this account.
export const POST = withAuth(async (user, _req, params) => {
  const task = await prisma.task.findFirst({ where: { id: params.id, organizationId: user.oid } });
  if (!task) return error("Task not found.", 404);
  if (task.ownerUserId) return error("This task is already linked to an account.", 409);

  const me = await prisma.user.findUnique({ where: { id: user.uid }, select: { ownerAliases: true } });
  const aliases = new Set((me?.ownerAliases || []).map((a: string) => a));
  if (task.owner && normName(task.owner) !== normName(user.name)) aliases.add(task.owner.trim());

  await prisma.$transaction(async (tx: any) => {
    await tx.task.update({ where: { id: task.id }, data: { ownerUserId: user.uid } });
    await tx.user.update({ where: { id: user.uid }, data: { ownerAliases: Array.from(aliases) } });
    // Link any other unlinked tasks with the same owner label to this account too.
    if (task.owner) {
      await tx.task.updateMany({ where: { organizationId: user.oid, ownerUserId: null, owner: task.owner }, data: { ownerUserId: user.uid } });
    }
  });
  return json({ ok: true });
});
