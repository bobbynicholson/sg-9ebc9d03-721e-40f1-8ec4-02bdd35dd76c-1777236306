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
 * Only safe branding columns are returned — never embed tokens, billing
 * info, or anything else that lives on the row.
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
}

export async function getInitialBrandingForSlug(
  slug: string,
): Promise<InitialBranding | null> {
  if (!slug) return null;

  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("companies")
      .select("id, slug, company_name, logo_url, primary_color, secondary_color, accent_color")
      .eq("slug", slug)
      .maybeSingle();

    if (error || !data) return null;

    // The auto-generated Database types don't currently include
    // `accent_color`, so cast to a permissive shape rather than fight
    // the types. The runtime row does have the column.
    const row = data as Record<string, string | null | undefined>;

    return {
      id: row.id ?? "",
      slug: row.slug ?? slug,
      companyName: row.company_name || "Your portal",
      logoUrl: row.logo_url || null,
      primaryColor: row.primary_color || null,
      secondaryColor: row.secondary_color || null,
      accentColor: row.accent_color || null,
    };
  } catch {
    return null;
  }
}
