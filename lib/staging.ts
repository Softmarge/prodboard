import crypto from "crypto";

// The staging access gate. On the staging deployment (NEXT_PUBLIC_APP_ENV =
// "staging") every user sees the test-environment banner and must enter a
// passcode to get in. The passcode itself lives only in server env
// (STAGING_PASSCODE) and is emailed to the org's admins on request.

export const STAGING_COOKIE = "staging_ok";

export function stagingGateOn(): boolean {
  return process.env.NEXT_PUBLIC_APP_ENV === "staging";
}

// The value the unlock cookie must hold to prove a correct passcode was entered.
// Derived from the passcode and AUTH_SECRET so it can't be forged, and so
// rotating either invalidates every unlock. Null when not configured.
export function stagingUnlockToken(): string | null {
  const pass = process.env.STAGING_PASSCODE;
  const secret = process.env.AUTH_SECRET;
  if (!pass || !secret) return null;
  return crypto.createHmac("sha256", secret).update("staging-unlock:" + pass).digest("hex");
}

export function stagingPasscodeMatches(input: string): boolean {
  const pass = process.env.STAGING_PASSCODE || "";
  if (!pass || !input) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(pass);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
