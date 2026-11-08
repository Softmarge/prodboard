import { z } from "zod";
import { cookies } from "next/headers";
import { withAuth, json, error } from "@/lib/api";
import { stagingGateOn, stagingUnlockToken, stagingPasscodeMatches, STAGING_COOKIE } from "@/lib/staging";

export const runtime = "nodejs";

const Body = z.object({ passcode: z.string().min(1).max(200) });

// Verify the staging passcode and, on success, set a session cookie that lets
// this browser past the banner until it closes.
export const POST = withAuth(async (user, req) => {
  if (!stagingGateOn()) return error("Not available here.", 400);
  const token = stagingUnlockToken();
  if (!token) return error("The staging passcode is not set up yet. Ask the admin.", 503);
  let data;
  try {
    data = Body.parse(await req.json());
  } catch {
    return error("Enter the passcode.");
  }
  if (!stagingPasscodeMatches(data.passcode.trim())) return error("That passcode is not right.", 401);
  cookies().set(STAGING_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  return json({ ok: true });
});
