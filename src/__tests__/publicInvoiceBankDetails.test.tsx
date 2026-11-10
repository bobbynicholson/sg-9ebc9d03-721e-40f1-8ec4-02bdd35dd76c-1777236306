import { render, screen } from "@testing-library/react";
import InvoicePaymentPage from "@/pages/pay/i/[token]";

jest.mock("next/router", () => ({
  useRouter: () => ({ query: { token: "invoice-token" }, isReady: true }),
}));
jest.mock("next/head", () => ({ __esModule: true, default: () => null }));
jest.mock("@/lib/supabase/service", () => ({ getServiceSupabase: jest.fn() }));
jest.mock("@/lib/branding/applyBranding", () => ({
  applyBrandingToDOM: jest.fn(),
  loadBrandFonts: jest.fn(),
}));

const invoice = {
  id: "invoice-id",
  public_token: "invoice-token",
  invoice_number: "INV-100",
  invoice_date: "2026-11-01",
  due_date: "2026-11-30",
  total_amount: 1250,
  amount_paid: 0,
  balance_due: 1250,
  status: "sent",
  invoice_data: { clientName: "Test Client", items: [] },
  payment_currency: "ZAR",
  payment_options: {
    provider: "payfast",
    online_available: true,
    unavailable_reason: null,
    eft_available: false,
  },
  payments: [],
  eft_claims: [],
  companies: {
    id: "company-id",
    company_name: "Test Caterer",
    legal_name: "Test Caterer (Pty) Ltd",
    email: "accounts@example.test",
    phone_number: null,
    logo_url: null,
    vat_registered: false,
    vat_number: null,
    vat_rate: null,
    registration_number: null,
    deposit_percent: 50,
    primary_color: null,
    secondary_color: null,
    accent_color: null,
    bank_name: "Fixture Bank",
    bank_account_holder: "Test Caterer (Pty) Ltd",
    bank_account_number: "1234567890",
    bank_branch_code: "250655",
    bank_account_type: "Business Cheque",
    eft_instructions: "Use the invoice number as reference.",
  },
};
let invoiceToLoad = invoice;

describe("public invoice bank details", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invoiceToLoad = invoice;
    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/get")) {
        return { ok: true, json: async () => ({ invoice: invoiceToLoad }) } as Response;
      }
      if (url.includes("credit-balance")) {
        return { ok: true, json: async () => ({ ok: false }) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    }) as jest.Mock;
  });

  it("shows EFT details beside active PayFast checkout without enabling EFT proof submission", async () => {
    render(<InvoicePaymentPage />);

    expect(await screen.findByText("Bank transfer details (EFT)")).toBeVisible();
    expect(screen.getByText("Fixture Bank")).toBeVisible();
    expect(screen.getByText("1234567890")).toBeVisible();
    expect(screen.getByText((_, element) => element?.textContent === "Use INV-100 as your payment reference.")).toBeVisible();
    expect(screen.getByText(/Pay online with PayFast, or use the bank transfer details below/)).toBeVisible();
    expect(screen.queryByText("Send payment proof for review")).toBeNull();
  });

  it("explains how to get bank details if they have not been configured", async () => {
    invoiceToLoad = {
      ...invoice,
      companies: {
        ...invoice.companies,
        bank_name: null,
        bank_account_number: null,
      },
    };
    render(<InvoicePaymentPage />);

    expect(await screen.findByText("Bank transfer details (EFT)")).toBeVisible();
    expect(screen.getByText(/Bank transfer details have not been added to this invoice/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Email Test Caterer for bank details" })).toHaveAttribute("href", expect.stringContaining("accounts@example.test"));
  });

  it("keeps bank details visible on a paid invoice and says no further payment is due", async () => {
    invoiceToLoad = {
      ...invoice,
      amount_paid: 1250,
      balance_due: 0,
      status: "paid",
    };
    render(<InvoicePaymentPage />);

    expect(await screen.findByText("Bank transfer details (EFT)")).toBeVisible();
    expect(screen.getByText("1234567890")).toBeVisible();
    expect(screen.getByText(/This invoice is paid in full. These bank details are shown for your records; no further payment is due./)).toBeVisible();
  });

  it("keeps EFT proof submission available when online checkout is unavailable", async () => {
    invoiceToLoad = {
      ...invoice,
      payment_options: {
        provider: null,
        online_available: false,
        unavailable_reason: "not_configured",
        eft_available: true,
      },
    };
    render(<InvoicePaymentPage />);

    expect(await screen.findByText("Bank transfer details (EFT)")).toBeVisible();
    expect(screen.getByRole("button", { name: "Send payment proof for review" })).toBeVisible();
  });
});
