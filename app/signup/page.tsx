"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import PasswordInput from "@/app/components/PasswordInput";
import { passwordProblem, PASSWORD_MIN } from "@/lib/password";

function SignupForm() {
  const router = useRouter();
  const invite = useSearchParams().get("invite") || "";
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "", organization: "", role: "PM" });
  const [invitedOrg, setInvitedOrg] = useState<string | null>(null);
  const [inviteBad, setInviteBad] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  useEffect(() => {
    if (!invite) return;
    (async () => {
      try {
        const res = await fetch(`/api/invite/${invite}`);
        if (!res.ok) { setInviteBad(true); return; }
        const d = await res.json();
        setInvitedOrg(d.organization);
        setForm((f) => ({ ...f, organization: d.organization }));
      } catch { setInviteBad(true); }
    })();
  }, [invite]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const pwProblem = passwordProblem(form.password);
    if (pwProblem) { setErr(pwProblem); return; }
    if (form.password !== form.confirm) { setErr("Passwords do not match."); return; }
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name, email: form.email, password: form.password,
          organization: form.organization, role: form.role,
          ...(invite ? { inviteToken: invite } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Sign up failed."); setBusy(false); return; }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setErr("Network error. Try again.");
      setBusy(false);
    }
  }

  const joining = !!invitedOrg;

  return (
    <>
      <h1>Create your account</h1>
      <p className="lead">
        {joining ? <>You are joining <b>{invitedOrg}</b>.</> : "The first person to register an organization becomes its admin (Lead PM)."}
      </p>
      {inviteBad && <div className="err" style={{ marginBottom: 12 }}>That invite link is invalid or expired. You can still create a new organization below, or ask your colleague for a fresh link.</div>}
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="name">Full name</label>
          <input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="org">Organization</label>
          <input id="org" value={form.organization} onChange={(e) => set("organization", e.target.value)} placeholder="e.g. Acme Rewards" required disabled={joining} />
          {joining && <div className="hint" style={{ marginTop: 4 }}>Set by your invite link and cannot be changed.</div>}
        </div>
        <div className="field">
          <label htmlFor="role">Role</label>
          <select id="role" value={form.role} onChange={(e) => set("role", e.target.value)}>
            <option value="PM">Product Manager</option>
            <option value="VIEWER">Viewer (read-only)</option>
          </select>
          <div className="hint" style={{ marginTop: 4 }}>
            {joining ? "An admin can change your role later under Members." : "If you are the first to register this organization, you will be made admin automatically."}
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
        {err && <div className="err">{err}</div>}
        <button className="btn primary" type="submit" disabled={busy} style={{ width: "100%", marginTop: 6 }}>
          {busy ? "Creating…" : "Create account"}
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
          <div className="logo">
            <div className="mk">PB</div>
            <div>
              <div className="nm">ProdBoard</div>
              <div className="sub">Tech delivery visibility</div>
            </div>
          </div>
        </div>
        <Suspense fallback={<div className="hint">Loading…</div>}>
          <SignupForm />
        </Suspense>
      </div>
    </div>
  );
}
