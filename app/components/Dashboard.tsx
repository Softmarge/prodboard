"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import BrandLogo from "./BrandLogo";
import {
  Activity,
  BSORTS,
  EDIT_STATUSES,
  EffKey,
  Group,
  Member,
  ORDER,
  PTYPES,
  Product,
  Role,
  StatusKey,
  Task,
  addDaysYMD,
  downloadCSV,
  effectiveStatus,
  existsAsOf,
  fmtDate,
  fmtTs,
  isoToYMD,
  lastUpdateFor,
  priorityOf,
  productDisplay,
  productOption,
  relTime,
  roleLabel,
  statusMeta,
  todayYMD,
} from "./helpers";

type Me = { id: string; name: string; email: string; role: Role; viewAll?: boolean; capPm?: boolean; capOwner?: boolean; capReviewer?: boolean };
type HlPreset = { name: string; color: string };
type PresenceMember = { id: string; name: string; role: Role; lastSeenAt: string | null; online: boolean };

// Per-user task highlights, shared through context so deep card/row components
// can read a task's color and open the picker without prop drilling.
const HLContext = createContext<{ color: (id: string) => string | undefined; open: (id: string, e: React.MouseEvent) => void }>({ color: () => undefined, open: () => {} });
function useHl() { return useContext(HLContext); }
// Low-alpha tint from a #rrggbb color, for row and card backgrounds.
function hlTint(color?: string): string | undefined {
  if (!color) return undefined;
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color + "2E" : color;
}
type MainView = "board" | "myproducts" | "mytasks" | "myreviews" | "products" | "sheet" | "report" | "activity" | "feedbacks" | "approvals";
// A multi-capability user acts under one "hat" at a time. The mode is a UI lens;
// the server still authorizes by the user's real capability.
type Mode = "pm" | "owner" | "reviewer" | "viewer";
const MODE_LABEL: Record<Mode, string> = { pm: "Manager", owner: "Task Owner", reviewer: "Reviewer", viewer: "Viewer" };
type BoardView = "kanban" | "list" | "grid";
type Filters = { q: string; team: string; product: string; owner: string; sr: string; status: string; pm: string };
const EMPTY_FILTERS: Filters = { q: "", team: "", product: "", owner: "", sr: "", status: "", pm: "" };
const REAL: StatusKey[] = ["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "IN_REVIEW", "COMPLETE"];

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}
function ls(key: string, def: string) {
  try { return localStorage.getItem(key) || def; } catch { return def; }
}
function lsSet(key: string, v: string) { try { localStorage.setItem(key, v); } catch {} }

function Chip({ status }: { status: string }) {
  const s = statusMeta(status);
  return <span className={`chip ${s.cls}`}><span className="dot" />{s.label}</span>;
}
function PrBadge({ t }: { t: Task }) {
  const p = priorityOf(t);
  return <span className={`prbadge p${p}`} title={`Priority level ${p}`}>P{p}</span>;
}

export default function Dashboard({ me }: { me: Me }) {
  const router = useRouter();
  const isAdmin = me.role === "ADMIN";
  // A user can hold several roles at once: their primary role plus any capability
  // flags a Lead PM granted. Each resolves to a "hat" they can act under.
  const canManage = isAdmin || me.role === "PM" || !!me.capPm;
  const canViewAllEff = isAdmin || me.role === "VIEWER" || !!me.viewAll;
  const hasViewerHat = me.role === "VIEWER" || !!me.viewAll; // explicit org read-only (admin acts in PM mode)
  const ownerCap = me.role === "TASK_OWNER" || !!me.capOwner;
  const reviewerCap = me.role === "REVIEWER" || !!me.capReviewer;
  const pmScoped = canManage && !isAdmin && !canViewAllEff; // a PM sees only their products
  // All the roles this user holds, for the header pill.
  const heldRoleLabels = isAdmin
    ? ["Admin"]
    : [roleLabel(me.role),
        me.capPm && me.role !== "PM" ? "Manager" : "",
        me.viewAll && me.role !== "VIEWER" ? "Viewer" : "",
        me.capOwner && me.role !== "TASK_OWNER" ? "Task owner" : "",
        me.capReviewer && me.role !== "REVIEWER" ? "Reviewer" : "",
      ].filter(Boolean);

  const [products, setProducts] = useState<Product[]>([]);
  const [pickable, setPickable] = useState<Product[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [teams, setTeams] = useState<string[]>([]);
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState<MainView>("board");
  const [boardView, setBoardView] = useState<BoardView>(() => ls("pdt_bview", "kanban") as BoardView);
  const [boardSort, setBoardSort] = useState<string>(() => ls("pdt_bsort", "priority"));
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [asOf, setAsOf] = useState("");
  const [range, setRange] = useState({ from: addDaysYMD(todayYMD(), -6), to: todayYMD() });

  // products view
  const [productLayout, setProductLayout] = useState<"cards" | "list">(() => ls("pdt_plo", "cards") as "cards" | "list");
  const [productSort, setProductSort] = useState<string>(() => ls("pdt_psort", "name"));
  const [productQuery, setProductQuery] = useState("");
  const [showDecom, setShowDecom] = useState(false);
  const [detailProduct, setDetailProduct] = useState<string | null>(null);
  const [productBoardId, setProductBoardId] = useState<string | null>(null);
  const [pbView, setPbView] = useState<BoardView>(() => ls("pdt_pbview", "kanban") as BoardView);

  const [toast, setToast] = useState("");
  const [taskModal, setTaskModal] = useState<{ open: boolean; editing: Task | null; preProduct?: string | null; preStatus?: StatusKey; ownerCreate?: boolean }>({ open: false, editing: null });
  const [moveConfirm, setMoveConfirm] = useState<{ id: string; ns: StatusKey; title: string; from: StatusKey } | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const [prodCreateOpen, setProdCreateOpen] = useState(false);
  const [prodSettings, setProdSettings] = useState<string | null>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const [alertsManageOpen, setAlertsManageOpen] = useState(false);
  const [featureAlerts, setFeatureAlerts] = useState<{ id: string; title: string; body: string; linkUrl: string | null; linkLabel: string | null }[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [taskImportOpen, setTaskImportOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifPrefsOpen, setNotifPrefsOpen] = useState(false);

  // Product groups: Main (all) vs a selected personal group. The selection is
  // remembered server-side so it reopens on next login.
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupMode, setGroupMode] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupsModalOpen, setGroupsModalOpen] = useState(false);
  const groupInit = useRef(false);

  // Highlights (private per user) + presence.
  const [highlights, setHighlights] = useState<Record<string, string>>({});
  const [hlPresets, setHlPresets] = useState<HlPreset[]>([{ name: "Focus", color: "#FDE047" }, { name: "Risk", color: "#F9A8D4" }]);
  const [hlMenu, setHlMenu] = useState<{ taskId: string; x: number; y: number } | null>(null);
  const [hlPresetsOpen, setHlPresetsOpen] = useState(false);
  const [presence, setPresence] = useState<PresenceMember[]>([]);
  const [presenceOpen, setPresenceOpen] = useState(false);

  // Owner persona: My Tasks + claim-your-tasks reconciliation.
  const [claimable, setClaimable] = useState<{ id: string; title: string; owner: string; productId: string | null }[]>([]);
  const [chosenMode, setChosenMode] = useState<Mode>(() => (ls("pdt_mode", "") as Mode) || "pm");
  const [claimOpen, setClaimOpen] = useState(false);
  const [myTaskView, setMyTaskView] = useState<"list" | "grid">(() => ls("pdt_mtview", "list") as "list" | "grid");

  // Notifications.
  const [notifs, setNotifs] = useState<{ id: string; type: string; taskId: string | null; text: string; read: boolean; createdAt: string }[]>([]);
  const [notifUnread, setNotifUnread] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);

  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const flash = useCallback((m: string) => {
    setToast(m); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(""), 2200);
  }, []);

  useEffect(() => { try { const t = localStorage.getItem("pdt_theme"); if (t) document.documentElement.setAttribute("data-theme", t); } catch {} }, []);
  function toggleTheme() {
    const cur = document.documentElement.getAttribute("data-theme");
    const dark = cur ? cur === "dark" : matchMedia("(prefers-color-scheme:dark)").matches;
    const next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next); lsSet("pdt_theme", next); setToast((t) => t);
    setTick((x) => x + 1);
  }
  const [, setTick] = useState(0);

  const loadAll = useCallback(async () => {
    const d = await api("/api/bootstrap");
    setProducts(d.products); setPickable(d.pickableProducts || d.products); setTasks(d.tasks); setActivity(d.activity); setTeams(d.teams);
    setGroups(d.groups || []);
    setHighlights(d.highlights || {});
    if (d.highlightPresets) setHlPresets(d.highlightPresets);
    if (d.organization) setOrgName(d.organization.name);
    api("/api/me/claimable").then((c) => setClaimable(c.tasks || [])).catch(() => {});
    // Initialize the Main/Groups selection once, from the remembered choice.
    if (!groupInit.current) {
      groupInit.current = true;
      if (d.activeGroupId) { setSelectedGroupId(d.activeGroupId); setGroupMode(true); }
    }
  }, []);
  // Reload through the scoped bootstrap so a PM never pulls data outside scope.
  const reloadWork = loadAll;
  const reloadProducts = loadAll;

  useEffect(() => {
    (async () => {
      try { await loadAll(); } catch (e) { flash((e as Error).message); } finally { setLoading(false); }
    })();
  }, [loadAll, flash]);

  const loadFeatureAlerts = useCallback(async () => { try { const d = await api("/api/feature-alerts"); setFeatureAlerts(d.items || []); } catch {} }, []);
  useEffect(() => { loadFeatureAlerts(); }, [loadFeatureAlerts]);
  async function dismissFeatureAlert(id: string) {
    setFeatureAlerts((cur) => cur.filter((a) => a.id !== id)); // optimistic
    try { await api(`/api/feature-alerts/${id}/dismiss`, { method: "POST", body: JSON.stringify({}) }); } catch {}
  }

  const productById = useMemo(() => { const m: Record<string, Product> = {}; products.forEach((p) => (m[p.id] = p)); return m; }, [products]);

  // Active group drives a product-set lens over every task view. Null = Main.
  const activeGroup = useMemo(() => (groupMode && selectedGroupId ? groups.find((g) => g.id === selectedGroupId) || null : null), [groupMode, selectedGroupId, groups]);
  const groupProductIds = useMemo(() => (activeGroup ? new Set(activeGroup.productIds) : null), [activeGroup]);
  const inGroup = useCallback((pid: string | null) => !groupProductIds || (!!pid && groupProductIds.has(pid)), [groupProductIds]);
  const scopedProducts = useMemo(() => (groupProductIds ? products.filter((p) => groupProductIds.has(p.id)) : products), [products, groupProductIds]);
  const scopedTasks = useMemo(() => (groupProductIds ? tasks.filter((t) => inGroup(t.productId)) : tasks), [tasks, groupProductIds, inGroup]);
  const scopedActivity = useMemo(() => {
    if (!groupProductIds) return activity;
    const ids = new Set(scopedTasks.map((t) => t.id));
    return activity.filter((a) => a.taskId && ids.has(a.taskId));
  }, [activity, groupProductIds, scopedTasks]);

  // If the selected group vanished (deleted, or not ours), fall back to Main.
  useEffect(() => {
    if (selectedGroupId && !groups.some((g) => g.id === selectedGroupId)) { setSelectedGroupId(null); setGroupMode(false); }
  }, [groups, selectedGroupId]);

  const persistActive = useCallback((id: string | null) => { api("/api/me/active-group", { method: "PATCH", body: JSON.stringify({ groupId: id }) }).catch(() => {}); }, []);
  const clearProductFilter = () => setFilters((f) => ({ ...f, product: "" }));
  function selectMain() { setGroupMode(false); clearProductFilter(); persistActive(null); }
  function selectGroups() {
    const id = selectedGroupId || groups[0]?.id || null;
    if (!id) { setGroupMode(true); setGroupsModalOpen(true); return; }
    setGroupMode(true); setSelectedGroupId(id); clearProductFilter(); persistActive(id);
  }
  function pickGroup(id: string) { setGroupMode(true); setSelectedGroupId(id); clearProductFilter(); persistActive(id); }
  function activateGroup(id: string) { setGroupMode(true); setSelectedGroupId(id); clearProductFilter(); persistActive(id); }

  // Highlights: optimistic set/clear, saved per user.
  const setHighlight = useCallback((taskId: string, color: string | null) => {
    setHighlights((prev) => { const n = { ...prev }; if (color) n[taskId] = color; else delete n[taskId]; return n; });
    api("/api/highlights", { method: "POST", body: JSON.stringify({ taskId, color }) }).catch(() => {});
  }, []);
  const hlCtx = useMemo(() => ({ color: (id: string) => highlights[id], open: (id: string, e: React.MouseEvent) => setHlMenu({ taskId: id, x: e.clientX, y: e.clientY }) }), [highlights]);

  // Presence: heartbeat and roster refresh on an interval.
  useEffect(() => {
    let live = true;
    const beat = () => { api("/api/presence", { method: "POST" }).catch(() => {}); };
    const refresh = async () => { try { const d = await api("/api/presence"); if (live) setPresence(d.members || []); } catch {} };
    beat(); refresh();
    const b = setInterval(beat, 60000);
    const r = setInterval(refresh, 30000);
    return () => { live = false; clearInterval(b); clearInterval(r); };
  }, []);
  const onlineCount = presence.filter((m) => m.online).length;
  const lastActivity = activity[0] || null;

  // Notifications: poll, mark read, open.
  const loadNotifs = useCallback(async () => { try { const d = await api("/api/notifications"); setNotifs(d.items || []); setNotifUnread(d.unread || 0); } catch {} }, []);
  useEffect(() => { loadNotifs(); const t = setInterval(loadNotifs, 30000); return () => clearInterval(t); }, [loadNotifs]);
  async function markAllNotifs() { setNotifUnread(0); setNotifs((n) => n.map((x) => ({ ...x, read: true }))); try { await api("/api/notifications", { method: "POST", body: JSON.stringify({}) }); } catch {} }
  function openNotif(n: { id: string; taskId: string | null; read: boolean }) {
    if (!n.read) { setNotifs((cur) => cur.map((x) => (x.id === n.id ? { ...x, read: true } : x))); setNotifUnread((u) => Math.max(0, u - 1)); api("/api/notifications", { method: "POST", body: JSON.stringify({ id: n.id }) }).catch(() => {}); }
    setNotifOpen(false);
    if (n.taskId) setDrawerTaskId(n.taskId);
  }
  const people = useMemo(() => { const s = new Set<string>(); scopedTasks.forEach((t) => t.owner && s.add(t.owner)); scopedProducts.forEach((p) => p.pm && s.add(p.pm)); return Array.from(s).sort(); }, [scopedTasks, scopedProducts]);
  const srList = useMemo(() => { const s = new Set<string>(); scopedTasks.forEach((t) => t.serviceRequest && s.add(t.serviceRequest)); return Array.from(s).sort(); }, [scopedTasks]);
  const pmList = useMemo(() => { const s = new Set<string>(); scopedProducts.forEach((p) => p.pm && s.add(p.pm)); return Array.from(s).sort(); }, [scopedProducts]);
  // Owner names that resolve to a real account (a member, or an owner label already linked).
  const registeredOwners = useMemo(() => {
    const s = new Set<string>();
    presence.forEach((m) => s.add(m.name.trim().toLowerCase()));
    tasks.forEach((t) => { if (t.ownerUserId && t.owner) s.add(t.owner.trim().toLowerCase()); });
    return s;
  }, [presence, tasks]);
  const myProducts = useMemo(() => scopedProducts.filter((p) => (p.pm || "").trim().toLowerCase() === me.name.trim().toLowerCase()), [scopedProducts, me.name]);
  const myOwnedTasks = useMemo(() => tasks.filter((t) => t.ownerUserId === me.id), [tasks, me.id]);
  const ownsTasks = myOwnedTasks.length > 0;
  const myReviewedTasks = useMemo(() => tasks.filter((t) => t.reviewerUserId === me.id), [tasks, me.id]);
  const reviewsTasks = myReviewedTasks.length > 0;

  // The hats this user holds. A user with more than one gets a mode switcher and
  // acts under one hat at a time (do owner work in Task Owner mode, confirm in PM
  // mode). Default order is the priority order below: PM, Task Owner, Reviewer, Viewer.
  const hats = useMemo<Mode[]>(() => {
    const h: Mode[] = [];
    if (canManage) h.push("pm");
    if (ownsTasks || claimable.length > 0 || ownerCap) h.push("owner");
    if (reviewsTasks || reviewerCap) h.push("reviewer");
    if (hasViewerHat) h.push("viewer");
    return h.length ? h : ["viewer"];
  }, [canManage, ownerCap, reviewerCap, hasViewerHat, ownsTasks, reviewsTasks, claimable.length]);
  // The active mode: the chosen one if the user still holds that hat, else the
  // strongest available. Derived so a remembered choice reappears once its hat loads.
  const mode: Mode = hats.includes(chosenMode) ? chosenMode : hats[0];
  // Effective capability under the current mode (the server still checks the real one).
  const canWrite = mode === "pm";
  const ownerActing = mode === "owner";
  const reviewerActing = mode === "reviewer";
  const canOwnerCreate = ownerActing || reviewerActing; // owners/reviewers may create tasks they own
  // Products the current user already works on (owns or reviews a task on): creating
  // on one of these goes live, on anything else it needs PM approval.
  const involvedProductIds = useMemo(() => new Set(tasks.filter((t) => t.ownerUserId === me.id || t.reviewerUserId === me.id).map((t) => t.productId).filter(Boolean) as string[]), [tasks, me.id]);
  const pendingForMe = useMemo(() => scopedTasks.filter((t) => t.pending), [scopedTasks]);
  function pickMode(m: Mode) {
    setChosenMode(m); lsSet("pdt_mode", m);
    setProductBoardId(null);
    setView(m === "owner" ? "mytasks" : m === "reviewer" ? "myreviews" : "board");
  }

  // Tabs follow the active mode: PM mode shows the management tabs and Owner
  // Feedbacks; Viewer mode the org-wide read-only tabs; Task Owner mode just My Tasks.
  const tabDefs = useMemo<[MainView, string][]>(() => {
    if (mode === "owner") return [["mytasks", "My Tasks"]];
    if (mode === "reviewer") return [["myreviews", "My Reviews"]];
    if (mode === "viewer") return [["board", "Main Board"], ["products", "Products"], ["report", "Weekly report"], ["sheet", "Sheet"]];
    // pm mode
    const base: [MainView, string][] = pmScoped
      ? [["board", "My Main Board"], ["myproducts", "My Products"], ["activity", "My Activity"]]
      : [["board", "Main Board"], ["myproducts", "My Products"], ["products", "Products"], ["sheet", "Sheet"], ["report", "Weekly report"], ["activity", "Activity"]];
    if (pendingForMe.length) base.push(["approvals", "Approvals"]);
    base.push(["feedbacks", "Owner Feedbacks"]);
    return base;
  }, [mode, pmScoped, pendingForMe.length]);
  // Keep the active tab valid when the mode (and so the tab set) changes.
  useEffect(() => {
    if (tabDefs.length && !tabDefs.some(([v]) => v === view)) setView(tabDefs[0][0]);
  }, [tabDefs, view]);
  const teamOptions = useMemo(() => { const s = new Set<string>(); teams.forEach((t) => s.add(t)); tasks.forEach((t) => t.team && s.add(t.team)); return Array.from(s); }, [teams, tasks]);

  const dispName = useCallback((id: string | null) => productDisplay(id ? productById[id] : null), [productById]);

  const visible = useMemo(() => {
    let arr = scopedTasks;
    if (asOf) arr = arr.filter((t) => existsAsOf(t, asOf));
    return arr.filter((t) => {
      if (filters.team && t.team !== filters.team) return false;
      if (filters.product && t.productId !== filters.product) return false;
      if (filters.owner && t.owner !== filters.owner) return false;
      if (filters.sr && (t.serviceRequest || "") !== filters.sr) return false;
      if (filters.pm) { const p = t.productId ? productById[t.productId] : null; if ((p?.pm || "") !== filters.pm) return false; }
      if (filters.status) { const e = effectiveStatus(t, asOf || null, activity); if (e.status !== filters.status) return false; }
      if (filters.q) {
        const h = `${t.title} ${t.owner} ${dispName(t.productId)} ${t.serviceRequest || ""} ${t.blocker || ""}`.toLowerCase();
        if (!h.includes(filters.q.toLowerCase())) return false;
      }
      return true;
    });
  }, [scopedTasks, filters, asOf, activity, dispName]);

  const cmpTasks = useCallback((a: Task, b: Task) => {
    switch (boardSort) {
      case "due": return (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
      case "status": { const ea = effectiveStatus(a, asOf || null, activity), eb = effectiveStatus(b, asOf || null, activity); return ORDER.indexOf(ea.status) - ORDER.indexOf(eb.status) || (a.dueDate || "").localeCompare(b.dueDate || ""); }
      case "owner": return (a.owner || "").localeCompare(b.owner || "");
      case "product": return dispName(a.productId).localeCompare(dispName(b.productId));
      case "updated": return (b.updatedAt || "").localeCompare(a.updatedAt || "");
      default: return priorityOf(a) - priorityOf(b) || (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
    }
  }, [boardSort, asOf, activity, dispName]);

  async function logout() { await api("/api/auth/logout", { method: "POST" }); router.push("/login"); router.refresh(); }

  function moveStatus(id: string, ns: StatusKey) {
    const t = tasks.find((x) => x.id === id); if (!t || t.status === ns || asOf) return;
    // Moving out of Not started needs a start and due date: open the editor to fill them.
    if (ns !== "NOT_STARTED" && (!t.startDate || !t.dueDate)) {
      setTaskModal({ open: true, editing: t, preStatus: ns });
      flash(`Set a start and due date to move this to ${statusMeta(ns).label}`);
      return;
    }
    // A blocked task needs a reason: open the editor to capture it.
    if (ns === "BLOCKED" && !(t.blocker || "").trim()) {
      setTaskModal({ open: true, editing: t, preStatus: ns });
      flash("Add a reason for the blocker to mark this Blocked");
      return;
    }
    // Confirm the move before it is applied.
    setMoveConfirm({ id, ns, title: t.title, from: t.status });
  }
  async function performMove(id: string, ns: StatusKey) {
    setTasks((prev) => prev.map((x) => (x.id === id ? { ...x, status: ns } : x))); // optimistic
    try { await api(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ status: ns }) }); await reloadWork(); flash(`Moved to ${statusMeta(ns).label}`); }
    catch (e) { flash((e as Error).message); reloadWork(); }
  }

  // ---- export ----
  function eventText(a: Activity): string {
    if (a.type === "created") return `Created (${a.toStatus ? statusMeta(a.toStatus).label : ""})`;
    if (a.type === "status") return `Moved ${a.fromStatus ? statusMeta(a.fromStatus).label + " to " : "to "}${a.toStatus ? statusMeta(a.toStatus).label : ""}`;
    if (a.type === "note") return `Update: ${a.content || ""}`;
    return a.content || "Updated";
  }
  function doExport() {
    if (view === "report") { exportReport(); return; }
    const header: unknown[][] = [];
    if (asOf) header.push([`VIEW FROM ${fmtDate(asOf + "T12:00:00")} (close of business). Historical, not live`]);
    header.push(["Exported", new Date().toLocaleString(), asOf ? `As of ${asOf}` : "Live"]);
    header.push([]);
    const rows: unknown[][] = [["Task", "Context", "Product", "Task Owner", "Start date", "Due date", "Status", "Latest update", "Priority", "Team", "Service request", "Blocker", "Created by"]];
    visible.slice().sort(cmpTasks).forEach((t) => {
      const e = effectiveStatus(t, asOf || null, activity); const lu = lastUpdateFor(t.id, activity);
      rows.push([t.title, t.context || "", dispName(t.productId), t.owner, isoToYMD(t.startDate), isoToYMD(t.dueDate), statusMeta(e.status).label, lu ? fmtTs(lu.ts) : "", `Level ${priorityOf(t)}`, t.team, t.serviceRequest || "", t.blocker || "", t.createdBy || ""]);
    });
    downloadCSV(`prodboard${asOf ? "-asof-" + asOf : ""}.csv`, [...header, ...rows]);
  }
  function exportReport() {
    const fromT = new Date(range.from + "T00:00:00").getTime(); const toT = new Date(range.to + "T23:59:59.999").getTime();
    const moved = scopedActivity.filter((a) => { const ts = new Date(a.ts).getTime(); return ts >= fromT && ts <= toT && a.type !== "product"; }).sort((a, b) => +new Date(a.ts) - +new Date(b.ts));
    const header: unknown[][] = [["Weekly delivery report"], ["Period", `${fmtDate(range.from + "T12:00:00")} to ${fmtDate(range.to + "T12:00:00")}`], ["Generated", new Date().toLocaleString()], []];
    const rows: unknown[][] = [["Service request", "Product", "Task", "Event", "By", "When", "Resulting status"]];
    moved.forEach((a) => { const t = tasks.find((x) => x.id === a.taskId); rows.push([t?.serviceRequest || "General / no request", dispName(t?.productId ?? null), t?.title || a.taskTitle || "", eventText(a), a.author || "", fmtTs(a.ts), a.toStatus ? statusMeta(a.toStatus).label : ""]); });
    downloadCSV(`weekly-report-${range.from}-to-${range.to}.csv`, [...header, ...rows]);
  }

  const drawerTask = drawerTaskId ? tasks.find((t) => t.id === drawerTaskId) || null : null;

  return (
    <HLContext.Provider value={hlCtx}>
      <div className="app">
      <div className="brand">
        <Link href="/" className="logo" style={{ textDecoration: "none", color: "inherit" }} title="Go to ProdBoard home" aria-label="ProdBoard home">
          <BrandLogo height={30} sub={orgName ? `Organization: ${orgName}` : "Tech delivery visibility"} />
        </Link>
        <div className="spacer" />
        {lastActivity && <div className="lastupd" title={`${eventText(lastActivity)} by ${lastActivity.author}`}><span className="lu-k">Last update</span><span className="lu-v">{relTime(lastActivity.ts)}{lastActivity.author ? ` · ${lastActivity.author}` : ""}</span></div>}
        <button className="presencepill" onClick={() => setPresenceOpen((o) => !o)} title="Who is online" aria-label="Who is online"><span className="live-dot" />{onlineCount} online</button>
        <button className="bellbtn" onClick={() => { setNotifOpen((o) => !o); }} title="Notifications" aria-label={`Notifications${notifUnread ? `, ${notifUnread} unread` : ""}`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
          {notifUnread > 0 ? <span className="bellcount">{notifUnread > 9 ? "9+" : notifUnread}</span> : null}
        </button>
        <div className="whoami"><button className="linklike" style={{ fontWeight: 600, color: "var(--fg)" }} title="Edit your name" onClick={() => setProfileOpen(true)}>{me.name}</button><span className="rolepill">{heldRoleLabels.join(" + ")}</span></div>
        {hats.length > 1 && (
          <label className="modepick" title="Switch which hat you are acting under">
            <span className="modepick-k">Mode:</span>
            <select value={mode} onChange={(e) => pickMode(e.target.value as Mode)} aria-label="Mode">
              {hats.map((h) => <option key={h} value={h}>{MODE_LABEL[h]}</option>)}
            </select>
          </label>
        )}
        <button className="btn ghost sm" onClick={() => setInviteOpen(true)}>Invite</button>
        {isAdmin && mode === "pm" && <button className="btn ghost sm" onClick={() => setMembersOpen(true)}>Members</button>}
        {isAdmin && mode === "pm" && <button className="btn ghost sm" onClick={() => setAlertsManageOpen(true)}>Alerts</button>}
        <button className="iconbtn" title="Toggle light / dark" onClick={toggleTheme} aria-label="Toggle theme">◐</button>
        <button className="btn ghost sm" onClick={logout}>Sign out</button>
      </div>

      <div className="controls">
        <div className="tabs" role="tablist">
          {tabDefs.map(([v, label]) => (
            <button key={v} className="tab" role="tab" aria-selected={view === v} onClick={() => { setView(v); setProductBoardId(null); }}>
              {label}
              {v === "board" && !loading ? <span className="cnt">({visible.filter((t) => !t.pending).length})</span> : null}
              {v === "activity" && scopedActivity.length ? <span className="cnt">({scopedActivity.length})</span> : null}
              {v === "approvals" && pendingForMe.length ? <span className="cnt">({pendingForMe.length})</span> : null}
            </button>
          ))}
        </div>

        <div className="groupbar">
          <div className="segmented sm">
            <button aria-pressed={!groupMode} onClick={selectMain}>Main</button>
            <button aria-pressed={groupMode} onClick={selectGroups}>Groups</button>
          </div>
          {groupMode && (
            <div className="grouppanel">
              {groups.length === 0 ? (
                <span className="hint">No groups yet. Create one to view a set of products together.</span>
              ) : (
                <div className="grouppills">
                  {groups.map((g) => (
                    <button key={g.id} className={`gpill${selectedGroupId === g.id ? " on" : ""}`} onClick={() => pickGroup(g.id)} title={`${g.productIds.length} product${g.productIds.length === 1 ? "" : "s"}`}>
                      {g.name}<span className="gcount">{g.productIds.length}</span>
                    </button>
                  ))}
                </div>
              )}
              <span className="grow" />
              <button className="btn ghost sm" onClick={() => setGroupsModalOpen(true)}>Manage groups</button>
            </div>
          )}
        </div>

        {view !== "activity" && view !== "products" && view !== "myproducts" && view !== "feedbacks" && (
          <div className="filterrow">
            <input type="search" placeholder="Search tasks…" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
            <select value={filters.team} onChange={(e) => setFilters({ ...filters, team: e.target.value })} aria-label="Team"><option value="">All teams</option>{teamOptions.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            <select value={filters.product} onChange={(e) => setFilters({ ...filters, product: e.target.value })} aria-label="Product"><option value="">{activeGroup ? "All in group" : "All products"}</option>{[...scopedProducts].sort((a, b) => productOption(a).localeCompare(productOption(b))).map((p) => <option key={p.id} value={p.id}>{productOption(p)}</option>)}</select>
            <select value={filters.owner} onChange={(e) => setFilters({ ...filters, owner: e.target.value })} aria-label="Owner"><option value="">All owners</option>{people.map((o) => <option key={o} value={o}>{o}</option>)}</select>
            <select value={filters.sr} onChange={(e) => setFilters({ ...filters, sr: e.target.value })} aria-label="Service request"><option value="">All requests</option>{srList.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            {!pmScoped && <select value={filters.pm} onChange={(e) => setFilters({ ...filters, pm: e.target.value })} aria-label="Manager"><option value="">All managers</option>{pmList.map((p) => <option key={p} value={p}>{p}</option>)}</select>}
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })} aria-label="Status"><option value="">All statuses</option><option value="NOT_STARTED">Not started</option><option value="IN_PROGRESS">In progress</option><option value="BLOCKED">Blocked</option><option value="IN_REVIEW">In review</option><option value="COMPLETE">Complete</option><option value="OVERDUE">Overdue</option></select>
            <button className="btn ghost sm" onClick={() => setFilters(EMPTY_FILTERS)}>Clear</button>
            <span className="grow" />
            <div className="tt"><label htmlFor="asof">As of</label><input id="asof" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></div>
            <button className="btn sm" onClick={doExport}>Export CSV</button>
            {isAdmin && <button className="btn sm" onClick={() => setTaskImportOpen(true)}>Import tasks</button>}
            {(canWrite || canOwnerCreate) && <button className="btn primary sm" onClick={() => setTaskModal({ open: true, editing: null, ownerCreate: !canWrite })}>+ Task</button>}
          </div>
        )}
      </div>

      <div className="appscroll">
      {asOf && (
        <div className="asof-banner">
          <span>⏱ Historical view. Board shown as of close of business</span>
          <span className="tag">VIEW FROM {fmtDate(asOf + "T12:00:00")}</span>
          <button className="btn ghost sm" onClick={() => setAsOf("")}>Back to live</button>
        </div>
      )}

      <main>
        {featureAlerts.length > 0 && (
          <div className="fa-stack">
            {featureAlerts.map((a) => (
              <div className="fa-card" key={a.id}>
                <div className="fa-main">
                  <div className="fa-title"><span className="fa-tag">New</span>{a.title}</div>
                  <div className="fa-body">{a.body}</div>
                  {a.linkUrl ? <a className="fa-link" href={a.linkUrl} target="_blank" rel="noopener noreferrer">{a.linkLabel || "Learn more"}</a> : null}
                </div>
                <button className="btn sm" onClick={() => dismissFeatureAlert(a.id)}>Got it</button>
              </div>
            ))}
          </div>
        )}
        {loading ? <div className="empty"><h3>Loading…</h3></div>
          : productBoardId ? <ProductBoard product={productById[productBoardId]} tasks={tasks.filter((t) => t.productId === productBoardId)} asOf={asOf} activity={activity} pbView={pbView} setPbView={(v) => { setPbView(v); lsSet("pdt_pbview", v); }} boardSort={boardSort} setBoardSort={(s) => { setBoardSort(s); lsSet("pdt_bsort", s); }} cmpTasks={cmpTasks} dispName={dispName} canWrite={canWrite} onBack={() => setProductBoardId(null)} onOpenTask={setDrawerTaskId} onAdd={() => setTaskModal({ open: true, editing: null, preProduct: productBoardId })} onMove={moveStatus} onHlPresets={() => setHlPresetsOpen(true)} />
          : view === "board" ? <Board tasks={visible.filter((t) => !t.pending)} allCount={scopedTasks.filter((t) => !t.pending).length} asOf={asOf} activity={activity} boardView={boardView} setBoardView={(v) => { setBoardView(v); lsSet("pdt_bview", v); }} boardSort={boardSort} setBoardSort={(s) => { setBoardSort(s); lsSet("pdt_bsort", s); }} cmpTasks={cmpTasks} dispName={dispName} canWrite={canWrite} onOpenTask={setDrawerTaskId} onMove={moveStatus} onHlPresets={() => setHlPresetsOpen(true)} />
          : view === "products" || view === "myproducts" ? <ProductsView products={view === "myproducts" ? myProducts : scopedProducts} tasks={scopedTasks} layout={productLayout} setLayout={(l) => { setProductLayout(l); lsSet("pdt_plo", l); }} sort={productSort} setSort={(s) => { setProductSort(s); lsSet("pdt_psort", s); }} query={productQuery} setQuery={setProductQuery} showDecom={showDecom} setShowDecom={setShowDecom} canWrite={canWrite} isAdmin={isAdmin} onCreate={() => setProdCreateOpen(true)} onImport={() => setImportOpen(true)} onSettings={setProdSettings} onDetail={setDetailProduct} onAdd={(pid) => setTaskModal({ open: true, editing: null, preProduct: pid })} onDecom={toggleDecom} />
          : view === "mytasks" ? <MyTasksView tasks={visible.filter((t) => t.ownerUserId === me.id)} activity={activity} asOf={asOf} cmpTasks={cmpTasks} dispName={dispName} tview={myTaskView} setTview={(v) => { setMyTaskView(v); lsSet("pdt_mtview", v); }} onOpenTask={setDrawerTaskId} claimableCount={claimable.length} onClaim={() => setClaimOpen(true)} />
          : view === "myreviews" ? <MyReviewsView tasks={visible.filter((t) => t.reviewerUserId === me.id)} activity={activity} asOf={asOf} cmpTasks={cmpTasks} dispName={dispName} tview={myTaskView} setTview={(v) => { setMyTaskView(v); lsSet("pdt_mtview", v); }} onOpenTask={setDrawerTaskId} />
          : view === "sheet" ? <Sheet tasks={visible.filter((t) => !t.pending)} asOf={asOf} activity={activity} dispName={dispName} onOpenTask={setDrawerTaskId} />
          : view === "approvals" ? <ApprovalsView tasks={pendingForMe} activity={activity} dispName={dispName} onOpenTask={setDrawerTaskId} />
          : view === "feedbacks" ? <FeedbacksView tasks={scopedTasks.filter((t) => t.ownerDoneAt && !t.pending)} activity={activity} dispName={dispName} onOpenTask={setDrawerTaskId} />
          : view === "report" ? <Report tasks={scopedTasks.filter((t) => !t.pending)} activity={scopedActivity} dispName={dispName} range={range} setRange={setRange} eventText={eventText} />
          : <Feed activity={scopedActivity} tasks={scopedTasks} />}
      </main>
      </div>
      </div>

      {taskModal.open && (
        <TaskModal editing={taskModal.editing} preProduct={taskModal.preProduct ?? null} preStatus={taskModal.preStatus ?? null} products={products} teamOptions={teamOptions} people={people} registered={registeredOwners} srList={srList} tasks={tasks}
          ownerMode={!!taskModal.ownerCreate} meName={me.name} pickProducts={pickable} involvedIds={involvedProductIds}
          onClose={() => setTaskModal({ open: false, editing: null })}
          onAddTeam={async (name) => { try { const r = await api("/api/teams", { method: "POST", body: JSON.stringify({ name }) }); setTeams(r.teams); return r.teams as string[]; } catch (e) { flash((e as Error).message); return teamOptions; } }}
          onSaved={async (msg) => { setTaskModal({ open: false, editing: null }); await reloadWork(); flash(msg); }} />
      )}

      {drawerTask && (
        <TaskDrawer task={drawerTask} activity={activity} dispName={dispName} asOf={asOf} canWrite={canWrite} ownerActing={ownerActing} reviewerActing={reviewerActing} meId={me.id} meName={me.name} members={presence}
          onClose={() => setDrawerTaskId(null)}
          onEdit={(t) => { setDrawerTaskId(null); setTaskModal({ open: true, editing: t, ownerCreate: canOwnerCreate }); }}
          onPosted={async (msg) => { await reloadWork(); flash(msg); }} />
      )}

      {detailProduct && productById[detailProduct] && (
        <ProductDetail product={productById[detailProduct]} tasks={tasks.filter((t) => t.productId === detailProduct)} activity={activity} asOf={asOf} canWrite={canWrite}
          onClose={() => setDetailProduct(null)}
          onOpenTask={(id) => { setDetailProduct(null); setDrawerTaskId(id); }}
          onBoard={() => { const id = detailProduct; setDetailProduct(null); setProductBoardId(id); }}
          onAdd={() => { const id = detailProduct; setTaskModal({ open: true, editing: null, preProduct: id }); }}
          onSettings={() => { const id = detailProduct; setDetailProduct(null); setProdSettings(id); }} />
      )}

      {prodCreateOpen && (
        <ProductCreateModal people={people} onClose={() => setProdCreateOpen(false)}
          onCreate={async (body) => { try { await api("/api/products", { method: "POST", body: JSON.stringify(body) }); setProdCreateOpen(false); await reloadProducts(); flash("Product added"); } catch (e) { flash((e as Error).message); } }} />
      )}

      {prodSettings && productById[prodSettings] && (
        <ProductSettingsModal product={productById[prodSettings]} people={people} isAdmin={isAdmin} onClose={() => setProdSettings(null)}
          onSave={async (body) => { try { await api(`/api/products/${prodSettings}`, { method: "PATCH", body: JSON.stringify(body) }); setProdSettings(null); await reloadProducts(); flash("Product updated"); } catch (e) { flash((e as Error).message); } }}
          onDecom={async () => { const id = prodSettings; setProdSettings(null); await toggleDecom(id); }} />
      )}

      {profileOpen && <ProfileModal currentName={me.name} onClose={() => setProfileOpen(false)} onSaved={async (msg) => { setProfileOpen(false); flash(msg); await loadAll(); router.refresh(); }} flash={flash} />}

      {importOpen && <ImportModal onClose={() => setImportOpen(false)} onDone={async (msg) => { setImportOpen(false); await reloadProducts(); flash(msg); }} flash={flash} />}

      {taskImportOpen && <TaskImportModal onClose={() => setTaskImportOpen(false)} onDone={async (msg) => { setTaskImportOpen(false); await loadAll(); flash(msg); }} flash={flash} />}

      {moveConfirm && (
        <ConfirmAction
          title="Move this task?"
          message={<>Move <b>{moveConfirm.title}</b> from <b>{statusMeta(moveConfirm.from).label}</b> to <b>{statusMeta(moveConfirm.ns).label}</b>?</>}
          confirmLabel={`Move to ${statusMeta(moveConfirm.ns).label}`}
          busy={moveBusy}
          onConfirm={async () => { const mc = moveConfirm; setMoveBusy(true); await performMove(mc.id, mc.ns); setMoveBusy(false); setMoveConfirm(null); }}
          onCancel={() => { if (!moveBusy) setMoveConfirm(null); }}
        />
      )}
      {inviteOpen && <InviteModal onClose={() => setInviteOpen(false)} flash={flash} />}

      {membersOpen && <MembersModal meId={me.id} onClose={() => setMembersOpen(false)} flash={flash} />}
      {alertsManageOpen && <FeatureAlertsModal onClose={() => setAlertsManageOpen(false)} flash={flash} onChanged={loadFeatureAlerts} />}

      {groupsModalOpen && <GroupsModal groups={groups} products={products} onClose={() => setGroupsModalOpen(false)} onChanged={reloadWork} onActivate={activateGroup} flash={flash} />}

      {presenceOpen && <PresencePanel members={presence} meId={me.id} onClose={() => setPresenceOpen(false)} />}

      {notifOpen && <NotificationPanel items={notifs} unread={notifUnread} onOpenItem={openNotif} onMarkAll={markAllNotifs} onSettings={() => { setNotifOpen(false); setNotifPrefsOpen(true); }} onClose={() => setNotifOpen(false)} />}

      {notifPrefsOpen && <NotificationsModal onClose={() => setNotifPrefsOpen(false)} flash={flash} />}

      {claimOpen && <ClaimModal productById={productById} onClose={() => setClaimOpen(false)} flash={flash} onClaimed={async () => { await reloadWork(); api("/api/me/claimable").then((c) => setClaimable(c.tasks || [])).catch(() => {}); }} />}

      {hlMenu && <HighlightMenu taskId={hlMenu.taskId} x={hlMenu.x} y={hlMenu.y} presets={hlPresets} current={highlights[hlMenu.taskId]} onPick={(c) => { setHighlight(hlMenu.taskId, c); setHlMenu(null); }} onEditPresets={() => { setHlMenu(null); setHlPresetsOpen(true); }} onClose={() => setHlMenu(null)} />}

      {hlPresetsOpen && <HighlightPresetsModal presets={hlPresets} onClose={() => setHlPresetsOpen(false)} onSaved={(p) => { setHlPresets(p); setHlPresetsOpen(false); flash("Highlight presets saved"); }} flash={flash} />}

      {toast && <div className="toast">{toast}</div>}
    </HLContext.Provider>
  );

  async function toggleDecom(id: string) {
    const p = productById[id]; if (!p) return;
    try { await api(`/api/products/${id}`, { method: "PATCH", body: JSON.stringify({ decommissioned: !p.decommissioned }) }); await reloadProducts(); flash(p.decommissioned ? "Product recommissioned" : "Product decommissioned"); }
    catch (e) { flash((e as Error).message); }
  }
}

// ---------------- Board ----------------
// A task's timeline: start to due when a start date exists, otherwise just the due date.
function timelineText(t: Task): string {
  if (!t.dueDate && !t.startDate) return "Not scheduled";
  const due = t.dueDate ? fmtDate(t.dueDate) : "";
  const start = t.startDate ? fmtDate(t.startDate) : "";
  if (start && due) return start !== due ? `${start} to ${due}` : due;
  return due || start;
}
function cardMeta(t: Task, dispName: (id: string | null) => string, overdue: boolean) {
  return (
    <>
      <div className="meta">
        <span>{dispName(t.productId)}</span>
        <span className="who">{t.owner || "-"}</span>
        <span>{t.team}</span>
        {t.serviceRequest ? <span className="sr">{t.serviceRequest}</span> : null}
      </div>
      <div className="meta">
        <span style={{ opacity: 0.7 }}>Timeline:</span>
        <span className="tnum" style={overdue ? { color: "var(--s-overdue)", fontWeight: 600 } : undefined}>{timelineText(t)}</span>
      </div>
      {t.blocker ? <div className="meta"><span style={{ color: "var(--s-overdue)" }}>⚑ {t.blocker}</span></div> : null}
    </>
  );
}

function ViewSwitch({ value, onChange }: { value: BoardView; onChange: (v: BoardView) => void }) {
  return (
    <div className="segmented">
      <button data-on={value === "kanban"} aria-pressed={value === "kanban"} onClick={() => onChange("kanban")}>Kanban</button>
      <button aria-pressed={value === "list"} onClick={() => onChange("list")}>List</button>
      <button aria-pressed={value === "grid"} onClick={() => onChange("grid")}>Card grid</button>
    </div>
  );
}
// A compact "View" dropdown for the products toolbar: two options, Cards or List.
function ViewMenu({ value, onChange }: { value: "cards" | "list"; onChange: (v: "cards" | "list") => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const pick = (v: "cards" | "list") => { onChange(v); setOpen(false); };
  return (
    <div className="viewmenu" ref={ref}>
      <button type="button" className="btn sm viewbtn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
        View <span className="caret">▾</span>
      </button>
      {open && (
        <div className="viewpop" role="menu">
          <button type="button" role="menuitemradio" aria-checked={value === "cards"} className={value === "cards" ? "on" : ""} onClick={() => pick("cards")}>Cards</button>
          <button type="button" role="menuitemradio" aria-checked={value === "list"} className={value === "list" ? "on" : ""} onClick={() => pick("list")}>List</button>
        </div>
      )}
    </div>
  );
}
function SortSelect({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  return (
    <>
      <label className="hint" htmlFor="bsort">Sort</label>
      <select id="bsort" value={value} onChange={(e) => onChange(e.target.value)} style={{ padding: "6px 9px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)" }}>
        {BSORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </>
  );
}

function KanbanBoard({ tasks, activity, asOf, cmpTasks, dispName, canWrite, onOpenTask, onMove }: {
  tasks: Task[]; activity: Activity[]; asOf: string; cmpTasks: (a: Task, b: Task) => number; dispName: (id: string | null) => string; canWrite: boolean; onOpenTask: (id: string) => void; onMove: (id: string, ns: StatusKey) => void;
}) {
  const hl = useHl();
  const [over, setOver] = useState<string | null>(null);
  const drag = useRef<string | null>(null);
  const groups: Record<string, Task[]> = {}; REAL.forEach((s) => (groups[s] = []));
  tasks.forEach((t) => { (groups[t.status] = groups[t.status] || []).push(t); });
  const canDrag = canWrite && !asOf;
  return (
    <div className="board">
      {REAL.map((s) => {
        const g = [...(groups[s] || [])].sort(cmpTasks);
        return (
          <div key={s} className={`col${over === s ? " drophover" : ""}`}
            onDragOver={(e) => { if (canDrag) { e.preventDefault(); setOver(s); } }}
            onDragLeave={() => setOver((o) => (o === s ? null : o))}
            onDrop={(e) => { e.preventDefault(); setOver(null); const id = drag.current || e.dataTransfer.getData("text/plain"); if (id) onMove(id, s); drag.current = null; }}>
            <h3><Chip status={s} /><span className="n tnum">{g.length}</span></h3>
            <div className="cards">
              {g.map((t) => {
                const e = effectiveStatus(t, asOf || null, activity);
                const c = hl.color(t.id);
                return (
                  <div key={t.id} className="card" draggable={canDrag}
                    style={{ ["--sc" as string]: `var(${e.overdue ? "--s-overdue" : statusMeta(t.status).colorVar})`, ...(c ? { background: hlTint(c) } : {}) }}
                    onDragStart={(ev) => { drag.current = t.id; try { ev.dataTransfer.setData("text/plain", t.id); ev.dataTransfer.effectAllowed = "move"; } catch {} }}
                    onDragEnd={() => { drag.current = null; }}
                    onClick={() => onOpenTask(t.id)}>
                    <div className="tt-row"><div className="title">{t.title}</div><span className="tt-actions"><PrBadge t={t} /><HighlightDot color={c} onClick={(ev) => hl.open(t.id, ev)} /></span></div>
                    {e.overdue ? <div style={{ marginTop: 6 }}><Chip status="OVERDUE" /></div> : null}
                    {cardMeta(t, dispName, e.overdue)}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GridBoard({ tasks, activity, asOf, cmpTasks, dispName, onOpenTask }: { tasks: Task[]; activity: Activity[]; asOf: string; cmpTasks: (a: Task, b: Task) => number; dispName: (id: string | null) => string; onOpenTask: (id: string) => void; }) {
  const hl = useHl();
  const arr = [...tasks].sort(cmpTasks);
  return (
    <div className="board-grid">
      {arr.map((t) => { const e = effectiveStatus(t, asOf || null, activity); const c = hl.color(t.id); return (
        <div key={t.id} className="card" style={{ ["--sc" as string]: `var(${statusMeta(e.status).colorVar})`, ...(c ? { background: hlTint(c) } : {}) }} onClick={() => onOpenTask(t.id)}>
          <div className="tt-row"><div className="title">{t.title}</div><span className="tt-actions"><PrBadge t={t} /><HighlightDot color={c} onClick={(ev) => hl.open(t.id, ev)} /></span></div>
          <div style={{ marginTop: 6, display: "flex", gap: 6, alignItems: "center" }}><Chip status={e.status} />{t.pending ? <span className="awaitpill">Pending</span> : null}</div>
          {cardMeta(t, dispName, e.overdue)}
        </div>
      ); })}
    </div>
  );
}

function ListBoard({ tasks, activity, asOf, cmpTasks, dispName, onOpenTask }: { tasks: Task[]; activity: Activity[]; asOf: string; cmpTasks: (a: Task, b: Task) => number; dispName: (id: string | null) => string; onOpenTask: (id: string) => void; }) {
  const hl = useHl();
  const arr = [...tasks].sort(cmpTasks);
  return (
    <div className="sheetwrap">
      <table className="sheet">
        <thead><tr><th aria-label="Highlight"></th><th>Pri</th><th>Task</th><th>Product</th><th>Owner</th><th>Team</th><th>Status</th><th>Timeline</th><th>Request</th><th>Last update</th></tr></thead>
        <tbody>
          {arr.map((t) => { const e = effectiveStatus(t, asOf || null, activity); const lu = lastUpdateFor(t.id, activity); const c = hl.color(t.id); return (
            <tr key={t.id} className="rowbtn" style={c ? { background: hlTint(c) } : undefined} onClick={() => onOpenTask(t.id)}>
              <td><HighlightDot color={c} onClick={(ev) => hl.open(t.id, ev)} /></td>
              <td><PrBadge t={t} /></td>
              <td><div className="title">{t.title}{t.pending ? <span className="awaitpill" style={{ marginLeft: 6 }}>Pending</span> : null}</div>{t.blocker ? <div className="hint" style={{ color: "var(--s-overdue)" }}>⚑ {t.blocker}</div> : null}</td>
              <td>{dispName(t.productId)}</td><td>{t.owner || "-"}</td><td>{t.team}</td>
              <td><Chip status={e.status} /></td>
              <td className={`tnum due ${e.overdue ? "late" : ""}`}>{timelineText(t)}</td>
              <td>{t.serviceRequest ? <span className="sr">{t.serviceRequest}</span> : <span className="hint">-</span>}</td>
              <td className="hint tnum">{lu ? relTime(lu.ts) : "-"}</td>
            </tr>
          ); })}
        </tbody>
      </table>
    </div>
  );
}

function Board(props: { tasks: Task[]; allCount: number; asOf: string; activity: Activity[]; boardView: BoardView; setBoardView: (v: BoardView) => void; boardSort: string; setBoardSort: (s: string) => void; cmpTasks: (a: Task, b: Task) => number; dispName: (id: string | null) => string; canWrite: boolean; onOpenTask: (id: string) => void; onMove: (id: string, ns: StatusKey) => void; onHlPresets: () => void; }) {
  const { tasks, allCount, asOf, activity, boardView, setBoardView, boardSort, setBoardSort, cmpTasks, dispName, canWrite, onOpenTask, onMove, onHlPresets } = props;
  return (
    <>
      <div className="pbbar">
        <ViewSwitch value={boardView} onChange={setBoardView} />
        {boardView !== "kanban" && <SortSelect value={boardSort} onChange={setBoardSort} />}
        <span className="grow" />
        <HighlightPresetButton onClick={onHlPresets} />
      </div>
      {!tasks.length ? (
        <div className="empty"><h3>{allCount ? "No tasks match these filters" : "No tasks yet"}</h3><p>{allCount ? "Adjust or clear the filters to see more." : canWrite ? "Add the first deliverable with + Task." : "Nothing has been added yet."}</p></div>
      ) : boardView === "kanban" ? <KanbanBoard tasks={tasks} activity={activity} asOf={asOf} cmpTasks={cmpTasks} dispName={dispName} canWrite={canWrite} onOpenTask={onOpenTask} onMove={onMove} />
        : boardView === "grid" ? <GridBoard tasks={tasks} activity={activity} asOf={asOf} cmpTasks={cmpTasks} dispName={dispName} onOpenTask={onOpenTask} />
        : <ListBoard tasks={tasks} activity={activity} asOf={asOf} cmpTasks={cmpTasks} dispName={dispName} onOpenTask={onOpenTask} />}
    </>
  );
}

function ProductBoard(props: { product?: Product; tasks: Task[]; asOf: string; activity: Activity[]; pbView: BoardView; setPbView: (v: BoardView) => void; boardSort: string; setBoardSort: (s: string) => void; cmpTasks: (a: Task, b: Task) => number; dispName: (id: string | null) => string; canWrite: boolean; onBack: () => void; onOpenTask: (id: string) => void; onAdd: () => void; onMove: (id: string, ns: StatusKey) => void; onHlPresets: () => void; }) {
  const { product, tasks, asOf, activity, pbView, setPbView, boardSort, setBoardSort, cmpTasks, dispName, canWrite, onBack, onOpenTask, onAdd, onMove, onHlPresets } = props;
  if (!product) { onBack(); return null; }
  return (
    <>
      <div className="pbbar">
        <button className="btn ghost sm" onClick={onBack}>← Main Board</button>
        <div className="pbtitle">Product Board: <b>{productDisplay(product)}</b></div>
        <span className="grow" />
        <ViewSwitch value={pbView} onChange={setPbView} />
        {pbView !== "kanban" && <SortSelect value={boardSort} onChange={setBoardSort} />}
        <HighlightPresetButton onClick={onHlPresets} />
        {product.decommissioned ? <span className="decbadge" style={{ margin: 0 }}>Decommissioned</span> : canWrite ? <button className="btn primary sm" onClick={onAdd}>+ Task</button> : null}
      </div>
      {!tasks.length ? (
        <div className="empty"><h3>No tasks in this product</h3><p>{product.decommissioned ? "This product is decommissioned." : "Add the first task with + Task. It also appears on the Main Board."}</p></div>
      ) : pbView === "kanban" ? <KanbanBoard tasks={tasks} activity={activity} asOf={asOf} cmpTasks={cmpTasks} dispName={dispName} canWrite={canWrite} onOpenTask={onOpenTask} onMove={onMove} />
        : pbView === "grid" ? <GridBoard tasks={tasks} activity={activity} asOf={asOf} cmpTasks={cmpTasks} dispName={dispName} onOpenTask={onOpenTask} />
        : <ListBoard tasks={tasks} activity={activity} asOf={asOf} cmpTasks={cmpTasks} dispName={dispName} onOpenTask={onOpenTask} />}
    </>
  );
}

// ---------------- Sheet ----------------
function Sheet({ tasks, asOf, activity, dispName, onOpenTask }: { tasks: Task[]; asOf: string; activity: Activity[]; dispName: (id: string | null) => string; onOpenTask: (id: string) => void; }) {
  const hl = useHl();
  if (!tasks.length) return <div className="empty"><h3>No tasks to show</h3></div>;
  const sorted = [...tasks].sort((a, b) => { const ea = effectiveStatus(a, asOf || null, activity), eb = effectiveStatus(b, asOf || null, activity); const i = ORDER.indexOf(ea.status) - ORDER.indexOf(eb.status); return i || (a.dueDate || "").localeCompare(b.dueDate || ""); });
  return (
    <div className="sheetwrap">
      <table className="sheet">
        <thead><tr><th aria-label="Highlight"></th><th>Task</th><th>Product</th><th>Team</th><th>Owner</th><th>Status</th><th>Timeline</th><th>Request</th><th>Last update</th></tr></thead>
        <tbody>
          {sorted.map((t) => { const e = effectiveStatus(t, asOf || null, activity); const lu = lastUpdateFor(t.id, activity); const c = hl.color(t.id); return (
            <tr key={t.id} className="rowbtn" style={c ? { background: hlTint(c) } : undefined} onClick={() => onOpenTask(t.id)}>
              <td><HighlightDot color={c} onClick={(ev) => hl.open(t.id, ev)} /></td>
              <td><div className="title">{t.title}</div>{t.blocker ? <div className="hint" style={{ color: "var(--s-overdue)" }}>⚑ {t.blocker}</div> : null}</td>
              <td>{dispName(t.productId)}</td><td>{t.team}</td><td>{t.owner || "-"}</td>
              <td><Chip status={e.status} /></td>
              <td className={`tnum due ${e.overdue ? "late" : ""}`}>{timelineText(t)}</td>
              <td>{t.serviceRequest ? <span className="sr">{t.serviceRequest}</span> : <span className="hint">-</span>}</td>
              <td className="hint tnum">{lu ? relTime(lu.ts) : "-"}</td>
            </tr>
          ); })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------- My Tasks (owner persona) ----------------
function MyTasksView({ tasks, activity, asOf, cmpTasks, dispName, tview, setTview, onOpenTask, claimableCount, onClaim }: { tasks: Task[]; activity: Activity[]; asOf: string; cmpTasks: (a: Task, b: Task) => number; dispName: (id: string | null) => string; tview: "list" | "grid"; setTview: (v: "list" | "grid") => void; onOpenTask: (id: string) => void; claimableCount: number; onClaim: () => void; }) {
  return (
    <>
      <div className="pbbar">
        <div className="segmented sm">
          <button aria-pressed={tview === "list"} onClick={() => setTview("list")}>List</button>
          <button aria-pressed={tview === "grid"} onClick={() => setTview("grid")}>Card grid</button>
        </div>
        <span className="grow" />
        {claimableCount > 0 ? <button className="btn ghost sm" onClick={onClaim}>Claim tasks ({claimableCount})</button> : null}
      </div>
      {claimableCount > 0 ? <div className="claimbanner">Some tasks may be assigned to you under a different name. <button className="linklike" onClick={onClaim}>Review and claim them</button>.</div> : null}
      {!tasks.length ? (
        <div className="empty"><h3>No tasks linked to you yet</h3><p>{claimableCount > 0 ? "Claim the tasks assigned to you to see them here." : "Tasks you own will appear here once a PM assigns them to you."}</p></div>
      ) : tview === "grid" ? (
        <GridBoard tasks={tasks} activity={activity} asOf={asOf} cmpTasks={cmpTasks} dispName={dispName} onOpenTask={onOpenTask} />
      ) : (
        <ListBoard tasks={tasks} activity={activity} asOf={asOf} cmpTasks={cmpTasks} dispName={dispName} onOpenTask={onOpenTask} />
      )}
    </>
  );
}

// ---------------- My Reviews (reviewer persona) ----------------
function MyReviewsView({ tasks, activity, asOf, cmpTasks, dispName, tview, setTview, onOpenTask }: { tasks: Task[]; activity: Activity[]; asOf: string; cmpTasks: (a: Task, b: Task) => number; dispName: (id: string | null) => string; tview: "list" | "grid"; setTview: (v: "list" | "grid") => void; onOpenTask: (id: string) => void; }) {
  return (
    <>
      <div className="pbbar">
        <div className="segmented sm">
          <button aria-pressed={tview === "list"} onClick={() => setTview("list")}>List</button>
          <button aria-pressed={tview === "grid"} onClick={() => setTview("grid")}>Card grid</button>
        </div>
        <span className="grow" />
      </div>
      {!tasks.length ? (
        <div className="empty"><h3>Nothing to review yet</h3><p>Tasks where you are named the reviewer will appear here, and you will be notified when one is ready for review.</p></div>
      ) : tview === "grid" ? (
        <GridBoard tasks={tasks} activity={activity} asOf={asOf} cmpTasks={cmpTasks} dispName={dispName} onOpenTask={onOpenTask} />
      ) : (
        <ListBoard tasks={tasks} activity={activity} asOf={asOf} cmpTasks={cmpTasks} dispName={dispName} onOpenTask={onOpenTask} />
      )}
    </>
  );
}

function ClaimModal({ productById, onClose, flash, onClaimed }: { productById: Record<string, Product>; onClose: () => void; flash: (m: string) => void; onClaimed: () => Promise<void> | void; }) {
  const [rows, setRows] = useState<{ id: string; title: string; owner: string; productId: string | null }[]>([]);
  const [all, setAll] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const load = useCallback(async (showAll: boolean) => {
    setLoading(true);
    try { const d = await api(`/api/me/claimable${showAll ? "?all=1" : ""}`); setRows(d.tasks || []); }
    catch (e) { flash((e as Error).message); } finally { setLoading(false); }
  }, [flash]);
  useEffect(() => { load(all); }, [all, load]);
  async function claim(id: string) {
    setBusy(id);
    try { await api(`/api/tasks/${id}/claim`, { method: "POST" }); setRows((r) => r.filter((x) => x.id !== id)); await onClaimed(); flash("Task claimed"); }
    catch (e) { flash((e as Error).message); } finally { setBusy(""); }
  }
  const list = q.trim() ? rows.filter((t) => `${t.owner} ${t.title}`.toLowerCase().includes(q.toLowerCase())) : rows;
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <div className="dhead"><h2>Claim your tasks</h2><button className="iconbtn" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="dbody">
          <p className="lead" style={{ marginBottom: 12 }}>Tasks assigned to you by name that are not yet linked to your account. Claim the ones that are yours; the name is remembered so future tasks link automatically.</p>
          <input type="search" placeholder="Search by name or task…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 8 }} />
          <label className="chkline" style={{ marginBottom: 10 }}><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show all unlinked tasks (find a name that does not match)</label>
          {loading ? <div className="hint">Loading…</div> : !list.length ? <div className="hint">{all ? "No unlinked tasks." : "No likely matches. Tick “Show all” to search every unlinked task."}</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 340, overflowY: "auto" }}>
              {list.map((t) => (
                <div className="prow" key={t.id}>
                  <div className="prow-top">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{t.title}</div>
                      <div className="hint">Owner label: {t.owner || "-"}{t.productId && productById[t.productId] ? ` · ${productById[t.productId].name}` : ""}</div>
                    </div>
                    <button className="btn primary sm" onClick={() => claim(t.id)} disabled={busy === t.id}>{busy === t.id ? "Claiming…" : "This is me"}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------- Report ----------------
function Report({ tasks, activity, dispName, range, setRange, eventText }: { tasks: Task[]; activity: Activity[]; dispName: (id: string | null) => string; range: { from: string; to: string }; setRange: (r: { from: string; to: string }) => void; eventText: (a: Activity) => string; }) {
  const fromT = new Date(range.from + "T00:00:00").getTime(); const toT = new Date(range.to + "T23:59:59.999").getTime();
  const moved = activity.filter((a) => { const ts = new Date(a.ts).getTime(); return ts >= fromT && ts <= toT && a.type !== "product"; });
  const completed = new Set(moved.filter((a) => (a.type === "status" || a.type === "created") && a.toStatus === "COMPLETE").map((a) => a.taskId)).size;
  const createdN = moved.filter((a) => a.type === "created").length;
  const touched = new Set(moved.map((a) => a.taskId));
  const overdueEnd = tasks.filter((t) => t.status !== "COMPLETE" && isoToYMD(t.dueDate) && isoToYMD(t.dueDate) < range.to).length;
  const byEntity: Record<string, Record<string, Activity[]>> = {};
  moved.forEach((a) => { const t = tasks.find((x) => x.id === a.taskId); const sr = t?.serviceRequest || "General / no request"; const prod = dispName(t?.productId ?? null); byEntity[sr] = byEntity[sr] || {}; byEntity[sr][prod] = byEntity[sr][prod] || []; byEntity[sr][prod].push(a); });
  return (
    <>
      <div className="rangebar">
        <label>Report period</label>
        <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <span className="hint">to</span>
        <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        <span className="grow" />
        <button className="btn sm" onClick={() => setRange({ from: addDaysYMD(todayYMD(), -6), to: todayYMD() })}>This week</button>
      </div>
      <div className="summary">
        <Tile k="Items that moved" v={touched.size} />
        <Tile k="Completed" v={completed} />
        <Tile k="New tasks" v={createdN} />
        <Tile k="Overdue at period end" v={overdueEnd} color={overdueEnd ? "--s-overdue" : undefined} />
      </div>
      {!moved.length ? <div className="empty"><h3>Nothing moved in this period</h3><p>No status changes or notes between {fmtDate(range.from + "T12:00:00")} and {fmtDate(range.to + "T12:00:00")}.</p></div>
        : Object.keys(byEntity).sort().map((sr) => (
          <div className="rpt-group" key={sr}>
            <h3>{sr.startsWith("General") ? sr : <span className="sr">{sr}</span>}</h3>
            {Object.keys(byEntity[sr]).sort().map((prod) => (
              <div key={prod}>
                <div className="rpt-sub">{prod}</div>
                {byEntity[sr][prod].sort((a, b) => +new Date(a.ts) - +new Date(b.ts)).map((a) => { const t = tasks.find((x) => x.id === a.taskId); const col = a.toStatus || ""; return (
                  <div key={a.id} className="rpt-item" style={{ ["--sc" as string]: col ? `var(${statusMeta(col).colorVar})` : "var(--border)" }}>
                    <div className="line"><b>{t?.title || a.taskTitle || "Task"}</b>{col ? <Chip status={col} /> : null}</div>
                    <div className="ev">{eventText(a)} · {a.author} · {fmtTs(a.ts)}</div>
                  </div>
                ); })}
              </div>
            ))}
          </div>
        ))}
    </>
  );
}
function Tile({ k, v, color }: { k: string; v: number; color?: string }) { return <div className="tile"><div className="k">{k}</div><div className="v tnum" style={color ? { color: `var(${color})` } : undefined}>{v}</div></div>; }

// ---------------- Activity ----------------
function Feed({ activity, tasks }: { activity: Activity[]; tasks: Task[] }) {
  if (!activity.length) return <div className="empty"><h3>No activity yet</h3><p>Status changes and progress notes appear here as the team updates tasks.</p></div>;
  const arr = [...activity].sort((a, b) => +new Date(b.ts) - +new Date(a.ts)).slice(0, 150);
  return (
    <div className="feed">
      {arr.map((a) => { const t = tasks.find((x) => x.id === a.taskId); const title = t?.title || a.taskTitle || "a task"; const col = a.toStatus || "";
        return (
          <div className="fitem" key={a.id}>
            <span className="fdot" style={{ ["--c" as string]: col ? `var(${statusMeta(col).colorVar})` : "var(--muted)" }} />
            <div className="fbody">
              <div><b>{a.author || "Someone"}</b>{" "}
                {a.type === "created" ? <>created <Chip status={a.toStatus || "NOT_STARTED"} /> on <b>{title}</b></>
                  : a.type === "status" ? <>moved <Chip status={a.toStatus || ""} /> on <b>{title}</b></>
                  : a.type === "note" ? <>noted: {a.content} on <b>{title}</b></>
                  : <>{a.content}</>}
              </div>
              <div className="fmeta">{fmtTs(a.ts)} · {relTime(a.ts)}</div>
            </div>
          </div>
        ); })}
    </div>
  );
}

// ---------------- Products view ----------------
const PSORTS: [string, string][] = [["name", "Name"], ["tasks", "Most tasks"], ["type", "Type"], ["pm", "Manager"]];
function ProductsView(props: { products: Product[]; tasks: Task[]; layout: "cards" | "list"; setLayout: (l: "cards" | "list") => void; sort: string; setSort: (s: string) => void; query: string; setQuery: (q: string) => void; showDecom: boolean; setShowDecom: (b: boolean) => void; canWrite: boolean; isAdmin: boolean; onCreate: () => void; onImport: () => void; onSettings: (id: string) => void; onDetail: (id: string) => void; onAdd: (id: string) => void; onDecom: (id: string) => void; }) {
  const { products, tasks, layout, setLayout, sort, setSort, query, setQuery, showDecom, setShowDecom, canWrite, isAdmin, onCreate, onImport, onSettings, onDetail, onAdd, onDecom } = props;
  const count = (id: string) => tasks.filter((t) => t.productId === id).length;
  let list = products.filter((p) => (showDecom ? true : !p.decommissioned));
  list = [...list].sort((a, b) => {
    if (sort === "tasks") return count(b.id) - count(a.id) || productDisplay(a).localeCompare(productDisplay(b));
    if (sort === "type") return (a.type || "").localeCompare(b.type || "") || productDisplay(a).localeCompare(productDisplay(b));
    if (sort === "pm") return (a.pm || "").localeCompare(b.pm || "") || productDisplay(a).localeCompare(productDisplay(b));
    return productDisplay(a).localeCompare(productDisplay(b));
  });
  const q = query.toLowerCase();
  if (q) list = list.filter((p) => `${p.name} ${p.type || ""} ${p.pm || ""}`.toLowerCase().includes(q));

  const actions = (p: Product) => (
    <>
      {!p.decommissioned && canWrite && <button className="btn primary sm" onClick={() => onAdd(p.id)}>+ Task</button>}
      {canWrite && <button className="btn sm" onClick={() => onSettings(p.id)}>Settings</button>}
      {canWrite && <button className="btn ghost sm" onClick={() => onDecom(p.id)}>{p.decommissioned ? "Recommission" : "Decommission"}</button>}
    </>
  );
  return (
    <>
      <div className="pbar">
        {canWrite && <button className="btn primary sm" onClick={onCreate}>+ Product</button>}
        {isAdmin && <button className="btn sm" onClick={onImport}>Import</button>}
        <input type="search" placeholder="Filter products…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ padding: "6px 9px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)", minWidth: 120 }} />
        <label className="hint" htmlFor="psort">Sort</label>
        <select id="psort" value={sort} onChange={(e) => setSort(e.target.value)} style={{ padding: "6px 9px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--surface)" }}>{PSORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <span className="grow" />
        <label className="chkline"><input type="checkbox" checked={showDecom} onChange={(e) => setShowDecom(e.target.checked)} /> Show decommissioned</label>
        <ViewMenu value={layout} onChange={setLayout} />
      </div>
      {!list.length ? (
        <div className="empty"><h3>{products.length ? "No products to show" : "No products yet"}</h3><p>{products.length ? "Toggle “Show decommissioned” or clear the filter." : "Add your first product with + Product. Every task lives under a product."}</p></div>
      ) : layout === "cards" ? (
        <div className="pgrid">
          {list.map((p) => { const n = count(p.id); return (
            <div key={p.id} className={`pcard${p.decommissioned ? " decom" : ""}`}>
              <button className="pname-btn" onClick={() => onDetail(p.id)} title="View tasks">{productDisplay(p)}</button>
              <div className="pmeta">Manager: {p.pm || "unassigned"}{p.type ? <> · <span className="ptag" style={{ margin: 0 }}>{p.type}</span></> : null}</div>
              <div className="pmeta tnum">{n} task{n === 1 ? "" : "s"}{p.decommissioned ? <span className="decbadge">Decommissioned</span> : null}</div>
              <div className="pacts">{actions(p)}</div>
            </div>
          ); })}
        </div>
      ) : (
        <div className="plist">
          {list.map((p) => { const n = count(p.id); return (
            <div key={p.id} className={`prowx${p.decommissioned ? " decom" : ""}`}>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div><button className="pname-btn" onClick={() => onDetail(p.id)} title="View tasks">{productDisplay(p)}</button>{p.decommissioned ? <span className="decbadge">Decommissioned</span> : null}</div>
                <div className="hint">Manager: {p.pm || "unassigned"} · {n} task{n === 1 ? "" : "s"}</div>
              </div>
              {actions(p)}
            </div>
          ); })}
        </div>
      )}
    </>
  );
}

function ProductDetail({ product, tasks, activity, asOf, canWrite, onClose, onOpenTask, onBoard, onAdd, onSettings }: { product: Product; tasks: Task[]; activity: Activity[]; asOf: string; canWrite: boolean; onClose: () => void; onOpenTask: (id: string) => void; onBoard: () => void; onAdd: () => void; onSettings: () => void; }) {
  const hl = useHl();
  const list = [...tasks].sort((a, b) => { const ea = effectiveStatus(a, asOf || null, activity), eb = effectiveStatus(b, asOf || null, activity); return ORDER.indexOf(ea.status) - ORDER.indexOf(eb.status) || (a.dueDate || "").localeCompare(b.dueDate || ""); });
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer open">
        <div className="dhead"><h2>{productDisplay(product)}</h2><button className="iconbtn" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="dbody">
          <div className="kv" style={{ marginBottom: 12 }}>
            <span className="k">Manager</span><span className="v">{product.pm || "unassigned"}</span>
            <span className="k">Type</span><span className="v">{product.type || "-"}</span>
            <span className="k">Tasks</span><span className="v tnum">{list.length}</span>
            {product.decommissioned ? <><span className="k">Status</span><span className="v"><span className="decbadge" style={{ margin: 0 }}>Decommissioned</span></span></> : null}
          </div>
          <div style={{ marginBottom: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn sm" onClick={onBoard}>View product board</button>
            {!product.decommissioned && canWrite && <button className="btn primary sm" onClick={onAdd}>+ Task in this product</button>}
            {canWrite && <button className="btn sm" onClick={onSettings}>Settings</button>}
          </div>
          {!list.length ? (
            <div className="empty" style={{ padding: "30px 10px" }}><h3>No tasks under this product yet</h3><p>{product.decommissioned ? "This product is decommissioned." : "Add the first task with the button above. It shows on the Main Board too."}</p></div>
          ) : (
            <div className="pdlist">
              {list.map((t) => { const e = effectiveStatus(t, asOf || null, activity); const c = hl.color(t.id); return (
                <button key={t.id} className="pdtask" style={{ ["--sc" as string]: `var(${statusMeta(e.status).colorVar})`, ...(c ? { background: hlTint(c) } : {}) }} onClick={() => onOpenTask(t.id)}>
                  <div className="pdtask-top"><span className="title">{t.title}</span><span className="tt-actions"><Chip status={e.status} /><HighlightDot color={c} onClick={(ev) => hl.open(t.id, ev)} /></span></div>
                  {t.context ? <div className="ctxpreview">{t.context}</div> : null}
                  <div className="meta"><span className="who">{t.owner || "-"}</span><span>{t.team}</span><span className="tnum"><span style={{ opacity: 0.7 }}>Timeline:</span> {timelineText(t)}</span>{t.serviceRequest ? <span className="sr">{t.serviceRequest}</span> : null}</div>
                </button>
              ); })}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

// ---------------- Task modal ----------------
function TaskModal({ editing, preProduct, preStatus, products, teamOptions, people, registered, srList, tasks, ownerMode = false, meName = "", pickProducts, involvedIds, onClose, onAddTeam, onSaved }: {
  editing: Task | null; preProduct: string | null; preStatus: StatusKey | null; products: Product[]; teamOptions: string[]; people: string[]; registered: Set<string>; srList: string[]; tasks: Task[];
  ownerMode?: boolean; meName?: string; pickProducts?: Product[]; involvedIds?: Set<string>;
  onClose: () => void; onAddTeam: (name: string) => Promise<string[]>; onSaved: (msg: string) => void;
}) {
  // Owners/reviewers can create against any active product; everyone else uses the
  // product list they were given.
  const productSource = ownerMode && pickProducts ? pickProducts : products;
  const liveProducts = productSource.filter((p) => !p.decommissioned || (editing && editing.productId === p.id));
  const ownerTeam = (name: string) => { let best: Task | null = null; tasks.forEach((t) => { if (t.owner === name) { if (!best || new Date(t.createdAt) > new Date(best.createdAt)) best = t; } }); return best ? (best as Task).team : ""; };

  const [srMode, setSrMode] = useState<"none" | "existing" | "new">(editing?.serviceRequest ? "existing" : "none");
  const [srExisting, setSrExisting] = useState(editing?.serviceRequest || srList[0] || "");
  const [srNew, setSrNew] = useState("");
  const [title, setTitle] = useState(editing?.title || "");
  const [context, setContext] = useState(editing?.context || "");
  const [productId, setProductId] = useState(editing?.productId || preProduct || liveProducts[0]?.id || "");
  const [ownerSel, setOwnerSel] = useState(editing?.owner || "");
  const [ownerNew, setOwnerNew] = useState("");
  const [reviewerSel, setReviewerSel] = useState(editing?.reviewer || "");
  const [reviewerNew, setReviewerNew] = useState("");
  const [team, setTeam] = useState(editing?.team || teamOptions[0] || "");
  const [teamTouched, setTeamTouched] = useState(!!editing);
  const [teams, setTeams] = useState(teamOptions);
  const [showTeamAdd, setShowTeamAdd] = useState(false);
  const [teamNew, setTeamNew] = useState("");
  const [priority, setPriority] = useState(editing ? priorityOf(editing) : 2);
  const [status, setStatus] = useState<StatusKey>(preStatus || editing?.status || "IN_PROGRESS");
  const [start, setStart] = useState(isoToYMD(editing?.startDate));
  const [due, setDue] = useState(isoToYMD(editing?.dueDate));
  const [blocker, setBlocker] = useState(editing?.blocker || "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const lockProduct = !editing && !!preProduct;
  const [confirmExit, setConfirmExit] = useState(false);

  const ownerExisting = people.includes(ownerSel);

  async function commitTeam() {
    const nm = teamNew.trim(); if (!nm) return;
    const next = await onAddTeam(nm); setTeams(next); setTeam(nm); setTeamTouched(true); setTeamNew(""); setShowTeamAdd(false);
  }
  async function save() {
    const owner = ownerMode ? meName : (ownerSel === "__new__" ? ownerNew.trim() : ownerSel);
    const reviewer = reviewerSel === "__new__" ? reviewerNew.trim() : reviewerSel;
    const sr = srMode === "existing" ? srExisting : srMode === "new" ? srNew.trim() : "";
    if (!title.trim()) return setErr("Give the task a title.");
    if (!productId) return setErr("Pick a product.");
    if (!owner) return setErr("Pick or add an owner.");
    if (!team) return setErr("Pick a team / function.");
    if (status !== "NOT_STARTED" && (!start || !due)) return setErr("A start date and due date are required unless the task is Not started.");
    if (status === "BLOCKED" && !blocker.trim()) return setErr("A blocked task needs a reason. Fill in the blocker.");
    setErr(""); setBusy(true);
    const body = { title, context, productId, owner, reviewer, team, priority, status, startDate: start, dueDate: due, serviceRequest: sr, blocker };
    try {
      if (editing) { await api(`/api/tasks/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) }); onSaved("Task updated"); }
      else { await api("/api/tasks", { method: "POST", body: JSON.stringify(body) }); onSaved("Task created"); }
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }

  // Unsaved input guard: compare to the task being edited, or any typed content for a new task.
  const reviewerVal = reviewerSel === "__new__" ? reviewerNew.trim() : reviewerSel;
  const dirty = editing
    ? (title !== (editing.title || "") || context !== (editing.context || "") || blocker !== (editing.blocker || "") || isoToYMD(editing.startDate) !== start || isoToYMD(editing.dueDate) !== due || status !== editing.status || priority !== priorityOf(editing) || (ownerSel && ownerSel !== editing.owner) || ownerNew.trim() !== "" || reviewerVal !== (editing.reviewer || ""))
    : (!!title.trim() || !!context.trim() || !!blocker.trim() || !!ownerNew.trim() || !!srNew.trim() || !!due || (!!ownerSel && ownerSel !== "__new__") || !!reviewerVal);
  function requestClose() { if (dirty && !busy) setConfirmExit(true); else onClose(); }

  return (
    <>
      <div className="scrim" onClick={requestClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <div className="dhead"><h2>{editing ? "Edit task" : "New task"}</h2><button className="iconbtn" onClick={requestClose} aria-label="Close">✕</button></div>
        <div className="dbody">
          <div className="field">
            <label>Service request</label>
            <div className="segmented">
              <button type="button" aria-pressed={srMode === "none"} onClick={() => setSrMode("none")}>No request</button>
              <button type="button" aria-pressed={srMode === "existing"} onClick={() => setSrMode("existing")}>Existing request</button>
              <button type="button" aria-pressed={srMode === "new"} onClick={() => setSrMode("new")}>New request</button>
            </div>
            {srMode === "existing" && <div style={{ marginTop: 8 }}><select value={srExisting} onChange={(e) => setSrExisting(e.target.value)} style={{ width: "100%" }}>{srList.length ? srList.map((s) => <option key={s} value={s}>{s}</option>) : <option value="">No existing requests yet</option>}</select></div>}
            {srMode === "new" && <div style={{ marginTop: 8 }}><input value={srNew} onChange={(e) => setSrNew(e.target.value)} placeholder="e.g. SR-120 New service request" /></div>}
            <div className="hint" style={{ marginTop: 4 }}>A request can have several tasks. Group them under the same request.</div>
          </div>
          <div className="field req"><label>Task (outcome)</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Ship USSD airtime purchase flow" /></div>
          <div className="field"><label>Context (optional)</label><textarea value={context} onChange={(e) => setContext(e.target.value)} rows={3} placeholder="A short intro so stakeholders understand what this task is about and why it matters" /></div>
          <div className="field req"><label>Product</label><select value={productId} disabled={lockProduct} onChange={(e) => setProductId(e.target.value)}>{liveProducts.length ? [...liveProducts].sort((a, b) => productOption(a).localeCompare(productOption(b))).map((p) => <option key={p.id} value={p.id}>{productOption(p)}</option>) : <option value="">No products yet</option>}</select>
            {ownerMode ? (involvedIds && productId && involvedIds.has(productId)
              ? <div className="ownerbadge on" style={{ marginTop: 6 }}>You work on this product, so this task goes live right away.</div>
              : <div className="ownerbadge off" style={{ marginTop: 6 }}>New product for you. A manager will approve this task before others can see it.</div>) : null}
          </div>
          <div className="two">
            {ownerMode ? (
              <div className="field"><label>Owner</label><div className="hint" style={{ paddingTop: 7 }}>You ({meName})</div></div>
            ) : (
            <div className="field req"><label>Owner</label>
              <select value={ownerExisting || ownerSel === "__new__" ? ownerSel : (ownerSel ? ownerSel : "")} onChange={(e) => setOwnerSel(e.target.value)}>
                <option value="">Select owner</option>
                {!ownerExisting && ownerSel && ownerSel !== "__new__" ? <option value={ownerSel}>{ownerSel}</option> : null}
                {people.map((o) => { const reg = registered.has(o.trim().toLowerCase()); return <option key={o} value={o}>{reg ? `• ${o}` : o}</option>; })}
                <option value="__new__">+ Add new owner</option>
              </select>
              {ownerSel && ownerSel !== "__new__" ? (
                registered.has(ownerSel.trim().toLowerCase())
                  ? <div className="ownerbadge on">On ProdBoard</div>
                  : <div className="ownerbadge off">Not on ProdBoard yet · invite them so they can update it</div>
              ) : null}
              {ownerSel === "__new__" && <div style={{ marginTop: 6 }}><input value={ownerNew} onChange={(e) => setOwnerNew(e.target.value)} placeholder="New owner name" /></div>}
            </div>
            )}
            <div className="field req"><label>Team / function</label>
              <select value={team} onChange={(e) => { setTeam(e.target.value); setTeamTouched(true); }}>{teams.map((t) => <option key={t} value={t}>{t}</option>)}</select>
              <div style={{ marginTop: 6 }}><button type="button" className="btn ghost sm" onClick={() => setShowTeamAdd((s) => !s)}>+ Team</button></div>
              {showTeamAdd && <div style={{ marginTop: 6, display: "flex", gap: 6 }}><input value={teamNew} onChange={(e) => setTeamNew(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitTeam(); } }} placeholder="New team name" /><button type="button" className="btn sm" onClick={commitTeam}>Add</button></div>}
            </div>
          </div>
          <div className="two">
            <div className="field"><label>Priority</label><select value={priority} onChange={(e) => setPriority(Number(e.target.value))}><option value={1}>Level 1 (most important)</option><option value={2}>Level 2</option><option value={3}>Level 3 (least important)</option></select></div>
            <div className="field"><label>Status</label><select value={status} onChange={(e) => setStatus(e.target.value as StatusKey)}>{EDIT_STATUSES.map((s) => <option key={s} value={s}>{statusMeta(s).label}</option>)}</select></div>
          </div>
          <div className="field"><label>Second reviewer <span className="hint">(optional)</span></label>
            <select value={reviewerSel} onChange={(e) => setReviewerSel(e.target.value)}>
              <option value="">No reviewer</option>
              {reviewerSel && reviewerSel !== "__new__" && !people.some((o) => o === reviewerSel) ? <option value={reviewerSel}>{reviewerSel}</option> : null}
              {people.map((o) => { const reg = registered.has(o.trim().toLowerCase()); return <option key={o} value={o}>{reg ? `• ${o}` : o}</option>; })}
              <option value="__new__">+ Add new reviewer</option>
            </select>
            {reviewerSel && reviewerSel !== "__new__" ? (
              registered.has(reviewerSel.trim().toLowerCase())
                ? <div className="ownerbadge on">On ProdBoard</div>
                : <div className="ownerbadge off">Not on ProdBoard yet · invite them so they can review it</div>
            ) : null}
            {reviewerSel === "__new__" && <div style={{ marginTop: 6 }}><input value={reviewerNew} onChange={(e) => setReviewerNew(e.target.value)} placeholder="New reviewer name" /></div>}
            <div className="hint" style={{ marginTop: 4 }}>A reviewer sees this task in My Reviews, can post review notes, and is notified when it is ready for review. Links to their account automatically once they are on ProdBoard.</div>
          </div>
          <div className="two">
            <div className={status !== "NOT_STARTED" ? "field req" : "field"}><label>Start date{status === "NOT_STARTED" ? <span className="hint"> (optional)</span> : null}</label><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div className={status !== "NOT_STARTED" ? "field req" : "field"}><label>Due date{status === "NOT_STARTED" ? <span className="hint"> (optional)</span> : null}</label><input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
          </div>
          {status === "NOT_STARTED" ? <div className="hint" style={{ marginTop: -4 }}>Not started tasks can skip dates. You will be asked to set them when the task moves to In progress.</div> : null}
          <div className={status === "BLOCKED" ? "field req" : "field"}><label>Blocker{status === "BLOCKED" ? " (required)" : " (optional)"}</label><input value={blocker} onChange={(e) => setBlocker(e.target.value)} placeholder={status === "BLOCKED" ? "why it is blocked and what it is waiting on" : "why it is stuck, if it is"} /></div>
          {err && <div className="err">{err}</div>}
        </div>
        <div className="dfoot"><button className="btn" onClick={requestClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Create task"}</button></div>
      </div>
      {confirmExit && <ConfirmExit what={editing ? `your changes to “${editing.title}”` : "this new task"} saving={busy} onSave={() => { setConfirmExit(false); save(); }} onDiscard={onClose} onCancel={() => setConfirmExit(false)} />}
    </>
  );
}

// ---------------- Task drawer ----------------
function TaskDrawer({ task, activity, dispName, asOf, canWrite, ownerActing, reviewerActing, meId, meName, members, onClose, onEdit, onPosted }: { task: Task; activity: Activity[]; dispName: (id: string | null) => string; asOf: string; canWrite: boolean; ownerActing: boolean; reviewerActing: boolean; meId: string; meName: string; members: PresenceMember[]; onClose: () => void; onEdit: (t: Task) => void; onPosted: (msg: string) => void; }) {
  const e = effectiveStatus(task, asOf || null, activity);
  const hist = activity.filter((a) => a.taskId === task.id).sort((a, b) => +new Date(b.ts) - +new Date(a.ts));
  const [status, setStatus] = useState<StatusKey>(task.status);
  const [note, setNote] = useState(""); const [blocker, setBlocker] = useState(task.blocker || "");
  const [context, setContext] = useState(task.context || "");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [confirmPost, setConfirmPost] = useState(false);
  const [confirmMarkDone, setConfirmMarkDone] = useState(false);
  const contextDirty = context.trim() !== (task.context || "").trim();
  const postDirty = status !== task.status || !!note.trim() || blocker.trim() !== (task.blocker || "");
  const dirty = contextDirty || postDirty;
  function histText(a: Activity) {
    if (a.type === "created") return `Created as ${a.toStatus ? statusMeta(a.toStatus).label : ""}`;
    if (a.type === "status") return `Status to ${a.toStatus ? statusMeta(a.toStatus).label : ""}${a.fromStatus ? ` (from ${statusMeta(a.fromStatus).label})` : ""}`;
    if (a.type === "note") return `Note: ${a.content || ""}`;
    return a.content || "Updated";
  }
  async function doSaveContext() { await api(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ context }) }); }
  async function doPost() { await api(`/api/tasks/${task.id}/updates`, { method: "POST", body: JSON.stringify({ status, note, blocker }) }); }
  const statusChanging = status !== task.status;
  async function reallyPost() {
    setErr(""); setBusy(true);
    try { await doPost(); setNote(""); onPosted("Update posted"); onClose(); }
    catch (ex) { setErr((ex as Error).message); setBusy(false); setConfirmPost(false); }
  }
  function post() {
    if (!postDirty) return setErr("Nothing to post. Change the status, add a note, or edit the blocker.");
    // Confirm before a status move; a plain note/blocker edit posts straight away.
    if (statusChanging) { setErr(""); setConfirmPost(true); return; }
    reallyPost();
  }
  async function saveContext() {
    if (!contextDirty) return;
    setErr(""); setBusy(true);
    try { await doSaveContext(); onPosted(task.context ? "Context updated" : "Context added"); }
    catch (ex) { setErr((ex as Error).message); } finally { setBusy(false); }
  }
  // Clicking outside or ✕ with unsaved input asks before discarding.
  function requestClose() { if (dirty) setConfirmExit(true); else onClose(); }
  async function saveAndExit() {
    setErr(""); setBusy(true);
    try {
      if (contextDirty) await doSaveContext();
      if (postDirty) await doPost();
      onPosted("Update saved"); onClose();
    } catch (ex) { setErr((ex as Error).message); setBusy(false); setConfirmExit(false); }
  }

  // Owner / confirmation workflow.
  const iAmOwner = task.ownerUserId === meId;
  const iAmReviewer = task.reviewerUserId === meId;
  const awaiting = !!task.ownerDoneAt;
  const [ownerNote, setOwnerNote] = useState("");
  const [reviewerNote, setReviewerNote] = useState("");
  const [sendBackOpen, setSendBackOpen] = useState(false);
  const [sendBackText, setSendBackText] = useState("");
  const [assignTo, setAssignTo] = useState("");
  async function run(fn: () => Promise<void>, okMsg: string) {
    setErr(""); setBusy(true);
    try { await fn(); onPosted(okMsg); onClose(); } catch (ex) { setErr((ex as Error).message); setBusy(false); }
  }
  const ownerMarkDone = () => run(async () => { await api(`/api/tasks/${task.id}/owner-done`, { method: "POST", body: JSON.stringify({ note: ownerNote.trim() || undefined }) }); }, "Marked done, awaiting confirmation");
  const ownerPostNote = () => { if (!ownerNote.trim()) { setErr("Add a note first."); return; } run(async () => { await api(`/api/tasks/${task.id}/updates`, { method: "POST", body: JSON.stringify({ note: ownerNote }) }); }, "Note posted"); };
  const reviewerPostNote = () => { if (!reviewerNote.trim()) { setErr("Add a note first."); return; } run(async () => { await api(`/api/tasks/${task.id}/updates`, { method: "POST", body: JSON.stringify({ note: `Review: ${reviewerNote.trim()}` }) }); }, "Review note posted"); };
  const confirmDone = () => run(async () => { await api(`/api/tasks/${task.id}/confirm`, { method: "POST", body: JSON.stringify({}) }); }, "Confirmed complete");
  const doSendBack = () => { if (!sendBackText.trim()) { setErr("Add a comment for the owner."); return; } run(async () => { await api(`/api/tasks/${task.id}/send-back`, { method: "POST", body: JSON.stringify({ comment: sendBackText }) }); }, "Sent back to owner"); };
  const assignOwner = () => { if (!assignTo) return; run(async () => { await api(`/api/tasks/${task.id}/assign`, { method: "POST", body: JSON.stringify({ userId: assignTo }) }); }, "Owner linked to account"); };
  // Approval workflow for owner-created tasks.
  const iCreated = iAmOwner && task.createdBy === meName;
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectText, setRejectText] = useState("");
  const approveTask = () => run(async () => { await api(`/api/tasks/${task.id}/approve`, { method: "POST", body: JSON.stringify({}) }); }, "Task approved");
  const rejectTask = () => { if (!rejectText.trim()) { setErr("Add a comment for the creator."); return; } run(async () => { await api(`/api/tasks/${task.id}/reject`, { method: "POST", body: JSON.stringify({ comment: rejectText }) }); }, "Sent back to the creator"); };

  return (
    <>
      <div className="scrim" onClick={requestClose} />
      <aside className="drawer open">
        <div className="dhead"><h2>{task.title}</h2><button className="iconbtn" onClick={requestClose} aria-label="Close">✕</button></div>
        <div className="dbody">
          <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}><Chip status={e.status} />{task.pending ? <span className="awaitpill">Pending approval</span> : null}{awaiting ? <span className="awaitpill">Awaiting confirmation{task.ownerDoneBy ? ` · ${task.ownerDoneBy}` : ""}</span> : null}{asOf ? <span className="hint">as of {fmtDate(asOf + "T12:00:00")}</span> : null}</div>
          {canWrite && task.pending && (
            <div className="confirmbox-inline">
              <div style={{ fontWeight: 600, marginBottom: 2 }}>New task awaiting your approval</div>
              <div className="hint" style={{ marginBottom: 8 }}>{task.createdBy || "An owner"} created this under {dispName(task.productId)}, a product new to them. Approve to make it visible to everyone, or send it back with a note.</div>
              {!rejectOpen ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn primary sm" onClick={approveTask} disabled={busy}>Approve</button>
                  <button className="btn ghost sm" onClick={() => setRejectOpen(true)} disabled={busy}>Send back</button>
                </div>
              ) : (
                <div className="field" style={{ margin: 0 }}>
                  <label>Comment for the creator (required)</label>
                  <textarea value={rejectText} onChange={(e2) => setRejectText(e2.target.value)} placeholder="what needs to change (e.g. wrong product)" rows={2} />
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
                    <button className="btn ghost sm" onClick={() => { setRejectOpen(false); setRejectText(""); }}>Cancel</button>
                    <button className="btn primary sm" onClick={rejectTask} disabled={busy}>Send back</button>
                  </div>
                </div>
              )}
            </div>
          )}
          {iCreated && task.pending && (ownerActing || reviewerActing) && (
            <div className="confirmbox-inline">
              <div style={{ fontWeight: 600, marginBottom: 2 }}>Pending approval</div>
              <div className="hint" style={{ marginBottom: 8 }}>This task is on a product new to you, so a manager will approve it before others can see it. You can edit it, for example to move it to the right product.</div>
              <div style={{ display: "flex", justifyContent: "flex-end" }}><button className="btn sm" onClick={() => onEdit(task)} disabled={busy}>Edit details</button></div>
            </div>
          )}
          {canWrite ? (
            <div className="ctxbox">
              <div className="ctxlabel">Context <span className="hint" style={{ textTransform: "none", letterSpacing: 0 }}>· optional, for stakeholders</span></div>
              <textarea value={context} onChange={(e2) => setContext(e2.target.value)} rows={3} placeholder="A short intro so stakeholders understand what this task is about and why it matters" style={{ width: "100%", marginTop: 6 }} />
              {contextDirty && <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}><button className="btn primary sm" onClick={saveContext} disabled={busy}>{busy ? "Saving…" : "Save context"}</button></div>}
            </div>
          ) : task.context ? (
            <div className="ctxbox"><div className="ctxlabel">Context</div><div className="ctxbody">{task.context}</div></div>
          ) : null}
          <div className="kv">
            <span className="k">Product</span><span className="v">{dispName(task.productId)}</span>
            <span className="k">Team</span><span className="v">{task.team || "-"}</span>
            <span className="k">Owner</span><span className="v">{task.owner || "-"}{task.ownerUserId ? <span className="hint"> · linked</span> : <span className="hint"> · not linked</span>}</span>
            {task.reviewer ? <><span className="k">Reviewer</span><span className="v">{task.reviewer}{task.reviewerUserId ? <span className="hint"> · linked</span> : <span className="hint"> · not linked</span>}</span></> : null}
            <span className="k">Priority</span><span className="v"><PrBadge t={task} /> Level {priorityOf(task)}</span>
            <span className="k">Start</span><span className="v tnum">{fmtDate(task.startDate)}</span>
            <span className="k">Due</span><span className="v tnum" style={e.overdue ? { color: "var(--s-overdue)", fontWeight: 600 } : undefined}>{fmtDate(task.dueDate)}</span>
            {task.serviceRequest ? <><span className="k">Request</span><span className="v"><span className="sr">{task.serviceRequest}</span></span></> : null}
            {task.blocker ? <><span className="k">Blocker</span><span className="v" style={{ color: "var(--s-overdue)" }}>{task.blocker}</span></> : null}
            <span className="k">Created by</span><span className="v">{task.createdBy || "-"} <span className="hint">{task.createdAt ? fmtTs(task.createdAt) : ""}</span></span>
          </div>
          {canWrite && awaiting && (
            <div className="confirmbox-inline">
              <div style={{ fontWeight: 600, marginBottom: 2 }}>Owner marked this done</div>
              <div className="hint" style={{ marginBottom: 8 }}>{task.ownerDoneBy || "The owner"} is waiting for your confirmation.</div>
              {!sendBackOpen ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button className="btn primary sm" onClick={confirmDone} disabled={busy}>Confirm complete</button>
                  <button className="btn ghost sm" onClick={() => setSendBackOpen(true)} disabled={busy}>Send back</button>
                </div>
              ) : (
                <div className="field" style={{ margin: 0 }}>
                  <label>Comment for the owner (required)</label>
                  <textarea value={sendBackText} onChange={(e2) => setSendBackText(e2.target.value)} placeholder="what still needs doing" rows={2} />
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
                    <button className="btn ghost sm" onClick={() => { setSendBackOpen(false); setSendBackText(""); }}>Cancel</button>
                    <button className="btn primary sm" onClick={doSendBack} disabled={busy}>Send back</button>
                  </div>
                </div>
              )}
            </div>
          )}
          {canWrite && !task.ownerUserId && members.length > 0 && (
            <div className="field">
              <label>Link owner to an account</label>
              <div style={{ display: "flex", gap: 8 }}>
                <select value={assignTo} onChange={(e2) => setAssignTo(e2.target.value)} style={{ flex: 1 }}>
                  <option value="">Choose a member…</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
                <button className="btn sm" onClick={assignOwner} disabled={busy || !assignTo}>Link</button>
              </div>
              <div className="hint" style={{ marginTop: 4 }}>Owner typed as “{task.owner}”. Link it to the right account so they get this in My Tasks.</div>
            </div>
          )}
          {canWrite && (
            <div className="addupd">
              <div className="field"><label>Change status</label><select value={status} onChange={(e2) => setStatus(e2.target.value as StatusKey)}>{EDIT_STATUSES.map((s) => <option key={s} value={s}>{statusMeta(s).label}</option>)}</select>
                {status !== "NOT_STARTED" && (!task.startDate || !task.dueDate) ? <div className="hint" style={{ color: "var(--s-overdue)", marginTop: 4 }}>This task has no start or due date. Use “Edit details” to set them before moving it out of Not started.</div> : null}</div>
              <div className="field"><label>Progress note</label><textarea value={note} onChange={(e2) => setNote(e2.target.value)} placeholder="what moved; add evidence the task is alive" /></div>
              <div className={status === "BLOCKED" ? "field req" : "field"}><label>Blocker{status === "BLOCKED" ? " (required)" : " (optional)"}</label><input value={blocker} onChange={(e2) => setBlocker(e2.target.value)} placeholder={status === "BLOCKED" ? "why it is blocked and what it is waiting on" : "leave blank if not blocked"} />
                {status === "BLOCKED" && !blocker.trim() ? <div className="hint" style={{ color: "var(--s-overdue)", marginTop: 4 }}>A blocked task needs a reason. Add the blocker to post this.</div> : null}</div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><button className="btn sm" onClick={() => onEdit(task)}>Edit details</button><button className="btn primary sm" onClick={post} disabled={busy}>{busy ? "Posting…" : "Post update"}</button></div>
              {err && <div className="err">{err}</div>}
            </div>
          )}
          {ownerActing && iAmOwner && (
            <div className="addupd">
              {awaiting ? <div className="hint" style={{ marginBottom: 8 }}>You marked this done. Awaiting Manager confirmation.</div> : null}
              <div className="field"><label>Progress note</label><textarea value={ownerNote} onChange={(e2) => setOwnerNote(e2.target.value)} placeholder="what you did; evidence it is moving" rows={3} /></div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                {iCreated ? <button className="btn sm" onClick={() => onEdit(task)} disabled={busy}>Edit details</button> : null}
                <button className="btn sm" onClick={ownerPostNote} disabled={busy}>Post note</button>
                {!awaiting && task.status !== "COMPLETE" ? <button className="btn primary sm" onClick={() => setConfirmMarkDone(true)} disabled={busy}>Mark done</button> : null}
              </div>
              {err && <div className="err">{err}</div>}
            </div>
          )}
          {reviewerActing && iAmReviewer && (
            <div className="addupd">
              <div className="hint" style={{ marginBottom: 8 }}>You are the reviewer on this task. Add a review note; the manager and owner can see it in the history.</div>
              <div className="field"><label>Review note</label><textarea value={reviewerNote} onChange={(e2) => setReviewerNote(e2.target.value)} placeholder="your review feedback" rows={3} /></div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn primary sm" onClick={reviewerPostNote} disabled={busy}>Post review note</button>
              </div>
              {err && <div className="err">{err}</div>}
            </div>
          )}
          <div className="hist" style={{ marginTop: 16 }}>
            <h3>Task history ({hist.length})</h3>
            {!hist.length && <div className="hint">No history yet.</div>}
            {hist.map((a) => (
              <div className="hline" key={a.id}>
                <span className="hd" style={{ ["--c" as string]: a.toStatus ? `var(${statusMeta(a.toStatus).colorVar})` : "var(--muted)" }} />
                <div style={{ minWidth: 0 }}><div>{histText(a)}</div><div className="ht">{a.author} · {fmtTs(a.ts)}</div></div>
              </div>
            ))}
          </div>
        </div>
      </aside>
      {confirmExit && <ConfirmExit what={`your update on “${task.title}”`} saving={busy} onSave={saveAndExit} onDiscard={onClose} onCancel={() => setConfirmExit(false)} />}
      {confirmPost && <ConfirmAction title="Post this update?" message={<>Change the status of <b>{task.title}</b> from <b>{statusMeta(task.status).label}</b> to <b>{statusMeta(status).label}</b>?</>} confirmLabel="Post update" busy={busy} onConfirm={reallyPost} onCancel={() => { if (!busy) setConfirmPost(false); }} />}
      {confirmMarkDone && <ConfirmAction title="Mark as done?" message={<>Mark <b>{task.title}</b> as done and send it to the manager for confirmation?</>} confirmLabel="Mark done" busy={busy} onConfirm={() => { setConfirmMarkDone(false); ownerMarkDone(); }} onCancel={() => { if (!busy) setConfirmMarkDone(false); }} />}
    </>
  );
}

// A generic confirm dialog (used for status moves and marking a task done).
function ConfirmAction({ title, message, confirmLabel, busy, onConfirm, onCancel }: { title: string; message: React.ReactNode; confirmLabel: string; busy: boolean; onConfirm: () => void; onCancel: () => void; }) {
  return (
    <div className="confirmwrap" onClick={onCancel}>
      <div className="confirmbox" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="confirm-actions">
          <button className="btn ghost sm" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className="btn primary sm" onClick={onConfirm} disabled={busy}>{busy ? "Working…" : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// A guard shown when the user clicks away with unsaved input.
function ConfirmExit({ what, saving, onSave, onDiscard, onCancel }: { what: string; saving: boolean; onSave: () => void; onDiscard: () => void; onCancel: () => void; }) {
  return (
    <div className="confirmwrap" onClick={onCancel}>
      <div className="confirmbox" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h3>Unsaved changes</h3>
        <p>You have unsaved changes to {what}. Do you want to save before leaving?</p>
        <div className="confirm-actions">
          <button className="btn ghost sm" onClick={onDiscard}>Discard</button>
          <button className="btn sm" onClick={onCancel}>Keep editing</button>
          <button className="btn primary sm" onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save update"}</button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Product create / settings ----------------
function ProductCreateModal({ people, onClose, onCreate }: { people: string[]; onClose: () => void; onCreate: (body: { name: string; pm: string; type: string }) => void; }) {
  const [name, setName] = useState(""); const [pm, setPm] = useState(""); const [type, setType] = useState(""); const [err, setErr] = useState("");
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <div className="dhead"><h2>New product</h2><button className="iconbtn" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="dbody">
          <div className="field"><label>Product name (name only)</label><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CashToken, Winbundle, Fela" /></div>
          <div className="field"><label>Type (pick one, set at creation)</label>
            <div className="typegrid">{PTYPES.map((ty) => <label className="tychk" key={ty}><input type="radio" name="ptype" checked={type === ty} onChange={() => setType(ty)} /> {ty}</label>)}</div>
            <div className="hint" style={{ marginTop: 4 }}>Type is fixed after creation. Shows as name + type, e.g. “Winbundle Mobile App”.</div>
          </div>
          <div className="field"><label>Manager</label><input list="people-dl" value={pm} onChange={(e) => setPm(e.target.value)} placeholder="Manager name" /><datalist id="people-dl">{people.map((p) => <option key={p} value={p} />)}</datalist></div>
          {err && <div className="err">{err}</div>}
        </div>
        <div className="dfoot"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={() => { if (!name.trim()) { setErr("Name the product."); return; } onCreate({ name, pm, type }); }}>Create product</button></div>
      </div>
    </>
  );
}

function ProductSettingsModal({ product, people, isAdmin, onClose, onSave, onDecom }: { product: Product; people: string[]; isAdmin: boolean; onClose: () => void; onSave: (body: { name: string; pm: string }) => void; onDecom: () => void; }) {
  const [name, setName] = useState(product.name); const [pm, setPm] = useState(product.pm || ""); const [err, setErr] = useState("");
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <div className="dhead"><h2>Product settings</h2><button className="iconbtn" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="dbody">
          <div className="field"><label>Product name</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="field"><label>Type (fixed)</label><div style={{ paddingTop: 2 }}><span className="ptag" style={{ margin: 0 }}>{product.type || "-"}</span> <span className="hint">type can’t be changed after creation</span></div></div>
          <div className="field"><label>Manager</label><input list="people-dl2" value={pm} onChange={(e) => setPm(e.target.value)} placeholder="Manager name" /><datalist id="people-dl2">{people.map((p) => <option key={p} value={p} />)}</datalist></div>
          {err && <div className="err">{err}</div>}
        </div>
        <div className="dfoot">
          <button className="btn ghost" onClick={onDecom}>{product.decommissioned ? "Recommission" : "Decommission"}</button>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => { if (!name.trim()) { setErr("Name can’t be empty."); return; } onSave({ name, pm }); }}>Save</button>
        </div>
      </div>
    </>
  );
}

// ---------------- Profile (edit own name, OTP-verified) ----------------
function ProfileModal({ currentName, onClose, onSaved, flash }: { currentName: string; onClose: () => void; onSaved: (m: string) => void; flash: (m: string) => void; }) {
  const [step, setStep] = useState<"name" | "code">("name");
  const [name, setName] = useState(currentName);
  const [code, setCode] = useState("");
  const [relayed, setRelayed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function start() {
    const n = name.trim();
    if (!n) { setErr("Enter a name."); return; }
    if (n === currentName) { setErr("That is already your name."); return; }
    setErr(""); setBusy(true);
    try {
      const d = await api("/api/me/name/start", { method: "POST", body: JSON.stringify({ name: n }) });
      setRelayed(!!d.relayed); setStep("code"); setBusy(false);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  async function verify() {
    if (!/^\d{4}$/.test(code)) { setErr("Enter the 4-digit code."); return; }
    setErr(""); setBusy(true);
    try {
      await api("/api/me/name/verify", { method: "POST", body: JSON.stringify({ code }) });
      onSaved("Name updated");
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <div className="dhead"><h2>Your profile</h2><button className="iconbtn" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="dbody">
          {step === "name" ? (
            <>
              <div className="field"><label htmlFor="pf-name">Display name</label><input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="hint">Changing your name needs email verification and must be unique in your organization. It is how products are matched to you, so set it to the exact Manager name on your products (for example “Majesty”).</div>
              {err && <div className="err">{err}</div>}
            </>
          ) : (
            <>
              <p className="lead">{relayed ? "A 4-digit code was sent to your workspace administrator. Ask them for it." : "Enter the 4-digit code we emailed you."}</p>
              <div className="field"><label htmlFor="pf-code">Verification code</label>
                <input id="pf-code" inputMode="numeric" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))} style={{ fontSize: 22, letterSpacing: 8, textAlign: "center" }} placeholder="0000" autoFocus /></div>
              {err && <div className="err">{err}</div>}
            </>
          )}
        </div>
        <div className="dfoot">
          <button className="btn" onClick={onClose}>Cancel</button>
          {step === "name"
            ? <button className="btn primary" onClick={start} disabled={busy}>{busy ? "Sending…" : "Send code"}</button>
            : <button className="btn primary" onClick={verify} disabled={busy}>{busy ? "Verifying…" : "Verify & save"}</button>}
        </div>
      </div>
    </>
  );
}

// ---------------- Import products ----------------
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}
function rowsToProducts(matrix: string[][]): { name: string; type: string; pm: string }[] {
  if (!matrix.length) return [];
  const header = matrix[0].map((h) => h.trim().toLowerCase());
  const looksHeader = header.some((h) => /(name|product|type|manager|pm)/.test(h));
  let nameI = 0, typeI = 1, pmI = 2;
  let start = 0;
  if (looksHeader) {
    start = 1;
    const find = (preds: ((h: string) => boolean)[]) => { for (const p of preds) { const i = header.findIndex(p); if (i >= 0) return i; } return -1; };
    nameI = find([(h) => h === "name" || h === "product", (h) => h.includes("product") && !h.includes("type") && !h.includes("manager"), (h) => h.includes("name")]);
    typeI = find([(h) => h.includes("type")]);
    pmI = find([(h) => h.includes("manager") || h === "pm", (h) => h.includes("pm")]);
  }
  const out: { name: string; type: string; pm: string }[] = [];
  for (let r = start; r < matrix.length; r++) {
    const row = matrix[r];
    const name = (nameI >= 0 ? row[nameI] : row[0] || "").trim();
    if (!name || /^\d+$/.test(name)) { /* skip blank or pure-number index cells */ }
    const type = (typeI >= 0 ? row[typeI] || "" : "").trim();
    const pm = (pmI >= 0 ? row[pmI] || "" : "").trim();
    if (name) out.push({ name, type, pm });
  }
  return out;
}
function ImportModal({ onClose, onDone, flash }: { onClose: () => void; onDone: (msg: string) => void; flash: (m: string) => void; }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => rowsToProducts(parseCSV(text)), [text]);
  async function readFile(f: File) {
    const name = f.name.toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      flash("Save the sheet as CSV and upload that, or paste the rows.");
      return;
    }
    setText(await f.text());
  }
  async function doImport() {
    if (!rows.length) { flash("No rows found. Paste CSV or choose a .csv file."); return; }
    setBusy(true);
    try {
      const res = await api("/api/products/import", { method: "POST", body: JSON.stringify({ rows }) });
      onDone(`Imported ${res.created}, skipped ${res.skipped} (already present).`);
    } catch (e) { flash((e as Error).message); setBusy(false); }
  }
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <div className="dhead"><h2>Import products</h2><button className="iconbtn" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="dbody">
          <p className="lead" style={{ marginBottom: 12 }}>Upload a CSV or paste rows with columns <b>Name, Type, PM</b> (a header row is detected automatically). Types are matched to the standard set; unknown types become “Other”. Products whose name already exists are skipped.</p>
          <div className="field">
            <label htmlFor="imp-file">CSV file</label>
            <input id="imp-file" type="file" accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); }} />
          </div>
          <div className="field">
            <label htmlFor="imp-text">…or paste rows</label>
            <textarea id="imp-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={"Name,Type,PM\nWinBundle Website,Website,Chisom"} style={{ minHeight: 120, fontFamily: "var(--mono)" }} />
          </div>
          <div className="hint">{rows.length ? `${rows.length} product${rows.length === 1 ? "" : "s"} detected.` : "No rows detected yet."}</div>
        </div>
        <div className="dfoot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={doImport} disabled={busy || !rows.length}>{busy ? "Importing…" : `Import ${rows.length || ""}`.trim()}</button>
        </div>
      </div>
    </>
  );
}

// ---------------- Import tasks ----------------
type ImportTaskRow = { ref: string; product: string; type: string; title: string; team: string; owner: string; reviewer: string; priority: string; status: string; startDate: string; dueDate: string; context: string; blocker: string; note1: string; note2: string };
const TASK_COLS: (keyof ImportTaskRow)[] = ["ref", "product", "type", "title", "team", "owner", "reviewer", "priority", "status", "startDate", "dueDate", "context", "blocker", "note1", "note2"];
function rowsToTasks(matrix: string[][]): ImportTaskRow[] {
  if (!matrix.length) return [];
  const header = matrix[0].map((h) => h.trim().toLowerCase());
  const looksHeader = header.some((h) => /(ref|task|product|title|owner|status|type|due|note)/.test(h));
  const col: Record<keyof ImportTaskRow, number> = { ref: 0, product: 1, type: 2, title: 3, team: 4, owner: 5, reviewer: 6, priority: 7, status: 8, startDate: 9, dueDate: 10, context: 11, blocker: 12, note1: 13, note2: 14 };
  let start = 0;
  if (looksHeader) {
    start = 1;
    const find = (preds: ((h: string) => boolean)[]) => { for (const p of preds) { const i = header.findIndex(p); if (i >= 0) return i; } return -1; };
    col.ref = find([(h) => h === "ref" || h === "task id" || h === "id", (h) => h.includes("ref")]);
    col.product = find([(h) => h === "product", (h) => h.includes("product") && !h.includes("type")]);
    col.type = find([(h) => h === "type" || h.includes("type")]);
    col.title = find([(h) => h === "title", (h) => h === "task", (h) => h.includes("title"), (h) => h.includes("task") && !h.includes("id")]);
    col.team = find([(h) => h === "team", (h) => h.includes("team"), (h) => h.includes("discipline")]);
    col.owner = find([(h) => h === "owner", (h) => h.includes("owner")]);
    col.reviewer = find([(h) => h.includes("review")]);
    col.priority = find([(h) => h.includes("priorit")]);
    col.status = find([(h) => h === "status", (h) => h.includes("status")]);
    col.startDate = find([(h) => h.includes("start")]);
    col.dueDate = find([(h) => h.includes("due")]);
    col.context = find([(h) => h.includes("context"), (h) => h.includes("description")]);
    col.blocker = find([(h) => h.includes("blocker"), (h) => h.includes("dependency")]);
    col.note1 = find([(h) => h.includes("note 1") || h.includes("note1"), (h) => h.includes("note") && h.includes("1")]);
    col.note2 = find([(h) => h.includes("note 2") || h.includes("note2"), (h) => h.includes("note") && h.includes("2")]);
  }
  const cell = (row: string[], i: number) => (i >= 0 ? (row[i] || "") : "").trim();
  const out: ImportTaskRow[] = [];
  for (let r = start; r < matrix.length; r++) {
    const row = matrix[r];
    const rec = {} as ImportTaskRow;
    TASK_COLS.forEach((c) => { rec[c] = cell(row, col[c]); });
    if (rec.title && rec.product) out.push(rec);
  }
  return out;
}
function TaskImportModal({ onClose, onDone, flash }: { onClose: () => void; onDone: (msg: string) => void; flash: (m: string) => void; }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => rowsToTasks(parseCSV(text)), [text]);
  async function readFile(f: File) {
    const name = f.name.toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) { flash("Save the sheet as CSV and upload that, or paste the rows."); return; }
    setText(await f.text());
  }
  async function doImport() {
    if (!rows.length) { flash("No rows found. Paste CSV or choose a .csv file."); return; }
    setBusy(true);
    try {
      const res = await api("/api/tasks/import", { method: "POST", body: JSON.stringify({ rows }) });
      let msg = `Imported ${res.created} task${res.created === 1 ? "" : "s"}`;
      if (res.notes) msg += `, ${res.notes} progress note${res.notes === 1 ? "" : "s"}`;
      if (res.skipped) msg += `, skipped ${res.skipped}`;
      msg += ".";
      if (res.problems && res.problems.length) flash(res.problems[0]);
      onDone(msg);
    } catch (e) { flash((e as Error).message); setBusy(false); }
  }
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <div className="dhead"><h2>Import tasks</h2><button className="iconbtn" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="dbody">
          <p className="lead" style={{ marginBottom: 12 }}>Upload a CSV with columns <b>Ref, Product, Type, Title, Team, Owner, Reviewer, Priority, Status, Start Date, Due Date, Context, Blocker, Note 1, Note 2</b> (a header row is detected automatically). Products are matched or created by name and type; owners already on ProdBoard are linked to their accounts, the rest stay as labels to link later. Note 1 and Note 2 become progress notes. Rows whose Ref already exists are skipped, so re-running is safe.</p>
          <div className="field">
            <label htmlFor="tk-file">CSV file</label>
            <input id="tk-file" type="file" accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); }} />
          </div>
          <div className="field">
            <label htmlFor="tk-text">…or paste rows</label>
            <textarea id="tk-text" value={text} onChange={(e) => setText(e.target.value)} placeholder={"Ref,Product,Type,Title,Team,Owner,...,Status,Start Date,Due Date\nPRD-001-T01,WinBundle,Website,Written Content,Marketing,Jude,,2,NOT_STARTED,2026-10-01,2026-10-16"} style={{ minHeight: 120, fontFamily: "var(--mono)" }} />
          </div>
          <div className="hint">{rows.length ? `${rows.length} task${rows.length === 1 ? "" : "s"} detected.` : "No rows detected yet."}</div>
        </div>
        <div className="dfoot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={doImport} disabled={busy || !rows.length}>{busy ? "Importing…" : `Import ${rows.length || ""}`.trim()}</button>
        </div>
      </div>
    </>
  );
}

// ---------------- Notification settings ----------------
function NotificationsModal({ onClose, flash }: { onClose: () => void; flash: (m: string) => void; }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [digest, setDigest] = useState(false);
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [events, setEvents] = useState<{ key: string; label: string }[]>([]);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const d = await api("/api/me/notifications");
        setDigest(!!d.emailDigest);
        setMuted(new Set<string>(d.emailMuted || []));
        setEvents(d.events || []);
        setConfigured(d.emailConfigured !== false);
      } catch (e) { flash((e as Error).message); }
      setLoading(false);
    })();
  }, [flash]);

  function toggleEvent(key: string) {
    setMuted((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }

  async function save() {
    setBusy(true);
    try {
      await api("/api/me/notifications", { method: "POST", body: JSON.stringify({ emailDigest: digest, emailMuted: Array.from(muted) }) });
      flash("Notification settings saved");
      onClose();
    } catch (e) { flash((e as Error).message); setBusy(false); }
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <div className="dhead"><h2>Email notifications</h2><button className="iconbtn" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="dbody">
          {loading ? <div className="hint">Loading…</div> : (
            <>
              <label className="rolechk" style={{ alignItems: "flex-start" }}>
                <input type="checkbox" checked={digest} onChange={(e) => setDigest(e.target.checked)} />
                <span>
                  <b>Notify me by email</b>
                  <div className="hint" style={{ marginTop: 2 }}>Updates are batched and sent at most once every 15 minutes, so related events arrive in a single email rather than one per event. In-app notifications are unaffected.</div>
                </span>
              </label>
              {!configured && <div className="banner-ok" style={{ marginTop: 10 }}>Email sending is not set up on the server yet, so these will take effect once it is. Your choices are still saved.</div>}
              <div style={{ marginTop: 14, opacity: digest ? 1 : 0.5, pointerEvents: digest ? "auto" : "none" }}>
                <div className="hint" style={{ marginBottom: 6 }}>Email me about:</div>
                {events.map((ev) => (
                  <label key={ev.key} className="rolechk">
                    <input type="checkbox" checked={!muted.has(ev.key)} onChange={() => toggleEvent(ev.key)} />
                    <span>{ev.label}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="dfoot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={busy || loading}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </>
  );
}

// ---------------- Invite ----------------
// ---------------- Product groups ----------------
function GroupsModal({ groups, products, onClose, onChanged, onActivate, flash }: { groups: Group[]; products: Product[]; onClose: () => void; onChanged: () => Promise<void> | void; onActivate: (id: string) => void; flash: (m: string) => void; }) {
  const [mode, setMode] = useState<"list" | "edit">(groups.length ? "list" : "edit");
  const [editing, setEditing] = useState<Group | null>(null);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [pickView, setPickView] = useState<"list" | "grid">("list");
  const [busy, setBusy] = useState(false);

  const active = useMemo(() => products.filter((p) => !p.decommissioned), [products]);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = [...active].sort((a, b) => a.name.localeCompare(b.name));
    return q ? base.filter((p) => productOption(p).toLowerCase().includes(q)) : base;
  }, [active, query]);

  function startNew() { setEditing(null); setName(""); setPicked(new Set()); setQuery(""); setMode("edit"); }
  function startEdit(g: Group) { setEditing(g); setName(g.name); setPicked(new Set(g.productIds)); setQuery(""); setMode("edit"); }
  function toggle(id: string) { setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }

  async function save() {
    const nm = name.trim();
    if (!nm) { flash("Give the group a name."); return; }
    if (picked.size === 0) { flash("Pick at least one product."); return; }
    setBusy(true);
    try {
      if (editing) {
        await api(`/api/groups/${editing.id}`, { method: "PATCH", body: JSON.stringify({ name: nm, productIds: Array.from(picked) }) });
        flash("Group updated");
      } else {
        const d = await api("/api/groups", { method: "POST", body: JSON.stringify({ name: nm, productIds: Array.from(picked) }) });
        if (d.group?.id) onActivate(d.group.id);
        flash("Group created");
      }
      await onChanged();
      setMode("list");
    } catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  }
  async function remove(g: Group) {
    if (!confirm(`Delete the group “${g.name}”? This does not change any products or tasks.`)) return;
    setBusy(true);
    try { await api(`/api/groups/${g.id}`, { method: "DELETE" }); await onChanged(); flash("Group deleted"); } catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <div className="dhead"><h2>{mode === "edit" ? (editing ? "Edit group" : "New group") : "Product groups"}</h2><button className="iconbtn" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="dbody">
          {mode === "list" ? (
            <>
              <p className="lead" style={{ marginBottom: 12 }}>Your groups are personal. Pick one from the Groups bar to view just those products across the board, sheet, report and export.</p>
              {groups.length === 0 ? <div className="hint" style={{ marginBottom: 12 }}>You have no groups yet.</div> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                  {groups.map((g) => (
                    <div className="prow" key={g.id}>
                      <div className="prow-top">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>{g.name}</div>
                          <div className="hint">{g.productIds.length} product{g.productIds.length === 1 ? "" : "s"}</div>
                        </div>
                        <button className="btn ghost sm" onClick={() => startEdit(g)}>Edit</button>
                        <button className="btn ghost sm" onClick={() => remove(g)} disabled={busy}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button className="btn primary sm" onClick={startNew}>+ New group</button>
            </>
          ) : (
            <>
              <div className="field">
                <label htmlFor="gname">Group name</label>
                <input id="gname" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tuesday Standup" autoFocus />
              </div>
              <div className="field">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <label style={{ margin: 0 }}>Products <span className="hint">({picked.size} selected)</span></label>
                  <span className="grow" />
                  <div className="segmented sm">
                    <button type="button" aria-pressed={pickView === "list"} onClick={() => setPickView("list")}>List</button>
                    <button type="button" aria-pressed={pickView === "grid"} onClick={() => setPickView("grid")}>Grid</button>
                  </div>
                </div>
                <input type="search" placeholder="Filter products…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginBottom: 8 }} />
                <div style={{ maxHeight: 300, overflowY: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
                  {list.length === 0 ? <div className="hint" style={{ padding: 10 }}>No products match.</div>
                    : pickView === "list" ? list.map((p) => {
                      const on = picked.has(p.id);
                      return (
                        <label key={p.id} className={`gpickrow${on ? " on" : ""}`}>
                          <input type="checkbox" checked={on} onChange={() => toggle(p.id)} />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span className="gpick-name">{p.name}</span>
                            <span className="hint" style={{ display: "block" }}>Manager: {p.pm || "unassigned"}{p.type ? ` · ${p.type}` : ""}</span>
                          </span>
                        </label>
                      );
                    })
                    : (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8, padding: 10 }}>
                        {list.map((p) => {
                          const on = picked.has(p.id);
                          return (
                            <label key={p.id} className={`gpick${on ? " on" : ""}`}>
                              <input type="checkbox" checked={on} onChange={() => toggle(p.id)} />
                              <span style={{ minWidth: 0 }}><span className="gpick-name">{p.name}</span>{p.type ? <span className="hint" style={{ display: "block" }}>{p.type}</span> : null}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button className="btn ghost sm" onClick={() => (groups.length ? setMode("list") : onClose())} disabled={busy}>Cancel</button>
                <button className="btn primary sm" onClick={save} disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Create group"}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------- Highlights & presence ----------------
function HighlightDot({ color, onClick }: { color?: string; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button type="button" className="hldot" aria-label={color ? "Change highlight" : "Highlight task"} title="Highlight"
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      style={color ? { background: color, borderColor: color } : undefined}>
      {!color && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h16" /><path d="M14 4l6 6-9 9H5v-6z" /></svg>}
    </button>
  );
}
function HighlightPresetButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="btn ghost sm" onClick={onClick} title="Highlight presets" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h16" /><path d="M14 4l6 6-9 9H5v-6z" /></svg>
      Highlight
    </button>
  );
}
function HighlightMenu({ taskId, x, y, presets, current, onPick, onEditPresets, onClose }: { taskId: string; x: number; y: number; presets: HlPreset[]; current?: string; onPick: (color: string | null) => void; onEditPresets: () => void; onClose: () => void; }) {
  void taskId;
  const [custom, setCustom] = useState(current && !presets.some((p) => p.color.toLowerCase() === current.toLowerCase()) && /^#[0-9a-fA-F]{6}$/.test(current) ? current : "#8B5CF6");
  const left = Math.min(x, (typeof window !== "undefined" ? window.innerWidth : 1200) - 244);
  const top = Math.min(y, (typeof window !== "undefined" ? window.innerHeight : 800) - 240);
  return (
    <>
      <div className="hlscrim" onClick={onClose} />
      <div className="hlmenu" style={{ left, top }} role="menu">
        <div className="hlmenu-title">Highlight</div>
        {presets.map((p, i) => (
          <button key={i} type="button" className={`hlopt${current && current.toLowerCase() === p.color.toLowerCase() ? " on" : ""}`} onClick={() => onPick(p.color)}>
            <span className="hlsw" style={{ background: p.color }} />{p.name}
          </button>
        ))}
        <div className="hlcustom">
          <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(custom) ? custom : "#8B5CF6"} onChange={(e) => setCustom(e.target.value)} aria-label="Custom highlight color" />
          <button type="button" className="btn sm" onClick={() => onPick(custom)}>Apply color</button>
        </div>
        {current ? <button type="button" className="hlopt remove" onClick={() => onPick(null)}>Remove highlight</button> : null}
        <button type="button" className="hllink" onClick={onEditPresets}>Edit presets</button>
      </div>
    </>
  );
}
function HighlightPresetsModal({ presets, onClose, onSaved, flash }: { presets: HlPreset[]; onClose: () => void; onSaved: (p: HlPreset[]) => void; flash: (m: string) => void; }) {
  const [p, setP] = useState<HlPreset[]>(presets.map((x) => ({ ...x })));
  const [busy, setBusy] = useState(false);
  function set(i: number, k: keyof HlPreset, v: string) { setP((prev) => prev.map((x, j) => (j === i ? { ...x, [k]: v } : x))); }
  async function save() {
    if (p.some((x) => !x.name.trim())) { flash("Give each preset a name."); return; }
    setBusy(true);
    try { const d = await api("/api/me/highlight-presets", { method: "PATCH", body: JSON.stringify({ presets: p.map((x) => ({ name: x.name.trim(), color: x.color })) }) }); onSaved(d.presets); }
    catch (e) { flash((e as Error).message); setBusy(false); }
  }
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <div className="dhead"><h2>Highlight presets</h2><button className="iconbtn" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="dbody">
          <p className="lead" style={{ marginBottom: 12 }}>Two quick-pick colors for highlighting tasks. Highlights are private to you and stay with you across the board, list and sheet.</p>
          {p.map((x, i) => (
            <div key={i} className="two" style={{ alignItems: "flex-end" }}>
              <div className="field"><label>Preset {i + 1} name</label><input value={x.name} onChange={(e) => set(i, "name", e.target.value)} maxLength={40} placeholder={i === 0 ? "e.g. Focus" : "e.g. Risk"} /></div>
              <div className="field"><label>Color</label><input type="color" value={/^#[0-9a-fA-F]{6}$/.test(x.color) ? x.color : "#FDE047"} onChange={(e) => set(i, "color", e.target.value)} style={{ width: "100%", height: 40, padding: 2 }} /></div>
            </div>
          ))}
        </div>
        <div className="dfoot"><button className="btn" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save presets"}</button></div>
      </div>
    </>
  );
}
function PresencePanel({ members, meId, onClose }: { members: PresenceMember[]; meId: string; onClose: () => void; }) {
  const online = members.filter((m) => m.online);
  const offline = members.filter((m) => !m.online);
  return (
    <>
      <div className="hlscrim" onClick={onClose} />
      <div className="presencepanel" role="dialog" aria-label="Who is online">
        <div className="pp-head"><b>{online.length} online</b><button className="iconbtn" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="pp-body">
          {online.map((m) => <div key={m.id} className="pp-row"><span className="live-dot" /><span className="pp-name">{m.name}{m.id === meId ? " (you)" : ""}</span><span className="pp-role">{roleLabel(m.role)}</span></div>)}
          {online.length === 0 ? <div className="hint" style={{ padding: "4px 2px" }}>No one is online right now.</div> : null}
          {offline.length ? <div className="pp-sep">Offline</div> : null}
          {offline.map((m) => <div key={m.id} className="pp-row off"><span className="idle-dot" /><span className="pp-name">{m.name}{m.id === meId ? " (you)" : ""}</span><span className="pp-last">{m.lastSeenAt ? relTime(m.lastSeenAt) : "never"}</span></div>)}
        </div>
      </div>
    </>
  );
}

function NotificationPanel({ items, unread, onOpenItem, onMarkAll, onSettings, onClose }: { items: { id: string; type: string; taskId: string | null; text: string; read: boolean; createdAt: string }[]; unread: number; onOpenItem: (n: { id: string; taskId: string | null; read: boolean }) => void; onMarkAll: () => void; onSettings: () => void; onClose: () => void; }) {
  return (
    <>
      <div className="hlscrim" onClick={onClose} />
      <div className="presencepanel" role="dialog" aria-label="Notifications">
        <div className="pp-head"><b>Notifications</b><div style={{ display: "flex", alignItems: "center", gap: 8 }}>{unread > 0 ? <button className="linklike" onClick={onMarkAll}>Mark all read</button> : null}<button className="linklike" onClick={onSettings} title="Email notification settings">Settings</button><button className="iconbtn" onClick={onClose} aria-label="Close">✕</button></div></div>
        <div className="pp-body">
          {!items.length ? <div className="hint" style={{ padding: "6px 2px" }}>No notifications yet.</div> : items.map((n) => (
            <button key={n.id} className={`notif${n.read ? "" : " unread"}`} onClick={() => onOpenItem(n)}>
              <div className="notif-text">{n.text}</div>
              <div className="notif-time">{relTime(n.createdAt)}</div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

// ---------------- Owner Feedbacks (PM) ----------------
function FeedbacksView({ tasks, activity, dispName, onOpenTask }: { tasks: Task[]; activity: Activity[]; dispName: (id: string | null) => string; onOpenTask: (id: string) => void; }) {
  const list = [...tasks].sort((a, b) => (b.ownerDoneAt || "").localeCompare(a.ownerDoneAt || ""));
  return (
    <div className="pdlist" style={{ marginTop: 4 }}>
      {!list.length ? <div className="empty"><h3>Nothing awaiting confirmation</h3><p>When a task owner marks their work done, it appears here for you to confirm or send back.</p></div> : list.map((t) => {
        const lu = lastUpdateFor(t.id, activity);
        return (
          <button key={t.id} className="pdtask" style={{ ["--sc" as string]: "var(--warn-fg)" }} onClick={() => onOpenTask(t.id)}>
            <div className="pdtask-top"><span className="title">{t.title}</span><span className="awaitpill">Awaiting confirmation</span></div>
            <div className="meta"><span className="who">{t.ownerDoneBy || t.owner || "-"}</span><span>{dispName(t.productId)}</span>{t.ownerDoneAt ? <span className="tnum">Done {relTime(t.ownerDoneAt)}</span> : null}</div>
            {lu && lu.content ? <div className="ctxpreview">{lu.content}</div> : null}
          </button>
        );
      })}
    </div>
  );
}

// ---------------- Approvals (PM): owner-created tasks on new products ----------------
function ApprovalsView({ tasks, activity, dispName, onOpenTask }: { tasks: Task[]; activity: Activity[]; dispName: (id: string | null) => string; onOpenTask: (id: string) => void; }) {
  const list = [...tasks].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return (
    <div className="pdlist" style={{ marginTop: 4 }}>
      {!list.length ? <div className="empty"><h3>Nothing to approve</h3><p>When an owner or reviewer creates a task under a product new to them, it appears here for you to approve or send back.</p></div> : list.map((t) => {
        const lu = lastUpdateFor(t.id, activity);
        return (
          <button key={t.id} className="pdtask" style={{ ["--sc" as string]: "var(--accent)" }} onClick={() => onOpenTask(t.id)}>
            <div className="pdtask-top"><span className="title">{t.title}</span><span className="awaitpill">Pending approval</span></div>
            <div className="meta"><span className="who">{t.createdBy || t.owner || "-"}</span><span>{dispName(t.productId)}</span>{t.createdAt ? <span className="tnum">Created {relTime(t.createdAt)}</span> : null}</div>
            {lu && lu.content ? <div className="ctxpreview">{lu.content}</div> : null}
          </button>
        );
      })}
    </div>
  );
}

type InviteRoleChoice = "" | "PM" | "VIEWER" | "TASK_OWNER" | "REVIEWER";
function InviteModal({ onClose, flash }: { onClose: () => void; flash: (m: string) => void; }) {
  const [role, setRole] = useState<InviteRoleChoice>(""); // "" = let them choose
  const [firstName, setFirstName] = useState("");
  const [surname, setSurname] = useState("");
  const [linkName, setLinkName] = useState("");
  const [cands, setCands] = useState<{ users: string[]; unlinked: { label: string; count: number }[] }>({ users: [], unlinked: [] });
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { api("/api/invite/candidates").then((d) => setCands({ users: d.users || [], unlinked: d.unlinked || [] })).catch(() => {}); }, []);
  // Warn if this person looks like someone already on ProdBoard.
  const dupUser = cands.users.find((u) => {
    const un = u.trim().toLowerCase();
    return un === firstName.trim().toLowerCase() || (!!linkName && un === linkName.trim().toLowerCase());
  });

  async function createLink() {
    setBusy(true);
    try {
      const d = await api("/api/invite", {
        method: "POST",
        body: JSON.stringify({
          role: role || null,
          firstName: firstName.trim() || undefined,
          surname: surname.trim() || undefined,
          linkName: linkName.trim() || undefined,
        }),
      });
      setUrl(d.url);
      flash("Invite link ready");
    } catch (e) { flash((e as Error).message); } finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(url); flash("Invite link copied"); }
    catch { const el = document.getElementById("invite-url") as HTMLInputElement | null; if (el) { el.select(); } flash("Select and copy the link"); }
  }
  // Any change to the settings means the shown link no longer matches them.
  function onSetting<T>(setter: (v: T) => void) { return (v: T) => { setter(v); setUrl(""); }; }

  const inviteRoleLabel =
    role === "VIEWER" ? "Viewer (read-only)"
    : role === "PM" ? "Manager"
    : role === "TASK_OWNER" ? "Task owner"
    : role === "REVIEWER" ? "Reviewer"
    : "their choice of role";
  const named = [firstName.trim(), surname.trim()].filter(Boolean).join(" ");

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <div className="dhead"><h2>Invite a colleague</h2><button className="iconbtn" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="dbody">
          <p className="lead" style={{ marginBottom: 14 }}>Create a link to invite someone. Everything below is optional. Whoever signs up joins your organization automatically, with the organization locked in; they just set their email and password.</p>

          <div className="field">
            <label htmlFor="invite-role">Invite as</label>
            <select id="invite-role" value={role} onChange={(e) => onSetting(setRole)(e.target.value as InviteRoleChoice)}>
              <option value="">Let them choose</option>
              <option value="PM">Manager</option>
              <option value="VIEWER">Viewer (read-only)</option>
              <option value="TASK_OWNER">Task owner (sees only their tasks)</option>
              <option value="REVIEWER">Reviewer (sees only tasks they review)</option>
            </select>
            <div className="hint" style={{ marginTop: 4 }}>Leave as “Let them choose” to not preselect a role. A link can never grant admin. You can also grant a task owner or reviewer viewer access later under Members.</div>
          </div>

          {cands.unlinked.length > 0 && (
            <div className="field">
              <label htmlFor="invite-link">Link to an existing person <span className="hint">(optional)</span></label>
              <select id="invite-link" value={linkName} onChange={(e) => { const v = e.target.value; onSetting(setLinkName)(v); if (v && !firstName.trim()) onSetting(setFirstName)(v.split(/\s+/)[0]); }}>
                <option value="">Not linking to anyone</option>
                {cands.unlinked.map((c) => <option key={c.label} value={c.label}>{c.label} ({c.count} task{c.count === 1 ? "" : "s"})</option>)}
              </select>
              <div className="hint" style={{ marginTop: 4 }}>People named on tasks who are not on ProdBoard yet. Pick one and their new account inherits those tasks when they sign up.</div>
            </div>
          )}

          <div className="two">
            <div className="field">
              <label htmlFor="invite-first">First name <span className="hint">(optional)</span></label>
              <input id="invite-first" value={firstName} onChange={(e) => onSetting(setFirstName)(e.target.value)} placeholder="Prefilled for them" />
            </div>
            <div className="field">
              <label htmlFor="invite-surname">Surname <span className="hint">(optional)</span></label>
              <input id="invite-surname" value={surname} onChange={(e) => onSetting(setSurname)(e.target.value)} placeholder="Prefilled for them" />
            </div>
          </div>
          <div className="hint" style={{ marginTop: -4, marginBottom: 10 }}>If you fill these, the signup form comes prefilled{named ? <> for <b>{named}</b></> : null}; they can still edit them.</div>
          {dupUser && <div className="ownerbadge off" style={{ marginBottom: 10 }}>Someone named <b>{dupUser}</b> is already on ProdBoard. Check before inviting a duplicate.</div>}

          {!url ? (
            <button className="btn primary sm" onClick={createLink} disabled={busy} style={{ width: "100%" }}>{busy ? "Creating…" : "Create invite link"}</button>
          ) : (
            <>
              <div className="field">
                <label htmlFor="invite-url">Invite link</label>
                <input id="invite-url" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button className="btn ghost sm" onClick={createLink} disabled={busy}>New link</button>
                <button className="btn primary sm" onClick={copy}>Copy link</button>
              </div>
              <div className="hint" style={{ marginTop: 10 }}>This link invites as <b>{inviteRoleLabel}</b>{named ? <>, prefilled for <b>{named}</b>. Create a separate link for each person you name.</> : <>. It is reusable, so anyone you share it with can join.</>}{linkName ? <> It will link the new account to tasks assigned to <b>{linkName}</b>.</> : null}</div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------- Members ----------------
const ROLE_CHECKS: [Role, string][] = [["ADMIN", "Admin"], ["PM", "Manager"], ["VIEWER", "Viewer"], ["TASK_OWNER", "Task owner"], ["REVIEWER", "Reviewer"]];
const ROLE_PRIORITY: Role[] = ["ADMIN", "PM", "VIEWER", "TASK_OWNER", "REVIEWER"];
// The roles a member currently holds (primary role plus any granted capabilities).
function rolesOf(m: Member): Set<Role> {
  if (m.role === "ADMIN") return new Set<Role>(["ADMIN"]);
  const s = new Set<Role>([m.role]);
  if (m.viewAll) s.add("VIEWER");
  if (m.capPm) s.add("PM");
  if (m.capOwner) s.add("TASK_OWNER");
  if (m.capReviewer) s.add("REVIEWER");
  return s;
}
// Collapse a chosen role set into a primary role plus additive capability flags.
function rolesPayload(set: Set<Role>) {
  const pri = ROLE_PRIORITY.find((r) => set.has(r)) || "VIEWER";
  return {
    role: pri,
    viewAll: set.has("VIEWER") && pri !== "VIEWER" && pri !== "ADMIN",
    capPm: set.has("PM") && pri !== "PM" && pri !== "ADMIN",
    capOwner: set.has("TASK_OWNER") && pri !== "TASK_OWNER" && pri !== "ADMIN",
    capReviewer: set.has("REVIEWER") && pri !== "REVIEWER" && pri !== "ADMIN",
  };
}

function MembersModal({ meId, onClose, flash }: { meId: string; onClose: () => void; flash: (m: string) => void; }) {
  const [members, setMembers] = useState<Member[]>([]); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { try { setMembers((await api("/api/users")).users); } catch (e) { flash((e as Error).message); } finally { setLoading(false); } }, [flash]);
  useEffect(() => { load(); }, [load]);
  async function toggleRole(m: Member, role: Role, checked: boolean) {
    const next = rolesOf(m);
    if (role === "ADMIN") { if (checked) { next.clear(); next.add("ADMIN"); } else next.delete("ADMIN"); }
    else { if (checked) { next.add(role); next.delete("ADMIN"); } else next.delete(role); }
    if (next.size === 0) { flash("A member needs at least one role."); return; }
    try { await api("/api/users", { method: "PATCH", body: JSON.stringify({ userId: m.id, ...rolesPayload(next) }) }); await load(); flash("Roles updated"); }
    catch (e) { flash((e as Error).message); await load(); }
  }
  async function changeName(id: string, name: string, prev: string) {
    const n = name.trim();
    if (!n || n === prev) return;
    try { await api("/api/users", { method: "PATCH", body: JSON.stringify({ userId: id, name: n }) }); await load(); flash("Name updated"); } catch (e) { flash((e as Error).message); await load(); }
  }
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <div className="dhead"><h2>Members</h2><button className="iconbtn" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="dbody">
          <div className="hint" style={{ marginBottom: 10 }}>Tick every role a person should have; they can hold more than one and switch between them with the Mode selector. Admins manage everything. Managers create and update products and tasks. Viewers have read-only access to the whole organization. Task owners and reviewers see only their own work. A member’s name must match the Manager name on their products for scoping to work.</div>
          {loading ? <div className="hint">Loading…</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {members.map((m) => {
                const have = rolesOf(m);
                const adminOnly = m.role === "ADMIN";
                return (
                <div className="prow" key={m.id}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input defaultValue={m.name} onBlur={(e) => changeName(m.id, e.target.value, m.name)} style={{ fontWeight: 600, width: "100%", padding: "4px 6px", border: "1px solid var(--border)", borderRadius: 6, background: "var(--surface-2)" }} />
                    <div className="hint">{m.email}{m.id === meId ? " · you" : ""}</div>
                  </div>
                  <div className="rolechecks">
                    {ROLE_CHECKS.map(([r, label]) => (
                      <label key={r} className={`rolechk${have.has(r) ? " on" : ""}`}>
                        <input type="checkbox" checked={have.has(r)} onChange={(e) => toggleRole(m, r, e.target.checked)} />
                        {label}
                      </label>
                    ))}
                  </div>
                  {adminOnly && <div className="hint" style={{ marginTop: 4 }}>Admin has full access, so the other roles do not apply.</div>}
                </div>
              ); })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------- Feature alerts (admin) ----------------
const ALERT_AUD: [string, string][] = [["all", "Everyone"], ["pm", "Managers"], ["owner", "Task owners"], ["reviewer", "Reviewers"], ["viewer", "Viewers"]];
function audienceLabel(aud: string[]): string {
  if (!aud || !aud.length || aud.includes("all")) return "Everyone";
  return aud.map((a) => ALERT_AUD.find(([k]) => k === a)?.[1] || a).join(", ");
}
function FeatureAlertsModal({ onClose, flash, onChanged }: { onClose: () => void; flash: (m: string) => void; onChanged: () => void; }) {
  type Row = { id: string; title: string; body: string; linkUrl: string | null; linkLabel: string | null; audience: string[]; active: boolean; dismissals: number; createdAt: string };
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [aud, setAud] = useState<Set<string>>(new Set(["all"]));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => { try { setRows((await api("/api/feature-alerts?manage=1")).alerts || []); } catch (e) { flash((e as Error).message); } finally { setLoading(false); } }, [flash]);
  useEffect(() => { load(); }, [load]);

  function toggleAud(k: string) {
    setAud((cur) => {
      const n = new Set(cur);
      if (k === "all") return new Set(["all"]);
      n.delete("all");
      if (n.has(k)) n.delete(k); else n.add(k);
      if (n.size === 0) n.add("all");
      return n;
    });
  }
  async function create() {
    if (!title.trim() || !body.trim()) { setErr("Give the alert a title and a message."); return; }
    if (linkUrl.trim() && !/^https?:\/\//i.test(linkUrl.trim())) { setErr("A link must start with http:// or https://."); return; }
    setErr(""); setBusy(true);
    try {
      await api("/api/feature-alerts", { method: "POST", body: JSON.stringify({ title, body, linkUrl: linkUrl.trim() || undefined, linkLabel: linkLabel.trim() || undefined, audience: Array.from(aud) }) });
      setTitle(""); setBody(""); setLinkUrl(""); setLinkLabel(""); setAud(new Set(["all"]));
      await load(); onChanged(); flash("Feature alert posted");
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  async function toggleActive(r: Row) { try { await api(`/api/feature-alerts/${r.id}`, { method: "PATCH", body: JSON.stringify({ active: !r.active }) }); await load(); onChanged(); } catch (e) { flash((e as Error).message); } }
  async function remove(r: Row) { try { await api(`/api/feature-alerts/${r.id}`, { method: "DELETE" }); await load(); onChanged(); flash("Alert deleted"); } catch (e) { flash((e as Error).message); } }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <div className="dhead"><h2>Feature alerts</h2><button className="iconbtn" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="dbody">
          <p className="lead" style={{ marginBottom: 12 }}>Announce a new feature to the people it matters to. Each person sees it until they dismiss it.</p>
          <div className="field req"><label>Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Reviewers can now add notes" maxLength={160} /></div>
          <div className="field req"><label>Message</label><textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="What changed and what to do with it" maxLength={2000} /></div>
          <div className="two">
            <div className="field"><label>Link <span className="hint">(optional)</span></label><input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" /></div>
            <div className="field"><label>Link label <span className="hint">(optional)</span></label><input value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="Learn more" /></div>
          </div>
          <div className="field"><label>Who should see it</label>
            <div className="rolechecks">
              {ALERT_AUD.map(([k, label]) => (
                <label key={k} className={`rolechk${aud.has(k) ? " on" : ""}`}>
                  <input type="checkbox" checked={aud.has(k)} onChange={() => toggleAud(k)} />
                  {label}
                </label>
              ))}
            </div>
          </div>
          {err && <div className="err">{err}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}><button className="btn primary sm" onClick={create} disabled={busy}>{busy ? "Posting…" : "Post alert"}</button></div>

          <div className="hist" style={{ marginTop: 18 }}>
            <h3>Posted alerts ({rows.length})</h3>
            {loading ? <div className="hint">Loading…</div> : !rows.length ? <div className="hint">No alerts yet.</div> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
                {rows.map((r) => (
                  <div className="prow" key={r.id}>
                    <div className="prow-top">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{r.title}{!r.active ? <span className="hint"> · inactive</span> : null}</div>
                        <div className="hint">{audienceLabel(r.audience)} · {r.dismissals} dismissed</div>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="btn sm" onClick={() => toggleActive(r)}>{r.active ? "Deactivate" : "Reactivate"}</button>
                        <button className="btn ghost sm" onClick={() => remove(r)}>Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
