import { resolveCompanyEftDetails } from "@/lib/companyEftDetails";
import { getServiceSupabase } from "@/lib/supabase/service";

/** Add only the company's customer-safe bank fields after a client-order
 * token has been validated by client_view_order. */
export async function attachClientOrderBankDetails<T extends Record<string, any>>(result: T): Promise<T & { bankTransferDetails: ReturnType<typeof resolveCompanyEftDetails> | null }> {
  const companyId = String(result?.order?.company_id || result?.company?.id || "").trim();
  if (!companyId) return { ...result, bankTransferDetails: null };

  try {
    const { data, error } = await (getServiceSupabase() as any)
      .from("companies")
      .select("company_name, email, bank_name, bank_account_holder, bank_account_number, bank_branch_code, bank_account_type, eft_instructions")
      .eq("id", companyId)
      .maybeSingle();
    if (error) throw error;
    const company = data || {};
    return {
      ...result,
      company: {
        ...(result.company || {}),
        company_name: result.company?.company_name || company.company_name || null,
        email: result.company?.email || company.email || null,
      },
      bankTransferDetails: resolveCompanyEftDetails(company),
    };
  } catch (error) {
    console.warn("[client-order] company bank details could not be loaded:", error);
    return { ...result, bankTransferDetails: null };
  }
}
