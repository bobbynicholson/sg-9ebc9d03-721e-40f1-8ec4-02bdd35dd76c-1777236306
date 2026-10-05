import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PaymentModal } from "@/components/billing/PaymentModal";

jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
const invoice = { id: "invoice-1", invoice_number: "INV-1", order_id: "order-1", order_number: "ORD-1",
  amount: 1000, pay_now_amount: 5, currency: "R", status: "pending", public_token: "invoice-token" };
let checkoutBodies: Array<Record<string, unknown>>;
beforeEach(() => {
  checkoutBodies = [];
  Object.defineProperty(global.crypto, "randomUUID", { configurable: true, value: () => "00000000-0000-0000-0000-000000000001" });
  global.fetch = jest.fn(async (url, options) => {
    const path = String(url);
    const data = path.includes("/create-session")
      ? (checkoutBodies.push(JSON.parse(String(options?.body))), { ok: true, provider: "store_credit", settled: false, creditApplied: 5, balanceDue: 995 })
      : path.includes("/credit-balance") ? { ok: true, available: 0, maxApplicable: 0 }
      : { invoice: { payment_options: { online_available: true }, companies: {} } };
    return { ok: true, json: async () => data } as Response;
  });
});

test("portal payment honors the agreed first amount and uses authenticated checkout despite a public token", async () => {
  const onPaymentSuccess = jest.fn();
  render(<PaymentModal invoice={invoice} open authenticatedCheckout onClose={jest.fn()} onPaymentSuccess={onPaymentSuccess} />);
  fireEvent.click(await screen.findByRole("button", { name: "Pay R5.00" }));
  await waitFor(() => expect(onPaymentSuccess).toHaveBeenCalled());
  expect(checkoutBodies[0]).toMatchObject({ invoice_id: "invoice-1", pay_amount: 5 });
  expect(checkoutBodies[0]).not.toHaveProperty("public_token");
});

test("client can choose the full balance without changing the saved first-payment amount", async () => {
  render(<PaymentModal invoice={invoice} open authenticatedCheckout onClose={jest.fn()} onPaymentSuccess={jest.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Pay full balance: R1,000.00" }));
  fireEvent.click(await screen.findByRole("button", { name: "Pay R1,000.00" }));
  await waitFor(() => expect(checkoutBodies).toHaveLength(1));
  expect(checkoutBodies[0].pay_amount).toBe(1000);
  expect(invoice.pay_now_amount).toBe(5);
});
