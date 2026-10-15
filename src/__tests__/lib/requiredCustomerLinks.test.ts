import { ensureRequiredOrderLink } from "@/lib/email/requiredCustomerLinks";
import { TEMPLATE_REGISTRY } from "@/lib/messageTemplates/registry";

describe("required customer links", () => {
  const orderUrl =
    "https://cateringms.com/spit-braai-delivery/c/order/order-1?t=secure-token";

  it("adds the secure order link to a legacy deposit template", () => {
    expect(
      ensureRequiredOrderLink("Pay here: https://example.com/pay/1", orderUrl),
    ).toContain(`View your order: ${orderUrl}`);
  });

  it("does not duplicate an order link already supplied by the template", () => {
    const body = `Pay here.\n\nView your order: ${orderUrl}`;
    expect(ensureRequiredOrderLink(body, orderUrl)).toBe(body);
  });

  it("keeps the quote-acceptance link contract explicit in the editor", () => {
    // Deposit invoice: invoice link, no order link (order link comes once the deposit is paid).
    const depositInvoice = TEMPLATE_REGISTRY.find((entry) => entry.key === "deposit_invoice_issued");
    expect(depositInvoice?.defaultBody).toContain("{{invoice_link}}");
    expect(depositInvoice?.defaultBody).not.toContain("{{order_url}}");
    expect(depositInvoice?.variables.some((variable) => variable.name === "order_url")).toBe(false);
    // Payment receipts: order link, no invoice link.
    for (const key of ["deposit_payment_received", "balance_payment_received"]) {
      const template = TEMPLATE_REGISTRY.find((entry) => entry.key === key);
      expect(template?.defaultBody).toContain("{{order_url}}");
      expect(template?.defaultBody).not.toContain("{{invoice_link}}");
      expect(template?.variables.some((variable) => variable.name === "order_url")).toBe(true);
    }
  });
});
