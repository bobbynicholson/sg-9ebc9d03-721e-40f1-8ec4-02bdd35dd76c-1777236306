import { mkdir, writeFile } from "node:fs/promises";

// The local source loader handles the TypeScript module this resolves to at
// runtime. Keeping this dynamic also prevents the repository type-check from
// treating this temporary QA runner as application source.
const { renderInvoicePdf } = await import(
  new URL("../../src/services/pdf/renderPdf.ts", import.meta.url).href,
);

const output = "tmp/pdfs/invoice-layout-qa.pdf";

const pdf = await renderInvoicePdf({
  invoice_number: "INV-005639",
  invoice_date: "2026-10-08",
  due_date: "2026-10-10",
  status: "sent",
  order_number: "ORD-918908",
  event_name: "Harvesters Ministry lunch",
  event_date: "2026-12-11",
  event_time: "18:30:00",
  client: {
    name: "Angeline Daniels",
    email: "angeline.d@harvestersministries.com",
    phone: "081 321 3208",
    address: "13 Somerset Road, Longdown Estate, Somerset West",
  },
  line_items: [
    { name: "Lamb Spit Full Portion - main", quantity: 67, unit_price: 95, total: 6365 },
    { name: "Roasted Chicken Pieces - main", quantity: 67, unit_price: 40, total: 2680 },
    { name: "Kiddies Meals - other", quantity: 4, unit_price: 75, total: 300 },
  ],
  subtotal: 7969.57,
  tax_amount: 1195.43,
  total_amount: 9165,
  amount_paid: 0,
  balance_due: 9165,
  first_payment_amount: 4582.5,
  currency: "ZAR",
  payment_terms: "A 50% payment confirms the booking. The remaining balance is due before the event.",
  payment_instructions: {
    online_provider: "payfast",
    payment_url: "https://pay.example.test/invoice/INV-005639",
    reference: "INV-005639",
  },
  notes: "Please advise us of dietary requirements before the event.",
  company: {
    id: "spit-braai-delivery",
    company_name: "Spit Braai Delivery",
    legal_name: "Spit Braai Delivery",
    email: "hello@spitbraaidelivery.co.za",
    phone: "0826411373",
    address_line1: "64 Visagie Street",
    city: "Monte Vista",
    country: "South Africa",
    primary_color: "#ff2d10",
    time_format: "both",
    vat_registered: true,
    vat_number: "4250305390",
    vat_rate: 15,
    registration_number: "2022/427271/07",
  },
});

await mkdir("tmp/pdfs", { recursive: true });
await writeFile(output, pdf);
console.log(output);
