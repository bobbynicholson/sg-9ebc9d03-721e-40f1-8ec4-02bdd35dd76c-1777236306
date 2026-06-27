/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * brandedEmailShell - wraps any body (plain text OR HTML fragment) in
 * a branded email shell using the catering company's logo, colours,
 * and contact info from the companies row.
 *
 * TIGHTEN I.124 (2026-06-03): Bobby's call: "I need the email the
 * client receives to have better styling and be simply beautified.
 * I know I said text only before, but I think a pretty branded email
 * is better. for quotes and confirmations and auto emails. Update
 * all auto emails to match the company branding colours in settings
 * as well."
 *
 * Design constraints (transactional HTML email is a different beast
 * from web HTML):
 *   - Inline styles for everything that matters. <style> blocks
 *     work in Apple Mail / Gmail iOS / Outlook web but get stripped
 *     by Gmail Android web view + older clients - we use them only
 *     for media-query progressive enhancement, every visual must
 *     also work inline.
 *   - Tables for layout. Outlook + Apple Mail break flexbox / grid.
 *   - Web-safe fonts only. We pick a sans stack that falls back to
 *     -apple-system on iOS, Segoe UI on Outlook, Helvetica on Yahoo,
 *     Arial as the universal floor.
 *   - Max width 600px. Standard email rendering width across most
 *     clients; anything wider gets cropped on mobile.
 *   - NO images. TIGHTEN I.125 dropped the logo entirely - logos
 *     look messy before download in Gmail / Outlook (broken image
 *     placeholder), are blocked by default in many clients, and add
 *     load latency. The brand colour + company name in the header
 *     carry identity cleanly without depending on image download.
 *   - 16px minimum body font so iOS Safari doesn't trigger
 *     zoom-on-tap.
 *   - 44px minimum touch-target on the CTA per Apple HIG.
 *
 * Cache: small in-process LRU on companyId -> shell so we don't read
 * companies on every send. 5-min TTL is short enough to pick up brand
 * changes promptly without thrashing the row. Cache survives within a
 * single warm Vercel instance; dies on cold start (acceptable).
 */

import { supabase } from "@/integrations/supabase/client";

interface CompanyBrand {
  company_name: string | null;
  // TIGHTEN I.125 (2026-06-03): logo_url intentionally NOT read.
  // Logos look broken in most clients before image download and
  // many block remote images by default. Brand colour + company
  // name carry identity without the image-loading penalty.
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  address_line1: string | null;
  city: string | null;
}

const TTL_MS = 5 * 60 * 1000;
const brandCache = new Map<string, { brand: CompanyBrand; fetchedAt: number }>();

function pickClient(client: any): any {
  return client || supabase;
}

async function readBrand(companyId: string, client?: any): Promise<CompanyBrand | null> {
  const cached = brandCache.get(companyId);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.brand;
  try {
    const { data, error } = await pickClient(client)
      .from("companies")
      .select(
        "company_name, primary_color, secondary_color, accent_color, email, phone, website, address_line1, city",
      )
      .eq("id", companyId)
      .maybeSingle();
    if (error) return null;
    if (!data) return null;
    const brand = data as CompanyBrand;
    brandCache.set(companyId, { brand, fetchedAt: Date.now() });
    return brand;
  } catch {
    return null;
  }
}

/** Strip <html>/<body>/<style> so we don't double-wrap content the
 *  caller already shelled. */
function stripDocumentTags(body: string): string {
  let s = body;
  s = s.replace(/<\/?html[^>]*>/gi, "");
  s = s.replace(/<\/?body[^>]*>/gi, "");
  s = s.replace(/<head[\s\S]*?<\/head>/gi, "");
  return s.trim();
}

/** Detect if a body string is "rich enough" HTML that we shouldn't
 *  paragraph-wrap it. Any block-level tag counts. */
function looksLikeHtml(body: string): boolean {
  return /<(p|div|table|h[1-6]|ul|ol|li|br|a\s|img\s|hr|section|article|header|footer|blockquote)\b/i.test(
    body,
  );
}

/** Turn plain text into paragraphs + links. Splits on blank lines
 *  for paragraph breaks; single \n becomes <br>. Bare URLs become
 *  anchored links so the client can click without copy-pasting. */
function plainToHtml(body: string): string {
  const safe = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const linked = safe.replace(
    /(https?:\/\/[^\s<]+)/g,
    (m) =>
      `<a href="${m}" style="color:#1f6feb;text-decoration:underline;word-break:break-all;">${m}</a>`,
  );
  // TIGHTEN I.125 (2026-06-03): bump body font-size to 16px so iOS
  // Safari Mail doesn't auto-zoom (anything < 16px triggers the
  // accessibility zoom on tap). Line-height 1.65 reads cleanly on
  // a 4-inch screen.
  const paragraphs = linked
    .split(/\n\s*\n/)
    .map((p) =>
      `<p style="margin:0 0 18px 0;line-height:1.65;color:#1f2937;font-size:16px;mso-line-height-rule:exactly;">${p
        .replace(/\n/g, "<br>")
        .trim()}</p>`,
    )
    .filter(Boolean)
    .join("\n");
  return paragraphs;
}

const HEX = /^#?[0-9a-f]{6}$/i;

function normalisedColor(input: string | null | undefined, fallback: string): string {
  if (!input) return fallback;
  const v = input.trim();
  if (HEX.test(v)) return v.startsWith("#") ? v.toLowerCase() : `#${v.toLowerCase()}`;
  return fallback;
}

function isLight(hex: string): boolean {
  // Quick relative-luminance check; used to decide whether the header
  // foreground text is white or near-black.
  const m = hex.replace(/^#/, "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 160;
}

export interface BrandedEmailOptions {
  companyId: string;
  body: string;
  /** Optional preheader (the gray preview text most clients show
   *  next to / under the subject in the inbox list). */
  preheader?: string;
  /** Optional "View" CTA button rendered above the body in the brand
   *  primary color. Caller passes the label + URL. */
  cta?: { label: string; url: string };
  /** Optional supabase client override (service role for server
   *  contexts that don't have the anon session). */
  client?: any;
}

/**
 * Render the body wrapped in a branded email shell. Falls back to a
 * neutral shell if the brand fetch fails so the send still goes out.
 *
 * TIGHTEN I.125 (2026-06-03): logo removed. Logos look messy in most
 * email clients before the user clicks "load images", and many block
 * remote images by default. The company name in the brand colour
 * carries the identity cleanly without depending on image download.
 *
 * Mobile-first refactor:
 *   - 16px body font so iOS Safari doesn't trigger zoom-on-tap
 *   - 1.65 line-height for readable line spacing on small screens
 *   - 100% width on the outer card with 600px max for desktop
 *   - 20px horizontal padding (instead of 32px) so content doesn't
 *     hug the edges on narrow phones
 *   - Full-width CTA button on mobile via display:block + width:100%
 *   - Minimum 44px touch-target height on CTA (Apple HIG)
 *   - <style> block with @media queries for clients that respect it
 *     (Apple Mail, Gmail iOS app); inline fallbacks for the rest
 *   - mso-line-height-rule:exactly for Outlook line-height fidelity
 */
export async function renderBrandedEmailHtml(opts: BrandedEmailOptions): Promise<string> {
  const { companyId, body, preheader, cta, client } = opts;
  const brand = (await readBrand(companyId, client)) || {
    company_name: null,
    primary_color: null, secondary_color: null, accent_color: null,
    email: null, phone: null, website: null, address_line1: null, city: null,
  };

  const primary = normalisedColor(brand.primary_color, "#0f172a");
  // Raj (2026-06-25): client emails must carry the SAME brand identity
  // as the client portal. The portal header is a primary -> secondary
  // gradient with white text (ClientPageHeader), and the CTA uses the
  // accent. Mirror exactly that here so a multi-colour brand (e.g. Spit
  // Braai's red/green/blue) shows its full combination, not just one
  // colour. secondary_color was previously read but never used.
  const secondary = normalisedColor(brand.secondary_color, primary);
  // TIGHTEN I.126: prefer the accent colour for the CTA so the email
  // doesn't read as one big block of the primary brand colour. When
  // accent and primary are equal (or both null), fall back to primary
  // so single-colour tenants still get a coherent look.
  const accentRaw   = normalisedColor(brand.accent_color, primary);
  const accent      = accentRaw === primary ? primary : accentRaw;
  const ctaTextColor = isLight(accent) ? "#0f172a" : "#ffffff";
  // Header text flips to near-black on a light brand colour so it stays
  // readable; white on the usual saturated brand colours.
  const headerTextColor = isLight(primary) ? "#0f172a" : "#ffffff";
  // Gradient header to match the portal. Falls back to a flat primary
  // when the tenant only set one colour, and Outlook (no gradient
  // support) reads the bgcolor/background-color flat primary anyway.
  const headerGradient =
    secondary !== primary
      ? `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`
      : primary;
  const companyName  = (brand.company_name || "").trim() || "Your catering team";

  const stripped = stripDocumentTags(body);
  const contentHtml = looksLikeHtml(stripped) ? stripped : plainToHtml(stripped);

  // TIGHTEN I.126: the CTA now lives BELOW the body. Bobby's call:
  // "view and accept button at the top is too in your face. I want
  // that to be further down ... below the quote link." So the body
  // reads first, the action follows.
  const ctaHtml = cta
    ? `
      <tr>
        <td class="cms-px" style="padding:8px 24px 32px 24px;" align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="cms-cta-table" style="width:100%;max-width:320px;margin:0 auto;">
            <tr>
              <td class="cms-cta-cell" style="border-radius:10px;background:${accent};box-shadow:0 8px 18px rgba(15,23,42,0.14);">
                <a class="cms-cta" href="${cta.url}" style="display:block;text-align:center;padding:14px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;color:${ctaTextColor};text-decoration:none;border-radius:10px;line-height:1.2;mso-line-height-rule:exactly;min-height:44px;">
                  ${cta.label}
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : "";

  const contactLines: string[] = [];
  if (brand.email)     contactLines.push(`<a href="mailto:${brand.email}" style="color:#64748b;text-decoration:none;">${brand.email}</a>`);
  if (brand.phone)     contactLines.push(`<a href="tel:${brand.phone.replace(/[^+\d]/g, "")}" style="color:#64748b;text-decoration:none;">${brand.phone}</a>`);
  if (brand.website)   contactLines.push(`<a href="${brand.website}" style="color:#64748b;text-decoration:none;">${brand.website.replace(/^https?:\/\//, "")}</a>`);
  const contactHtml = contactLines.length
    ? `<div class="cms-contact" style="font-size:13px;color:#64748b;line-height:1.7;">${contactLines.join(`<span class="cms-sep"> &middot; </span>`)}</div>`
    : "";
  const addressHtml = brand.address_line1 || brand.city
    ? `<div style="font-size:12px;color:#94a3b8;line-height:1.5;margin-top:6px;">${[brand.address_line1, brand.city].filter(Boolean).join(", ")}</div>`
    : "";

  const preheaderHtml = preheader
    ? `<div style="display:none;font-size:1px;color:#fff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${preheader}</div>`
    : "";

  // TIGHTEN I.126: header is now refined - small uppercase tenant
  // name in brand primary colour on white, with a thin coloured top
  // rule. Bobby's call: "make Splitbrite delivery wording nice and
  // small, nice and clean at the top." The huge solid-colour bar
  // dominated the visual and made every mail look the same blue.
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${companyName}</title>
  <style>
    @media only screen and (max-width: 480px) {
      .cms-card { border-radius: 0 !important; box-shadow: none !important; }
      .cms-px { padding-left: 18px !important; padding-right: 18px !important; }
      .cms-header { padding: 18px 18px !important; }
      .cms-header-name { font-size: 12px !important; letter-spacing: 1.5px !important; }
      .cms-body { padding: 24px 18px 8px !important; }
      .cms-footer { padding: 20px 18px !important; }
      .cms-cta-table { width: 100% !important; }
      .cms-cta-cell { display: block !important; }
      .cms-cta { display: block !important; text-align: center !important; padding: 16px 24px !important; }
      .cms-sep { display: none !important; }
      .cms-contact a { display: block; padding: 4px 0; }
    }
    @media (prefers-color-scheme: dark) {
      .cms-card { background: #ffffff !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
${preheaderHtml}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f5f9;padding:24px 0;">
  <tr>
    <td align="left" style="padding:0 12px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="cms-card" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.06);">
        <tr>
          <td class="cms-header" bgcolor="${primary}" style="padding:24px;text-align:left;background-color:${primary};background-image:${headerGradient};">
            <div class="cms-header-name" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;color:${headerTextColor};letter-spacing:0.3px;line-height:1.3;mso-line-height-rule:exactly;">
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
          <td class="cms-footer" style="background:#f8fafc;padding:22px 24px;text-align:left;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;border-top:1px solid #e2e8f0;">
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
}

/** Test-only: wipe the in-process brand cache. */
export function _resetBrandCache(): void {
  brandCache.clear();
}
