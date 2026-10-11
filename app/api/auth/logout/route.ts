import { clearSession } from "@/lib/auth";
import { json } from "@/lib/api";

export const runtime = "nodejs";

export async function POST() {
  clearSession();
  return json({ ok: true });
}
