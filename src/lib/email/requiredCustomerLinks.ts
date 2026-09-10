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
