import { withAuth, json, requestOrigin } from "@/lib/api";
import { stagingGateOn, stagingUnlockToken } from "@/lib/staging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Diagnostic: reports only whether the gate's env reaches this runtime and what
// host/origin the request resolves to (no secret values). Temporary.
export const GET = withAuth(async (_user, req) => {
  return json({
    appEnv: process.env.NEXT_PUBLIC_APP_ENV ?? null,
    gateOn: stagingGateOn(),
    hasPasscode: !!process.env.STAGING_PASSCODE,
    tokenComputed: !!stagingUnlockToken(),
    emailConfigured: !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
    // Origin diagnostics for the link bug:
    reqUrlOrigin: new URL(req.url).origin,
    hostHeader: req.headers.get("host"),
    xForwardedHost: req.headers.get("x-forwarded-host"),
    xForwardedProto: req.headers.get("x-forwarded-proto"),
    computedOrigin: requestOrigin(req),
    appOriginEnv: process.env.APP_ORIGIN ?? null,
    verificationRelayTo: process.env.VERIFICATION_RELAY_TO ? "set" : null,
  });
});
