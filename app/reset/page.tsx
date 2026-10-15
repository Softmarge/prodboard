"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import PasswordInput from "@/app/components/PasswordInput";
import BrandLogo from "@/app/components/BrandLogo";
import { passwordProblem, PASSWORD_MIN } from "@/lib/password";

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = passwordProblem(password);
    if (p) { setErr(p); return; }
    if (password !== confirm) { setErr("Passwords do not match."); return; }
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error || "Could not reset password."); setBusy(false); return; }
      setDone(true);
      setTimeout(() => { router.push("/login"); router.refresh(); }, 1500);
    } catch {
      setErr("Network error. Try again.");
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <>
        <h1>Reset your password</h1>
        <div className="err">This reset link is missing its token. Request a new link.</div>
        <div className="foot"><Link href="/forgot">Request a new link</Link></div>
      </>
    );
  }
  if (done) {
    return (
      <>
        <h1>Password updated</h1>
        <div className="banner-ok">Your password has been changed. Taking you to sign in…</div>
        <div className="foot"><Link href="/login">Sign in</Link></div>
      </>
    );
  }
  return (
    <>
      <h1>Choose a new password</h1>
      <p className="lead">Set a new password for your account.</p>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="password">New password</label>
          <PasswordInput id="password" autoComplete="new-password" value={password} onChange={setPassword} />
          <div className="hint" style={{ marginTop: 4 }}>At least {PASSWORD_MIN} characters, with a letter and a number.</div>
        </div>
        <div className="field">
          <label htmlFor="confirm">Confirm new password</label>
          <PasswordInput id="confirm" autoComplete="new-password" value={confirm} onChange={setConfirm} />
        </div>
        {err && <div className="err">{err}</div>}
        <button className="btn primary" type="submit" disabled={busy} style={{ width: "100%", marginTop: 6 }}>
          {busy ? "Saving…" : "Update password"}
        </button>
      </form>
      <div className="foot"><Link href="/login">Back to sign in</Link></div>
    </>
  );
}

export default function ResetPage() {
  return (
    <div className="authwrap">
      <div className="authcard">
        <div className="brandrow">
          <Link href="/" className="logo" style={{ textDecoration: "none", color: "inherit" }} aria-label="ProdBoard home">
            <BrandLogo height={30} sub="Tech delivery visibility" />
          </Link>
        </div>
        <Suspense fallback={<div className="hint">Loading…</div>}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
