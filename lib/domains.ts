// Email-domain allowlist helpers. An org's allowedDomains is a list of bare
// domains (e.g. ["celdinnovations.com"]); an empty list means every domain is
// allowed.

export function emailDomain(email: string): string {
  const at = email.lastIndexOf("@");
  return at >= 0 ? email.slice(at + 1).trim().toLowerCase() : "";
}

// Clean admin input into stored domains: lowercase, drop a leading @, trim, keep
// only plausible domains, de-duplicate.
export function normalizeDomains(input: string[]): string[] {
  const out: string[] = [];
  for (const raw of input || []) {
    const d = String(raw).trim().toLowerCase().replace(/^@+/, "").replace(/\/+$/, "");
    if (d && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(d) && !out.includes(d)) out.push(d);
  }
  return out;
}

export function domainAllowed(email: string, allowedDomains: string[] | null | undefined): boolean {
  if (!allowedDomains || allowedDomains.length === 0) return true;
  return allowedDomains.includes(emailDomain(email));
}
