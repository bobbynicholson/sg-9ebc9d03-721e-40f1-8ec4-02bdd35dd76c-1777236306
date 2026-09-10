/**
 * Shared client-facing legal helpers.
 *
 * A caterer's terms live on the company row, but the public link must work
 * in emails and PDFs where there is no authenticated tenant context.  The
 * `/terms/[company]` page accepts either the stable company id or its slug.
 */

export const DEFAULT_CONFIDENTIALITY_NOTICE =
  "CONFIDENTIALITY NOTICE: This email and any attachments are intended solely for the named recipient and may contain confidential, privileged, or personal information. If you received it in error, please notify the sender immediately, delete it, and do not copy, disclose, distribute, or rely on its contents.";

export const MAX_CONFIDENTIALITY_NOTICE_LENGTH = 4000;

function cleanIdentifier(identifier: string | null | undefined): string {
  return String(identifier || "").trim().replace(/^\/+|\/+$/g, "");
}

function normaliseOrigin(raw: string | null | undefined): string {
  const value = String(raw || "").trim();
  if (!value) return "";
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return withProtocol.replace(/\/+$/, "");
}

/** Relative public URL for a caterer's own terms and conditions. */
export function buildCompanyTermsPath(identifier: string | null | undefined): string {
  const clean = cleanIdentifier(identifier);
  return clean ? `/terms/${encodeURIComponent(clean)}` : "/terms";
}

/**
 * Absolute variant used in emails and generated PDFs.
 *
 * Explicit/request origins beat Vercel's deployment hostname so customer
 * links never accidentally point at a deployment-protected preview URL.
 */
export function buildCompanyTermsUrl(
  identifier: string | null | undefined,
  originOverride?: string | null,
): string {
  const origin =
    normaliseOrigin(process.env.NEXT_PUBLIC_APP_URL) ||
    normaliseOrigin(originOverride) ||
    normaliseOrigin(process.env.NEXT_PUBLIC_SITE_URL) ||
    "https://cateringms.com";
  return `${origin}${buildCompanyTermsPath(identifier)}`;
}

/** Blank/custom values always resolve to a legally visible notice. */
export function resolveConfidentialityNotice(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || DEFAULT_CONFIDENTIALITY_NOTICE).slice(
    0,
    MAX_CONFIDENTIALITY_NOTICE_LENGTH,
  );
}
