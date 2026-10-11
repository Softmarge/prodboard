import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error, canWrite } from "@/lib/api";

export const runtime = "nodejs";

export const GET = withAuth(async (user) => {
  const products = await prisma.product.findMany({
    where: { organizationId: user.oid },
    orderBy: { name: "asc" },
  });
  return json({ products });
});

const Create = z.object({
  name: z.string().min(1).max(160),
  pm: z.string().max(120).optional().default(""),
  type: z.string().max(60).optional().default(""),
});

export const POST = withAuth(async (user, req) => {
  if (!canWrite(user)) return error("You do not have permission to add products.", 403);
  let data;
  try {
    data = Create.parse(await req.json());
  } catch {
    return error("A product needs a name.");
  }
  const type = data.type?.trim() || null;
  const product = await prisma.product.create({
    data: {
      name: data.name.trim(),
      pm: data.pm?.trim() || null,
      type,
      organizationId: user.oid,
      createdBy: user.name,
    },
  });
  await prisma.activity.create({
    data: {
      type: "product",
      content: `added product ${product.name}${type ? ` ${type}` : ""}`,
      author: user.name,
      organizationId: user.oid,
    },
  });
  return json({ product });
});
