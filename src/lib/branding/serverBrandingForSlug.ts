/**
 * Server-side branding fetch for tenant pre-auth pages.
 *
 * Used by `getStaticProps` on /[company_slug]/login,
 * /[company_slug]/client/login and /[company_slug]/auth/callback so the
 * page renders with the tenant's logo/colours from the very first paint.
 *
 * Reads via the service-role client because:
 *   - The pages are public (no auth) and the `companies` table no longer
 *     allows anon SELECTs (it used to leak embed tokens / billing fields).
 *   - The SECURITY DEFINER RPC `get_company_branding` exists for the
 *     anon browser path, but doesn't return `accent_color`. Reading the
 *     row with the service role lets us return the full palette without
 *     a schema migration.
 *
 * Only safe branding columns are returned, never embed tokens, billing
 * info, or anything else that lives on the row.
 *
 * TIGHTEN I.34: the old shape returned just `InitialBranding | null` and
 * the login pages rendered every null as "Company not found". That hid
 * three distinct failure modes:
 *
 *   - `not_found`      - slug genuinely doesn't exist (end-user typo,
 *                        stale link, deleted company)
 *   - `not_configured` - service-role key missing / wrong on this deploy
 *                        (operator misconfiguration). Most common in
 *                        practice; previously indistinguishable from
 *                        "company not found" in the page UI.
 *   - `server_error`   - DB query failed for some other reason (RLS
 *                        regression, schema cache lag, network blip).
 *
 * `getInitialBrandingForSlugDetailed` returns the discriminated result.
 * `getInitialBrandingForSlug` stays as the thin back-compat wrapper for
 * callers that only care about the success branding (auth/callback).
 *
 * Every failure path now logs loudly to the server console so Vercel
 * function logs surface the root cause - the previous bare
 * `} catch { return null; }` swallowed everything silently.
 */
import { getServiceSupabase } from "@/lib/supabase/service";

export interface InitialBranding {
  id: string;
  slug: string;
  companyName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  fontBody: string | null;
  fontDisplay: string | null;
}

export type BrandingLookupReason = "not_found" | "not_configured" | "server_error";

export interface BrandingLookupResult {
  branding: InitialBranding | null;
  reason: BrandingLookupReason | null;
  /** Free-text debug message logged + returned for ops visibility.
   *  Never includes secret values - safe to render to the page. */
  debug: string | null;
}

/** True when a Postgres error is "column ... does not exist" (SQLSTATE 42703).
 *  Used to detect a deploy where an optional column's migration hasn't run yet
 *  so we can retry the query without that column instead of failing the page. */
function isMissingColumnError(
  error: { code?: string | null; message?: string | null } | null,
): boolean {
  if (!error) return false;
  if (error.code === "42703") return true;
  return /column .+ does not exist/i.test(error.message || "");
}

export async function getInitialBrandingForSlugDetailed(
  slug: string,
): Promise<BrandingLookupResult> {
  if (!slug) {
    return { branding: null, reason: "not_found", debug: "empty slug" };
  }

  let supabase: ReturnType<typeof getServiceSupabase>;
  try {
    supabase = getServiceSupabase();
  } catch (e: any) {
    // service.ts throws on missing env or anon-key-in-service-slot.
    // Log loudly so the cause is in the Vercel function logs.
    // eslint-disable-next-line no-console
    console.error(
      `[serverBrandingForSlug] service client init failed for slug='${slug}':`,
      e?.message || e,
    );
    return {
      branding: null,
      reason: "not_configured",
      debug: e?.message || "service client init failed",
    };
  }

  try {
    // Base palette columns are always present. The brand_font_* columns are
    // added by migration 20260616120000_brand_fonts.sql; on a deploy where
    // that migration hasn't run yet they don't exist. Selecting a missing
    // column makes Postgres error ("column companies.brand_font_body does not
    // exist"), which previously took the WHOLE tenant login page down with a
    // server_error - fonts are an optional white-label nicety and must never
    // break login. So if the font columns are missing we transparently retry
    // without them and serve branding with null fonts (CateringMS defaults).
    const BASE_COLS =
      "id, slug, company_name, logo_url, primary_color, secondary_color, accent_color";
    const FONT_COLS = "brand_font_body, brand_font_display";

    // `cols` is a runtime string, so the typed client can't infer a row
    // shape - cast to the permissive result we already consume below.
    type RowResult = {
      data: Record<string, string | null | undefined> | null;
      error: { message: string; code?: string | null } | null;
    };
    const fetchRow = (cols: string): Promise<RowResult> =>
      supabase
        .from("companies")
        .select(cols)
        .eq("slug", slug)
        .maybeSingle() as unknown as Promise<RowResult>;

    let { data, error } = await fetchRow(`${BASE_COLS}, ${FONT_COLS}`);

    if (error && isMissingColumnError(error)) {
      // eslint-disable-next-line no-console
      console.warn(
        `[serverBrandingForSlug] brand_font_* columns missing for slug='${slug}' ` +
          `(run migration 20260616120000_brand_fonts.sql); serving without fonts. ` +
          `detail: ${error.message}`,
      );
      ({ data, error } = await fetchRow(BASE_COLS));
    }

    if (error) {
      // eslint-disable-next-line no-console
      console.error(
        `[serverBrandingForSlug] companies lookup failed for slug='${slug}':`,
        error.message,
      );
      return {
        branding: null,
        reason: "server_error",
        debug: error.message,
      };
    }
    if (!data) {
      return { branding: null, reason: "not_found", debug: null };
    }

    // The auto-generated Database types don't currently include
    // `accent_color`, so cast to a permissive shape rather than fight
    // the types. The runtime row does have the column.
    const row = data as Record<string, string | null | undefined>;

    return {
      branding: {
        id: row.id ?? "",
        slug: row.slug ?? slug,
        companyName: row.company_name || "Your portal",
        logoUrl: row.logo_url || null,
        primaryColor: row.primary_color || null,
        secondaryColor: row.secondary_color || null,
        accentColor: row.accent_color || null,
        fontBody: row.brand_font_body || null,
        fontDisplay: row.brand_font_display || null,
      },
      reason: null,
      debug: null,
    };
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error(
      `[serverBrandingForSlug] crashed for slug='${slug}':`,
      e?.message || e,
    );
    return {
      branding: null,
      reason: "server_error",
      debug: e?.message || "unknown error",
    };
  }
}

/**
 * Back-compat: returns just the branding (or null) for callers that
 * don't need to differentiate the failure mode.
 */
export async function getInitialBrandingForSlug(
  slug: string,
): Promise<InitialBranding | null> {
  const result = await getInitialBrandingForSlugDetailed(slug);
  return result.branding;
}
