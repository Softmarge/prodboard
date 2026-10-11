import { NextResponse } from "next/server";
import { getSession, SessionUser } from "./auth";

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

/** Can this user write shared data (create/edit tasks & products)? */
export function canWrite(user: SessionUser): boolean {
  return user.role === "ADMIN" || user.role === "PM";
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
    return handler(user, req, context?.params ?? {});
  };
}
