"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import PasswordInput from "@/app/components/PasswordInput";
import BrandLogo from "@/app/components/BrandLogo";
import { passwordProblem, PASSWORD_MIN } from "@/lib/password";

function roleName(r: string | null): string {
  switch (r) {
    case "VIEWER": return "Viewer (read-only)";
    case "PM": return "Manager";
    case "TASK_OWNER": return "Task owner";
    case "REVIEWER": return "Reviewer";
    default: return "Manager";
  }
}

function SignupForm() {
  const router = useRouter();
  const invite = useSearchParams().get("invite") || "";
  const [step, setStep] = useState<"form" | "code">("form");
  const [form, setForm] = useState({ firstName: "", surname: "", email: "", password: "", confirm: "", organization: "", role: "PM" });
  const [invitedOrg, setInvitedOrg] = useState<string | null>(null);
  const [invitedRole, setInvitedRole] = useState<string | null>(null);
  const [invitedLinkName, setInvitedLinkName] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [resentMsg, setResentMsg] = useState("");
  const [relayed, setRelayed] = useState(false);
  const [accepted, setAccepted] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  useEffect(() => {
    if (!invite) return;
    (async () => {
      try {
        const res = await fetch(`/api/invite/${invite}`);
        if (!res.ok) { const e = await res.json().catch(() => ({})); setInviteError(e.error || "That invite link is invalid or expired."); return; }
        const d = await res.json();
        setInvitedOrg(d.organization);
        setInvitedRole(d.role || null);
        setInvitedLinkName(d.linkName || null);
        setForm((f) => ({
          ...f,
          organization: d.organization,
          role: d.role || f.role,
          firstName: d.firstName || f.firstName,
          surname: d.surname || f.surname,
        }));
      } catch { setInviteError("That invite link is invalid or expired."); }
    })();
  }, [invite]);

  async function startSignup(e: React.FormEvent) {
    e.preventDefault();
    const pwProblem = passwordProblem(form.password);
    if (pwProblem) { setErr(pwProblem); return; }
    if (form.password !== form.confirm) { setErr("Passwords do not match."); return; }
    if (!accepted) { setErr("Please accept the Terms of Service and Privacy Policy to continue."); return; }
    setErr(""); setBusy(true);
    try {
      const res = await fetch("/api/auth/signup/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: form.firstName, surname: form.surname, email: form.email, password: form.password,
          organization: form.organization, role: form.role, acceptedTerms: accepted,
          ...(invite ? { inviteToken: invite } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Sign up failed."); setBusy(false); return; }
      setRelayed(!!data.relayed); setBusy(false); setStep("code"); setErr("");
    } catch { setErr("Network error. Try again."); setBusy(false); }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{4}$/.test(code)) { setErr("Enter the 4-digit code from your email."); return; }
    setErr(""); setBusy(true);
    try {
      const res = await fetch("/api/auth/signup/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, code }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Verification failed."); setBusy(false); return; }
      router.push("/dashboard"); router.refresh();
    } catch { setErr("Network error. Try again."); setBusy(false); }
  }

  async function resend() {
    setErr(""); setResentMsg("");
    try {
      const res = await fetch("/api/auth/signup/resend", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d.error || "Could not resend."); return; }
      setResentMsg("A new code is on its way.");
    } catch { setErr("Network error. Try again."); }
  }

  const joining = !!invitedOrg;

  if (step === "code") {
    return (
      <>
        <h1>Verify your email</h1>
        <p className="lead">
          {relayed
            ? <>Your 4-digit code was sent to your workspace administrator for approval. Ask them for the code, then enter it here to finish creating your account.</>
            : <>We sent a 4-digit code to <b>{form.email}</b>. Enter it to finish creating your account.</>}
        </p>
        {resentMsg && <div className="banner-ok">{resentMsg}</div>}
        <form onSubmit={verifyCode}>
          <div className="field">
            <label htmlFor="code">Verification code</label>
            <input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={4} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
              style={{ fontSize: 24, letterSpacing: 10, textAlign: "center", fontVariantNumeric: "tabular-nums" }}
              placeholder="0000" required autoFocus />
          </div>
          {err && <div className="err">{err}</div>}
          <button className="btn primary" type="submit" disabled={busy} style={{ width: "100%", marginTop: 6 }}>
            {busy ? "Verifying…" : "Verify & create account"}
          </button>
        </form>
        <div className="foot">
          Did not get it? <button className="linklike" type="button" onClick={resend}>Resend code</button>
          {" · "}
          <button className="linklike" type="button" onClick={() => { setStep("form"); setErr(""); setCode(""); }}>Change details</button>
        </div>
      </>
    );
  }

  return (
    <>
      <h1>Create your account</h1>
      <p className="lead">
        {joining ? <>You are joining <b>{invitedOrg}</b>.{invitedLinkName ? <> Your account will be linked to work assigned to <b>{invitedLinkName}</b>.</> : null}</> : "The first person to register an organization becomes its admin."}
      </p>
      {inviteError && <div className="err" style={{ marginBottom: 12 }}>{inviteError} You can still create a new organization below, or ask your colleague for a fresh link.</div>}
      <form onSubmit={startSignup}>
        <div className="two">
          <div className="field">
            <label htmlFor="firstName">First name</label>
            <input id="firstName" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="surname">Surname</label>
            <input id="surname" value={form.surname} onChange={(e) => set("surname", e.target.value)} required />
          </div>
        </div>
        <div className="hint" style={{ marginTop: -4, marginBottom: 10 }}>Your display name will be your first name{form.firstName ? <> (<b>{form.firstName.trim()}</b>)</> : ""}, and must be unique in your organization.</div>
        <div className="field">
          <label htmlFor="org">Organization</label>
          <input id="org" value={form.organization} onChange={(e) => set("organization", e.target.value)} placeholder="e.g. Acme Rewards" required disabled={joining} />
          {joining && <div className="hint" style={{ marginTop: 4 }}>Set by your invite link and cannot be changed.</div>}
        </div>
        <div className="field">
          <label htmlFor="role">Role</label>
          <select id="role" value={form.role} onChange={(e) => set("role", e.target.value)} disabled={joining && !!invitedRole}>
            <option value="PM">Manager</option>
            <option value="VIEWER">Viewer (read-only)</option>
            {(invitedRole === "TASK_OWNER" || form.role === "TASK_OWNER") && <option value="TASK_OWNER">Task owner</option>}
            {(invitedRole === "REVIEWER" || form.role === "REVIEWER") && <option value="REVIEWER">Reviewer</option>}
          </select>
          <div className="hint" style={{ marginTop: 4 }}>
            {joining
              ? (invitedRole
                  ? <>Set to <b>{roleName(invitedRole)}</b> by your invite link. An admin can change it later under Members.</>
                  : "Choose your role. An admin can change it later under Members.")
              : "If you are the first to register this organization, you will be made admin automatically."}
          </div>
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" value={form.email} onChange={(e) => set("email", e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <PasswordInput id="password" autoComplete="new-password" value={form.password} onChange={(v) => set("password", v)} />
          <div className="hint" style={{ marginTop: 4 }}>At least {PASSWORD_MIN} characters, with a letter and a number.</div>
        </div>
        <div className="field">
          <label htmlFor="confirm">Confirm password</label>
          <PasswordInput id="confirm" autoComplete="new-password" value={form.confirm} onChange={(v) => set("confirm", v)} />
        </div>
        <label className="chkline" style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, margin: "4px 0 10px" }}>
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} style={{ marginTop: 2 }} />
          <span>I agree to the <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a> and <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</span>
        </label>
        {err && <div className="err">{err}</div>}
        <button className="btn primary" type="submit" disabled={busy || !accepted} style={{ width: "100%", marginTop: 6 }}>
          {busy ? "Sending code…" : "Continue"}
        </button>
      </form>
      <div className="foot">Already have an account? <Link href="/login">Sign in</Link></div>
    </>
  );
}

export default function SignupPage() {
  return (
    <div className="authwrap">
      <div className="authcard">
        <div className="brandrow">
          <Link href="/" className="logo" style={{ textDecoration: "none", color: "inherit" }} aria-label="ProdBoard home">
            <BrandLogo height={30} sub="Tech delivery visibility" />
          </Link>
        </div>
        <Suspense fallback={<div className="hint">Loading…</div>}>
          <SignupForm />
        </Suspense>
      </div>
    </div>
  );
}
