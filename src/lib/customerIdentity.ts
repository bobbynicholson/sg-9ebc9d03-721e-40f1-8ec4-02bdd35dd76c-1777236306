/** Stored client_name remains the person; it must never become a billing alias. */
export function customerBillingIdentity(contactName?: string | null, companyName?: string | null) {
  const contact = String(contactName || "").trim();
  const company = String(companyName || "").trim();
  return { name: company || contact, contactName: company && contact && company !== contact ? contact : null };
}
