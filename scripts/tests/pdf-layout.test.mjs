// npm run test:pdf-layout
// Optional: PDF_LAYOUT_OUTPUT=tmp/pdfs/layout-after saves the actual PDFs for visual QA.
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import React from "react";
import { pdf } from "@react-pdf/renderer";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { InvoiceDocument } from "../../src/services/pdf/InvoiceDocument.tsx";
import { QuoteDocument } from "../../src/services/pdf/QuoteDocument.tsx";
import { ReceiptDocument } from "../../src/services/pdf/ReceiptDocument.tsx";

const company = {
  id: "layout-fixture", slug: "harbour-catering", company_name: "Harbour Catering",
  legal_name: "Harbour Catering (Pty) Ltd", email: "accounts@harbour.example",
  phone: "+27 21 555 0100", address_line1: "12 Harbour Road", city: "Cape Town",
  country: "South Africa", primary_color: "#0f766e", vat_registered: true,
  vat_number: "4123456789", registration_number: "2026/123456/07", vat_rate: 15,
};
const eft = {
  company_name: company.legal_name, bank_name: "Example Bank", account_holder: company.legal_name,
  account_number: "1234567890", branch_code: "250655", account_type: "Business Cheque",
  reference: "LAYOUT-0042", instructions: "Email proof of payment to accounts@harbour.example.",
};
const payment = {
  online_provider: "payfast", payment_url: "https://catering.example/pay/i/layout-0042",
  reference: "LAYOUT-0042", eft,
};
const terms = "TERMS-START: A 50% payment confirms the booking. The balance is due before the event.";
const items = (count, long = false) => Array.from({ length: count }, (_, i) => ({
  name: `Dish-${String(i + 1).padStart(3, "0")}`,
  category: "main", quantity: 40, unit_price: 125, total: 5000,
  description: long ? "Fresh seasonal ingredients, prepared for the event and served with vegetables. ".repeat(12) : undefined,
}));
const invoiceData = (count, overrides = {}) => ({
  invoice_number: "INV-LAYOUT-0042", invoice_date: "2026-10-06", due_date: "2026-10-13",
  status: "sent", client: { name: "Ayesha Khan", email: "ayesha@example.com", address: "14 Market Street, Cape Town" },
  line_items: items(count), subtotal: 5000, tax_amount: 750, total_amount: 5750,
  amount_paid: 0, balance_due: 5750, currency: "ZAR", payment_instructions: payment,
  payment_terms: terms, company, ...overrides,
});
const quoteData = (count, overrides = {}) => ({
  quote_number: "QUO-LAYOUT-0042", client_name: "Ayesha Khan", client_email: "ayesha@example.com",
  menu_items: items(count), subtotal: 5000, tax_amount: 750, total: 5750,
  payment_instructions: payment, payment_terms: terms, company, ...overrides,
});

test("quote: both service sittings are present in the PDF", async () => {
  const pages = await render("quote-two-sittings", QuoteDocument, quoteData(2, {
    event_date: "2099-11-06", event_time: "12:00", guest_count: 100,
    service_sittings: [
      { sequence_number: 1, guest_count: 50, service_time: "12:00" },
      { sequence_number: 2, guest_count: 50, service_time: "18:00" },
    ],
  }));
  assertPageSafety(pages);
  const text = pages.map(page => page.text).join(" ");
  assert.match(text, /Sitting 1: 50 guests/);
  assert.match(text, /Sitting 2: 50 guests/);
});
const receiptData = (count, payments = 1, overrides = {}) => ({
  ...invoiceData(count), paid_at: "2026-10-06T14:35:00Z", amount_paid: 5750, balance_due: 0,
  payment_records: Array.from({ length: payments }, (_, i) => ({
    amount: 5750 / payments, currency: "ZAR", payment_method: "eft", paid_at: "2026-10-06T14:35:00Z",
    transaction_id: `BANK-TXN-${String(i + 1).padStart(3, "0")}`, payment_reference: "LAYOUT-0042",
  })), eft_details: eft, ...overrides,
});

async function render(name, Component, data) {
  let layout;
  const instance = pdf(React.cloneElement(Component({ data }), { onRender: (result) => { layout = result._INTERNAL__LAYOUT__DATA_; } }));
  const stream = await instance.toBuffer();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  if (process.env.PDF_LAYOUT_OUTPUT) {
    await mkdir(process.env.PDF_LAYOUT_OUTPUT, { recursive: true });
    await writeFile(join(process.env.PDF_LAYOUT_OUTPUT, `${name}.pdf`), buffer);
    if (process.env.PDF_LAYOUT_DEBUG) {
      const simplify = (node) => ({ type: node.type, value: node.value, box: node.box, children: node.children?.map(simplify) });
      await writeFile(join(process.env.PDF_LAYOUT_OUTPUT, `${name}.json`), JSON.stringify(simplify(layout)));
    }
  }
  const document = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
  const pages = [];
  try {
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      pages.push({ width: viewport.width, height: viewport.height, items: content.items.filter((item) => item.str?.trim()), text: content.items.map((item) => item.str || "").join(" ").replace(/\s+/g, " ").replace(/\s+:/g, ":") });
    }
  } finally {
    await document.destroy();
  }
  return pages;
}

function assertPageSafety(pages) {
  pages.forEach((page, index) => {
    const footerIndex = page.items.findIndex((item) => item.str.startsWith(company.company_name) && item.transform[5] < 62);
    assert.ok(footerIndex >= 0, `Missing footer on page ${index + 1}`);
    const body = page.items.slice(0, footerIndex);
    assert.ok(body.length > 0, `Page ${index + 1} has only a footer`);
    for (const item of body) assert.ok(item.transform[5] >= 62, `Body overlaps footer: ${item.str}`);
    for (const item of page.items) {
      assert.ok(item.transform[5] > 15, `Text below the page: ${item.str}`);
      assert.ok(item.transform[5] < page.height - 30, `Text above the top margin: ${item.str}`);
      assert.ok(item.transform[4] >= 35, `Text outside left margin: ${item.str}`);
      assert.ok(item.transform[4] + item.width <= page.width - 34, `Text outside right margin: ${item.str}`);
    }
    assert.match(page.text, new RegExp(`Page ${index + 1} of ${pages.length}`));
  });
}
function assertItems(pages, expected) {
  const text = pages.map((page) => page.text).join(" ");
  for (const item of expected) assert.ok(text.includes(item.name), `Missing ${item.name}`);
}

for (const [kind, Component, dataFor] of [["invoice", InvoiceDocument, invoiceData], ["quote", QuoteDocument, quoteData], ["receipt", ReceiptDocument, receiptData]]) {
  test(`${kind}: company billing name and attention contact both fit in the document`, async () => {
    const data = dataFor(2);
    if (kind === "quote") { data.client_name = "Sheri Lee Pan"; data.client_company_name = "Example Events (Pty) Ltd"; }
    else data.client = { ...data.client, name: "Sheri Lee Pan", company_name: "Example Events (Pty) Ltd" };
    const pages = await render(`${kind}-company`, Component, data);
    assertPageSafety(pages);
    const text = pages.map((page) => page.text).join(" ");
    assert.match(text, /Example Events \(Pty\) Ltd/);
    assert.match(text, /Attention: Sheri Lee Pan/);
    assert.ok(text.indexOf("Example Events (Pty) Ltd") < text.indexOf("Attention: Sheri Lee Pan"));
  });
  test(`${kind}: long company names wrap within the party column`, async () => {
    const data = dataFor(2);
    const organisation = "Example International Conferences and Catering Events Management Company (Pty) Ltd";
    if (kind === "quote") data.client_company_name = organisation;
    else data.client = { ...data.client, company_name: organisation };
    const pages = await render(`${kind}-long-company`, Component, data);
    assertPageSafety(pages);
    assert.ok(pages.map((page) => page.text).join(" ").includes(organisation));
  });
}

for (const [kind, Component, dataFor] of [["invoice", InvoiceDocument, invoiceData], ["quote", QuoteDocument, quoteData], ["receipt", ReceiptDocument, receiptData]]) {
  for (const count of [...Array.from({ length: 17 }, (_, i) => i), 30, 80]) {
    test(`${kind}: ${count} items fit within pages and retain every line`, async () => {
      const data = dataFor(count);
      const pages = await render(`${kind}-${count}`, Component, data);
      assertPageSafety(pages);
      assertItems(pages, data.line_items || data.menu_items);
      if (kind === "receipt") {
        const text = pages.map((page) => page.text).join("").replace(/\s/g, "");
        assert.ok(text.includes("PAYMENTRECORD"));
        assert.ok(text.indexOf("Paidinfull") < text.indexOf("PAYMENTRECORD"), "Receipt payment details should follow the totals");
        assert.ok(text.indexOf("Thankyou") > text.indexOf("PAYMENTRECORD"), "Receipt thank-you should follow the payment details");
        assert.equal((text.match(/Thankyou/g) || []).length, 1, "Receipt thank-you should appear once");
        assert.ok(text.includes("WeappreciateyourbusinesswithHarbourCatering."));
        assert.ok(pages.at(-1).text.replace(/\s/g, "").includes("PAYMENTRECORD"), "The closing thank-you must share a page with the payment record");
      }
      for (const row of data.line_items || data.menu_items) {
        const page = pages.find((page) => page.items.some((item) => item.str === row.name));
        const name = page?.items.find((item) => item.str === row.name);
        assert.ok(name && page.items.some((item) => item.transform[4] > 400 && Math.abs(item.transform[5] - name.transform[5]) < 2), `Price detached from ${row.name}`);
        const belowName = page.items.filter((item) => item.transform[4] < 300 && name.transform[5] - item.transform[5] > 0 && name.transform[5] - item.transform[5] < 20).map((item) => item.str).join("").replace(/\s/g, "");
        assert.ok(belowName.includes("40x"), `Quantity detached from ${row.name}`);
      }
      if (count <= 3) assert.equal(pages.length, 1, "A compact order should not create an unnecessary extra page");
      if (count === 3 && kind !== "receipt") {
        const online = pages[0].items.find((item) => item.str === "Online payment");
        const eftMethod = pages[0].items.find((item) => item.str === "Bank transfer (EFT)");
        assert.ok(online && eftMethod && eftMethod.transform[4] > online.transform[4] + 150 && Math.abs(online.transform[5] - eftMethod.transform[5]) < 1, "Payment methods should align side by side");
      }
    });
  }
}

test("invoice: payment instructions precede long payment terms", async () => {
  const pages = await render("invoice-long-terms", InvoiceDocument, invoiceData(3, { payment_terms: `${terms} ${"Terms for this event apply. ".repeat(240)}` }));
  assertPageSafety(pages);
  const text = pages.map((page) => page.text).join(" ");
  const compact = text.replace(/\s/g, "");
  assert.ok(compact.includes("HOWTOPAY"));
  assert.ok(compact.indexOf("HOWTOPAY") < compact.indexOf("TERMS-START"));
  assert.ok(pages[0].text.includes("Account number: 1234567890"), "Bank details should remain on the compact order page");
});

test("receipt: many payment records can span pages without losing transactions", async () => {
  const data = receiptData(3, 24);
  const pages = await render("receipt-many-payments", ReceiptDocument, data);
  assertPageSafety(pages);
  const text = pages.map((page) => page.text).join(" ");
  for (const payment of data.payment_records) assert.ok(text.includes(payment.transaction_id));
});

for (const [kind, Component, dataFor] of [["invoice", InvoiceDocument, invoiceData], ["quote", QuoteDocument, quoteData], ["receipt", ReceiptDocument, receiptData]]) {
  test(`${kind}: descriptions longer than a page flow without clipping`, async () => {
    const rows = items(2, true).map((item) => ({ ...item, description: `${item.description.repeat(8)} DESCRIPTION-END-${item.name}` }));
    const data = dataFor(2, ...(kind === "receipt" ? [1, { line_items: rows }] : [{ [kind === "quote" ? "menu_items" : "line_items"]: rows }]));
    const pages = await render(`${kind}-long-descriptions`, Component, data);
    assertPageSafety(pages);
    const text = pages.map((page) => page.text).join(" ");
    for (const row of rows) assert.ok(text.includes(`DESCRIPTION-END-${row.name}`));
  });
}

test("quote: equipment and all optional charges paginate", async () => {
  const equipment = Array.from({ length: 25 }, (_, i) => ({ name: `Equipment-${String(i + 1).padStart(3, "0")}`, quantity: 40, unit_price: 5, total: 200 }));
  const data = quoteData(12, {
    equipment_items: equipment, event_date: "2027-01-15", event_time: "18:30", guest_count: 40,
    venue_address: "Cape Town Waterfront, Conference Hall, Main Entrance",
    delivery_fee: 250, collection_fee: 200, waiter_total_fee: 1000, waiter_count: 2, waiter_duration_hours: 4,
    discount_amount: 100, initial_payment_amount: 2875, terms_and_conditions: terms.repeat(30), notes: "FINAL-NOTE: Please confirm dietary requirements.",
  });
  const pages = await render("quote-all-options", QuoteDocument, data);
  assertPageSafety(pages);
  assertItems(pages, [...data.menu_items, ...equipment]);
  assert.match(pages.map((page) => page.text).join(" "), /FINAL-NOTE/);
});

for (const [kind, Component, dataFor] of [["invoice", InvoiceDocument, invoiceData], ["quote", QuoteDocument, quoteData]]) {
  for (const [route, instructions] of [["eft", { eft }], ["online", { ...payment, eft: null }], ["none", null]]) {
    test(`${kind}: ${route} payment instructions`, async () => {
      const pages = await render(`${kind}-${route}`, Component, dataFor(3, { payment_instructions: instructions }));
      assertPageSafety(pages);
      const text = pages.map((page) => page.text).join(" ");
      assert.equal(text.includes("Account number: 1234567890"), route === "eft");
      assert.equal(text.includes("PayFast"), route === "online");
    });
  }
  test(`${kind}: long beneficiary and notes can flow`, async () => {
    const data = dataFor(4, {
      payment_instructions: { ...payment, eft: { ...eft, account_holder: "Registered catering company with multiple regional offices ".repeat(80), instructions: "Payment instructions and proof of payment information. ".repeat(100) + "BANK-END" } },
      notes: "Catering service details for this event. ".repeat(300) + "NOTES-END",
    });
    const pages = await render(`${kind}-long-bank-notes`, Component, data);
    assertPageSafety(pages);
    const text = pages.map((page) => page.text).join(" ");
    assert.ok(text.includes("BANK-END"));
    assert.ok(text.includes("NOTES-END"));
  });
}

test("invoice: paid invoices retain all payment details without requesting another payment", async () => {
  const pages = await render("invoice-paid", InvoiceDocument, invoiceData(2, { status: "paid", amount_paid: 5750, balance_due: 0 }));
  assertPageSafety(pages);
  assert.ok(!pages.map((page) => page.text).join("").replace(/\s/g, "").includes("HOWTOPAY"));
  const text = pages.map((page) => page.text).join(" ");
  assert.ok(text.includes("Account number: 1234567890"));
  assert.ok(text.includes("Paid in full. Payment details are shown for your records."));
});

test("invoice: missing item names have a fallback", async () => {
  const pages = await render("invoice-unnamed-item", InvoiceDocument, invoiceData(1, { line_items: [{ quantity: 2, unit_price: 20, total: 40 }] }));
  assertPageSafety(pages);
  assert.match(pages.map((page) => page.text).join(" "), /Item 1/);
});

test("invoice: event, deposit plan, discount, long names and large values", async () => {
  const data = invoiceData(5, {
    invoice_date: "2099-10-01", due_date: "2099-10-13", event_date: "2100-01-15", event_time: "18:30", order_number: "ORD-LAYOUT-0042", guest_count: 400,
    event_name: "Annual celebration and appreciation event for the regional catering association",
    venue_address: "The conference centre on the waterfront, Hall B, second floor, Cape Town, South Africa",
    client: { name: "Ayesha Khan and the regional catering association event planning committee", address: "14 Market Street, Waterfront, Cape Town, South Africa", tax_number: "4123456789" },
    first_payment_amount: 5000000, total_amount: 10000000, subtotal: 8695652.17, tax_amount: 1304347.83,
    discount_amount: 100, balance_due: 10000000,
    line_items: [{ name: "A large catering package including all requested service requirements", quantity: 400, unit_price: 25000, total: 10000000 }],
  });
  const pages = await render("invoice-all-options", InvoiceDocument, data);
  assertPageSafety(pages);
  assertItems(pages, data.line_items);
  assert.ok(pages.map((page) => page.text).join("").replace(/\s/g, "").includes("PAYMENTPLAN"));
});
