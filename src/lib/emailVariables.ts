/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Normalise the variable bag passed to an email template.
 *
 * Why: templates across the platform reference variables in mixed
 * styles - some use snake_case ({{first_name}}, {{order_number}}),
 * some camelCase ({{clientName}}, {{orderNumber}}) - while callers pass
 * whatever shape was handy at the call site. When the two don't line up
 * the placeholder resolves to empty (or, on the raw-body path, leaks as
 * a literal {{first_name}}). That's the "some emails show the value,
 * some show blank/raw" inconsistency.
 *
 * This helper expands a bag so a placeholder resolves regardless of
 * which style the template author used:
 *   1. Mirror every supplied key between camelCase and snake_case.
 *   2. Fill the handful of cross-field aliases templates rely on
 *      (first_name from a full name, company/tenant name, order/invoice
 *      number) when the specific key wasn't supplied.
 *
 * It never overwrites an explicitly-supplied value - it only fills gaps.
 * Pure + idempotent, so it's safe to run more than once on the same bag.
 */
export function normalizeEmailVariables(
  input: Record<string, any> = {},
): Record<string, any> {
  const out: Record<string, any> = { ...input };

  const snakeToCamel = (k: string) => k.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
  const camelToSnake = (k: string) => k.replace(/([A-Z])/g, (m) => "_" + m.toLowerCase());

  // 1. Mirror camelCase <-> snake_case for every supplied key without
  //    clobbering an explicitly-provided variant.
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined || v === null) continue;
    const camel = snakeToCamel(k);
    const snake = camelToSnake(k);
    if (camel !== k && out[camel] === undefined) out[camel] = v;
    if (snake !== k && out[snake] === undefined) out[snake] = v;
  }

  // Pick the first non-empty value across candidate keys.
  const pick = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const val = out[key];
      if (val !== undefined && val !== null && String(val).trim() !== "") return String(val);
    }
    return undefined;
  };
  const isEmpty = (k: string) => out[k] === undefined || out[k] === null || String(out[k]).trim() === "";

  // 2. Cross-field aliases.
  const fullName = pick("client_name", "customer_name", "full_name", "name", "recipient_name");

  // first_name: derive from a supplied full name when first_name itself
  // wasn't given. We deliberately do NOT invent a "there" default - a
  // caller that explicitly passed null/empty keeps the empty render, and
  // callers wanting a greeting fallback still pass "there" themselves.
  if (isEmpty("first_name") && fullName) {
    out.first_name = fullName.trim().split(/\s+/)[0];
  }
  if (isEmpty("firstName") && !isEmpty("first_name")) out.firstName = out.first_name;

  // client_name / clientName
  if (isEmpty("client_name") && fullName) out.client_name = fullName;
  if (isEmpty("clientName") && out.client_name) out.clientName = out.client_name;

  // company / tenant name (templates use any of these interchangeably).
  const company = pick("company_name", "tenant_name", "companyName", "tenantName", "business_name");
  if (company) {
    if (isEmpty("company_name")) out.company_name = company;
    if (isEmpty("companyName")) out.companyName = company;
    if (isEmpty("tenant_name")) out.tenant_name = company;
    if (isEmpty("tenantName")) out.tenantName = company;
  }

  // order_number <-> invoice_number (deposit/balance receipts use the
  // order number where an invoice number isn't separately tracked).
  const orderNo = pick("order_number", "orderNumber");
  const invNo = pick("invoice_number", "invoiceNumber");
  if (orderNo && !invNo) {
    out.invoice_number = orderNo;
    out.invoiceNumber = orderNo;
  }
  if (invNo && !orderNo) {
    out.order_number = invNo;
    out.orderNumber = invNo;
  }

  return out;
}
