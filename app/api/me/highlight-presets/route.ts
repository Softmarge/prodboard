import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error } from "@/lib/api";

export const runtime = "nodejs";

const Preset = z.object({ name: z.string().min(1).max(40), color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/) });
const Body = z.object({ presets: z.array(Preset).length(2) });

// Save the user's two personal highlight presets (name + color each).
export const PATCH = withAuth(async (user, req) => {
  let data;
  try {
    data = Body.parse(await req.json());
  } catch {
    return error("Give each preset a name and a valid color.");
  }
  await prisma.user.update({
    where: { id: user.uid },
    data: {
      hlName1: data.presets[0].name.trim(),
      hlColor1: data.presets[0].color,
      hlName2: data.presets[1].name.trim(),
      hlColor2: data.presets[1].color,
    },
  });
  return json({ ok: true, presets: data.presets });
});
