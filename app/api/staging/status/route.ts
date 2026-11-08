import { withAuth, json } from "@/lib/api";
import { stagingGateOn, stagingUnlockToken } from "@/lib/staging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Diagnostic: reports only whether the gate's env is reaching this runtime,
// never any secret value. Temporary, remove once the gate is confirmed working.
export const GET = withAuth(async () => {
  return json({
    appEnv: process.env.NEXT_PUBLIC_APP_ENV ?? null,
    gateOn: stagingGateOn(),
    hasPasscode: !!process.env.STAGING_PASSCODE,
    passcodeLength: (process.env.STAGING_PASSCODE || "").length,
    hasAuthSecret: !!process.env.AUTH_SECRET,
    tokenComputed: !!stagingUnlockToken(),
    emailConfigured: !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
  });
});
