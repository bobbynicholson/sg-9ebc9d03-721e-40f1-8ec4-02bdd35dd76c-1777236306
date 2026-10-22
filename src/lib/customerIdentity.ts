/** Stored client_name remains the person; it must never become a billing alias. */
export function customerBillingIdentity(contactName?: string | null, companyName?: string | null) {
  const contact = String(contactName || "").trim();
  const company = String(companyName || "").trim();
  return { name: company || contact, contactName: company && contact && company !== contact ? contact : null };
}

/** A document-specific name (including an explicit individual/null) wins
 * over the customer's default. Legacy snapshots without the field inherit. */
export function resolveInvoiceCompanyName({ order, invoiceData, client }: {
  order?: { client_company_name?: string | null } | null;
  invoiceData?: { clientCompanyName?: string | null } | null;
  client?: { company_name?: string | null } | null;
}): string | null {
  const value = order?.client_company_name !== undefined ? order.client_company_name
    : invoiceData?.clientCompanyName !== undefined ? invoiceData.clientCompanyName
    : client?.company_name;
  return String(value || "").trim() || null;
}

export function resolveInvoiceContactName({ order, invoiceData, client }: {
  order?: { client_name?: string | null } | null;
  invoiceData?: { clientName?: string | null } | null;
  client?: { client_name?: string | null } | null;
}): string {
  return [order?.client_name, invoiceData?.clientName, client?.client_name]
    .map((value) => String(value || "").trim()).find(Boolean) || "";
}

/** Importing an organisation must not turn it into a person's greeting. */
export function importedCustomerIdentity(person?: string | null, organisation?: string | null) {
  return { client_name: String(person || "").trim() || "Customer", company_name: String(organisation || "").trim() || null };
}
