// The notification events a user can choose to receive by email, with a
// friendly label for each. The raw Notification.type values map onto these
// keys; anything not listed here is in-app only and never emailed.

export type EmailEvent = { key: string; label: string; types: string[] };

export const EMAIL_EVENTS: EmailEvent[] = [
  { key: "assigned", label: "A task is assigned to me", types: ["assigned"] },
  { key: "review_assigned", label: "I am added as a reviewer", types: ["review_assigned"] },
  { key: "review_ready", label: "A task is ready for my review", types: ["review_ready"] },
  { key: "approval_request", label: "A task needs my approval", types: ["approval_request"] },
  { key: "owner_created", label: "An owner adds a task on my product", types: ["owner_created"] },
  { key: "owner_done", label: "An owner marks their task done", types: ["owner_done"] },
  { key: "approved", label: "My proposed task is approved", types: ["approved"] },
  { key: "sendback", label: "My task is sent back for changes", types: ["sendback"] },
  { key: "confirm", label: "My task is confirmed complete", types: ["confirm"] },
];

export const EMAIL_EVENT_KEYS = EMAIL_EVENTS.map((e) => e.key);

// raw notification type -> event key
const TYPE_TO_KEY: Record<string, string> = {};
for (const e of EMAIL_EVENTS) for (const t of e.types) TYPE_TO_KEY[t] = e.key;

export function eventKeyForType(type: string): string | null {
  return TYPE_TO_KEY[type] || null;
}

export function labelForType(type: string): string {
  const key = TYPE_TO_KEY[type];
  const ev = EMAIL_EVENTS.find((e) => e.key === key);
  return ev ? ev.label : "Update";
}

// Is this notification type emailable given the user's muted-event list?
export function isEmailable(type: string, muted: string[]): boolean {
  const key = eventKeyForType(type);
  if (!key) return false;
  return !muted.includes(key);
}
