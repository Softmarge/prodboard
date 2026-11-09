"use client";

import { useState, type FormEvent } from "react";

// Shown in place of the app when an admin requires this user to move to an
// approved email domain before continuing. Two steps: enter the new address,
// then confirm the code emailed to it.
export default function ChangeEmailRequired({ email }: { email: string }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [newEmail, setNewEmail] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function startChange(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/me/email/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ newEmail: newEmail.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) setStep("code");
      else setErr(d.error || "Could not start the change.");
    } catch {
      setErr("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/me/email/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) window.location.reload();
      else setErr(d.error || "That code is not right.");
    } catch {
      setErr("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
    window.location.href = "/login";
  }

  const inp: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--surface-2)",
    color: "var(--text)",
    textAlign: "center",
  };

  return (
    <div className="stagingblock">
      <div className="stagingblock-card" style={{ borderTopColor: "#f59e0b" }}>
        <div className="stagingblock-badge" style={{ background: "#f59e0b", color: "#1a1200" }}>Action needed</div>
        <h1>Update your email</h1>
        <p>An administrator requires you to use an approved email address before continuing. Your current email is <b>{email}</b>.</p>

        {step === "email" ? (
          <form onSubmit={startChange} style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => { setNewEmail(e.target.value); setErr(""); }}
              placeholder="New email address"
              autoFocus
              style={inp}
            />
            <button className="btn primary" type="submit" disabled={busy || !newEmail.trim()}>
              {busy ? "Sending…" : "Send code"}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
            <p className="stagingblock-foot" style={{ margin: 0 }}>Enter the 4-digit code sent to <b>{newEmail}</b>.</p>
            <input
              inputMode="numeric"
              value={code}
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 4)); setErr(""); }}
              placeholder="4-digit code"
              autoFocus
              style={{ ...inp, letterSpacing: 6 }}
            />
            <button className="btn primary" type="submit" disabled={busy || code.length !== 4}>
              {busy ? "Checking…" : "Confirm new email"}
            </button>
            <button className="linklike" type="button" onClick={() => { setStep("email"); setCode(""); setErr(""); }}>
              Use a different email
            </button>
          </form>
        )}

        {err && <div className="stagingblock-foot" style={{ color: "#f87171" }}>{err}</div>}
        <div className="stagingblock-foot">
          <button className="linklike" type="button" onClick={signOut}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
