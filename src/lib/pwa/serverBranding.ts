import { getServiceSupabase } from "@/lib/supabase/service";
import { isCompanySlug, type PwaBranding } from "./metadata";

/** Only public branding fields may cross this unauthenticated boundary. */
export async function getPwaBranding(selector: { slug?: string; id?: string }): Promise<PwaBranding | null> {
  if (!isCompanySlug(selector.slug) && !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(selector.id || "")) return null;
  const db = getServiceSupabase();
  let query = db.from("companies").select("id, slug, company_name, logo_url, primary_color")
    .is("deleted_at", null).or("is_active.is.null,is_active.eq.true");
  query = isCompanySlug(selector.slug) ? query.eq("slug", selector.slug) : query.eq("id", selector.id);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error("Company app branding could not be loaded");
  return data ? {
    id: data.id, slug: data.slug, companyName: data.company_name,
    logoUrl: data.logo_url, primaryColor: data.primary_color,
  } : null;
}
