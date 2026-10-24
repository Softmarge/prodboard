import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import Dashboard from "@/app/components/Dashboard";
import StagingBlocked from "@/app/components/StagingBlocked";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getSession();
  if (!user) redirect("/login");

  // On the staging environment, only admins and allowlisted emails may use the
  // app. Everyone else is sent to production. Controlled by NEXT_PUBLIC_APP_ENV
  // (set to "staging" on the staging deployment) and STAGING_ALLOW (a
  // comma-separated email list). Production leaves both unset, so this is a no-op there.
  if (process.env.NEXT_PUBLIC_APP_ENV === "staging") {
    const allow = (process.env.STAGING_ALLOW || "").toLowerCase().split(",").map((s) => s.trim()).filter(Boolean);
    const allowed = user.role === "ADMIN" || allow.includes((user.email || "").toLowerCase());
    if (!allowed) return <StagingBlocked />;
  }

  return (
    <Dashboard
      me={{ id: user.uid, name: user.name, email: user.email, role: user.role, viewAll: user.viewAll === true, capPm: user.capPm === true, capOwner: user.capOwner === true, capReviewer: user.capReviewer === true }}
    />
  );
}
