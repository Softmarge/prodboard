"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import "../landing.css";

function Arrow() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="M13 6l6 6-6 6" /></svg>;
}
function Tick() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>;
}

export default function Landing({ signedIn }: { signedIn: boolean }) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.getAttribute("data-theme") === "dark");
  }, []);
  function toggleTheme() {
    const next = dark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("pdt_theme", next); } catch {}
    setDark(!dark);
  }

  const startHref = signedIn ? "/dashboard" : "/signup";

  return (
    <div className="lp" id="top">
      <header className="lp-header">
        <nav className="lp-nav">
          <a href="#top" className="lp-brand">
            <span className="lp-mark">PB</span>
            <span className="lp-brandname">ProdBoard</span>
          </a>
          <div className="lp-navlinks">
            <a href="#features">Features</a>
            <a href="#product">Product</a>
            <a href="#how">How it works</a>
          </div>
          <div className="lp-navactions">
            <button type="button" className="lp-themebtn" onClick={toggleTheme} aria-label="Toggle light or dark theme">
              {dark
                ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
                : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>}
            </button>
            {signedIn ? (
              <Link href="/dashboard" className="lp-btn lp-btn-primary lp-btn-sm">Go to dashboard</Link>
            ) : (
              <>
                <Link href="/login" className="lp-link">Sign in</Link>
                <Link href="/signup" className="lp-btn lp-btn-primary lp-btn-sm">Get started</Link>
              </>
            )}
          </div>
        </nav>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-copy">
          <span className="lp-eyebrow-pill"><span className="lp-dot" />Product management, pinned in one place</span>
          <h1 className="lp-h1">Every product. Every task. One board.</h1>
          <p className="lp-sub">ProdBoard brings your products, tasks, owners and timelines onto a single board, so standups run on facts and nothing slips between teams.</p>
          <div className="lp-hero-actions">
            <Link href={startHref} className="lp-btn lp-btn-primary lp-btn-lg lp-btn-hero">Start your board<Arrow /></Link>
            <a href="#product" className="lp-btn lp-btn-ghost lp-btn-lg">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /><path d="M15 4v16" /></svg>
              See the board
            </a>
          </div>
          <div className="lp-ticks">
            <span className="lp-tick"><Tick />Kanban, list and card views</span>
            <span className="lp-tick"><Tick />Weekly reports built in</span>
          </div>
        </div>
        <div className="lp-hero-art">
          <img src="/hero-board.jpg" alt="A corkboard titled Product Board with colour-coded product folders pinned to it" className="lp-hero-img" />
          <div className="lp-float">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span className="lp-pill ip">In progress</span>
              <span className="lp-pr p1">P1</span>
            </div>
            <div className="lp-tcard-title">Mobile App Designs and Prototype</div>
            <div className="lp-ttime">Timeline: Sep 29 to Oct 13</div>
          </div>
        </div>
      </section>

      <section id="features" className="lp-band">
        <div className="lp-section">
          <div className="lp-feature-head">
            <span className="lp-eyebrow">Features</span>
            <h2 className="lp-h2">Built around how product teams already work</h2>
            <p className="lp-lead">From the Monday plan to the Friday report, ProdBoard keeps the whole picture in one place.</p>
          </div>
          <div className="lp-feature-grid">
            <div className="lp-feature">
              <span className="lp-ficon f1"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="5" height="16" rx="1.5" /><rect x="10" y="4" width="5" height="11" rx="1.5" /><rect x="17" y="4" width="4" height="7" rx="1.5" /></svg></span>
              <h3>One main board</h3>
              <p>Switch between Kanban, list and card grid. Not started, in progress, in review and complete, all at a glance.</p>
            </div>
            <div className="lp-feature">
              <span className="lp-ficon f2"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.4 3.4-5.5 6.5-5.5s5.7 2.1 6.5 5.5" /><circle cx="17.5" cy="9" r="2.5" /><path d="M17 14.5c2.4.2 4 1.9 4.5 4.5" /></svg></span>
              <h3>Groups for every standup</h3>
              <p>Save a group per meeting or person, open it, and the board shows exactly the tasks that matter to that room.</p>
            </div>
            <div className="lp-feature">
              <span className="lp-ficon f3"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4-2v-4z" /></svg></span>
              <h3>Filters that think like a PM</h3>
              <p>Slice by team, owner, request, PM or status, or rewind the board to any date with As of.</p>
            </div>
            <div className="lp-feature">
              <span className="lp-ficon f4"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5" /><path d="M9 13h7" /><path d="M9 17h5" /></svg></span>
              <h3>Weekly report, written for you</h3>
              <p>What moved, what shipped and what is stuck, pulled straight from the board every week.</p>
            </div>
            <div className="lp-feature">
              <span className="lp-ficon f5"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12h4l3-7 4 14 3-7h4" /></svg></span>
              <h3>Activity you can trust</h3>
              <p>Every status change, owner swap and timeline shift is logged, so nobody has to ask what happened.</p>
            </div>
            <div className="lp-feature">
              <span className="lp-ficon f6"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M4 20h16" /></svg></span>
              <h3>Sheet view and CSV export</h3>
              <p>Need it in a spreadsheet? Open the sheet view or export the filtered board to CSV in one click.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="product" className="lp-section">
        <div className="lp-product-head">
          <span className="lp-eyebrow">The product</span>
          <h2 className="lp-h2">Your whole week, on one screen</h2>
          <p className="lp-lead">Products, owners, priorities and timelines side by side. Open the board in your standup and talk through it top to bottom.</p>
        </div>
        <div className="lp-window">
          <div className="lp-winbar">
            <span className="lp-windot" /><span className="lp-windot" /><span className="lp-windot" />
            <span className="lp-winurl">app.prodboard.[your-domain]</span>
          </div>
          <div className="lp-winbody">
            <div className="lp-tabs">
              <div className="lp-tabrow">
                <span className="lp-tab-active">Main Board <span style={{ fontSize: 12, opacity: 0.8 }}>(5)</span></span>
                <span className="lp-tab">My Products</span>
                <span className="lp-tab">Products</span>
                <span className="lp-tab">Sheet</span>
                <span className="lp-tab">Weekly report</span>
                <span className="lp-tab">Activity</span>
              </div>
              <div className="lp-seg">
                <span className="lp-seg-on">Kanban</span><span>List</span><span>Card grid</span>
              </div>
            </div>
            <div className="lp-boardscroll">
              <div className="lp-board">
                <div className="lp-col">
                  <div className="lp-coltop"><span className="lp-pill ns">Not started</span><span className="lp-count">1</span></div>
                  <div className="lp-tcard ns">
                    <div className="lp-tcard-top"><span className="lp-tcard-title">Implementation of multi language feature</span><span className="lp-pr p2">P2</span></div>
                    <div className="lp-tmeta">Mobile App <span className="who">Adekunle</span></div>
                    <div className="lp-trow">Engineering <span className="lp-tag">User Experience</span></div>
                    <div className="lp-ttime">Timeline: <span>Oct 20 to Nov 7, 2026</span></div>
                  </div>
                </div>
                <div className="lp-col">
                  <div className="lp-coltop"><span className="lp-pill ip">In progress</span><span className="lp-count">2</span></div>
                  <div className="lp-tcard ip">
                    <div className="lp-tcard-top"><span className="lp-tcard-title">Payment Gateway Integration</span><span className="lp-pr p1">P1</span></div>
                    <div className="lp-tmeta">Company Web App <span className="who">Chukwuma</span></div>
                    <div className="lp-tmeta">Engineering</div>
                    <div className="lp-ttime">Timeline: <span>Sep 29 to Oct 13, 2026</span></div>
                  </div>
                  <div className="lp-tcard ip">
                    <div className="lp-tcard-top"><span className="lp-tcard-title">Account creation optimization</span><span className="lp-pr p1">P1</span></div>
                    <div className="lp-tmeta">Mobile App <span className="who">Adekunle</span></div>
                    <div className="lp-trow">Product <span className="lp-tag">User Experience</span></div>
                    <div className="lp-ttime">Timeline: <span>Oct 1 to Oct 15, 2026</span></div>
                  </div>
                </div>
                <div className="lp-col">
                  <div className="lp-coltop"><span className="lp-pill rv">In review</span><span className="lp-count">1</span></div>
                  <div className="lp-tcard rv">
                    <div className="lp-tcard-top"><span className="lp-tcard-title">Admin Dashboard fixes</span><span className="lp-pr p2">P2</span></div>
                    <div className="lp-tmeta">Company Web App <span className="who">Aisha</span></div>
                    <div className="lp-trow">Engineering <span className="lp-tag">User Experience</span></div>
                    <div className="lp-ttime">Timeline: <span>Oct 6 to Oct 14, 2026</span></div>
                  </div>
                </div>
                <div className="lp-col">
                  <div className="lp-coltop"><span className="lp-pill cp">Complete</span><span className="lp-count">1</span></div>
                  <div className="lp-tcard cp">
                    <div className="lp-tcard-top"><span className="lp-tcard-title">Push Notification clean up</span><span className="lp-pr p1">P1</span></div>
                    <div className="lp-tmeta">Mobile App <span className="who">Chukwuma</span></div>
                    <div className="lp-trow">Engineering <span className="lp-tag">Push Notif</span></div>
                    <div className="lp-ttime">Timeline: <span>Sep 15 to Sep 29, 2026</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="lp-band">
        <div className="lp-section">
          <div className="lp-feature-head">
            <span className="lp-eyebrow">How it works</span>
            <h2 className="lp-h2">Up and running before your next standup</h2>
          </div>
          <div className="lp-steps">
            <div className="lp-step">
              <span className="lp-step-num">01</span>
              <h3>Pin your products</h3>
              <p>Add each product your team owns. Every one gets its own space for projects and tasks.</p>
            </div>
            <div className="lp-step">
              <span className="lp-step-num">02</span>
              <h3>Break work into tasks</h3>
              <p>Give each task an owner, a team, a priority and a timeline. Invite members to update their own.</p>
            </div>
            <div className="lp-step">
              <span className="lp-step-num">03</span>
              <h3>Run the room from the board</h3>
              <p>Open a group, walk the columns and send the weekly report when you are done.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-cta">
        <div className="lp-cta-inner">
          <div className="lp-cta-copy">
            <h2>Put every product on the board.</h2>
            <p>Set up your first board in minutes and bring it to your next standup.</p>
          </div>
          <div className="lp-cta-actions">
            <Link href={startHref} className="lp-cta-primary">Start your board</Link>
            <a href="#features" className="lp-cta-ghost">See the features</a>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <span className="lp-footer-mark">PB</span>
            <span>ProdBoard by CeLD Innovation Limited</span>
          </div>
          <div className="lp-footer-links">
            <Link href="/login">Sign in</Link>
            <Link href="/signup">Get started</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
