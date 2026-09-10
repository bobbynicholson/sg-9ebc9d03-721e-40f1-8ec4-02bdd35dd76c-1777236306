import { supabase } from "@/integrations/supabase/client";

/**
 * Company Isolation Utilities
 * Ensures all database queries are scoped to the correct company
 */

export interface CompanyContext {
  companyId: string;
  companySlug: string;
  userId: string;
  userRole: string;
}

/**
 * Get company context from current user session
 */
export async function getCompanyContext(): Promise<CompanyContext | null> {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select(`
      id,
      active_role,
      company_id,
      companies!company_id!inner(
        id,
        slug
      )
    `)
    .eq("id", session.user.id)
    .maybeSingle();

  if (!profile || !profile.companies) return null;

  return {
    companyId: profile.company_id,
    companySlug: (profile.companies as any).slug,
    userId: profile.id,
    userRole: profile.active_role,
  };
}

/**
 * Validate that a company slug matches the current user's company
 * Throws error if mismatch (unless user is super_admin)
 */
export async function validateCompanyAccess(
  urlCompanySlug: string
): Promise<boolean> {
  const context = await getCompanyContext();
  
  if (!context) {
    throw new Error("No company context found");
  }

  // Super admin can access any company
  if (context.userRole === "super_admin") {
    return true;
  }

  // Regular users must match their company
  if (context.companySlug !== urlCompanySlug) {
    console.error(`🚨 SECURITY: User attempted to access ${urlCompanySlug} but belongs to ${context.companySlug}`);
    throw new Error("Unauthorized company access");
  }

  return true;
}

/**
 * Get company ID from slug
 * Used to filter database queries
 */
export async function getCompanyIdFromSlug(slug: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("companies")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (error) console.error("[companyIsolation/getCompanyIdFromSlug] companies lookup failed:", error);

  return data?.id || null;
}

/**
 * Add company filter to Supabase query
 * Ensures query only returns data for the specified company
 */
export function withCompanyFilter<T>(
  query: any,
  companyId: string,
  columnName: string = "company_id"
) {
  return query.eq(columnName, companyId);
}

/**
 * Validate user belongs to company before mutation
 */
export async function validateCompanyMutation(
  userId: string,
  companyId: string
): Promise<boolean> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("company_id, active_role")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) return false;

  // Super admin can mutate any company's data
  if (profile.active_role === "super_admin") return true;

  // Regular users can only mutate their own company's data
  return profile.company_id === companyId;
}