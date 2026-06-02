/**
 * TIGHTEN I.113 (2026-06-02): single source of truth for customer-facing
 * URLs. Bobby's hard requirement: every customer email that mentions a
 * quote / order / invoice / refund should embed a URL that always
 * resolves to the LATEST state of the booking - not a snapshot from
 * when the email was sent.
 *
 * The three primary entry points:
 *
 *   /q/{public_token}     - polished quote view; auto-bridges to
 *                           /c/order/{id} when the quote has been
 *                           converted to an order (I.113 redirect
 *                           in pages/q/[token].tsx)
 *   /c/order/{id}?t=...   - polished order view; shows current status,
 *                           invoice, tracking timeline, Download
 *                           invoice + Pay now affordances
 *   /pay/i/{public_token} - invoice pay + download page; with
 *                           ?print=1 auto-fires the print dialog
 *
 * Tokens used:
 *   - quotes.public_token: stable UUID per quote row, never rotated
 *   - invoices.public_token: stable UUID per invoice row, never rotated
 *   - client_access_tokens: minted per-request for /c/order, 60d TTL,
 *     auto-recoverable via self-serve "send me a new link"
 *
 * For URLs we generate at email-send time (when we have a server-side
 * mint of the order token), use buildOrderClientUrl. For URLs the
 * client follows from an old email and the token has expired, the
 * /c/order page renders ExpiredLinkCard which is self-serve.
 *
 * All helpers SSR-safe: return absolute URLs in the browser, host-less
 * relative paths on the server (caller can prepend `${process.env.NEXT_PUBLIC_APP_URL}`
 * if they need a fully absolute URL from server context).
 */

function getOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin.replace(/\/$/, "");
  return (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
}

/**
 * The polished /q/{token} quote view. Same URL the client clicked from
 * their email. Auto-bridges to /c/order/{id} once the quote has been
 * converted (handled in pages/q/[token].tsx I.113 redirect).
 *
 * Returns null when no token (defensive - lets the caller render the
 * email without a link rather than a broken /q/null URL).
 */
export function buildPublicQuoteUrl(token: string | null | undefined): string | null {
  if (!token) return null;
  const origin = getOrigin();
  return `${origin}/q/${token}`;
}

/**
 * Polished invoice pay + download page. With ?print=1, auto-fires the
 * browser print dialog - used by the "Download invoice" button on
 * /c/order/{id}.
 *
 * Returns null when no token.
 */
export function buildPayInvoiceUrl(
  token: string | null | undefined,
  opts: { print?: boolean } = {},
): string | null {
  if (!token) return null;
  const origin = getOrigin();
  const qs = opts.print ? "?print=1" : "";
  return `${origin}/pay/i/${token}${qs}`;
}

/**
 * Polished order view. The `t` query param is the client_access_token
 * minted per send (60d TTL). For emails sent immediately after a mint
 * the link works directly; for older emails the page renders
 * ExpiredLinkCard which lets the client request a fresh link.
 *
 * Server-side callers that don't have a mint can pass an empty token
 * (the link will land on the recovery card). Preferred shape is to
 * mint at email-build time and pass the raw token here.
 */
export function buildOrderClientUrl(
  orderId: string | null | undefined,
  token: string | null | undefined,
): string | null {
  if (!orderId) return null;
  const origin = getOrigin();
  return token
    ? `${origin}/c/order/${orderId}?t=${token}`
    : `${origin}/c/order/${orderId}`;
}

/**
 * The "smart" entry point. Caller passes whatever they have; we
 * return the BEST customer-facing URL.
 *
 * Priority:
 *   1. If we have an order id + token, the order URL is canonical
 *      (current status, invoice, tracking).
 *   2. Else if we have a quote public_token, the quote URL is the
 *      bridge (auto-redirects to the order once converted).
 *   3. Else null - caller renders email without a link.
 *
 * Use this in email-composing services so every template gets a
 * consistent "always-current" link without each caller deciding
 * which URL to embed.
 */
export interface CustomerLinkInput {
  orderId?: string | null;
  orderClientToken?: string | null;
  quoteToken?: string | null;
}
export function buildCustomerLink(input: CustomerLinkInput): string | null {
  if (input.orderId && input.orderClientToken) {
    return buildOrderClientUrl(input.orderId, input.orderClientToken);
  }
  if (input.quoteToken) {
    return buildPublicQuoteUrl(input.quoteToken);
  }
  return null;
}
