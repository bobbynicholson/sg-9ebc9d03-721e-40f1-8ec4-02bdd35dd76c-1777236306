/* eslint-disable @typescript-eslint/no-explicit-any */

export interface DocumentAmountChange {
  companyId: string;
  previousTotal: number;
  newTotal: number;
  reason: string;
  quoteId?: string | null;
  orderId?: string | null;
  invoiceId?: string | null;
  refundPaymentId?: string | null;
  amountPaid?: number | null;
  balanceDue?: number | null;
}

export interface DocumentAmountChangeSummary {
  kind: "amount" | "refund";
  previousTotal: number;
  newTotal: number;
  changeAmount: number;
  direction: "increase" | "decrease";
  reason: string;
  quoteId: string | null;
  orderId: string | null;
  invoiceId: string | null;
  refundPaymentId: string | null;
  refundPaymentStatus: string | null;
  amountPaid: number | null;
  balanceDue: number | null;
  createdAt: string;
}

export async function recordDocumentAmountChange(
  client: any,
  input: DocumentAmountChange,
): Promise<{ summary: DocumentAmountChangeSummary | null; error?: string }> {
  const previousTotal = Number(input.previousTotal || 0);
  const newTotal = Number(input.newTotal || 0);
  const changeAmount = Number((newTotal - previousTotal).toFixed(2));
  if (!Number.isFinite(changeAmount) || Math.abs(changeAmount) < 0.01) {
    return { summary: null };
  }

  const createdAt = new Date().toISOString();
  const summary: DocumentAmountChangeSummary = {
    kind: "amount",
    previousTotal,
    newTotal,
    changeAmount,
    direction: changeAmount > 0 ? "increase" : "decrease",
    reason: input.reason,
    quoteId: input.quoteId || null,
    orderId: input.orderId || null,
    invoiceId: input.invoiceId || null,
    refundPaymentId: input.refundPaymentId || null,
    refundPaymentStatus: null,
    amountPaid: input.amountPaid == null ? null : Number(input.amountPaid),
    balanceDue: input.balanceDue == null ? null : Number(input.balanceDue),
    createdAt,
  };
  const details = {
    change_kind: "amount",
    quote_id: summary.quoteId,
    order_id: summary.orderId,
    invoice_id: summary.invoiceId,
    refund_payment_id: summary.refundPaymentId,
    previous_total: summary.previousTotal,
    new_total: summary.newTotal,
    change_amount: summary.changeAmount,
    change_direction: summary.direction,
    amount_paid: summary.amountPaid,
    balance_due: summary.balanceDue,
    reason: summary.reason,
  };
  const entries = [
    summary.quoteId ? { entity_type: "quotes", entity_id: summary.quoteId } : null,
    summary.orderId ? { entity_type: "orders", entity_id: summary.orderId } : null,
    summary.invoiceId ? { entity_type: "invoices", entity_id: summary.invoiceId } : null,
  ].filter(Boolean).map((entity: any) => ({
    company_id: input.companyId,
    user_id: null,
    action: "document_amount_changed",
    entity_type: entity.entity_type,
    entity_id: entity.entity_id,
    created_at: createdAt,
    details,
  }));

  if (entries.length === 0) return { summary: null };
  const { error } = await client.from("audit_logs").insert(entries);
  return error ? { summary, error: error.message } : { summary };
}

export async function recordDocumentRefundQueued(
  client: any,
  input: Omit<DocumentAmountChange, "previousTotal" | "newTotal"> & {
    amount: number;
    currentTotal: number;
  },
): Promise<{ error?: string }> {
  const amount = Number(input.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) return {};
  const details = {
    change_kind: "refund",
    quote_id: input.quoteId || null,
    order_id: input.orderId || null,
    invoice_id: input.invoiceId || null,
    refund_payment_id: input.refundPaymentId || null,
    previous_total: Number((input.currentTotal + amount).toFixed(2)),
    new_total: Number(input.currentTotal.toFixed(2)),
    change_amount: Number((-amount).toFixed(2)),
    change_direction: "decrease",
    amount_paid: input.amountPaid == null ? null : Number(input.amountPaid),
    balance_due: input.balanceDue == null ? null : Number(input.balanceDue),
    reason: input.reason,
  };
  const entries = [
    input.quoteId ? { entity_type: "quotes", entity_id: input.quoteId } : null,
    input.orderId ? { entity_type: "orders", entity_id: input.orderId } : null,
    input.invoiceId ? { entity_type: "invoices", entity_id: input.invoiceId } : null,
  ].filter(Boolean).map((entity: any) => ({
    company_id: input.companyId,
    user_id: null,
    action: "document_amount_changed",
    entity_type: entity.entity_type,
    entity_id: entity.entity_id,
    details,
  }));
  if (!entries.length) return {};
  const { error } = await client.from("audit_logs").insert(entries);
  return error ? { error: error.message } : {};
}

export async function loadLatestDocumentAmountChanges(
  client: any,
  companyId: string,
  entityIds: string[],
): Promise<Map<string, DocumentAmountChangeSummary>> {
  const ids = Array.from(new Set(entityIds.filter(Boolean)));
  if (!companyId || ids.length === 0) return new Map();

  const { data, error } = await client.from("audit_logs")
    .select("entity_id, created_at, details")
    .eq("company_id", companyId)
    .eq("action", "document_amount_changed")
    .in("entity_id", ids)
    .order("created_at", { ascending: false })
    .limit(Math.min(1000, ids.length * 20));
  if (error) throw error;

  const latest = new Map<string, DocumentAmountChangeSummary>();
  for (const row of data || []) {
    const id = String((row as any).entity_id || "");
    const details = (row as any).details || {};
    if (!id || latest.has(id)) continue;
    const previousTotal = Number(details.previous_total);
    const newTotal = Number(details.new_total);
    const direction = details.change_direction === "increase" || details.change_direction === "decrease"
      ? details.change_direction
      : null;
    if (!Number.isFinite(previousTotal) || !Number.isFinite(newTotal) || !direction) continue;
    latest.set(id, {
      previousTotal,
      newTotal,
      changeAmount: Number(details.change_amount ?? newTotal - previousTotal),
      direction,
      kind: details.change_kind === "refund" ? "refund" : "amount",
      reason: String(details.reason || "Amount updated"),
      quoteId: details.quote_id || null,
      orderId: details.order_id || null,
      invoiceId: details.invoice_id || null,
      refundPaymentId: details.refund_payment_id || null,
      refundPaymentStatus: null,
      amountPaid: details.amount_paid == null ? null : Number(details.amount_paid),
      balanceDue: details.balance_due == null ? null : Number(details.balance_due),
      createdAt: String((row as any).created_at || ""),
    });
  }

  const refundIds = Array.from(new Set(
    Array.from(latest.values())
      .map((change) => change.refundPaymentId)
      .filter((id): id is string => !!id),
  ));
  if (refundIds.length > 0) {
    try {
      const { data: refundRows, error: refundError } = await client.from("payments")
        .select("id, payment_status")
        .eq("company_id", companyId)
        .in("id", refundIds);
      if (!refundError) {
        const statusById = new Map<string, string>();
        for (const row of refundRows || []) {
          statusById.set(String((row as any).id), String((row as any).payment_status || ""));
        }
        for (const change of latest.values()) {
          if (change.refundPaymentId) {
            change.refundPaymentStatus = statusById.get(change.refundPaymentId) || null;
          }
        }
      }
    } catch {
      // Refund status is optional decoration; amount history remains usable.
    }
  }
  return latest;
}