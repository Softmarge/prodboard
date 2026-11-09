"use client";

// Shown in place of the app when an admin has locked this account.
export default function LockedOut() {
  async function signOut() {
    try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
    window.location.href = "/login";
  }
  return (
    <div className="stagingblock">
      <div className="stagingblock-card" style={{ borderTopColor: "#dc2626" }}>
        <div className="stagingblock-badge" style={{ background: "#dc2626" }}>Locked</div>
        <h1>This account has been locked</h1>
        <p>An administrator has locked your ProdBoard account, so you can&apos;t use it right now. If you think this is a mistake, contact your administrator.</p>
        <button className="btn" onClick={signOut}>Sign out</button>
      </div>
    </div>
  );
}
