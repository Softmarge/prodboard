"use client";
import { useState, type FormEvent } from "react";

// Shown on staging to every user after login. The test-environment banner stays
// visible; entering the staging passcode (emailed to the admin) lets this
// browser through to the app.
export default function StagingGate({ hasPasscode }: { hasPasscode: boolean }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailed, setEmailed] = useState(false);

  async function unlock(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/staging/unlock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passcode: code.trim() }) });
      if (r.ok) { window.location.reload(); return; }
      const d = await r.json().catch(() => ({}));
      setErr(d.error || "That passcode is not right.");
    } catch {
      setErr("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function emailAdmin() {
    setErr("");
    try {
      const r = await fetch("/api/staging/passcode-email", { method: "POST" });
      if (r.ok) setEmailed(true);
      else { const d = await r.json().catch(() => ({})); setErr(d.error || "Could not email the passcode."); }
    } catch {
      setErr("Could not email the passcode.");
    }
  }

  return (
    <div className="stagingblock">
      <div className="stagingblock-card">
        <div className="stagingblock-badge">Staging</div>
        <h1>This is the test environment</h1>
        <p>
          You are on ProdBoard staging, which is for feature testing only. Anything you do here does not reach the live
          app and may be wiped at any time. Please do your real work on the live site.
        </p>

        {hasPasscode ? (
          <form onSubmit={unlock} style={{ display: "flex", flexDirection: "column", gap: 8, margin: "4px 0 10px" }}>
            <input
              value={code}
              onChange={(e) => { setCode(e.target.value); setErr(""); }}
              placeholder="Enter staging passcode"
              autoFocus
              style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", textAlign: "center", letterSpacing: 2 }}
            />
            <button className="btn primary" type="submit" disabled={busy || !code.trim()}>{busy ? "Checking…" : "Enter staging"}</button>
          </form>
        ) : (
          <p className="stagingblock-foot">A staging passcode has not been set up yet. Ask the admin.</p>
        )}

        {err && <div className="stagingblock-foot" style={{ color: "#f87171" }}>{err}</div>}

        <a className="btn" href="https://prodboard.app">Go to prodboard.app</a>

        <div className="stagingblock-foot">
          {emailed
            ? "Sent. The passcode is on its way to the admin's email."
            : <button className="linklike" type="button" onClick={emailAdmin}>Email the passcode to the admin</button>}
        </div>
      </div>
    </div>
  );
}
