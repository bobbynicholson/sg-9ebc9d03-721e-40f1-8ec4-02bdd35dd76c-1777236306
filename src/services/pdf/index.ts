/**
 * PDF rendering surface. Server-only: callers must run inside a Next
 * API route, getServerSideProps, or another Node context.
 */

export { renderQuotePdf, renderInvoicePdf, sanitiseFilename } from "./renderPdf";
export { QuoteDocument } from "./QuoteDocument";
export { InvoiceDocument } from "./InvoiceDocument";
export type { QuotePdfData, QuotePdfMenuItem, QuotePdfEquipmentItem } from "./QuoteDocument";
export type { InvoicePdfData, InvoicePdfLineItem } from "./InvoiceDocument";
