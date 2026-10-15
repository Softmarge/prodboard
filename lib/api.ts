import { NextResponse } from "next/server";
import { getSession, SessionUser } from "./auth";
import { rateLimit, tooMany, LIMITS } from "./ratelimit";

export type Handler = (ctx: {
  user: SessionUser;
  req: Request;
  params: Record<string, string>;
}) => Promise<Response> | Response;

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Require a signed-in user. */
export async function requireUser(): Promise<SessionUser | null> {
  return getSession();
}

/** Can this user write shared data (create/edit tasks & products)? True for an
 *  admin, a PM, or anyone granted the PM capability. */
export function canWrite(user: SessionUser): boolean {
  return user.role === "ADMIN" || user.role === "PM" || user.capPm === true;
}

/** Can this user see the whole organization (read-only is enough)? Admins and
 *  viewers can; so can anyone granted the viewer capability (viewAll). */
export function canViewAll(user: SessionUser): boolean {
  return user.role === "ADMIN" || user.role === "VIEWER" || user.viewAll === true;
}

/** Scoped to the products a PM manages (plus their own owned/reviewed tasks). */
export function canManageScoped(user: SessionUser): boolean {
  return user.role === "PM" || user.capPm === true;
}

/** Scoped to only the tasks this user owns or reviews, not the whole org. */
export function isOwnerScoped(user: SessionUser): boolean {
  return !canViewAll(user) && !canManageScoped(user);
}

/** Holds a task-owner or reviewer persona (by role or granted capability). */
export function isOwnerOrReviewer(user: SessionUser): boolean {
  return user.role === "TASK_OWNER" || user.role === "REVIEWER" || user.capOwner === true || user.capReviewer === true;
}

/** Admin-only actions (manage users, reassign products, delete). */
export function isAdmin(user: SessionUser): boolean {
  return user.role === "ADMIN";
}

/** Wrap a route handler with auth; passes the session user through. */
export function withAuth(
  handler: (user: SessionUser, req: Request, params: Record<string, string>) => Promise<Response> | Response,
) {
  return async (req: Request, context: { params?: Record<string, string> }) => {
    const user = await getSession();
    if (!user) return error("Not signed in", 401);
    // Safety-net cap on writes per user. Reads (polled often) are left uncounted.
    if (req.method && req.method !== "GET" && req.method !== "HEAD") {
      const rl = await rateLimit("api", user.uid, LIMITS.api);
      if (!rl.ok) return tooMany(rl.retryAfter, "You are doing that too fast. Give it a moment and try again.");
    }
    return handler(user, req, context?.params ?? {});
  };
}
