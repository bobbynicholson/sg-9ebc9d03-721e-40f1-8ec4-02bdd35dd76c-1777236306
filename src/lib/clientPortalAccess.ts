/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Resolve a client portal identity only when that email is already an active
 * client contact in the requested company. Escaping LIKE metacharacters keeps
 * an email address from widening the case-insensitive match.
 */
export function findClientPortalContact(admin: any, companyId: string, email: string) {
  const emailPattern = email.replace(/[\\%_]/g, "\\$&");

  return admin
    .from("clients")
    .select("id, client_name")
    .eq("company_id", companyId)
    .ilike("email", emailPattern)
    .is("deleted_at", null)
    .or("is_active.is.null,is_active.eq.true")
    .limit(1)
    .maybeSingle();
}
