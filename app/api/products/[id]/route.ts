import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error, canWrite } from "@/lib/api";

export const runtime = "nodejs";

// Name and PM are editable after creation. Type is set once at creation and
// locked. decommissioned toggles retirement (never a hard delete).
const Patch = z.object({
  name: z.string().min(1).max(160).optional(),
  pm: z.string().max(120).nullable().optional(),
  decommissioned: z.boolean().optional(),
});

export const PATCH = withAuth(async (user, req, params) => {
  if (!canWrite(user)) return error("You do not have permission to edit products.", 403);
  const existing = await prisma.product.findFirst({
    where: { id: params.id, organizationId: user.oid },
  });
  if (!existing) return error("Product not found.", 404);

  let data;
  try {
    data = Patch.parse(await req.json());
  } catch {
    return error("Invalid product update.");
  }

  const product = await prisma.product.update({
    where: { id: existing.id },
    data: {
      ...(data.name !== undefined ? { name: data.name.trim() } : {}),
      ...(data.pm !== undefined ? { pm: data.pm?.trim() || null } : {}),
      ...(data.decommissioned !== undefined ? { decommissioned: data.decommissioned } : {}),
    },
  });

  const name = (p: typeof product) => `${p.name}${p.type ? " " + p.type : ""}`;

  if (data.pm !== undefined && (data.pm || "") !== (existing.pm || "")) {
    await prisma.activity.create({
      data: {
        type: "product",
        content: `reassigned ${name(product)} PM ${existing.pm ? `from ${existing.pm} ` : ""}to ${product.pm || "unassigned"}`,
        author: user.name,
        organizationId: user.oid,
      },
    });
  }
  if (data.decommissioned !== undefined && data.decommissioned !== existing.decommissioned) {
    await prisma.activity.create({
      data: {
        type: "product",
        content: `${data.decommissioned ? "decommissioned" : "recommissioned"} ${name(product)}`,
        author: user.name,
        organizationId: user.oid,
      },
    });
  }
  return json({ product });
});
