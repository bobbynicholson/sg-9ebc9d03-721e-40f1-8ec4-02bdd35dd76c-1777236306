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
 *   - Inline styles only. Gmail strips <style> blocks in many
 *     contexts, especially gmail-mobile.
 *   - Tables for layout. Outlook + Apple Mail break flexbox / grid.
 *   - Web-safe fonts only. We pick a sans stack that falls back to
 *     -apple-system on iOS, Segoe UI on Outlook, Helvetica on Yahoo,
 *     Arial as the universal floor.
 *   - Max width 600px. Standard email rendering width across most
 *     clients; anything wider gets cropped on mobile.
 *   - One image only (the logo). Inline images > 100KB get
 *     downloaded by default in most clients but flagged as
 *     "from-internet"; the company-uploaded logo URL is a remote
 *     reference so we accept that tradeoff for simplicity.
 *
 * Cache: small in-process LRU on companyId -> shell so we don't read
 * companies on every send. 5-min TTL is short enough to pick up brand
 * changes promptly without thrashing the row. Cache survives within a
 * single warm Vercel instance; dies on cold start (acceptable).
 */

import { supabase } from "@/integrations/supabase/client";

interface CompanyBrand {
  company_name: string | null;
  logo_url: string | null;
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
        "company_name, logo_url, primary_color, secondary_color, accent_color, email, phone, website, address_line1, city",
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
  const paragraphs = linked
    .split(/\n\s*\n/)
    .map((p) =>
      `<p style="margin:0 0 16px 0;line-height:1.6;color:#1f2937;font-size:15px;">${p
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
 */
export async function renderBrandedEmailHtml(opts: BrandedEmailOptions): Promise<string> {
  const { companyId, body, preheader, cta, client } = opts;
  const brand = (await readBrand(companyId, client)) || {
    company_name: null, logo_url: null,
    primary_color: null, secondary_color: null, accent_color: null,
    email: null, phone: null, website: null, address_line1: null, city: null,
  };

  const primary = normalisedColor(brand.primary_color, "#0f172a");
  const accent  = normalisedColor(brand.accent_color, primary);
  const headerTextColor = isLight(primary) ? "#0f172a" : "#ffffff";
  const ctaTextColor    = isLight(accent)  ? "#0f172a" : "#ffffff";
  const companyName     = (brand.company_name || "").trim() || "Your catering team";

  const stripped = stripDocumentTags(body);
  const contentHtml = looksLikeHtml(stripped) ? stripped : plainToHtml(stripped);

  const ctaHtml = cta
    ? `
      <tr>
        <td style="padding:0 32px 24px 32px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="border-radius:8px;background:${accent};">
                <a href="${cta.url}" style="display:inline-block;padding:12px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:${ctaTextColor};text-decoration:none;border-radius:8px;">
                  ${cta.label}
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : "";

  const logoHtml = brand.logo_url
    ? `<img src="${brand.logo_url}" alt="${companyName}" width="120" style="display:block;max-width:120px;height:auto;border:0;outline:none;text-decoration:none;">`
    : `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:18px;font-weight:700;color:${headerTextColor};">${companyName}</div>`;

  const contactLines: string[] = [];
  if (brand.email)     contactLines.push(`<a href="mailto:${brand.email}" style="color:#64748b;text-decoration:none;">${brand.email}</a>`);
  if (brand.phone)     contactLines.push(`<a href="tel:${brand.phone.replace(/[^+\d]/g, "")}" style="color:#64748b;text-decoration:none;">${brand.phone}</a>`);
  if (brand.website)   contactLines.push(`<a href="${brand.website}" style="color:#64748b;text-decoration:none;">${brand.website.replace(/^https?:\/\//, "")}</a>`);
  const contactHtml = contactLines.length
    ? `<div style="font-size:12px;color:#64748b;line-height:1.6;">${contactLines.join(" &middot; ")}</div>`
    : "";
  const addressHtml = brand.address_line1 || brand.city
    ? `<div style="font-size:11px;color:#94a3b8;line-height:1.5;margin-top:4px;">${[brand.address_line1, brand.city].filter(Boolean).join(", ")}</div>`
    : "";

  const preheaderHtml = preheader
    ? `<div style="display:none;font-size:1px;color:#fff;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${companyName}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
${preheaderHtml}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f8fafc;padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.06);">
        <tr>
          <td style="background:${primary};padding:24px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td>${logoHtml}</td>
                <td align="right" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:${headerTextColor};font-weight:500;letter-spacing:0.5px;text-transform:uppercase;opacity:0.85;">
                  ${companyName.toUpperCase()}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        ${ctaHtml}
        <tr>
          <td style="padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
            ${contentHtml}
          </td>
        </tr>
        <tr>
          <td style="background:#f1f5f9;padding:20px 32px;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
            <div style="font-size:13px;color:#475569;font-weight:600;margin-bottom:4px;">${companyName}</div>
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
