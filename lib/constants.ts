// Default team / function names. Organizations can add their own, stored on
// Organization.teams; the effective list is these plus the custom ones.
export const TEAM_BASE = [
  "AI",
  "Project",
  "BD",
  "Expansion",
  "Legal",
  "Customer Service",
  "HR",
  "Marketing",
  "Operations",
  "Sales",
];

export const PRODUCT_TYPES = [
  "Mobile App",
  "Website",
  "Web App",
  "USSD",
  "Backend / API",
  "Other",
];

// Default personal highlight presets (each user can rename and recolor these).
export const HL_PRESET_DEFAULTS: { name: string; color: string }[] = [
  { name: "Focus", color: "#FDE047" },
  { name: "Risk", color: "#F9A8D4" },
];

// A user is considered online if their last heartbeat was within this window.
export const ONLINE_WINDOW_MS = 2 * 60 * 1000;
