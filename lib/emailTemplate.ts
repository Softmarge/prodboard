// Branded, email-client-safe HTML for ProdBoard's transactional emails.
// Table layout + inline styles only (email clients ignore <style>/flex/grid).
// Brand: navy #092950, teal #00A9B2. The logo is referenced by absolute URL so it
// resolves in the inbox; alt text covers clients that block images.

type Btn = { label: string; url: string };

export function brandedEmail(opts: {
  origin: string;
  heading: string;
  intro?: string;
  code?: string; // a verification code to show prominently
  button?: Btn; // a call-to-action button
  outro?: string; // small print under the main content
}): string {
  const { origin, heading, intro, code, button, outro } = opts;
  const logo = `${origin}/prodboard-logo.png`;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const codeBlock = code
    ? `<tr><td style="padding:8px 0 4px">
         <div style="font-size:30px;font-weight:700;letter-spacing:10px;color:#092950;background:#eef1f5;border-radius:10px;padding:16px 0;text-align:center;font-family:'Courier New',monospace">${esc(code)}</div>
       </td></tr>`
    : "";

  const buttonBlock = button
    ? `<tr><td style="padding:14px 0 4px">
         <a href="${esc(button.url)}" style="display:inline-block;background:#092950;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px">${esc(button.label)}</a>
       </td></tr>`
    : "";

  const introBlock = intro ? `<tr><td style="padding:4px 0;color:#5a6678;font-size:14px;line-height:1.5">${intro}</td></tr>` : "";
  const outroBlock = outro ? `<tr><td style="padding:14px 0 0;color:#8a94a4;font-size:12px;line-height:1.5">${outro}</td></tr>` : "";

  return `<!doctype html>
<html><body style="margin:0;background:#f4f6f8;padding:24px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto">
    <tr><td style="padding:4px 4px 16px">
      <img src="${logo}" alt="ProdBoard" height="28" style="height:28px;display:block;border:0" />
    </td></tr>
    <tr><td style="background:#ffffff;border:1px solid #e2e6ea;border-radius:14px;padding:26px 24px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="font-size:20px;font-weight:700;color:#092950;padding-bottom:6px">${esc(heading)}</td></tr>
        ${introBlock}
        ${codeBlock}
        ${buttonBlock}
        ${outroBlock}
      </table>
    </td></tr>
    <tr><td style="padding:16px 4px;color:#8a94a4;font-size:12px">
      ProdBoard &middot; <a href="${origin}" style="color:#0e7c84;text-decoration:none">prodboard.app</a><br/>
      If you did not expect this email, you can safely ignore it.
    </td></tr>
  </table>
</body></html>`;
}
