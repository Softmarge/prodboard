import { NextRequest, NextResponse } from "next/server";
import { readToken, SESSION_COOKIE } from "./lib/auth";

// Protect the dashboard and the API (except auth endpoints). Uses jose only,
// which is Edge-compatible; no Prisma or bcrypt here.
const PUBLIC_API = ["/api/auth/login", "/api/auth/signup", "/api/auth/logout", "/api/auth/forgot", "/api/auth/reset"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const user = token ? await readToken(token) : null;

  const isApi = pathname.startsWith("/api");
  const isPublicApi = PUBLIC_API.some((p) => pathname.startsWith(p));

  if (isApi) {
    if (isPublicApi) return NextResponse.next();
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    return NextResponse.next();
  }

  // Page routes
  if (pathname.startsWith("/dashboard")) {
    if (!user) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
  }
  if ((pathname === "/login" || pathname === "/signup") && user) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/signup", "/api/:path*"],
};
