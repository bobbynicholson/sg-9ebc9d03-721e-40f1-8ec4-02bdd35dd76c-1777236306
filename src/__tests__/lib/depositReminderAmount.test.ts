import {
  hasRecordedDepositPayment,
  outstandingDepositReminderAmount,
} from "@/lib/depositReminderAmount";

describe("outstanding deposit reminder amount", () => {
  const base = {
    orderTotalAmount: 6316.5,
    orderDepositAmount: 3158.25,
    invoiceTotalAmount: 6316.5,
    invoiceBalanceDue: 6316.5,
  };

  it("asks for the agreed deposit, not the full invoice", () => {
    expect(outstandingDepositReminderAmount(base)).toBe(3158.25);
  });

  it("asks only for the remaining part of a partially paid deposit", () => {
    expect(outstandingDepositReminderAmount({
      ...base,
      orderAmountPaid: 3015.16,
      invoiceAmountPaid: 3015.16,
      invoiceBalanceDue: 3301.34,
    })).toBe(143.09);
  });

  it("does not send when the paid amount already satisfies the deposit, even if the flag is stale", () => {
    expect(outstandingDepositReminderAmount({
      ...base,
      depositPaid: false,
      orderAmountPaid: 3158.25,
      invoiceAmountPaid: 3158.25,
      invoiceBalanceDue: 3158.25,
    })).toBe(0);
  });

  it("recognizes recorded payments from either the order or invoice so the flag can be repaired", () => {
    expect(hasRecordedDepositPayment({
      ...base,
      depositPaid: false,
      orderAmountPaid: 0,
      invoiceAmountPaid: 3158.25,
    })).toBe(true);
  });

  it("does not repair the flag when recorded payments are below the agreed deposit", () => {
    expect(hasRecordedDepositPayment({
      ...base,
      depositPaid: false,
      orderAmountPaid: 3015.16,
      invoiceAmountPaid: 3015.16,
    })).toBe(false);
  });

  it("does not infer a paid deposit without a known order or invoice total", () => {
    expect(hasRecordedDepositPayment({
      depositPaid: false,
      orderAmountPaid: 9999,
    })).toBe(false);
  });

  it("does not send when the deposit-paid flag is set", () => {
    expect(outstandingDepositReminderAmount({ ...base, depositPaid: true })).toBe(0);
  });

  it("caps the deposit request at the invoice balance", () => {
    expect(outstandingDepositReminderAmount({ ...base, invoiceBalanceDue: 500 })).toBe(500);
  });
});
