import { render, screen, waitFor, act } from "@testing-library/react";
import { StrictMode } from "react";
import "@testing-library/jest-dom";
import ClientBillingPage from "@/pages/client-portal/billing";

const mockRouter = { isReady: true, query: { invoice_id: "invoice-1", payment_attempt_id: "attempt-1" } };
const mockAuth = { user: { id: "buyer-1" }, company: { id: "company-1", currency: "ZAR" } };
const mockInvoice = { id: "invoice-1", company_id: "company-1", invoice_number: "INV-RETURN", order_id: "order-1",
  invoice_date: "2026-10-01", due_date: "2099-12-31", total_amount: 1000, amount_paid: 0, balance_due: 1000, status: "sent",
  invoice_data: { initialPaymentAmount: 5 }, public_token: "public-token",
  orders: { order_number: "ORD-1", event_date: "2099-12-31", deposit_amount: 5, deposit_percentage: 50 } };
let mockRows: Array<Record<string, unknown>>;
let mockInvoiceError = false;
jest.mock("next/router", () => ({ useRouter: () => mockRouter }));
jest.mock("@/contexts/AuthContext", () => ({ useAuth: () => mockAuth }));
jest.mock("@/hooks/useTenantClientIds", () => ({ useTenantClientIds: () => ({ clientIds: ["client-1"], loading: false }) }));
jest.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock("@/hooks/useFuzzySearch", () => ({ useFuzzyItems: (items: unknown) => items }));
jest.mock("@/components/navigation/ClientNav", () => ({ ClientNav: () => null }));
jest.mock("@/components/ProtectedRoute", () => ({ ProtectedRoute: ({ children }: any) => children }));
jest.mock("@/components/ChatBot", () => ({ ChatBot: () => null }));
jest.mock("@/components/client-portal/ReceiptDialog", () => ({ ReceiptDialog: () => null }));
jest.mock("@/components/billing/PaymentModal", () => ({ PaymentModal: () => null }));
jest.mock("@/components/billing/InvoiceDetailModal", () => ({ InvoiceDetailModal: ({ invoice, open }: any) => open
  ? <div data-testid="invoice-detail">Paid {invoice.paid_amount}; Balance {invoice.balance_due}</div> : null }));
jest.mock("@/components/portal/ui", () => ({
  PortalShell: ({ children }: any) => <div>{children}</div>,
  PortalCard: ({ children }: any) => <div>{children}</div>,
  PortalHeader: () => null, PortalCardHeader: () => null, PortalOverview: () => null, StatTile: () => null, PageWorkbench: () => null,
}));
jest.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: (table: string) => {
    const chain: any = {};
    for (const method of ["select", "eq", "in", "is", "not"]) chain[method] = () => chain;
    chain.order = async () => table === "invoices" && mockInvoiceError
      ? { data: null, error: new Error("Balance refresh unavailable") }
      : { data: table === "invoices" ? mockRows : [], error: null };
    return chain;
  },
  channel: () => { const chain: any = {}; chain.on = () => chain; chain.subscribe = () => chain; return chain; },
  removeChannel: jest.fn(),
} }));
beforeEach(() => {
  mockRows = [{ ...mockInvoice }]; mockInvoiceError = false;
  HTMLElement.prototype.scrollIntoView = jest.fn();
});

test("portal blocks a pending checkout and refreshes the open invoice after verified partial payment", async () => {
  let confirm: (value: Response) => void = () => {};
  global.fetch = jest.fn(() => new Promise<Response>((resolve) => { confirm = resolve; }));
  render(<StrictMode><ClientBillingPage /></StrictMode>);
  const pay = await screen.findByRole("button", { name: "Pay Now" });
  expect(pay).toBeDisabled();
  await waitFor(() => expect(screen.getByTestId("invoice-detail")).toHaveTextContent("Paid 0; Balance 1000"));
  mockRows = [{ ...mockInvoice, amount_paid: 5, balance_due: 995, status: "partially_paid" }];
  await act(async () => { confirm({ ok: true, json: async () => ({ ok: true, status: "succeeded" }) } as Response); });
  await waitFor(() => expect(screen.getByTestId("invoice-detail")).toHaveTextContent("Paid 5; Balance 995"));
  expect(screen.getByRole("button", { name: "Pay Now" })).toBeEnabled();
  expect(screen.getByText("Payment received. Your paid amount and remaining balance have been refreshed.")).toBeVisible();
  expect(screen.getByText("Partially paid", { exact: true })).toBeVisible();
});

test.each(["failed", "expired"])("portal %s return permits retry and keeps the unpaid balance", async (status) => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ ok: true, status }) } as Response));
  render(<ClientBillingPage />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Pay Now" })).toBeEnabled());
  expect(screen.getByTestId("invoice-detail")).toHaveTextContent("Paid 0; Balance 1000");
  expect(screen.getByText(status === "failed"
    ? "This checkout did not complete. You can retry from the invoice."
    : "This checkout expired. You can start a new payment from the invoice.")).toBeVisible();
});

test("fully settled portal invoice has a receipt and no payment action", async () => {
  mockRows = [{ ...mockInvoice, amount_paid: 1000, balance_due: 0, status: "paid" }];
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ ok: true, status: "succeeded" }) } as Response));
  render(<ClientBillingPage />);
  await waitFor(() => expect(screen.getByTestId("invoice-detail")).toHaveTextContent("Paid 1000; Balance 0"));
  expect(screen.queryByRole("button", { name: "Pay Now" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Receipt" })).toBeEnabled();
});

test("client billing preserves invoice currency over the company default", async () => {
  mockRows = [{ ...mockInvoice, currency: "USD" }];
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ ok: true, status: "failed" }) } as Response));
  render(<ClientBillingPage />);
  expect(await screen.findByText("$1,000", { exact: true })).toBeVisible();
});

test("portal retains the checkout block if the provider confirms but balance refresh fails", async () => {
  let confirm: (value: Response) => void = () => {};
  global.fetch = jest.fn(() => new Promise<Response>((resolve) => { confirm = resolve; }));
  const errorLog = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    render(<ClientBillingPage />);
    await screen.findByTestId("invoice-detail");
    mockInvoiceError = true;
    await act(async () => { confirm({ ok: true, json: async () => ({ ok: true, status: "succeeded" }) } as Response); });
    await waitFor(() => expect(screen.getByText(/Payment was confirmed. Refresh this page/)).toBeVisible());
    expect(screen.getByRole("button", { name: "Pay Now" })).toBeDisabled();
  } finally { errorLog.mockRestore(); }
});
