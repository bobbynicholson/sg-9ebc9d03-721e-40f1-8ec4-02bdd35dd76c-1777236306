/**
 * ODOC G.1: canonical order URL builders.
 *
 * One place to construct order links across the app. Every CTA and
 * every notification producer should import from here so future
 * URL-shape changes (slug, role param, query convention) need a
 * single sweep, not 50.
 *
 * Two shapes:
 *
 *   staffOrderUrl(orderId, role?)
 *     For internal staff (kitchen, driver, waiter, shopping,
 *     cleaning, admin tier). Lands on the unified OrderDocument
 *     with the recipient's section auto-expanded.
 *
 *   clientOrderUrl(orderId, opts)
 *     For end customers. Magic-link path with the per-order token
 *     when the recipient may not be logged in (emails / WhatsApps).
 *     Falls back to /order/[id]?role=client for in-portal context
 *     where the user is already authenticated.
 *
 * Both helpers exist in two flavours:
 *   - browser/relative (`staffOrderHref`) for <Link>s
 *   - absolute (`staffOrderAbsoluteUrl`) for emails / WhatsApps
 *     where the recipient may open it outside the tab
 *
 * Role param convention:
 *   - kitchen_manager -> Kitchen section auto-expanded
 *   - kitchen_staff -> Kitchen section auto-expanded
 *   - driver        -> Driver section
 *   - waiter        -> Service team section
 *   - shopping_staff-> Shopping section
 *   - cleaning_manager / cleaning_staff -> Cleaning section
 *   - admin/owner/region_admin/sales_admin/company_admin -> admin
 *     (the doc page normalises all of these via ROLE_TO_SECTION)
 *   - client        -> client mode (Finance hidden)
 */

export type StaffOrderRole =
  | "kitchen_manager"
  | "kitchen_staff"
  | "driver"
  | "waiter"
  | "shopping_staff"
  | "cleaning_manager"
  | "cleaning_staff"
  | "admin"
  | "owner"
  | "region_admin"
  | "sales_admin"
  | "company_admin"
  | "super_admin";

/** Best-effort absolute base URL. Server-safe (no window). */
export function appBaseUrl(): string {
  // Priority order matters (2026-06-12 fix): NEXT_PUBLIC_VERCEL_URL
  // used to win, which is the raw *.vercel.app deployment host -
  // deploy-protected and wrong for customers - so every email link
  // built in the browser pointed at a login wall even though the
  // operator's tab was on the real domain. Explicit config first,
  // then the tab's own origin, then the Vercel host as last resort.
  let url =
    process?.env?.NEXT_PUBLIC_APP_URL ??
    process?.env?.NEXT_PUBLIC_SITE_URL ??
    "";
  if (!url && typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  if (!url) url = process?.env?.NEXT_PUBLIC_VERCEL_URL ?? "";
  if (!url) return "http://localhost:3000";
  url = url.startsWith("http") ? url : `https://${url}`;
  return url.replace(/\/$/, "");
}

/**
 * Relative href for a staff order link, slug-aware.
 *
 * Use from React components via:
 *   const { withSlug } = useTenantHref();
 *   <Link href={withSlug(staffOrderHref(id, "kitchen_staff"))} />
 *
 * The bare helper returns `/order/<id>?role=<role>` - the slug
 * prefix is the caller's responsibility because slug resolution
 * needs the AuthContext. We don't import that here so the helper
 * is usable from services too.
 */
export function staffOrderHref(orderId: string, role?: StaffOrderRole | null): string {
  if (!orderId) return "/order/";
  const qs = role ? `?role=${encodeURIComponent(role)}` : "";
  return `/order/${orderId}${qs}`;
}

/**
 * Absolute staff order URL for inclusion in emails / WhatsApps.
 * If a tenant slug is provided the URL is slug-prefixed for white
 * label hosts (e.g. https://cateringms.com/{slug}/order/{id}).
 */
export function staffOrderAbsoluteUrl(opts: {
  orderId: string;
  role?: StaffOrderRole | null;
  slug?: string | null;
  baseUrl?: string;
}): string {
  const base = (opts.baseUrl || appBaseUrl()).replace(/\/$/, "");
  const slugBit = opts.slug ? `/${opts.slug}` : "";
  const qs = opts.role ? `?role=${encodeURIComponent(opts.role)}` : "";
  return `${base}${slugBit}/order/${opts.orderId}${qs}`;
}

/**
 * Client order link.
 *
 * Magic-link mode (default for emails to clients): produces
 *   /c/order/<id>?t=<token>
 * which authenticates by cookie token and lands on the public
 * HeroCard view.
 *
 * In-portal mode (logged-in client clicking around their portal):
 *   /order/<id>?role=client
 * which uses the unified doc with client gating (Finance hidden).
 */
export function clientOrderHref(orderId: string, opts: { token?: string | null; inPortal?: boolean } = {}): string {
  if (!orderId) return "/c/order/";
  if (opts.inPortal) return `/order/${orderId}?role=client`;
  const tokenQs = opts.token ? `?t=${encodeURIComponent(opts.token)}` : "";
  return `/c/order/${orderId}${tokenQs}`;
}

/** Absolute client order URL (emails). Slug-aware. */
export function clientOrderAbsoluteUrl(opts: {
  orderId: string;
  token?: string | null;
  slug?: string | null;
  inPortal?: boolean;
  baseUrl?: string;
}): string {
  const base = (opts.baseUrl || appBaseUrl()).replace(/\/$/, "");
  const slugBit = opts.slug ? `/${opts.slug}` : "";
  if (opts.inPortal) {
    return `${base}${slugBit}/order/${opts.orderId}?role=client`;
  }
  const tokenQs = opts.token ? `?t=${encodeURIComponent(opts.token)}` : "";
  return `${base}${slugBit}/c/order/${opts.orderId}${tokenQs}`;
}
