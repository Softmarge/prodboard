import { SessionUser } from "@/lib/auth";
import { canWrite, canViewAll } from "@/lib/api";

export const ALERT_AUDIENCES = ["all", "pm", "owner", "reviewer", "viewer"] as const;
export type AlertAudience = (typeof ALERT_AUDIENCES)[number];

// The audience keys this user matches, so an alert targeted at any of them reaches
// them. Targeting is by designated role/capability, not by actual task assignment.
export function userAudienceKeys(user: SessionUser): Set<string> {
  const s = new Set<string>(["all"]);
  if (user.role === "ADMIN") {
    ["pm", "owner", "reviewer", "viewer"].forEach((k) => s.add(k));
    return s;
  }
  if (canWrite(user)) s.add("pm");
  if (user.role === "TASK_OWNER" || user.capOwner === true) s.add("owner");
  if (user.role === "REVIEWER" || user.capReviewer === true) s.add("reviewer");
  if (canViewAll(user)) s.add("viewer");
  return s;
}

// An alert reaches a user when it targets everyone or any audience they match.
export function alertMatches(audience: string[], keys: Set<string>): boolean {
  if (!audience || audience.length === 0) return true;
  if (audience.includes("all")) return true;
  return audience.some((a) => keys.has(a));
}
