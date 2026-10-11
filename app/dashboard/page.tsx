import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import Dashboard from "@/app/components/Dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  return (
    <Dashboard
      me={{ id: user.uid, name: user.name, email: user.email, role: user.role }}
    />
  );
}
