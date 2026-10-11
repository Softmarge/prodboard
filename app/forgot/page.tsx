"use client";
import { useState } from "react";
import Link from "next/link";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error || "Something went wrong.");
        setBusy(false);
        return;
      }
      setSent(true);
    } catch {
      setErr("Network error. Try again.");
      setBusy(false);
    }
  }

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
        <h1>Reset your password</h1>
        {sent ? (
          <>
            <div className="banner-ok">If an account exists for that email, a reset link is on its way. The link expires in one hour.</div>
            <p className="lead">Check your inbox, then follow the link to choose a new password.</p>
            <div className="foot"><Link href="/login">Back to sign in</Link></div>
          </>
        ) : (
          <>
            <p className="lead">Enter the email on your account and we will send a reset link.</p>
            <form onSubmit={submit}>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              {err && <div className="err">{err}</div>}
              <button className="btn primary" type="submit" disabled={busy} style={{ width: "100%", marginTop: 6 }}>
                {busy ? "Sending…" : "Send reset link"}
              </button>
            </form>
            <div className="foot"><Link href="/login">Back to sign in</Link></div>
          </>
        )}
      </div>
    </div>
  );
}
