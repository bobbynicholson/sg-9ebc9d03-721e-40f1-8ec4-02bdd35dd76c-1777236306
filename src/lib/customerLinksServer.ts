/**
 * TIGHTEN I.114 + I.115 (2026-06-02): server-side companion to
 * customerLinks.ts.
 *
 * Customer-facing emails fire from server-side services (orderWorkflow,
 * invoiceGenerationService, cancellationEmails, etc.) where window
 * doesn't exist. They need to:
 *   - mint a fresh client_access_token (via the mint_client_order_token
 *     RPC) at send time so the link in the email is immediately usable
 *   - build an absolute URL with the platform's configured app origin
 *     (NEXT_PUBLIC_APP_URL) AND the tenant slug, so the URL routes
 *     through the tenant rewrite chain (every admin / client-portal /
 *     team-portal URL does the same).
 *
 * URL shape (I.115): `${origin}/{slug}/q/{token}`,
 * `${origin}/{slug}/c/order/{id}?t=...`, `${origin}/{slug}/pay/i/{token}`.
 * The next.config rewrites the slug-prefixed paths to the canonical
 * pages with `?company_slug=` added. The bare /q, /c, /pay/i paths
 * still serve too as a back-compat fallback.
 *
 * Best-effort: failures fall back to the no-token URL, which lands on
 * the /c/order page's ExpiredLinkCard self-recovery flow.
 */

/** Normalise a raw origin/host value into "https://host" form (no
 *  trailing slash). Returns "" for empty input. */
function normalizeOrigin(raw?: string | null): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  const withProto = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
  return withProto.replace(/\/$/, "");
}

/**
 * Resolve the base origin for a customer link.
 *
 * Priority (2026-06-12, round 2): explicit NEXT_PUBLIC_APP_URL config
 * wins; then the REQUEST-derived origin override (the host the client
 * actually hit, eg. cateringms.com); the Vercel deployment host vars
 * are the very last resort. The first cut ranked the Vercel vars
 * above the override, and since VERCEL_URL is always set on Vercel
 * the override never won - acceptance emails carried
 * sg-...-xyz.vercel.app order links, which are deploy-protected and
 * walled customers behind a Vercel login.
 */
function resolveOrigin(override?: string | null): string {
  return (
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeOrigin(override) ||
    normalizeOrigin(process.env.NEXT_PUBLIC_VERCEL_URL || process.env.VERCEL_URL || "")
  );
}

/** Slug prefix path segment, eg. "/spit-braai-delivery" or "" when no
 *  slug is available. */
function slugSegment(slug?: string | null): string {
  if (!slug) return "";
  const trimmed = String(slug).trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed) return "";
  return `/${trimmed}`;
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
  /** Tenant slug (companies.slug). When omitted, the helper will look
   *  it up from companies using the provided supabase client. Pass it
   *  explicitly when the caller already has it to skip the round-trip. */
  slug?: string | null;
  /** Request-derived origin (eg. from the incoming req's host header).
   *  Used as a last resort when no APP_URL / VERCEL_URL env is set so
   *  public endpoints never email relative links. */
  origin?: string | null;
}

async function resolveSlug(sb: any, companyId: string): Promise<string | null> {
  try {
    const { data } = await sb
      .from("companies")
      .select("slug")
      .eq("id", companyId)
      .maybeSingle();
    return (data as any)?.slug || null;
  } catch {
    return null;
  }
}

/**
 * Mint + build. Returns the absolute /{slug}/c/order/{id}?t=... URL.
 * On any RPC failure returns the tokenless URL so the email link still
 * works (it falls back to the self-serve recovery card).
 */
export async function mintOrderCustomerLink(input: MintInput): Promise<string> {
  const { sb, companyId, orderId, label } = input;
  const origin = resolveOrigin(input.origin);
  const slug = input.slug !== undefined ? input.slug : await resolveSlug(sb, companyId);
  const sluggy = slugSegment(slug);
  const fallback = `${origin}${sluggy}/c/order/${orderId}`;

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
    return `${origin}${sluggy}/c/order/${orderId}?t=${raw}`;
  } catch (e: any) {
    console.warn("[customerLinksServer] mint threw, returning tokenless URL:", e?.message || e);
    return fallback;
  }
}

/**
 * Absolute pay-invoice URL with slug prefix. invoice.public_token is
 * stable, so no mint needed.
 */
export function buildPayInvoiceUrlServer(
  token: string | null | undefined,
  opts: { print?: boolean; slug?: string | null; origin?: string | null } = {},
): string | null {
  if (!token) return null;
  const origin = resolveOrigin(opts.origin);
  const qs = opts.print ? "?print=1" : "";
  return `${origin}${slugSegment(opts.slug)}/pay/i/${token}${qs}`;
}

/**
 * Absolute quote URL with slug prefix. quotes.public_token is stable.
 * After conversion the /q/{token} route auto-bridges to /c/order/{id}
 * (I.113), so this URL is always-current too.
 */
export function buildPublicQuoteUrlServer(
  token: string | null | undefined,
  slug?: string | null,
  originOverride?: string | null,
): string | null {
  if (!token) return null;
  const origin = resolveOrigin(originOverride);
  return `${origin}${slugSegment(slug)}/q/${token}`;
}
