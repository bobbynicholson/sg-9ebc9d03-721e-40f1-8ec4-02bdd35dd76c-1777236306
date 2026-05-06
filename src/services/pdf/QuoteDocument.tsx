/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck
/**
 * QuoteDocument -- React-PDF document mirroring /q/[token].tsx.
 *
 * Visual goal: when the client opens the attached PDF, it looks like
 * the same quote they see at the share link -- branded header band
 * tinted with the tenant primary colour, serif title, event details
 * grid, menu items, equipment, totals card, terms.
 *
 * React-PDF doesn't speak Tailwind, so we approximate the look using
 * its StyleSheet API. Pixel-perfect parity isn't the target -- what
 * matters is that the printed React-PDF output reads the same as the
 * printed web version (header colour, structure, totals layout,
 * VAT-aware copy).
 */

import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Font,
} from "@react-pdf/renderer";

// --- Types -----------------------------------------------------------------

export interface QuotePdfMenuItem {
  name: string;
  description?: string | null;
  unit_price?: number | null;
  quantity?: number | null;
  total?: number | null;
}

export interface QuotePdfEquipmentItem {
  name: string;
  quantity?: number | null;
  unit_price?: number | null;
  total?: number | null;
}

export interface QuotePdfData {
  quote_number: string;
  quote_name?: string | null;
  client_name?: string | null;
  event_date?: string | null;
  event_time?: string | null;
  setup_time?: string | null;
  guest_count?: number | null;
  venue_address?: string | null;

  menu_items?: QuotePdfMenuItem[] | null;
  equipment_items?: QuotePdfEquipmentItem[] | null;

  subtotal?: number | null;
  delivery_fee?: number | null;
  delivery_distance_km?: number | null;
  discount_amount?: number | null;
  tax_amount?: number | null;
  total: number;

  valid_until?: string | null;
  terms_and_conditions?: string | null;
  notes?: string | null;
  status?: string | null;
  accepted_at?: string | null;

  company: {
    company_name?: string | null;
    logo_url?: string | null;
    email?: string | null;
    phone?: string | null;
    address_line1?: string | null;
    address_line2?: string | null;
    city?: string | null;
    primary_color?: string | null;
    vat_registered?: boolean | null;
    vat_number?: string | null;
    vat_rate?: number | null;
  };
}

// --- Helpers ---------------------------------------------------------------

const fmtZAR = (n: number | null | undefined): string => {
  const v = Number(n || 0);
  try {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
      maximumFractionDigits: 0,
    }).format(v);
  } catch {
    return `R ${Math.round(v)}`;
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

const friendlyTime = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const [hStr, mStr] = String(raw).split(":");
  const h = Number(hStr);
  const m = Number(mStr || 0);
  if (!Number.isFinite(h)) return null;
  const period = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`;
};

const safePrimary = (hex: string | null | undefined): string => {
  if (!hex) return "#3B82F6";
  const t = String(hex).trim();
  if (/^#?[0-9a-f]{3}$/i.test(t) || /^#?[0-9a-f]{6}$/i.test(t)) {
    return t.startsWith("#") ? t : `#${t}`;
  }
  return "#3B82F6";
};

// --- Styles factory --------------------------------------------------------

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
      backgroundColor: `${primary}1A`, // ~10% alpha hex
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
      marginBottom: 8,
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
      marginBottom: 4,
    },
    referenceLine: {
      fontSize: 9,
      color: "#57534e",
    },
    vatLine: {
      fontSize: 8,
      color: "#78716c",
      marginTop: 2,
    },
    badge: {
      fontSize: 9,
      color: "#ffffff",
      backgroundColor: primary,
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 4,
      fontFamily: "Helvetica-Bold",
    },
    badgeAccepted: {
      backgroundColor: "#059669",
    },

    card: {
      borderWidth: 1,
      borderColor: "#e7e5e4",
      borderRadius: 6,
      padding: 12,
      marginBottom: 10,
    },
    sectionLabel: {
      fontSize: 8,
      letterSpacing: 1.2,
      color: primary,
      fontFamily: "Helvetica-Bold",
      textTransform: "uppercase",
      marginBottom: 6,
    },

    grid: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    gridCell: {
      width: "33.33%",
      paddingRight: 8,
      marginBottom: 8,
    },
    gridCellWide: {
      width: "100%",
      marginBottom: 4,
    },
    cellLabel: {
      fontSize: 7,
      letterSpacing: 1,
      color: primary,
      fontFamily: "Helvetica-Bold",
      textTransform: "uppercase",
      marginBottom: 2,
    },
    cellValue: {
      fontSize: 10,
      fontFamily: "Helvetica-Bold",
      color: "#1c1917",
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

    terms: {
      fontSize: 8,
      color: "#57534e",
      lineHeight: 1.4,
    },
    validUntil: {
      fontSize: 8,
      color: "#78716c",
      marginTop: 6,
    },
    footer: {
      marginTop: 14,
      fontSize: 8,
      color: "#a8a29e",
      textAlign: "center",
    },
  });

// --- Document --------------------------------------------------------------

interface Props {
  data: QuotePdfData;
}

export const QuoteDocument: React.FC<Props> = ({ data }) => {
  const company = data.company || ({} as QuotePdfData["company"]);
  const primary = safePrimary(company.primary_color);
  const styles = buildStyles(primary);

  const accepted = !!data.accepted_at;
  const eventDate = fmtDateZA(data.event_date);
  const validUntil = fmtDateZA(data.valid_until);
  const eventTime = friendlyTime(data.event_time);
  const setupTime = friendlyTime(data.setup_time);
  const today = fmtDateZA(new Date().toISOString());
  const vatRegistered = !!company.vat_registered;
  const vatNumber = company.vat_number || null;

  const menuItems = Array.isArray(data.menu_items) ? data.menu_items : [];
  const equipmentItems = Array.isArray(data.equipment_items) ? data.equipment_items : [];

  const deliveryFee = Number(data.delivery_fee || 0);
  const subtotal = Number(data.subtotal || 0);
  const itemsNet = subtotal - deliveryFee;
  const discount = Number(data.discount_amount || 0);
  const tax = Number(data.tax_amount || 0);
  const total = Number(data.total || 0);

  return (
    <Document
      title={`Quote ${data.quote_number}`}
      author={company.company_name || "CateringMS"}
      subject={data.quote_name || "Quote"}
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
              <Text style={styles.title}>
                {data.quote_name ||
                  `Quote for ${data.client_name || "your event"}`}
              </Text>
              <Text style={styles.referenceLine}>
                Reference {data.quote_number}
                {today ? `  |  prepared ${today}` : ""}
              </Text>
              {vatRegistered && vatNumber ? (
                <Text style={styles.vatLine}>VAT Reg No: {vatNumber}</Text>
              ) : null}
            </View>
            <View>
              <Text
                style={[
                  styles.badge,
                  accepted ? styles.badgeAccepted : {},
                ]}
              >
                {accepted ? "Accepted" : "Awaiting your response"}
              </Text>
            </View>
          </View>
        </View>

        {/* EVENT DETAILS */}
        <View style={styles.card}>
          <View style={styles.grid}>
            {data.client_name ? (
              <View style={styles.gridCell}>
                <Text style={styles.cellLabel}>For</Text>
                <Text style={styles.cellValue}>{data.client_name}</Text>
              </View>
            ) : null}
            {eventDate ? (
              <View style={styles.gridCell}>
                <Text style={styles.cellLabel}>Event date</Text>
                <Text style={styles.cellValue}>
                  {eventDate}
                  {eventTime ? ` -- ${eventTime} start` : ""}
                </Text>
                {setupTime && setupTime !== eventTime ? (
                  <Text style={styles.lineSub}>
                    Setup / arrival: {setupTime}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {data.guest_count != null ? (
              <View style={styles.gridCell}>
                <Text style={styles.cellLabel}>Guests</Text>
                <Text style={styles.cellValue}>{String(data.guest_count)}</Text>
              </View>
            ) : null}
            {data.venue_address ? (
              <View style={styles.gridCellWide}>
                <Text style={styles.cellLabel}>Venue</Text>
                <Text style={styles.cellValue}>{data.venue_address}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* MENU ITEMS */}
        {menuItems.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>From the kitchen</Text>
            {menuItems.map((item, i) => {
              const name = item?.name || `Item ${i + 1}`;
              const unitPrice = Number(item?.unit_price || 0);
              const qty = Number(item?.quantity || 1);
              const lineTotal = Number(
                item?.total != null ? item.total : unitPrice * qty,
              );
              const isLast = i === menuItems.length - 1;
              return (
                <View
                  key={`menu-${i}`}
                  style={[styles.lineRow, isLast ? styles.lineRowLast : {}]}
                  wrap={false}
                >
                  <View style={styles.lineLeft}>
                    <Text style={styles.lineName}>{name}</Text>
                    {item?.description ? (
                      <Text style={styles.lineDescription}>
                        {item.description}
                      </Text>
                    ) : null}
                    {qty > 1 ? (
                      <Text style={styles.lineSub}>
                        {qty} x {fmtZAR(unitPrice)}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.lineTotal}>{fmtZAR(lineTotal)}</Text>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* EQUIPMENT */}
        {equipmentItems.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.sectionLabel}>Equipment</Text>
            {equipmentItems.map((item, i) => {
              const name = item?.name || `Equipment ${i + 1}`;
              const qty = Number(item?.quantity || 1);
              const unitPrice = Number(item?.unit_price || 0);
              const lineTotal = Number(
                item?.total != null ? item.total : unitPrice * qty,
              );
              const isLast = i === equipmentItems.length - 1;
              return (
                <View
                  key={`eq-${i}`}
                  style={[styles.lineRow, isLast ? styles.lineRowLast : {}]}
                  wrap={false}
                >
                  <View style={styles.lineLeft}>
                    <Text style={styles.lineName}>{name}</Text>
                    {qty > 1 ? (
                      <Text style={styles.lineSub}>{qty} x</Text>
                    ) : null}
                  </View>
                  {lineTotal > 0 ? (
                    <Text style={styles.lineTotal}>{fmtZAR(lineTotal)}</Text>
                  ) : (
                    <Text style={styles.lineTotal}> </Text>
                  )}
                </View>
              );
            })}
          </View>
        ) : null}

        {/* TOTALS */}
        <View style={styles.card} wrap={false}>
          {deliveryFee > 0 ? (
            <>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>Items</Text>
                <Text style={styles.totalsValue}>{fmtZAR(itemsNet)}</Text>
              </View>
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>
                  Delivery
                  {data.delivery_distance_km
                    ? ` (${Number(data.delivery_distance_km).toFixed(1)} km)`
                    : ""}
                </Text>
                <Text style={styles.totalsValue}>{fmtZAR(deliveryFee)}</Text>
              </View>
            </>
          ) : null}
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>{fmtZAR(subtotal)}</Text>
          </View>
          {discount > 0 ? (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Discount</Text>
              <Text style={[styles.totalsValue, { color: "#047857" }]}>
                -{fmtZAR(discount)}
              </Text>
            </View>
          ) : null}
          {tax > 0 ? (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>
                VAT
                {company.vat_rate
                  ? ` (${Number(company.vat_rate).toFixed(0)}%)`
                  : ""}
              </Text>
              <Text style={styles.totalsValue}>{fmtZAR(tax)}</Text>
            </View>
          ) : null}
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>
              Total{vatRegistered ? " incl. VAT" : ""}
            </Text>
            <Text style={styles.grandTotalValue}>{fmtZAR(total)}</Text>
          </View>
        </View>

        {/* TERMS + valid until */}
        {(data.terms_and_conditions || validUntil) ? (
          <View style={styles.card}>
            {data.terms_and_conditions ? (
              <>
                <Text style={styles.sectionLabel}>Terms</Text>
                <Text style={styles.terms}>{data.terms_and_conditions}</Text>
              </>
            ) : null}
            {validUntil ? (
              <Text style={styles.validUntil}>Valid until {validUntil}.</Text>
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

export default QuoteDocument;
