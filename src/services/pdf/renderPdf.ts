/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck
/**
 * renderPdf -- server-side helpers that turn a typed data shape into
 * a PDF Buffer.
 *
 *   renderQuotePdf(data)   -> Buffer       quote share PDF
 *   renderInvoicePdf(data) -> Buffer       SARS-aware invoice PDF
 *
 * Server-only -- @react-pdf/renderer's pdf().toBuffer() spins up a
 * Node stream pipeline and pulls in canvas / pngjs. We hide the
 * require behind eval so Webpack / Next.js's client bundler doesn't
 * try to ship it to the browser. Mirrors the same trick emailService
 * uses for nodemailer.
 *
 * Caller hydrates QuotePdfData / InvoicePdfData by querying the
 * existing tables (quotes + companies for quotes; invoices + clients
 * + orders + companies for invoices). Keeping the data shape
 * decoupled from the DB row shape means the documents stay testable
 * without spinning up Supabase.
 */

import React from "react";
import { QuoteDocument, type QuotePdfData } from "./QuoteDocument";
import { InvoiceDocument, type InvoicePdfData } from "./InvoiceDocument";

export type { QuotePdfData, InvoicePdfData };

/**
 * Hide the require behind eval so the bundler doesn't see it. Same
 * pattern as emailService -> nodemailer. Returns the @react-pdf
 * `pdf` factory.
 */
function loadReactPdf(): any {
  if (typeof window !== "undefined") {
    throw new Error(
      "renderPdf can only run server-side -- @react-pdf/renderer's " +
        "Node stream pipeline isn't available in the browser.",
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const getRequire = () => eval("require");
  return getRequire()("@react-pdf/renderer");
}

/**
 * Drain @react-pdf's NodeJS Readable stream into a Buffer. The
 * library's instance.toBuffer() returns a stream in current versions;
 * collecting it ourselves keeps us version-tolerant.
 */
async function streamToBuffer(stream: any): Promise<Buffer> {
  // Some @react-pdf versions return a Buffer directly; others a Readable.
  if (Buffer.isBuffer?.(stream)) {
    return stream as Buffer;
  }
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c: any) => {
      chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    });
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

/**
 * Render a quote PDF. Caller hydrates QuotePdfData from the quote +
 * company rows; we don't touch the DB here on purpose so the
 * renderer stays a pure function of its input.
 */
export async function renderQuotePdf(data: QuotePdfData): Promise<Buffer> {
  const reactPdf = loadReactPdf();
  const instance = reactPdf.pdf(React.createElement(QuoteDocument, { data }));
  const result = await instance.toBuffer();
  return await streamToBuffer(result);
}

/**
 * Render an invoice PDF. Caller hydrates InvoicePdfData from the
 * invoices + clients + orders + companies rows.
 */
export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const reactPdf = loadReactPdf();
  const instance = reactPdf.pdf(React.createElement(InvoiceDocument, { data }));
  const result = await instance.toBuffer();
  return await streamToBuffer(result);
}

/**
 * Sanitise a string for use in a filename. Strips characters that
 * cause grief on Windows / Mac / Linux mail clients and keeps the
 * thing readable. Used by callers building "Quote-{quote_number}.pdf".
 */
export function sanitiseFilename(raw: string): string {
  return String(raw || "")
    .replace(/[\\/:*?"<>|\r\n\t]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80) || "document";
}
