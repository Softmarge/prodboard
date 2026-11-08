import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Dashboard from "@/app/components/Dashboard";
import StagingGate from "@/app/components/StagingGate";
import { stagingGateOn, stagingUnlockToken, STAGING_COOKIE } from "@/lib/staging";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  // On staging, every user sees the test-environment banner and must enter the
  // staging passcode (held only in server env, emailed to admins on request) to
  // get in. Production leaves NEXT_PUBLIC_APP_ENV unset, so this is a no-op there.
  // Before a passcode is configured, admins are let through so they are never
  // locked out while setting it up.
  if (stagingGateOn()) {
    const token = stagingUnlockToken();
    const unlocked = !!token && cookies().get(STAGING_COOKIE)?.value === token;
    const adminFallback = !token && user.role === "ADMIN";
    if (!unlocked && !adminFallback) return <StagingGate hasPasscode={!!token} />;
  }

  const leadRows = await prisma.teamLead.findMany({ where: { userId: user.uid }, select: { teamId: true } });

  return (
    <Dashboard
      me={{ id: user.uid, name: user.name, email: user.email, role: user.role, viewAll: user.viewAll === true, capPm: user.capPm === true, capOwner: user.capOwner === true, capReviewer: user.capReviewer === true, leadTeamIds: leadRows.map((r: any) => r.teamId) }}
    />
  );
}
