import { withAuth, json } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lightweight liveness check the client polls. withAuth returns 403 { locked }
// for a locked account before this runs, which the client turns into the
// locked screen.
export const GET = withAuth(async () => json({ ok: true }));
