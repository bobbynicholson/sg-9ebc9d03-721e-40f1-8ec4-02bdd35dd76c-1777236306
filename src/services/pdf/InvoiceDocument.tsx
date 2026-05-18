/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any */
// @ts-nocheck
/**
 * InvoiceDocument - React-PDF document for tax invoices.
 *
 * SARS rule: VAT-registered businesses must show "Tax Invoice" + the
 * VAT registration number on every invoice. Non-registered tenants
 * issue a plain "Invoice" with no VAT line. The vat_registered flag
 * on companies controls both header copy and whether the VAT line
 * appears in the totals stack.
 *
 * Built now even though no caller wires it in yet (Phase 4 will wire
 * it into invoice send). Mirrors QuoteDocument's structure so the two
 * read like the same family of documents.
 */

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";

// --- Types -----------------------------------------------------------------

export interface InvoicePdfLineItem {
  name: string;
  description?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  total?: number | null;
}

export interface InvoicePdfData {
  invoice_number: string;
  invoice_date: string; // ISO
  due_date: string; // ISO
  status?: string | null;

  client: {
    name: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
  };

  order_number?: string | null;
  event_name?: string | null;
  event_date?: string | null;

  line_items: InvoicePdfLineItem[];

  subtotal?: number | null;
  tax_amount?: number | null;
  /** Phase 15 #8: discount applied to the order before tax. When
   *  set the PDF renders a 'Discount' line under Subtotal so the
   *  client sees the saving rather than just a lower headline. */
  discount_amount?: number | null;
  total_amount: number;
  amount_paid?: number | null;
  balance_due?: number | null;
  currency?: string | null;

  notes?: string | null;
  payment_terms?: string | null;

  company: {
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

/**
 * Phase 9 #2: tenant-currency-aware money formatter. Falls back
 * to ZAR / R when the row doesn't declare a currency so existing
 * invoices keep rendering identically. Pass the invoice.currency
 * (or company.currency) string - e.g. "USD", "GBP", "ZAR".
 */
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
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(v);
  } catch {
    return `${CURRENCY_FALLBACK_SYMBOL[code] || ""}${Math.round(v)}`;
  }
};

const fmtDateZA = (raw: string | null | undefined): string | null => {
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
  if (!hex) return "#3B82F6";
  const t = String(hex).trim();
  if (/^#?[0-9a-f]{3}$/i.test(t) || /^#?[0-9a-f]{6}$/i.test(t)) {
    return t.startsWith("#") ? t : `#${t}`;
  }
  return "#3B82F6";
};

const buildAddress = (c: InvoicePdfData["company"]): string => {
  if (!c) return "";
  return [c.address_line1, c.address_line2, c.city, c.state_province, c.postal_code, c.country]
    .filter(Boolean)
    .join(", ");
};

// --- Styles ----------------------------------------------------------------

const buildStyles = (primary: string) =>
  StyleSheet.create({
    page: {
      paddingTop: 36,
      paddingBottom: 36,
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
    statusPill: {
      fontSize: 9,
      color: "#ffffff",
      backgroundColor: primary,
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 4,
      fontFamily: "Helvetica-Bold",
    },
    statusPaid: {
      backgroundColor: "#059669",
    },
    statusOverdue: {
      backgroundColor: "#dc2626",
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

    // Line rows mirror QuoteDocument so a quote and the matching
    // invoice read like the same family of documents. Wrapped in the
    // shared card style with a brand-primary section label.
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
    },

    // Full-width totals card matches QuoteDocument so the totals
    // section shares the same visual weight across both documents.
    totalsBlock: {
      borderWidth: 1,
      borderColor: "#e7e5e4",
      borderRadius: 6,
      padding: 12,
      marginBottom: 10,
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
    balanceDue: {
      fontSize: 11,
      fontFamily: "Helvetica-Bold",
      color: "#b45309",
    },
    paid: {
      fontSize: 11,
      fontFamily: "Helvetica-Bold",
      color: "#059669",
    },

    footer: {
      marginTop: 14,
      fontSize: 8,
      color: "#a8a29e",
      textAlign: "center",
    },
    notes: {
      fontSize: 9,
      color: "#57534e",
      lineHeight: 1.4,
    },
    vatLine: {
      fontSize: 8,
      color: "#78716c",
      marginTop: 2,
    },
  });

// --- Document --------------------------------------------------------------

interface Props {
  data: InvoicePdfData;
}

export const InvoiceDocument: React.FC<Props> = ({ data }) => {
  const company = data.company || ({} as InvoicePdfData["company"]);
  const primary = safePrimary(company.primary_color);
  const styles = buildStyles(primary);

  const vatRegistered = !!company.vat_registered;
  const vatNumber = company.vat_number || null;
  const heading = vatRegistered ? "Tax Invoice" : "Invoice";

  const status = (data.status || "").toLowerCase();
  const isPaid = status === "paid";
  const isOverdue = status === "overdue";

  const invoiceDate = fmtDateZA(data.invoice_date);
  const dueDate = fmtDateZA(data.due_date);
  const eventDate = fmtDateZA(data.event_date);

  const lineItems = Array.isArray(data.line_items) ? data.line_items : [];
  const subtotal = Number(data.subtotal || 0);
  const tax = Number(data.tax_amount || 0);
  const discount = Number(data.discount_amount || 0);
  const total = Number(data.total_amount || 0);
  const amountPaid = Number(data.amount_paid || 0);
  // Phase 9 #2: tenant currency. Closure binds the row's currency
  // (e.g. 'USD', 'GBP') so every money render below uses the
  // right symbol + locale. Defaults to ZAR / R when unset.
  const fmt = (n: number | null | undefined): string => fmtMoney(n, data.currency);
  const balanceDue = data.balance_due != null
    ? Number(data.balance_due)
    : Math.max(0, total - amountPaid);

  const billFromAddress = buildAddress(company);

  return (
    <Document
      title={`${heading} ${data.invoice_number}`}
      author={company.company_name || "CateringMS"}
      subject={heading}
    >
      <Page size="A4" style={styles.page}>
        {/* HEADER BAND */}
        <View style={styles.headerBand}>
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
                  <Text style={styles.metaLabel}>Invoice no.</Text>
                  <Text style={styles.metaValue}>{data.invoice_number}</Text>
                </View>
                {invoiceDate ? (
                  <View style={styles.metaCell}>
                    <Text style={styles.metaLabel}>Date</Text>
                    <Text style={styles.metaValue}>{invoiceDate}</Text>
                  </View>
                ) : null}
                {dueDate ? (
                  <View style={styles.metaCell}>
                    <Text style={styles.metaLabel}>Due</Text>
                    <Text style={styles.metaValue}>{dueDate}</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <View>
              <Text
                style={[
                  styles.statusPill,
                  isPaid ? styles.statusPaid : {},
                  isOverdue ? styles.statusOverdue : {},
                ]}
              >
                {(data.status || "Sent").toUpperCase()}
              </Text>
            </View>
          </View>
        </View>

        {/* BILL FROM / BILL TO */}
        <View style={styles.columns}>
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
            <Text style={styles.sectionLabel}>Bill to</Text>
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
          </View>
        </View>

        {/* LINE ITEMS - mirrors QuoteDocument's "From the kitchen" block */}
        {lineItems.length > 0 ? (
          <View style={[styles.column, { marginBottom: 10 }]}>
            <Text style={styles.sectionLabel}>From the kitchen</Text>
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
                  wrap={false}
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
        <View style={styles.totalsBlock} wrap={false}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>{fmt(subtotal)}</Text>
          </View>
          {/* Phase 15 #8: discount line. Surfaces orders.
              discount_amount on the PDF so the client sees the
              saving rather than just a lower headline - the
              concession reads as concession, not as a quiet
              price drop. */}
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
          {amountPaid > 0 ? (
            <View style={[styles.totalsRow, { marginTop: 6 }]}>
              <Text style={styles.totalsLabel}>Paid</Text>
              <Text style={styles.paid}>-{fmt(amountPaid)}</Text>
            </View>
          ) : null}
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>
              {balanceDue <= 0 ? "Balance" : "Balance due"}
            </Text>
            <Text style={balanceDue <= 0 ? styles.paid : styles.balanceDue}>
              {fmt(Math.max(0, balanceDue))}
            </Text>
          </View>
        </View>

        {/* NOTES + PAYMENT TERMS */}
        {(data.payment_terms || data.notes) ? (
          <View style={[styles.column, { marginBottom: 10 }]}>
            {data.payment_terms ? (
              <>
                <Text style={styles.sectionLabel}>Payment terms</Text>
                <Text style={styles.notes}>{data.payment_terms}</Text>
              </>
            ) : null}
            {data.notes ? (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 8 }]}>
                  Notes
                </Text>
                <Text style={styles.notes}>{data.notes}</Text>
              </>
            ) : null}
          </View>
        ) : null}

        {/* FOOTER */}
        <Text style={styles.footer}>
          {company.company_name ? `${company.company_name}` : ""}
          {company.email ? `  |  ${company.email}` : ""}
          {company.phone ? `  |  ${company.phone}` : ""}
        </Text>
      </Page>
    </Document>
  );
};

export default InvoiceDocument;
