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
    const { data, error } = await supabase
      .from("companies")
      .select("id, slug, company_name, logo_url, primary_color, secondary_color, accent_color, brand_font_body, brand_font_display")
      .eq("slug", slug)
      .maybeSingle();

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
