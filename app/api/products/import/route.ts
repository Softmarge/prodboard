import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error, isAdmin } from "@/lib/api";
import { PRODUCT_TYPES } from "@/lib/constants";

export const runtime = "nodejs";

const Row = z.object({
  name: z.string().min(1).max(200),
  type: z.string().max(60).optional().default(""),
  pm: z.string().max(120).optional().default(""),
});
const Body = z.object({ rows: z.array(Row).min(1).max(1000) });

// Normalize a type string to one of the known PRODUCT_TYPES (tolerant of
// spacing/case, e.g. "Backend/API" -> "Backend / API"). Unknown non-empty
// values fall back to "Other"; blank stays blank.
function normType(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const squashed = t.toLowerCase().replace(/\s|\//g, "");
  for (const canonical of PRODUCT_TYPES) {
    if (canonical.toLowerCase().replace(/\s|\//g, "") === squashed) return canonical;
  }
  return "Other";
}

export const POST = withAuth(async (user, req) => {
  if (!isAdmin(user)) return error("Only an admin can import products.", 403);
  let data;
  try {
    data = Body.parse(await req.json());
  } catch {
    return error("Nothing to import, or the rows are malformed.");
  }

  const existing = await prisma.product.findMany({ where: { organizationId: user.oid } });
  // A product is unique by name + type, so "WinBundle / Website" and
  // "WinBundle / Mobile App" are distinct and both import.
  const key = (n: string, t: string | null) => `${n.trim().toLowerCase()}|${(t || "").toLowerCase()}`;
  const seen = new Set(existing.map((p: any) => key(p.name, p.type)));

  let created = 0;
  let skipped = 0;
  for (const r of data.rows) {
    const name = r.name.trim();
    const type = normType(r.type || "");
    if (!name) { skipped++; continue; }
    const k = key(name, type);
    if (seen.has(k)) { skipped++; continue; }
    seen.add(k);
    await prisma.product.create({
      data: { name, type, pm: r.pm?.trim() || null, organizationId: user.oid, createdBy: user.name },
    });
    created++;
  }

  if (created) {
    await prisma.activity.create({
      data: {
        type: "product",
        content: `imported ${created} product${created === 1 ? "" : "s"}`,
        author: user.name,
        organizationId: user.oid,
      },
    });
  }
  return json({ created, skipped });
});
