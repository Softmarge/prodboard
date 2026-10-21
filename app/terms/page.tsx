import Link from "next/link";

export const metadata = { title: "Terms of Service - ProdBoard" };

export default function TermsPage() {
  return (
    <div className="legalwrap">
      <div className="legalhead">
        <Link href="/" className="legal-logo">ProdBoard</Link>
        <Link href="/privacy">Privacy Policy</Link>
      </div>

      <h1>Terms of Service</h1>
      <div className="legal-meta">Effective 21 October 2026</div>

      <div className="legal-banner">
        This is a starting template. Items in square brackets must be completed, and the terms should be reviewed by a qualified lawyer before you rely on them.
      </div>

      <h2>1. Agreement</h2>
      <p>By creating an account or using ProdBoard (the Service), operated by [Operator legal name] (we, us, our), you agree to these Terms of Service and to our <Link href="/privacy">Privacy Policy</Link>. If you do not agree, do not use the Service.</p>

      <h2>2. The service</h2>
      <p>ProdBoard is a hosted tool for tracking pending deliverables, tasks and projects across teams. We may add, change or remove features over time.</p>

      <h2>3. Eligibility</h2>
      <p>You must be at least 18 years old (or the age of majority in your region). If you use the Service on behalf of an organization, you confirm you are authorised to bind that organization to these terms.</p>

      <h2>4. Your account</h2>
      <p>Provide accurate information, keep your password secure, and do not share your account. You are responsible for activity under your account. Tell us promptly if you suspect unauthorised access.</p>

      <h2>5. Acceptable use</h2>
      <ul>
        <li>Do not use the Service for anything unlawful, infringing, or abusive.</li>
        <li>Do not attempt to breach or probe security, disrupt the Service, or access data that is not yours.</li>
        <li>Do not reverse engineer or resell the Service except as permitted by law.</li>
        <li>Do not upload personal data of others without a lawful basis to do so.</li>
      </ul>

      <h2>6. Your content</h2>
      <p>You keep ownership of the content you enter. You grant us the limited right to host, store and process that content solely to provide and maintain the Service. You are responsible for having the right to store and use the content and personal data you put into the Service.</p>

      <h2>7. Availability</h2>
      <p>The Service is provided on an as-is and as-available basis, without warranties of any kind to the extent permitted by law. It is an evolving product and we do not promise it will be uninterrupted or error-free.</p>

      <h2>8. Limitation of liability</h2>
      <p>To the maximum extent permitted by law, we are not liable for indirect, incidental or consequential losses, or for lost profits or data. Our total liability arising from the Service is limited to [the amount you paid us in the 12 months before the claim, or a nominal amount if the Service is free].</p>

      <h2>9. Suspension and termination</h2>
      <p>We may suspend or end access if these terms are breached or to protect the Service or its users. You may stop using the Service at any time and ask us to delete your account.</p>

      <h2>10. Changes to these terms</h2>
      <p>We may update these terms. If a change is material, we will take reasonable steps to notify you. Continuing to use the Service after a change means you accept the updated terms.</p>

      <h2>11. Governing law</h2>
      <p>These terms are governed by the laws of the Federal Republic of Nigeria, and disputes are subject to the courts of [jurisdiction].</p>

      <h2>12. Contact</h2>
      <p>[Operator legal name], [legal@prodboard.app].</p>

      <div className="legal-foot">
        <Link href="/">Home</Link>
        <Link href="/privacy">Privacy Policy</Link>
      </div>
    </div>
  );
}
