export type Role = "ADMIN" | "PM" | "VIEWER";
export type StatusKey = "NOT_STARTED" | "IN_PROGRESS" | "IN_REVIEW" | "COMPLETE";
export type EffKey = StatusKey | "OVERDUE";

export type Product = {
  id: string;
  name: string;
  pm: string | null;
  type: string | null;
  decommissioned?: boolean;
  createdBy?: string | null;
  createdAt?: string;
};
export type Task = {
  id: string;
  title: string;
  context?: string | null;
  productId: string | null;
  team: string;
  owner: string;
  priority?: number;
  status: StatusKey;
  startDate: string | null;
  dueDate: string;
  serviceRequest: string | null;
  blocker: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};
export type Activity = {
  id: string;
  type: string;
  taskId: string | null;
  taskTitle: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  content: string | null;
  author: string;
  ts: string;
};
export type Member = { id: string; name: string; email: string; role: Role; createdAt?: string };
export type Group = { id: string; name: string; productIds: string[] };

export const STATUS: Record<string, { label: string; cls: string; colorVar: string }> = {
  NOT_STARTED: { label: "Not started", cls: "ns", colorVar: "--s-notstarted" },
  IN_PROGRESS: { label: "In progress", cls: "ip", colorVar: "--s-progress" },
  IN_REVIEW: { label: "In review", cls: "rv", colorVar: "--s-review" },
  COMPLETE: { label: "Complete", cls: "cp", colorVar: "--s-complete" },
  OVERDUE: { label: "Overdue", cls: "ov", colorVar: "--s-overdue" },
};
export const ORDER: EffKey[] = ["OVERDUE", "IN_PROGRESS", "IN_REVIEW", "NOT_STARTED", "COMPLETE"];
export const EDIT_STATUSES: StatusKey[] = ["NOT_STARTED", "IN_PROGRESS", "IN_REVIEW", "COMPLETE"];
export const PTYPES = ["Mobile App", "Website", "Web App", "USSD", "Backend / API", "Other"];
export function priorityOf(t: Task): number {
  return t.priority && t.priority >= 1 && t.priority <= 3 ? t.priority : 2;
}
export const BSORTS: [string, string][] = [
  ["priority", "Priority"],
  ["due", "Due date"],
  ["status", "Status"],
  ["owner", "Owner"],
  ["product", "Product"],
  ["updated", "Last update"],
];

const d2 = (n: number) => String(n).padStart(2, "0");

export function isoToYMD(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${d2(d.getMonth() + 1)}-${d2(d.getDate())}`;
}
export function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d2(d.getMonth() + 1)}-${d2(d.getDate())}`;
}
export function addDaysYMD(ymd: string, days: number): string {
  const [y, m, dd] = ymd.split("-").map(Number);
  const d = new Date(y, m - 1, dd + days);
  return `${d.getFullYear()}-${d2(d.getMonth() + 1)}-${d2(d.getDate())}`;
}
export function fmtDate(iso?: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
export function fmtTs(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
export function relTime(iso?: string | null): string {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  const d = Math.floor(s / 86400);
  if (d < 30) return d + "d ago";
  return fmtTs(iso);
}

export function statusMeta(key: string) {
  return STATUS[key] || STATUS.NOT_STARTED;
}

export function effectiveStatus(
  t: Task,
  asOf: string | null,
  activity: Activity[],
): { status: EffKey; overdue: boolean } {
  if (!asOf) {
    const due = isoToYMD(t.dueDate);
    const over = t.status !== "COMPLETE" && !!due && due < todayYMD();
    return { status: over ? "OVERDUE" : t.status, overdue: over };
  }
  // reconstruct status as of close of business on asOf
  const cutoff = new Date(asOf + "T23:59:59.999").getTime();
  let best: Activity | null = null;
  let bestTs = -1;
  for (const a of activity) {
    if (a.taskId !== t.id) continue;
    if (a.type !== "created" && a.type !== "status") continue;
    const ts = new Date(a.ts).getTime();
    if (ts <= cutoff && ts >= bestTs) {
      bestTs = ts;
      best = a;
    }
  }
  const base = (best?.toStatus as StatusKey) || t.status;
  const due = isoToYMD(t.dueDate);
  const over = base !== "COMPLETE" && !!due && due < asOf;
  return { status: over ? "OVERDUE" : base, overdue: over };
}

export function existsAsOf(t: Task, asOf: string): boolean {
  if (!t.createdAt) return true;
  const cutoff = new Date(asOf + "T23:59:59.999").getTime();
  return new Date(t.createdAt).getTime() <= cutoff;
}

export function productDisplay(p?: Product | null): string {
  if (!p) return "-";
  return p.name;
}

// For <select> options only: disambiguates products that share a base name by
// showing the type in parentheses. Not used for titles, cards, or the board.
export function productOption(p: Product): string {
  return p.type ? `${p.name} (${p.type})` : p.name;
}

export function lastUpdateFor(taskId: string, activity: Activity[]): Activity | null {
  let best: Activity | null = null;
  for (const a of activity) {
    if (a.taskId !== taskId) continue;
    if (!best || new Date(a.ts) > new Date(best.ts)) best = a;
  }
  return best;
}

// ---- CSV ----
function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function downloadCSV(filename: string, rows: unknown[][]) {
  const text = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
