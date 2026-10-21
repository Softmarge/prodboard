import Link from "next/link";

export const metadata = { title: "Privacy Policy - ProdBoard" };

export default function PrivacyPage() {
  return (
    <div className="legalwrap">
      <div className="legalhead">
        <Link href="/" className="legal-logo">ProdBoard</Link>
        <Link href="/terms">Terms of Service</Link>
      </div>

      <h1>Privacy Policy</h1>
      <div className="legal-meta">Effective 21 October 2026</div>

      <div className="legal-banner">
        This is a starting template aligned to the Nigeria Data Protection Act 2023 (NDPA) and the EU/UK GDPR. Items in square brackets must be completed, and the whole policy should be reviewed by a qualified lawyer before you rely on it.
      </div>

      <h2>1. Who we are</h2>
      <p>ProdBoard (the Service) is operated by [Operator legal name], of [registered address] (we, us, our). We are the data controller for personal data processed through the Service. For privacy questions or to exercise your rights, contact us at [privacy@prodboard.app].</p>

      <h2>2. What we collect</h2>
      <ul>
        <li><b>Account data:</b> your first name, surname, display name, email address, organization name, and a securely hashed password.</li>
        <li><b>Content you create:</b> products, tasks, descriptions, progress notes, blockers, reviewers, owners, and reference fields you enter into the Service.</li>
        <li><b>Usage and activity:</b> actions you take, timestamps, approval and status history, and online presence.</li>
        <li><b>Technical data:</b> your network (IP) address, used for security and rate limiting, and a single session cookie used to keep you signed in.</li>
      </ul>

      <h2>3. How we use your data</h2>
      <p>To provide and operate the Service, authenticate you, send transactional emails (such as verification codes) and optional notification digests you have turned on, maintain security and prevent abuse, and keep the Service reliable.</p>

      <h2>4. Legal bases (GDPR)</h2>
      <p>Where the GDPR applies, we rely on: performance of a contract (to provide the Service you request), your consent (for optional notification emails, which you can withdraw at any time), our legitimate interests (securing the Service and preventing abuse), and legal obligations where applicable.</p>

      <h2>5. Cookies</h2>
      <p>We use one strictly necessary, httpOnly session cookie to keep you signed in. We do not use advertising or third-party tracking cookies. Your browser may also store small UI preferences (such as a chosen filter or theme) on your own device.</p>

      <h2>6. Sharing and processors</h2>
      <p>We do not sell your personal data. We share it only with service providers who process it on our behalf under agreements: hosting (Vercel), database (Neon), and email delivery (Resend). We may also disclose data where required by law.</p>

      <h2>7. International transfers</h2>
      <p>Our providers may process data outside Nigeria, including in the United States and the European Union. Where we transfer personal data across borders, we take steps required under the NDPA and use appropriate contractual safeguards.</p>

      <h2>8. Retention</h2>
      <p>We keep your personal data while your account is active and for a limited period afterwards, then delete or anonymise it, unless we must keep it longer to meet a legal obligation. You can ask us to delete your data, subject to those obligations.</p>

      <h2>9. Your rights</h2>
      <p>Subject to applicable law, you may request access to your data, correction, deletion, restriction or objection to processing, and portability, and you may withdraw consent you have given. To exercise any of these, contact us at [privacy@prodboard.app]. You also have the right to complain to the Nigeria Data Protection Commission (NDPC) or, in the EU/UK, your local supervisory authority.</p>

      <h2>10. Security</h2>
      <p>We protect data in transit with encryption (HTTPS), store passwords only as salted bcrypt hashes, rate-limit sensitive actions, and restrict access. No online service can be perfectly secure, so we cannot guarantee absolute security.</p>

      <h2>11. Children</h2>
      <p>The Service is not directed to anyone under 18, and you should not use it, or provide anyone else's personal data through it, unless you are 18 or older (or the age of majority in your region).</p>

      <h2>12. Changes</h2>
      <p>We may update this policy. If we make a material change, we will take reasonable steps to tell you. The effective date above shows when this version took effect.</p>

      <h2>13. Contact</h2>
      <p>[Operator legal name], [privacy@prodboard.app]. Data protection contact: [name or role].</p>

      <div className="legal-foot">
        <Link href="/">Home</Link>
        <Link href="/terms">Terms of Service</Link>
      </div>
    </div>
  );
}
