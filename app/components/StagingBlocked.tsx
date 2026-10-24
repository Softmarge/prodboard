import Link from "next/link";

// Shown on the staging environment to anyone who is not allowlisted, so people
// do their real work on production instead of on a throwaway copy.
export default function StagingBlocked() {
  return (
    <div className="stagingblock">
      <div className="stagingblock-card">
        <div className="stagingblock-badge">Staging</div>
        <h1>This is the test environment</h1>
        <p>
          You are on ProdBoard staging, which is for feature testing only. Anything you do here does not reach the live
          app and may be wiped at any time. Please do your real work on the live site.
        </p>
        <a className="btn primary" href="https://prodboard.app">Go to prodboard.app</a>
        <div className="stagingblock-foot">If you were asked to test a specific feature here, ask the admin to grant your account staging access.</div>
      </div>
    </div>
  );
}
