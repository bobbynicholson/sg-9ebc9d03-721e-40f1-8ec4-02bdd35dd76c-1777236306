/**
 * TIGHTEN I.114 (2026-06-02): server-side companion to customerLinks.ts.
 *
 * Customer-facing emails fire from server-side services (orderWorkflow,
 * invoiceGenerationService, cancellationEmails, etc.) where window
 * doesn't exist. They need to:
 *   - mint a fresh client_access_token (via the mint_client_order_token
 *     RPC) at send time so the link in the email is immediately usable
 *   - build an absolute URL with the platform's configured app origin
 *     (NEXT_PUBLIC_APP_URL)
 *
 * This module wraps both into one helper. Best-effort: failures fall
 * back to a host-prefixed URL with NO token, which lands the client
 * on the /c/order page's ExpiredLinkCard self-recovery flow. That is
 * still better than no link at all.
 */

function getServerOrigin(): string {
  const origin = process.env.NEXT_PUBLIC_APP_URL || "";
  return origin.replace(/\/$/, "");
}

interface MintInput {
  /** Service-role supabase client (any-typed because most callers
   *  already have `(supabase as any)` in scope). */
  sb: any;
  companyId: string;
  orderId: string;
  /** Short label so audit can see which surface generated the token
   *  (eg. "order-confirmed-email", "balance-reminder"). */
  label: string;
}

/**
 * Mint + build. Returns the absolute /c/order/{id}?t=... URL. On any
 * RPC failure returns the tokenless URL so the email link still works
 * (it falls back to the self-serve recovery card).
 */
export async function mintOrderCustomerLink(input: MintInput): Promise<string> {
  const { sb, companyId, orderId, label } = input;
  const origin = getServerOrigin();
  const fallback = `${origin}/c/order/${orderId}`;

  try {
    const { data, error } = await sb.rpc("mint_client_order_token", {
      p_company_id: companyId,
      p_order_id: orderId,
      p_label: label,
    });
    if (error) {
      console.warn("[customerLinksServer] mint failed, returning tokenless URL:", error.message);
      return fallback;
    }
    const raw = (data as any)?.raw_token;
    if (!raw) return fallback;
    return `${origin}/c/order/${orderId}?t=${raw}`;
  } catch (e: any) {
    console.warn("[customerLinksServer] mint threw, returning tokenless URL:", e?.message || e);
    return fallback;
  }
}

/**
 * Absolute pay-invoice URL. The invoice's public_token is stable, so
 * no mint needed. Server-callable companion to buildPayInvoiceUrl in
 * customerLinks.ts.
 */
export function buildPayInvoiceUrlServer(
  token: string | null | undefined,
  opts: { print?: boolean } = {},
): string | null {
  if (!token) return null;
  const origin = getServerOrigin();
  const qs = opts.print ? "?print=1" : "";
  return `${origin}/pay/i/${token}${qs}`;
}

/**
 * Absolute quote URL. quotes.public_token is stable. After conversion
 * the /q/{token} route auto-bridges to /c/order/{id} (I.113), so this
 * URL is always-current too.
 */
export function buildPublicQuoteUrlServer(token: string | null | undefined): string | null {
  if (!token) return null;
  const origin = getServerOrigin();
  return `${origin}/q/${token}`;
}
