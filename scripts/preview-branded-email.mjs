/**
 * Local preview of the REAL branded email shell output after the
 * left-align change. Reproduces src/services/email/brandedEmailShell.ts
 * markup verbatim (post-edit: outer td align="left", header
 * text-align:left) with the same body as the quote-accepted email in
 * Raj's screenshot, then writes an .html file we can open in a browser.
 *
 * No network / no Resend key needed - this is a pure render so we can
 * eyeball the layout. Run: node scripts/preview-branded-email.mjs
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const primary = "#4f46e5"; // Spit Braai indigo
const accent = primary;
const ctaTextColor = "#ffffff";
const companyName = "Spit Braai Delivery";

const contentHtml = `
<p style="margin:0 0 18px 0;line-height:1.65;color:#1f2937;font-size:16px;mso-line-height-rule:exactly;">Hi s,</p>
<p style="margin:0 0 18px 0;line-height:1.65;color:#1f2937;font-size:16px;mso-line-height-rule:exactly;">Thanks for accepting the quote for vjk. We've booked you in.</p>
<p style="margin:0 0 18px 0;line-height:1.65;color:#1f2937;font-size:16px;mso-line-height-rule:exactly;">A copy of the order plus tracking is here: <a href="https://cateringms.com/spit-braai-delivery/c/order/a7fad956" style="color:#1f6feb;text-decoration:underline;word-break:break-all;">https://cateringms.com/spit-braai-delivery/c/order/a7fad956</a></p>
<p style="margin:0 0 18px 0;line-height:1.65;color:#1f2937;font-size:16px;mso-line-height-rule:exactly;">We'll send the deposit invoice through next; once that's settled we're fully confirmed.</p>
<p style="margin:0 0 18px 0;line-height:1.65;color:#1f2937;font-size:16px;mso-line-height-rule:exactly;">Thanks,<br>Spit Braai Delivery</p>`;

const ctaHtml = "";

const contactLines = [
  `<a href="mailto:hello@spitbraaidelivery.co.za" style="color:#64748b;text-decoration:none;">hello@spitbraaidelivery.co.za</a>`,
  `<a href="tel:0826411273" style="color:#64748b;text-decoration:none;">082 641 1273</a>`,
  `<a href="https://spitbraaidelivery.co.za" style="color:#64748b;text-decoration:none;">spitbraaidelivery.co.za</a>`,
];
const contactHtml = `<div class="cms-contact" style="font-size:13px;color:#64748b;line-height:1.7;">${contactLines.join(`<span class="cms-sep"> &middot; </span>`)}</div>`;
const addressHtml = `<div style="font-size:12px;color:#94a3b8;line-height:1.5;margin-top:6px;">Cape Town</div>`;
const preheaderHtml = "";

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <title>${companyName}</title>
  <style>
    @media only screen and (max-width: 480px) {
      .cms-card { border-radius: 0 !important; box-shadow: none !important; }
      .cms-px { padding-left: 18px !important; padding-right: 18px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
${preheaderHtml}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f5f9;padding:24px 0;">
  <tr>
    <td align="left" style="padding:0 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="cms-card" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.06);border-top:3px solid ${primary};">
        <tr>
          <td class="cms-header" style="padding:20px 24px 4px 24px;text-align:left;">
            <div class="cms-header-name" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:${primary};letter-spacing:2px;text-transform:uppercase;line-height:1.4;mso-line-height-rule:exactly;">
              ${companyName}
            </div>
          </td>
        </tr>
        <tr>
          <td class="cms-body cms-px" style="padding:20px 24px 4px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1f2937;font-size:16px;line-height:1.65;">
            ${contentHtml}
          </td>
        </tr>
        ${ctaHtml}
        <tr>
          <td class="cms-footer" style="background:#f8fafc;padding:22px 24px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;border-top:1px solid #e2e8f0;">
            <div style="font-size:14px;color:#334155;font-weight:600;margin-bottom:6px;line-height:1.4;">${companyName}</div>
            ${contactHtml}
            ${addressHtml}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

const out = join(process.cwd(), "branded-email-preview.html");
writeFileSync(out, html, "utf8");
console.log("Wrote", out);
