import {
  loadLatestDocumentAmountChanges,
  recordDocumentAmountChange,
  recordDocumentRefundQueued,
} from "@/services/documentAmountChanges";

describe("document amount changes", () => {
  it("records one audit event for each linked document", async () => {
    const insert = jest.fn().mockResolvedValue({ error: null });
    const client = { from: jest.fn(() => ({ insert })) };

    const result = await recordDocumentAmountChange(client, {
      companyId: "company-1",
      previousTotal: 100,
      newTotal: 125,
      reason: "Additional guest",
      quoteId: "quote-1",
      orderId: "order-1",
      invoiceId: "invoice-1",
      amountPaid: 50,
      balanceDue: 75,
    });

    expect(result.error).toBeUndefined();
    expect(insert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ entity_type: "quotes", entity_id: "quote-1" }),
      expect.objectContaining({ entity_type: "orders", entity_id: "order-1" }),
      expect.objectContaining({ entity_type: "invoices", entity_id: "invoice-1" }),
    ]));
    expect(insert.mock.calls[0][0][0].details).toMatchObject({
      change_kind: "amount",
      previous_total: 100,
      new_total: 125,
      change_amount: 25,
      change_direction: "increase",
      reason: "Additional guest",
      amount_paid: 50,
      balance_due: 75,
    });
  });

  it("does not write an audit event when the total is unchanged", async () => {
    const insert = jest.fn();
    const client = { from: jest.fn(() => ({ insert })) };

    const result = await recordDocumentAmountChange(client, {
      companyId: "company-1",
      previousTotal: 100,
      newTotal: 100,
      reason: "No price change",
      orderId: "order-1",
    });

    expect(result.summary).toBeNull();
    expect(insert).not.toHaveBeenCalled();
  });

  it("marks queued refunds distinctly in the list history", async () => {
    const rows = [
      {
        entity_id: "invoice-1",
        created_at: "2026-01-02T00:00:00.000Z",
        details: {
          change_kind: "refund",
          previous_total: 125,
          new_total: 100,
          change_amount: -25,
          change_direction: "decrease",
          reason: "Refund queued",
          invoice_id: "invoice-1",
          refund_payment_id: "payment-1",
        },
      },
    ];
    const builder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: rows, error: null }),
    };
    const paymentsBuilder = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({
        data: [{ id: "payment-1", payment_status: "completed" }],
        error: null,
      }),
    };
    const client = {
      from: jest.fn((table: string) => table === "payments" ? paymentsBuilder : builder),
    };

    const changes = await loadLatestDocumentAmountChanges(client, "company-1", ["invoice-1"]);

    expect(changes.get("invoice-1")).toMatchObject({
      kind: "refund",
      direction: "decrease",
      changeAmount: -25,
      refundPaymentId: "payment-1",
      refundPaymentStatus: "completed",
    });
    expect(builder.eq).toHaveBeenCalledWith("action", "document_amount_changed");
  });

  it("records queued refund history as a decrease", async () => {
    const insert = jest.fn().mockResolvedValue({ error: null });
    const client = { from: jest.fn(() => ({ insert })) };

    const result = await recordDocumentRefundQueued(client, {
      companyId: "company-1",
      currentTotal: 100,
      amount: 25,
      reason: "Overpayment",
      invoiceId: "invoice-1",
      refundPaymentId: "payment-1",
    });

    expect(result.error).toBeUndefined();
    expect(insert.mock.calls[0][0][0].details).toMatchObject({
      change_kind: "refund",
      previous_total: 125,
      new_total: 100,
      change_amount: -25,
      change_direction: "decrease",
      refund_payment_id: "payment-1",
    });
  });
});
