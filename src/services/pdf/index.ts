/**
 * PDF rendering surface. Server-only: callers must run inside a Next
 * API route, getServerSideProps, or another Node context.
 */

export { renderQuotePdf, renderInvoicePdf, renderReceiptPdf, sanitiseFilename } from "./renderPdf";
export type {
  QuotePdfRenderOptions,
  InvoicePdfRenderOptions,
  ReceiptPdfRenderOptions,
} from "./renderPdf";
export { QuoteDocument } from "./QuoteDocument";
export { InvoiceDocument } from "./InvoiceDocument";
export { ReceiptDocument } from "./ReceiptDocument";
export type { QuotePdfData, QuotePdfMenuItem, QuotePdfEquipmentItem } from "./QuoteDocument";
export type { InvoicePdfData, InvoicePdfLineItem } from "./InvoiceDocument";
export type { ReceiptPdfData, ReceiptPdfLineItem } from "./ReceiptDocument";
