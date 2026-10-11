import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error, canWrite } from "@/lib/api";
import { TEAM_BASE } from "@/lib/constants";

export const runtime = "nodejs";

function merged(custom: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  [...TEAM_BASE, ...custom].forEach((t) => {
    const v = (t || "").trim();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  });
  return out;
}

export const GET = withAuth(async (user) => {
  const org = await prisma.organization.findUnique({ where: { id: user.oid } });
  return json({ teams: merged(org?.teams ?? []) });
});

const Create = z.object({ name: z.string().min(1).max(60) });

export const POST = withAuth(async (user, req) => {
  if (!canWrite(user)) return error("You do not have permission to add teams.", 403);
  let data;
  try {
    data = Create.parse(await req.json());
  } catch {
    return error("Give the team a name.");
  }
  const name = data.name.trim();
  const org = await prisma.organization.findUnique({ where: { id: user.oid } });
  const custom = org?.teams ?? [];
  if (!TEAM_BASE.includes(name) && !custom.includes(name)) {
    await prisma.organization.update({
      where: { id: user.oid },
      data: { teams: [...custom, name] },
    });
  }
  const refreshed = await prisma.organization.findUnique({ where: { id: user.oid } });
  return json({ teams: merged(refreshed?.teams ?? []) });
});
