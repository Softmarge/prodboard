import { z } from "zod";
import { prisma } from "@/lib/db";
import { withAuth, json, error, isAdmin } from "@/lib/api";
import { PRODUCT_TYPES, TEAM_BASE } from "@/lib/constants";
import { resolveOwnerUserId, normName } from "@/lib/owner";

export const runtime = "nodejs";

const STATUSES = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "IN_REVIEW", "COMPLETE"] as const;
type Status = (typeof STATUSES)[number];

const Row = z.object({
  ref: z.string().max(160).optional().default(""),
  product: z.string().min(1).max(200),
  type: z.string().max(60).optional().default(""),
  title: z.string().min(1).max(240),
  team: z.string().max(80).optional().default(""),
  owner: z.string().max(120).optional().default(""),
  reviewer: z.string().max(120).optional().default(""),
  priority: z.union([z.number(), z.string()]).optional(),
  status: z.string().max(40).optional().default(""),
  startDate: z.string().max(40).optional().default(""),
  dueDate: z.string().max(40).optional().default(""),
  context: z.string().max(4000).optional().default(""),
  blocker: z.string().max(400).optional().default(""),
  note1: z.string().max(1000).optional().default(""),
  note2: z.string().max(1000).optional().default(""),
});
const Body = z.object({ rows: z.array(Row).min(1).max(1000) });

// Map a type string to one of PRODUCT_TYPES (tolerant of spacing/case/slashes).
function normType(raw: string): string | null {
  const t = (raw || "").trim();
  if (!t) return null;
  const squashed = t.toLowerCase().replace(/\s|\//g, "");
  for (const canonical of PRODUCT_TYPES) {
    if (canonical.toLowerCase().replace(/\s|\//g, "") === squashed) return canonical;
  }
  return "Other";
}

function normStatus(raw: string): Status {
  const s = (raw || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const map: Record<string, Status> = {
    not_started: "NOT_STARTED", notstarted: "NOT_STARTED",
    in_progress: "IN_PROGRESS", inprogress: "IN_PROGRESS",
    blocked: "BLOCKED",
    in_review: "IN_REVIEW", inreview: "IN_REVIEW", review: "IN_REVIEW",
    complete: "COMPLETE", completed: "COMPLETE", done: "COMPLETE",
  };
  return map[s] || "NOT_STARTED";
}

function normPriority(raw: number | string | undefined): number {
  if (typeof raw === "number") return raw >= 1 && raw <= 3 ? Math.round(raw) : 2;
  const s = (raw || "").toString().trim().toLowerCase();
  const m = s.match(/p?\s*([123])/);
  if (m) return parseInt(m[1], 10);
  if (/high/.test(s)) return 1;
  if (/low/.test(s)) return 3;
  return 2;
}

function toDate(s?: string): Date | null {
  const v = (s || "").trim();
  if (!v) return null;
  const d = new Date(v + (v.length === 10 ? "T00:00:00" : ""));
  return isNaN(d.getTime()) ? null : d;
}

// Admin-only bulk task import. Resolves (or creates) the product by name+type,
// links owners/reviewers to existing accounts by name, and records each
// progress note as a note activity. Rows carrying a Ref already present as a
// task's service request are skipped, so re-running the same file is safe.
export const POST = withAuth(async (user, req) => {
  if (!isAdmin(user)) return error("Only an admin can import tasks.", 403);
  let data;
  try {
    data = Body.parse(await req.json());
  } catch {
    return error("Nothing to import, or the rows are malformed.");
  }

  const [existingProducts, existingTasks, org] = await Promise.all([
    prisma.product.findMany({ where: { organizationId: user.oid } }),
    prisma.task.findMany({ where: { organizationId: user.oid }, select: { serviceRequest: true } }),
    prisma.organization.findUnique({ where: { id: user.oid }, select: { teams: true } }),
  ]);

  const pkey = (n: string, t: string | null) => `${n.trim().toLowerCase()}|${(t || "").toLowerCase()}`;
  const productByKey = new Map<string, any>(existingProducts.map((p: any) => [pkey(p.name, p.type), p]));
  const usedRefs = new Set(existingTasks.map((t: any) => (t.serviceRequest || "").trim().toLowerCase()).filter(Boolean));
  const knownTeams = new Set([...TEAM_BASE, ...(org?.teams || [])].map((t) => t.toLowerCase()));
  const newTeams: string[] = [];

  // Resolve owner/reviewer labels to accounts once per distinct label.
  const ownerCache = new Map<string, string | null>();
  async function linkUser(label: string): Promise<string | null> {
    const key = normName(label);
    if (!key) return null;
    if (ownerCache.has(key)) return ownerCache.get(key)!;
    const uid = await resolveOwnerUserId(user.oid, label);
    ownerCache.set(key, uid);
    return uid;
  }

  let created = 0;
  let skipped = 0;
  let notes = 0;
  const problems: string[] = [];

  for (let i = 0; i < data.rows.length; i++) {
    const r = data.rows[i];
    const rowNo = i + 1;
    const title = r.title.trim();
    const productName = r.product.trim();
    if (!title || !productName) { skipped++; continue; }

    const ref = (r.ref || "").trim();
    if (ref && usedRefs.has(ref.toLowerCase())) { skipped++; continue; }

    const status = normStatus(r.status);
    const start = toDate(r.startDate);
    const due = toDate(r.dueDate);
    if (status !== "NOT_STARTED" && (!start || !due)) {
      problems.push(`Row ${rowNo} (${ref || title}): needs a start and due date for status ${status}.`);
      skipped++; continue;
    }
    const blocker = (r.blocker || "").trim();
    if (status === "BLOCKED" && !blocker) {
      problems.push(`Row ${rowNo} (${ref || title}): a blocked task needs a blocker.`);
      skipped++; continue;
    }

    // Resolve or create the product (name + normalized type).
    const type = normType(r.type || "");
    const k = pkey(productName, type);
    let product = productByKey.get(k);
    if (!product) {
      product = await prisma.product.create({
        data: { name: productName, type, pm: null, organizationId: user.oid, createdBy: user.name },
      });
      productByKey.set(k, product);
    }

    // Team: keep as typed; remember unknown ones so the org can filter by them.
    let team = (r.team || "").trim();
    if (!team) team = "Project";
    if (!knownTeams.has(team.toLowerCase())) { knownTeams.add(team.toLowerCase()); newTeams.push(team); }

    const ownerLabel = (r.owner || "").trim();
    const reviewerLabel = (r.reviewer || "").trim();
    const ownerUserId = ownerLabel ? await linkUser(ownerLabel) : null;
    const reviewerUserId = reviewerLabel ? await linkUser(reviewerLabel) : null;

    const noteLines = [r.note1, r.note2].map((n) => (n || "").trim()).filter(Boolean);

    await prisma.$transaction(async (tx: any) => {
      const task = await tx.task.create({
        data: {
          title,
          context: (r.context || "").trim() || null,
          productId: product.id,
          team,
          owner: ownerLabel || "Unassigned",
          ownerUserId,
          reviewer: reviewerLabel || null,
          reviewerUserId,
          priority: normPriority(r.priority),
          status,
          startDate: start,
          dueDate: due,
          serviceRequest: ref || null,
          blocker: blocker || null,
          pending: false,
          createdBy: user.name,
          organizationId: user.oid,
        },
      });
      await tx.activity.create({
        data: { type: "created", taskId: task.id, taskTitle: task.title, toStatus: task.status, author: user.name, organizationId: user.oid },
      });
      for (const line of noteLines) {
        await tx.activity.create({
          data: { type: "note", taskId: task.id, content: line, author: ownerLabel || user.name, organizationId: user.oid },
        });
        notes++;
      }
    });
    if (ref) usedRefs.add(ref.toLowerCase());
    created++;
  }

  if (newTeams.length) {
    await prisma.organization.update({ where: { id: user.oid }, data: { teams: { push: newTeams } } }).catch(() => {});
  }
  if (created) {
    await prisma.activity.create({
      data: { type: "product", content: `imported ${created} task${created === 1 ? "" : "s"}`, author: user.name, organizationId: user.oid },
    });
  }

  return json({ created, skipped, notes, newTeams, problems });
});
