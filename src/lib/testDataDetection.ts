const AUTOMATED_TEST_MARKER_RE = /\b(E2E-ORD|E2E-Q|E2E-INV|E2E_RUN:|ORDER-E2E|Codex[\s-]?E2E)\b/i;

export function hasAutomatedTestMarker(...values: unknown[]): boolean {
  return AUTOMATED_TEST_MARKER_RE.test(
    values
      .filter((v) => v !== null && v !== undefined)
      .map((v) => String(v))
      .join(" "),
  );
}

export function isAutomatedTestOrder(order: any): boolean {
  return hasAutomatedTestMarker(
    order?.order_number,
    order?.event_name,
    order?.internal_notes,
    order?.client_name,
  );
}

export function isAutomatedTestQuote(quote: any): boolean {
  return hasAutomatedTestMarker(
    quote?.quote_number,
    quote?.quote_name,
    quote?.notes,
    quote?.client_name,
    quote?.client_email,
  );
}

export function isAutomatedTestClient(client: any): boolean {
  return hasAutomatedTestMarker(
    client?.client_name,
    client?.email,
    client?.notes,
    client?.historical_notes,
  );
}

export function isAutomatedTestInvoice(invoice: any): boolean {
  return hasAutomatedTestMarker(
    invoice?.invoice_number,
    invoice?.invoice_data?.clientName,
    invoice?.invoice_data?.clientEmail,
  ) || isAutomatedTestOrder(invoice?.order || invoice?.orders);
}

export function isAutomatedTestOrderItem(item: any): boolean {
  return isAutomatedTestOrder(item?.order || item?.orders);
}
