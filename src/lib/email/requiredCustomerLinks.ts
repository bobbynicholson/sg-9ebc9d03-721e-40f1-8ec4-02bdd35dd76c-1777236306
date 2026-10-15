/**
 * Transactional acceptance emails must always give the client a route
 * back to the resulting order. Tenant/global templates may pre-date the
 * order_url variable, so enforcing the link at the transport boundary
 * prevents an old customised template from silently dropping it.
 */
export function ensureRequiredOrderLink(
  body: string,
  orderUrl: string | null | undefined,
): string {
  const cleanBody = String(body || "");
  const cleanUrl = String(orderUrl || "").trim();
  if (!cleanUrl) return cleanBody;

  // Avoid duplicate links when the selected template already contains
  // {{order_url}} and the resolver substituted it, or when a tenant
  // hard-coded an order link in its customised wording.
  if (cleanBody.includes(cleanUrl) || /\/c\/order\//i.test(cleanBody)) {
    return cleanBody;
  }

  return `${cleanBody.trimEnd()}\n\nView your order: ${cleanUrl}`;
}

/**
 * Quote-acceptance email flow (client brief, Oct 2026):
 *   - Quote accepted -> deposit invoice email only, with NO order link.
 *     The order link goes out only once the deposit is paid.
 *   - Deposit paid / balance paid -> thank-you receipt with the order
 *     link and NO invoice link: the client opens the order (client
 *     portal) to view and download the invoice.
 *
 * Applied at the transport boundary (emailService) so global defaults,
 * tenant-customised wording and admin resends all follow the same rule.
 */
export interface ClientFlowLinkRule {
  /** Variables removed before the template is filled in. */
  dropVariable: RegExp;
  /** Lines removed from the finished body (placeholder left unfilled, or a hard-coded link). */
  stripLine: RegExp;
  /** The unfilled placeholder alone, for lines too long to drop whole. */
  placeholder: RegExp;
  /** The order link is appended when the wording leaves it out. */
  requireOrderLink: boolean;
}

const ORDER_LINK_VARIABLE = /^order_?(url|link)$/i;
const INVOICE_LINK_VARIABLE = /^(invoice|payment|pay)_?(link|url)$/i;

const NO_ORDER_LINK: ClientFlowLinkRule = {
  dropVariable: ORDER_LINK_VARIABLE,
  stripLine: /\{\{\s*order_?(url|link)\s*\}\}|\/c\/order\//i,
  placeholder: /\{\{\s*order_?(url|link)\s*\}\}/gi,
  requireOrderLink: false,
};

const ORDER_LINK_NOT_INVOICE_LINK: ClientFlowLinkRule = {
  dropVariable: INVOICE_LINK_VARIABLE,
  stripLine: /\{\{\s*(invoice|payment|pay)_?(link|url)\s*\}\}|\/pay\/i\/|\/pay\/invoice\//i,
  placeholder: /\{\{\s*(invoice|payment|pay)_?(link|url)\s*\}\}/gi,
  requireOrderLink: true,
};

const CLIENT_FLOW_LINK_RULES: Record<string, ClientFlowLinkRule> = {
  deposit_invoice_issued: NO_ORDER_LINK,
  deposit_payment_received: ORDER_LINK_NOT_INVOICE_LINK,
  balance_payment_received: ORDER_LINK_NOT_INVOICE_LINK,
};

export function clientFlowLinkRule(templateKey: string | null | undefined): ClientFlowLinkRule | undefined {
  return templateKey ? CLIENT_FLOW_LINK_RULES[templateKey] : undefined;
}

/** Copy of the variables without the ones this email must not link to. */
export function withoutLinkVariables<T extends Record<string, unknown>>(
  variables: T,
  rule: ClientFlowLinkRule,
): T {
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(variables || {})) {
    if (!rule.dropVariable.test(key)) kept[key] = value;
  }
  return kept as T;
}

/**
 * Removes the lines that carry a link this email must not include.
 * A very long line (a whole HTML body on one line) is never dropped;
 * only the unfilled placeholder is removed from it, so the email is
 * never emptied by accident.
 */
export function stripLinkLines(body: string, rule: ClientFlowLinkRule): string {
  const lines = String(body || "").split("\n");
  const kept = lines
    .filter((line) => line.length > 400 || !rule.stripLine.test(line))
    .map((line) => (line.length > 400 ? line.replace(rule.placeholder, "") : line));
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
