import { render, screen } from "@testing-library/react";
import { AmountChangeAction } from "@/components/admin/financial/AmountChangeAction";
import type { DocumentAmountChangeSummary } from "@/services/documentAmountChanges";

const change: DocumentAmountChangeSummary = {
  kind: "amount",
  previousTotal: 100,
  newTotal: 125,
  changeAmount: 25,
  direction: "increase",
  reason: "Additional guest",
  quoteId: null,
  orderId: "order-1",
  invoiceId: "invoice-1",
  refundPaymentId: null,
  refundPaymentStatus: null,
  amountPaid: 100,
  balanceDue: 25,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("AmountChangeAction", () => {
  it("keeps an outstanding increase actionable", () => {
    render(
      <AmountChangeAction
        change={change}
        href="/admin/invoices?invoiceId=invoice-1"
        formatAmount={(amount) => `R${amount.toFixed(2)}`}
      />,
    );

    expect(screen.getByRole("link", { name: /increased R25.00 collect balance/i })).toHaveAttribute(
      "href",
      "/admin/invoices?invoiceId=invoice-1",
    );
  });

  it("fades and disables an increase once fully paid", () => {
    render(
      <AmountChangeAction
        change={change}
        href="/admin/invoices?invoiceId=invoice-1"
        settled
        formatAmount={(amount) => `R${amount.toFixed(2)}`}
      />,
    );

    const indicator = screen.getByRole("status", { name: /increased R25\.00\.\s*paid in full/i });
    expect(indicator).toHaveClass("opacity-60", "grayscale");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
