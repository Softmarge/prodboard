import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export type RateRule = { limit: number; windowMs: number };

// Tunable limits in one place. Windows are rolling fixed windows.
export const LIMITS = {
  login: { limit: 8, windowMs: 15 * 60_000 }, // per ip+email
  loginIp: { limit: 40, windowMs: 15 * 60_000 }, // per ip, stops spraying many emails
  signup: { limit: 6, windowMs: 60 * 60_000 }, // signup start per ip
  emailSend: { limit: 6, windowMs: 60 * 60_000 }, // forgot / resend per ip (email cost + bombing)
  verify: { limit: 25, windowMs: 15 * 60_000 }, // code checks per ip
  api: { limit: 240, windowMs: 60_000 }, // general authenticated writes per user
} as const;

// The caller's IP from the proxy headers Vercel sets. Falls back to a constant
// so a missing header shares one bucket rather than bypassing the limit.
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim() || "unknown";
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export type RateResult = { ok: boolean; retryAfter: number };

// Increment the counter for this window and report whether the limit is exceeded.
// Fails open: if the datastore errors, the request is allowed rather than blocked.
export async function rateLimit(bucket: string, identifier: string, rule: RateRule): Promise<RateResult> {
  const now = Date.now();
  const windowStart = Math.floor(now / rule.windowMs) * rule.windowMs;
  const expiresAt = new Date(windowStart + rule.windowMs);
  const key = `${bucket}:${identifier}:${windowStart}`;
  try {
    let count: number;
    try {
      const row = await prisma.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, expiresAt },
        update: { count: { increment: 1 } },
      });
      count = row.count;
    } catch {
      // Rare create race on the unique key: the row now exists, so increment it.
      const row = await prisma.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
      count = row.count;
    }
    // Opportunistic cleanup of expired counters so the table stays small.
    if (Math.random() < 0.02) {
      prisma.rateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});
    }
    return { ok: count <= rule.limit, retryAfter: Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000)) };
  } catch {
    return { ok: true, retryAfter: 0 };
  }
}

// A 429 with a friendly message and a Retry-After header.
export function tooMany(retryAfter: number, message?: string) {
  const mins = Math.ceil(retryAfter / 60);
  const wait = retryAfter >= 90 ? `about ${mins} minute${mins === 1 ? "" : "s"}` : `${retryAfter} second${retryAfter === 1 ? "" : "s"}`;
  return NextResponse.json(
    { error: message || `Too many requests. Please wait ${wait} and try again.` },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
