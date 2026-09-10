/**
 * TIGHTEN I.113 + I.115 (2026-06-02): single source of truth for
 * customer-facing URLs.
 *
 * Bobby's hard requirement: every customer email that mentions a
 * quote / order / invoice / refund should embed a URL that always
 * resolves to the LATEST state of the booking - not a snapshot from
 * when the email was sent. URL must route through the tenant slug so
 * production serves the right app + the URL feels branded.
 *
 * The three primary entry points (all slug-prefixed for production):
 *
 *   /{slug}/q/{public_token}     - polished quote view; auto-bridges to
 *                                  /{slug}/c/order/{id} when converted
 *   /{slug}/c/order/{id}?t=...   - polished order view; current status,
 *                                  invoice, tracking, Download invoice
 *   /{slug}/pay/i/{public_token} - invoice pay + download page;
 *                                  ?print=1 auto-fires the print dialog
 *
 * The slug-less paths (/q, /c, /pay/i) still serve the same Next pages
 * as a back-compat fallback for any existing email link. New links
 * include the slug so they route cleanly through Vercel's tenant
 * rewrite chain.
 */

function getOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin.replace(/\/$/, "");
  return (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
}

/** Slug prefix path segment, eg. "/spit-braai-delivery" or "" when no
 *  slug is available. */
function slugSegment(slug?: string | null): string {
  if (!slug) return "";
  const trimmed = String(slug).trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed) return "";
  return `/${trimmed}`;
}

/**
 * Polished quote view. With a slug (recommended), produces
 * `${origin}/{slug}/q/{token}`. Without, falls back to the bare
 * `${origin}/q/{token}` path which still serves as back-compat.
 *
 * Auto-bridges to /c/order/{id} once the quote has been converted
 * (handled in pages/q/[token].tsx I.113 redirect).
 */
export function buildPublicQuoteUrl(
  token: string | null | undefined,
  slug?: string | null,
): string | null {
  if (!token) return null;
  const origin = getOrigin();
  return `${origin}${slugSegment(slug)}/q/${token}`;
}

/**
 * Invoice pay + download page. With ?print=1, auto-fires the browser
 * print dialog - used by the "Download invoice" button on /c/order/{id}.
 */
export function buildPayInvoiceUrl(
  token: string | null | undefined,
  opts: { print?: boolean; slug?: string | null } = {},
): string | null {
  if (!token) return null;
  const origin = getOrigin();
  const qs = opts.print ? "?print=1" : "";
  return `${origin}${slugSegment(opts.slug)}/pay/i/${token}${qs}`;
}

/**
 * Polished order view. The `t` query param is the client_access_token
 * minted per send (60d TTL). For emails sent immediately after a mint
 * the link works directly; for older emails the page renders
 * ExpiredLinkCard which lets the client request a fresh link.
 */
export function buildOrderClientUrl(
  orderId: string | null | undefined,
  token: string | null | undefined,
  slug?: string | null,
): string | null {
  if (!orderId) return null;
  const origin = getOrigin();
  const path = `${slugSegment(slug)}/c/order/${orderId}`;
  return token
    ? `${origin}${path}?t=${token}`
    : `${origin}${path}`;
}

/**
 * The "smart" entry point. Caller passes whatever they have; we
 * return the BEST customer-facing URL.
 */
export interface CustomerLinkInput {
  orderId?: string | null;
  orderClientToken?: string | null;
  quoteToken?: string | null;
  slug?: string | null;
}
export function buildCustomerLink(input: CustomerLinkInput): string | null {
  if (input.orderId && input.orderClientToken) {
    return buildOrderClientUrl(input.orderId, input.orderClientToken, input.slug);
  }
  if (input.quoteToken) {
    return buildPublicQuoteUrl(input.quoteToken, input.slug);
  }
  return null;
}
