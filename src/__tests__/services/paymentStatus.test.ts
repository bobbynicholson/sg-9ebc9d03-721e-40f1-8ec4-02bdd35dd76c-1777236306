import {
  deriveOrderPaymentState,
  getOrderPaymentSummary,
  resolveOrderAmountPaid,
} from "@/lib/paymentStatus";

describe("order payment presentation", () => {
  it("shows Paid in Full when paid equals the order total", () => {
    expect(getOrderPaymentSummary({ totalAmount: 1000, amountPaid: 1000 }).label).toBe("Paid in Full");
  });

  it("shows Paid in Full when a legacy row is overpaid", () => {
    expect(getOrderPaymentSummary({ totalAmount: 1000, amountPaid: 1000.001 }).label).toBe("Paid in Full");
  });

  it("shows Deposit Paid only while a balance remains", () => {
    const summary = getOrderPaymentSummary({ totalAmount: 1000, amountPaid: 300 });
    expect(summary.label).toBe("Deposit Paid");
    expect(summary.balanceDue).toBe(700);
  });

  it("shows Awaiting Payment when nothing has been received", () => {
    expect(getOrderPaymentSummary({ totalAmount: 1000, amountPaid: 0, depositPaid: true, depositAmount: 300 }).label)
      .toBe("Awaiting Payment");
  });

  it("uses legacy balance data only when amount_paid is unavailable", () => {
    expect(resolveOrderAmountPaid({ totalAmount: 1000, amountPaid: null, balanceAmount: 250 })).toBe(750);
  });

  it("rounds to cents before deciding whether the order is paid", () => {
    expect(deriveOrderPaymentState(752.5, 752.499999999)).toBe("paid");
  });
});

