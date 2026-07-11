/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any */
// @ts-nocheck
/**
 * ReceiptDocument - single-page A4 PDF the client downloads from the
 * portal to acknowledge a paid invoice (CLI-I / CLI-30).
 *
 * Visually a sibling of InvoiceDocument but trimmed: no balance-due
 * frame, no payment-terms block, no "sent at" pill. The receipt is a
 * record of payment so it has to surface paid_at + payment_method
 * front-and-centre, and end with a "Thank you" footer.
 *
 * VAT handling mirrors InvoiceDocument because SARS requires the VAT
 * line + VAT registration number on a tax receipt the same way it
 * requires them on the original invoice.
 */

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Link,
} from "@react-pdf/renderer";
import { buildCompanyTermsUrl } from "@/lib/companyLegal";

// --- Types -----------------------------------------------------------------

export interface ReceiptPdfLineItem {
  name: string;
  description?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  total?: number | null;
}

export interface ReceiptPdfData {
  invoice_number: string;
  invoice_date: string;
  paid_at: string;
  payment_method?: string | null;
  payment_reference?: string | null;

  client: {
    name: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
  };

  order_number?: string | null;
  event_name?: string | null;
  event_date?: string | null;

  line_items: ReceiptPdfLineItem[];

  subtotal?: number | null;
  tax_amount?: number | null;
  discount_amount?: number | null;
  total_amount: number;
  amount_paid?: number | null;
  currency?: string | null;

  company: {
    /** id + slug feed the public /terms/[company] link on the footer -
     *  slug preferred (pretty URL), id is the stable fallback. */
    id?: string | null;
    slug?: string | null;
    company_name?: string | null;
    legal_name?: string | null;
    logo_url?: string | null;
    email?: string | null;
    phone?: string | null;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    state_province?: string | null;
    postal_code?: string | null;
    country?: string | null;
    primary_color?: string | null;
    vat_registered?: boolean | null;
    vat_number?: string | null;
    vat_rate?: number | null;
    registration_number?: string | null;
    tax_number?: string | null;
  };
}

// --- Helpers ---------------------------------------------------------------

const CURRENCY_LOCALE: Record<string, string> = {
  ZAR: "en-ZA",
  USD: "en-US",
  GBP: "en-GB",
  EUR: "en-IE",
  AUD: "en-AU",
  NZD: "en-NZ",
  NGN: "en-NG",
  KES: "en-KE",
};
const CURRENCY_FALLBACK_SYMBOL: Record<string, string> = {
  ZAR: "R", USD: "$", GBP: "GBP ", EUR: "EUR ", AUD: "A$", NZD: "NZ$", NGN: "NGN ", KES: "KSh ",
};
const fmtMoney = (n: number | null | undefined, currency?: string | null): string => {
  const v = Number(n || 0);
  const code = (currency || "ZAR").toUpperCase();
  const locale = CURRENCY_LOCALE[code] || "en-ZA";
  try {
    // Exact cents + dot-decimal like formatZAR (Callum 2026-07-08), no rounding.
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).formatToParts(v).map((p) => {
      if (p.type === "group") return " ";
      if (p.type === "decimal") return ".";
      return p.value.replace(/\s/g, " ");
    }).join("");
  } catch {
    return `${CURRENCY_FALLBACK_SYMBOL[code] || ""}${v.toFixed(2)}`;
  }
};

const fmtDate = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  try {
    return new Date(raw).toLocaleDateString("en-ZA", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return null;
  }
};

const safePrimary = (hex: string | null | undefined): string => {
  if (!hex) return "#d97706";
  const t = String(hex).trim();
  if (/^#?[0-9a-f]{3}$/i.test(t) || /^#?[0-9a-f]{6}$/i.test(t)) {
    return t.startsWith("#") ? t : `#${t}`;
  }
  return "#d97706";
};

const buildAddress = (c: ReceiptPdfData["company"]): string => {
  if (!c) return "";
  return [c.address_line1, c.address_line2, c.city, c.state_province, c.postal_code, c.country]
    .filter(Boolean)
    .join(", ");
};

const joinFooterParts = (parts: Array<string | null | undefined>): string =>
  parts
    .map((part) => (part == null ? "" : String(part).trim()))
    .filter(Boolean)
    .join(" | ");

/** Human-readable payment-method label. Falls back to the raw value
 *  when we don't have a translation - the operator-entered string is
 *  always better than an empty cell on the receipt. */
const methodLabel = (raw: string | null | undefined): string => {
  if (!raw) return "Recorded";
  const map: Record<string, string> = {
    bank_transfer: "Bank transfer",
    eft: "EFT",
    cash: "Cash",
    card: "Card",
    cheque: "Cheque",
    manual: "Manually recorded",
    stripe: "Card (Stripe)",
    payfast: "Card (PayFast)",
  };
  return map[raw] || String(raw)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

// --- Styles ----------------------------------------------------------------

const buildStyles = (primary: string) =>
  StyleSheet.create({
    page: {
      paddingTop: 36,
      paddingBottom: 62,
      paddingHorizontal: 36,
      fontSize: 10,
      fontFamily: "Helvetica",
      color: "#1c1917",
      backgroundColor: "#ffffff",
    },
    headerBand: {
      borderWidth: 1,
      borderColor: primary,
      borderRadius: 8,
      padding: 16,
      marginBottom: 12,
      backgroundColor: `${primary}1A`,
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
    },
    logo: {
      width: 80,
      height: 32,
      objectFit: "contain",
      marginBottom: 6,
    },
    companyTag: {
      fontSize: 9,
      letterSpacing: 1.4,
      color: primary,
      fontFamily: "Helvetica-Bold",
      marginBottom: 6,
      textTransform: "uppercase",
    },
    title: {
      fontSize: 22,
      fontFamily: "Times-Bold",
      color: "#1c1917",
    },
    paidPill: {
      fontSize: 9,
      color: "#ffffff",
      backgroundColor: primary,
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 4,
      fontFamily: "Helvetica-Bold",
    },
    metaRow: {
      flexDirection: "row",
      marginTop: 6,
    },
    metaCell: {
      marginRight: 18,
    },
    metaLabel: {
      fontSize: 7,
      letterSpacing: 1,
      color: primary,
      fontFamily: "Helvetica-Bold",
      textTransform: "uppercase",
      marginBottom: 2,
    },
    metaValue: {
      fontSize: 10,
      fontFamily: "Helvetica-Bold",
      color: "#1c1917",
    },
    vatLine: {
      fontSize: 8,
      color: "#78716c",
      marginTop: 2,
    },

    columns: {
      flexDirection: "row",
      gap: 12,
      marginBottom: 10,
    },
    column: {
      flex: 1,
      borderWidth: 1,
      borderColor: "#e7e5e4",
      borderRadius: 6,
      padding: 12,
    },
    sectionLabel: {
      fontSize: 8,
      letterSpacing: 1.2,
      color: primary,
      fontFamily: "Helvetica-Bold",
      textTransform: "uppercase",
      marginBottom: 6,
    },
    bodyText: {
      fontSize: 10,
      color: "#1c1917",
      lineHeight: 1.4,
    },
    smallText: {
      fontSize: 9,
      color: "#57534e",
      lineHeight: 1.4,
    },

    lineRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 5,
      borderBottomWidth: 1,
      borderBottomColor: "#f5f5f4",
    },
    lineRowLast: {
      borderBottomWidth: 0,
    },
    lineLeft: {
      flex: 1,
      paddingRight: 8,
    },
    lineName: {
      fontSize: 10,
      fontFamily: "Helvetica-Bold",
      color: "#1c1917",
    },
    lineDescription: {
      fontSize: 8,
      color: "#78716c",
      marginTop: 1,
    },
    lineSub: {
      fontSize: 8,
      color: "#78716c",
      marginTop: 1,
    },
    lineTotal: {
      fontSize: 10,
      fontFamily: "Helvetica-Bold",
      color: "#1c1917",
      textAlign: "right",
      width: 86,
    },

    totalsBlock: {
      borderWidth: 1,
      borderColor: "#e7e5e4",
      borderRadius: 6,
      padding: 12,
      marginBottom: 12,
    },
    totalsRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginVertical: 2,
    },
    totalsLabel: {
      fontSize: 10,
      color: "#57534e",
    },
    totalsValue: {
      fontSize: 10,
      color: "#1c1917",
    },
    grandTotalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 2,
      borderTopColor: primary,
    },
    grandTotalLabel: {
      fontSize: 13,
      fontFamily: "Times-Bold",
      color: "#1c1917",
    },
    grandTotalValue: {
      fontSize: 13,
      fontFamily: "Helvetica-Bold",
      color: primary,
    },
    paidValue: {
      fontSize: 11,
      fontFamily: "Helvetica-Bold",
      color: primary,
    },

    thanksBlock: {
      marginTop: 8,
      paddingVertical: 16,
      paddingHorizontal: 18,
      borderWidth: 1,
      borderColor: primary,
      borderRadius: 8,
      backgroundColor: `${primary}10`,
      alignItems: "center",
    },
    thanksHeadline: {
      fontSize: 14,
      fontFamily: "Times-Bold",
      color: primary,
      marginBottom: 4,
    },
    thanksSub: {
      fontSize: 9,
      color: "#57534e",
      textAlign: "center",
    },
    fixedFooter: {
      position: "absolute",
      left: 36,
      right: 36,
      bottom: 24,
      paddingTop: 6,
      borderTopWidth: 1,
      borderTopColor: "#e7e5e4",
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
    },
    footerText: {
      flex: 1,
      paddingRight: 10,
    },
    footerLine: {
      fontSize: 8,
      color: "#a8a29e",
      lineHeight: 1.25,
    },
    footerLegal: {
      fontSize: 7,
      color: "#a8a29e",
      lineHeight: 1.25,
      marginTop: 2,
    },
    footerPage: {
      width: 118,
      fontSize: 8,
      color: "#a8a29e",
      textAlign: "right",
    },
  });

// --- Document --------------------------------------------------------------

interface Props {
  data: ReceiptPdfData;
}

export const ReceiptDocument: React.FC<Props> = ({ data }) => {
  const company = data.company || ({} as ReceiptPdfData["company"]);
  const primary = safePrimary(company.primary_color);
  const styles = buildStyles(primary);

  const vatRegistered = !!company.vat_registered;
  const vatNumber = company.vat_number || null;
  const heading = vatRegistered ? "Tax Receipt" : "Receipt";

  const invoiceDate = fmtDate(data.invoice_date);
  const paidDate = fmtDate(data.paid_at);
  const eventDate = fmtDate(data.event_date);

  const lineItems = Array.isArray(data.line_items) ? data.line_items : [];
  const subtotal = Number(data.subtotal || 0);
  const tax = Number(data.tax_amount || 0);
  const discount = Number(data.discount_amount || 0);
  const total = Number(data.total_amount || 0);
  // Default amountPaid to total - a paid invoice has by definition
  // been fully settled; the column is for partial-payment audit only.
  const amountPaid = data.amount_paid != null ? Number(data.amount_paid) : total;
  const fmt = (n: number | null | undefined): string => fmtMoney(n, data.currency);

  const billFromAddress = buildAddress(company);
  const footerLine = joinFooterParts([
    company.company_name,
    company.email,
    company.phone,
  ]);
  const footerLegalLine = joinFooterParts([
    company.legal_name && company.legal_name !== company.company_name ? company.legal_name : null,
    company.registration_number ? `Reg ${company.registration_number}` : null,
    company.tax_number ? `Tax ${company.tax_number}` : null,
    vatRegistered && vatNumber ? `VAT ${vatNumber}` : null,
  ]);
  const companyTermsUrl = (company.slug || company.id)
    ? buildCompanyTermsUrl(company.slug || company.id)
    : null;

  return (
    <Document
      title={`${heading} ${data.invoice_number}`}
      author={company.company_name || "CateringMS"}
      subject={heading}
    >
      <Page size="A4" style={styles.page} wrap>
        {/* HEADER BAND */}
        <View style={styles.headerBand} wrap={false}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              {company.logo_url ? (
                <Image src={company.logo_url} style={styles.logo} />
              ) : null}
              <Text style={styles.companyTag}>
                {company.company_name || "Your caterer"}
              </Text>
              <Text style={styles.title}>{heading}</Text>
              {company.registration_number ? (
                <Text style={styles.vatLine}>
                  Reg No: {company.registration_number}
                </Text>
              ) : null}
              {vatRegistered && vatNumber ? (
                <Text style={styles.vatLine}>VAT Reg No: {vatNumber}</Text>
              ) : null}
              <View style={styles.metaRow}>
                <View style={styles.metaCell}>
                  <Text style={styles.metaLabel}>Receipt no.</Text>
                  <Text style={styles.metaValue}>{data.invoice_number}</Text>
                </View>
                {invoiceDate ? (
                  <View style={styles.metaCell}>
                    <Text style={styles.metaLabel}>Invoice date</Text>
                    <Text style={styles.metaValue}>{invoiceDate}</Text>
                  </View>
                ) : null}
                {paidDate ? (
                  <View style={styles.metaCell}>
                    <Text style={styles.metaLabel}>Paid</Text>
                    <Text style={styles.metaValue}>{paidDate}</Text>
                  </View>
                ) : null}
                <View style={styles.metaCell}>
                  <Text style={styles.metaLabel}>Method</Text>
                  <Text style={styles.metaValue}>{methodLabel(data.payment_method)}</Text>
                </View>
              </View>
            </View>
            <View>
              <Text style={styles.paidPill}>PAID</Text>
            </View>
          </View>
        </View>

        {/* BILL FROM / BILL TO */}
        <View style={styles.columns} wrap={false}>
          <View style={styles.column}>
            <Text style={styles.sectionLabel}>From</Text>
            <Text style={styles.bodyText}>
              {company.legal_name || company.company_name || ""}
            </Text>
            {billFromAddress ? (
              <Text style={styles.smallText}>{billFromAddress}</Text>
            ) : null}
            {company.email ? (
              <Text style={styles.smallText}>{company.email}</Text>
            ) : null}
            {company.phone ? (
              <Text style={styles.smallText}>{company.phone}</Text>
            ) : null}
          </View>
          <View style={styles.column}>
            <Text style={styles.sectionLabel}>Receipt for</Text>
            <Text style={styles.bodyText}>{data.client?.name || ""}</Text>
            {data.client?.address ? (
              <Text style={styles.smallText}>{data.client.address}</Text>
            ) : null}
            {data.client?.email ? (
              <Text style={styles.smallText}>{data.client.email}</Text>
            ) : null}
            {data.client?.phone ? (
              <Text style={styles.smallText}>{data.client.phone}</Text>
            ) : null}
            {data.order_number ? (
              <Text style={[styles.smallText, { marginTop: 4 }]}>
                Order: {data.order_number}
              </Text>
            ) : null}
            {data.event_name ? (
              <Text style={styles.smallText}>Event: {data.event_name}</Text>
            ) : null}
            {eventDate ? (
              <Text style={styles.smallText}>Event date: {eventDate}</Text>
            ) : null}
            {data.payment_reference ? (
              <Text style={[styles.smallText, { marginTop: 4 }]}>
                Ref: {data.payment_reference}
              </Text>
            ) : null}
          </View>
        </View>

        {/* LINE ITEMS */}
        {lineItems.length > 0 ? (
          <View style={[styles.column, { marginBottom: 10 }]}>
            <Text style={styles.sectionLabel} minPresenceAhead={44}>
              What was paid for
            </Text>
            {lineItems.map((row, i) => {
              const qty = Number(row?.quantity || 1);
              const unit = Number(row?.unit_price || 0);
              const lineTotal = Number(
                row?.total != null ? row.total : qty * unit,
              );
              const isLast = i === lineItems.length - 1;
              return (
                <View
                  key={`row-${i}`}
                  style={[styles.lineRow, isLast ? styles.lineRowLast : {}]}
                  minPresenceAhead={32}
                >
                  <View style={styles.lineLeft}>
                    <Text style={styles.lineName}>
                      {row?.name || `Item ${i + 1}`}
                    </Text>
                    {row?.description ? (
                      <Text style={styles.lineDescription}>{row.description}</Text>
                    ) : null}
                    {qty > 1 ? (
                      <Text style={styles.lineSub}>
                        {qty} x {fmt(unit)}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.lineTotal}>{fmt(lineTotal)}</Text>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* TOTALS */}
        <View style={styles.totalsBlock} wrap={false} minPresenceAhead={96}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>{fmt(subtotal)}</Text>
          </View>
          {discount > 0 ? (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Discount</Text>
              <Text style={styles.totalsValue}>-{fmt(discount)}</Text>
            </View>
          ) : null}
          {vatRegistered && tax > 0 ? (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>
                VAT
                {company.vat_rate
                  ? ` (${Number(company.vat_rate).toFixed(0)}%)`
                  : ""}
              </Text>
              <Text style={styles.totalsValue}>{fmt(tax)}</Text>
            </View>
          ) : null}
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>
              Total{vatRegistered ? " incl. VAT" : ""}
            </Text>
            <Text style={styles.grandTotalValue}>{fmt(total)}</Text>
          </View>
          <View style={[styles.totalsRow, { marginTop: 6 }]}>
            <Text style={styles.totalsLabel}>Paid in full</Text>
            <Text style={styles.paidValue}>{fmt(amountPaid)}</Text>
          </View>
        </View>

        {/* THANK YOU */}
        <View style={styles.thanksBlock} wrap={false}>
          <Text style={styles.thanksHeadline}>Thank you</Text>
          <Text style={styles.thanksSub}>
            We appreciate your business
            {company.company_name ? ` with ${company.company_name}` : ""}.
          </Text>
        </View>

        <View style={styles.fixedFooter} fixed>
          <View style={styles.footerText}>
            {footerLine ? <Text style={styles.footerLine}>{footerLine}</Text> : null}
            {footerLegalLine ? <Text style={styles.footerLegal}>{footerLegalLine}</Text> : null}
            {companyTermsUrl ? (
              <Text style={styles.footerLegal}>
                Terms &amp; Conditions: <Link src={companyTermsUrl}>{companyTermsUrl}</Link>
              </Text>
            ) : null}
          </View>
          <Text
            style={styles.footerPage}
            render={({ pageNumber, totalPages }) =>
              `${data.invoice_number || "Receipt"} | Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
};

export default ReceiptDocument;
