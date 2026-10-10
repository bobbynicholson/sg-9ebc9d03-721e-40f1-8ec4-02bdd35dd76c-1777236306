import { findMoneyInconsistencies } from "@/services/order/moneyReconciliation";

function reconciliationClient(input: {
  orders: any[];
  invoices: any[];
  orderPayments?: any[];
  invoicePayments?: any[];
}) {
  const orders = {
    select: jest.fn(), eq: jest.fn(), is: jest.fn(), order: jest.fn(), limit: jest.fn(),
  } as any;
  orders.select.mockReturnValue(orders);
  orders.eq.mockReturnValue(orders);
  orders.is.mockReturnValue(orders);
  orders.order.mockReturnValue(orders);
  orders.limit.mockResolvedValue({ data: input.orders, error: null });

  const invoices = { select: jest.fn(), in: jest.fn(), is: jest.fn() } as any;
  invoices.select.mockReturnValue(invoices);
  invoices.in.mockReturnValue(invoices);
  invoices.is.mockResolvedValue({ data: input.invoices, error: null });

  const paymentQuery = (rows: any[]) => {
    const query = { select: jest.fn(), eq: jest.fn(), in: jest.fn() } as any;
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.in.mockResolvedValue({ data: rows, error: null });
    return query;
  };
  const paymentQueries = [
    paymentQuery(input.orderPayments || []),
    paymentQuery(input.invoicePayments || []),
  ];
  let paymentIndex = 0;

  return {
    from: jest.fn((table: string) => {
      if (table === "orders") return orders;
      if (table === "invoices") return invoices;
      if (table === "payments") return paymentQueries[paymentIndex++];
      throw new Error(`Unexpected table ${table}`);
    }),
  } as any;
}

describe("money reconciliation", () => {
  it("keeps a real overpayment as one warning and catches a missing paid flag", async () => {
    const result = await findMoneyInconsistencies(reconciliationClient({
      orders: [{
        id: "order-1", order_number: "ORD-1", client_name: "Client", status: "confirmed",
        total_amount: 100, amount_paid: 120, payment_opening_paid: 0,
        balance_amount: 0, balance_paid: false,
      }],
      invoices: [{
        id: "invoice-1", order_id: "order-1", invoice_number: "INV-1", status: "paid",
        total_amount: 100, amount_paid: 120, balance_due: 0,
      }],
      // This row comes back from both queries in production when it links the
      // order and its invoice. The scan must not count it twice.
      orderPayments: [{
        id: "payment-1", order_id: "order-1", invoice_id: "invoice-1", amount: 120,
        payment_type: "invoice", payment_status: "completed",
      }],
      invoicePayments: [{
        id: "payment-1", order_id: "order-1", invoice_id: "invoice-1", amount: 120,
        payment_type: "invoice", payment_status: "completed",
      }],
    }), "company-1");

    expect(result.scanned).toBe(1);
    expect(result.truncated).toBe(false);
    expect(result.issues.map((issue) => issue.kind)).toEqual(expect.arrayContaining([
      "overpaid",
      "paid_flag_mismatch",
    ]));
    expect(result.issues.map((issue) => issue.kind)).not.toContain("invoice_internal");
    expect(result.issues.map((issue) => issue.kind)).not.toContain("order_vs_payment_ledger");
  });

  it("flags an order projection that has fallen behind a settled payment", async () => {
    const result = await findMoneyInconsistencies(reconciliationClient({
      orders: [{
        id: "order-1", order_number: "ORD-1", status: "confirmed", total_amount: 100,
        amount_paid: 0, payment_opening_paid: 0, balance_amount: 100, balance_paid: false,
      }],
      invoices: [{
        id: "invoice-1", order_id: "order-1", invoice_number: "INV-1", status: "sent",
        total_amount: 100, amount_paid: 0, balance_due: 100,
      }],
      invoicePayments: [{
        id: "payment-1", invoice_id: "invoice-1", amount: 100,
        payment_type: "invoice", payment_status: "completed",
      }],
    }), "company-1");

    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "order_vs_payment_ledger", severity: "error" }),
    ]));
  });
});
