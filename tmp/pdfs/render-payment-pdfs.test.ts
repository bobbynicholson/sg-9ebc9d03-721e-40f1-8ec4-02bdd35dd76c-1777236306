/** @jest-environment node */

import { mkdir, writeFile } from "node:fs/promises";
import { renderInvoicePdf, renderReceiptPdf } from "@/services/pdf";

describe("payment PDF visual fixtures", () => {
  it("renders online-invoice and EFT-receipt audit details", async () => {
    const company = {
      id: "company-1",
      slug: "harbour-catering",
      company_name: "Harbour Catering",
      legal_name: "Harbour Catering (Pty) Ltd",
      email: "accounts@harbour.example",
      phone: "+27 21 555 0100",
      address_line1: "12 Harbour Road",
      city: "Cape Town",
      country: "South Africa",
      primary_color: "#0f766e",
      registration_number: "2026/123456/07",
      vat_registered: true,
      vat_number: "4123456789",
    };

    const invoice = await renderInvoicePdf({
      invoice_number: "INV-2026-0042",
      invoice_date: "2026-10-06",
      due_date: "2026-10-13",
      status: "sent",
      client: { name: "Ayesha Khan", email: "ayesha@example.com" },
      order_number: "ORD-0042",
      event_name: "Ayesha's celebration",
      event_date: "2026-11-02",
      line_items: [{ name: "Canape service", quantity: 40, unit_price: 125, total: 5000 }],
      subtotal: 5000,
      tax_amount: 750,
      total_amount: 5750,
      amount_paid: 0,
      balance_due: 5750,
      currency: "ZAR",
      payment_terms: "Payment is due before the event.",
      payment_instructions: {
        online_provider: "payfast",
        payment_url: "https://catering.example/pay/i/11111111-1111-1111-1111-111111111111",
        reference: "INV-2026-0042",
      },
      company,
    });

    const receipt = await renderReceiptPdf({
      invoice_number: "INV-2026-0042",
      invoice_date: "2026-10-06",
      paid_at: "2026-10-06T14:35:00.000Z",
      client: { name: "Ayesha Khan", email: "ayesha@example.com" },
      order_number: "ORD-0042",
      line_items: [{ name: "Canape service", quantity: 40, unit_price: 125, total: 5000 }],
      subtotal: 5000,
      tax_amount: 750,
      total_amount: 5750,
      amount_paid: 5750,
      currency: "ZAR",
      payment_records: [{
        amount: 5750,
        currency: "ZAR",
        payment_method: "eft",
        transaction_id: "EFT-20261006-0042",
        payment_reference: "INV-2026-0042",
        paid_at: "2026-10-06T14:35:00.000Z",
      }],
      eft_details: {
        company_name: "Harbour Catering (Pty) Ltd",
        bank_name: "Example Bank",
        account_holder: "Harbour Catering (Pty) Ltd",
        account_number: "1234567890",
        branch_code: "250655",
        account_type: "Business Cheque",
        reference: "INV-2026-0042",
        instructions: "Email proof of payment to accounts@harbour.example.",
      },
      company,
    });

    await mkdir("tmp/pdfs", { recursive: true });
    await writeFile("tmp/pdfs/payment-online-invoice.pdf", invoice);
    await writeFile("tmp/pdfs/payment-eft-receipt.pdf", receipt);

    expect(invoice.subarray(0, 4).toString()).toBe("%PDF");
    expect(receipt.subarray(0, 4).toString()).toBe("%PDF");
  }, 30000);
});
