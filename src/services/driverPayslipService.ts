/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Driver payslip PDF generator. Download and email actions use this
 * same renderer so the employee receives the same company-branded,
 * period-specific statement in either case.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { DriverPaySummary } from "./driverPayService";

export interface PayslipMeta {
  companyName: string;
  companyLegalName?: string | null;
  companyAddress?: string | null;
  companyEmail?: string | null;
  companyPhone?: string | null;
  companyWebsite?: string | null;
  companyRegistrationNumber?: string | null;
  companyTaxNumber?: string | null;
  companyVatNumber?: string | null;
  companyVatRegistered?: boolean | null;
  companyLogoUrl?: string | null;
  companyBrandColor?: string | null;
  driverName: string;
  driverEmail?: string | null;
  driverPhone?: string | null;
  periodFrom: string;
  periodTo: string;
  /** Set only when the recorded payout exactly matches this payslip period. */
  payoutStatus?: "draft" | "reviewed" | "paid" | null;
  payoutMethod?: "eft" | "cash" | "mobile_money" | "other" | null;
  payoutReference?: string | null;
  paidAt?: string | null;
  /** Legacy symbol prefix retained for older callers. */
  currencyLabel?: string;
  currencyCode?: string;
}

type RGB = [number, number, number];

function parseColor(hex: string | null | undefined): RGB {
  const value = String(hex || "").trim().replace(/^#/, "");
  if (/^[\da-f]{3}$/i.test(value)) {
    return value.split("").map((part) => parseInt(part + part, 16)) as RGB;
  }
  if (/^[\da-f]{6}$/i.test(value)) {
    return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
  }
  return [177, 34, 39];
}

const WHITE: RGB = [255, 255, 255];
const INK: RGB = [24, 30, 42];
const BODY: RGB = [51, 60, 72];
const MUTED: RGB = [98, 107, 120];
const LINE: RGB = [226, 230, 236];
const PANEL: RGB = [247, 248, 250];
const MARGIN = 14;
const FIRST_PAGE_TOP = 44;
const LATER_PAGE_TOP = 22;
const LOGO_TIMEOUT_MS = 12_000;

function luminance(color: RGB): number {
  const [r, g, b] = color.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastText(color: RGB): RGB {
  const whiteContrast = 1.05 / (luminance(color) + 0.05);
  return whiteContrast >= 4.5 ? [255, 255, 255] : [0, 0, 0];
}

function mix(color: RGB, target: RGB, amount: number): RGB {
  return color.map((channel, index) => Math.round(channel + (target[index] - channel) * amount)) as RGB;
}

/** The company colour, darkened only as far as text on white needs. */
function readableOnWhite(color: RGB): RGB {
  let result = color;
  for (let step = 0; step < 20 && 1.05 / (luminance(result) + 0.05) < 4.5; step += 1) {
    result = mix(result, [0, 0, 0], 0.08);
  }
  return result;
}

function buildFmt(meta: PayslipMeta) {
  const code = meta.currencyCode || "";
  if (code) {
    try {
      const f = new Intl.NumberFormat("en-ZA", {
        style: "currency",
        currency: code,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      // Plain spaces: jsPDF mismeasures non-breaking ones, which pushes
      // right-aligned amounts out of line with their column headings.
      return (n: number) => f.format(Number(n) || 0).replace(/[  ]/g, " ");
    } catch {
      // Preserve compatibility for any legacy currency code.
    }
  }
  const symbol = meta.currencyLabel || "R";
  return (n: number) => `${symbol} ${(Number(n) || 0).toFixed(2)}`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Johannesburg",
  }).format(date);
}

function methodLabel(method: PayslipMeta["payoutMethod"]): string {
  switch (method) {
    case "eft": return "EFT / bank transfer";
    case "cash": return "Cash";
    case "mobile_money": return "Mobile money";
    case "other": return "Other";
    default: return "Not recorded";
  }
}

function companyInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1
    ? words.slice(0, 2).map((word) => Array.from(word)[0]).join("")
    : Array.from(words[0] || "CO").slice(0, 2).join("")).toUpperCase();
}

/**
 * Company logos are served through the same-origin PWA branding endpoint.
 * That endpoint safely resolves the tenant's saved logo and returns a
 * normalized PNG, avoiding browser CORS and jsPDF format surprises.
 */
async function loadLogoPngDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url || typeof fetch !== "function") return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOGO_TIMEOUT_MS);
  try {
    const response = await fetch(url, { credentials: "same-origin", signal: controller.signal });
    if (!response.ok || !response.headers.get("content-type")?.toLowerCase().startsWith("image/png")) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 2 * 1024 * 1024) return null;
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return `data:image/png;base64,${btoa(binary)}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function fitLines(doc: jsPDF, value: string, width: number, maxLines: number): string[] {
  if (!value.trim()) return [];
  return doc.splitTextToSize(value.trim(), width).slice(0, maxLines) as string[];
}

function drawLogo(doc: jsPDF, meta: PayslipMeta, logoDataUrl: string | null, brand: RGB, x: number, y: number, size: number): void {
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, "PNG", x, y, size, size, "company-logo", "FAST");
      return;
    } catch {
      // A bad or unavailable logo must not prevent the payslip itself.
    }
  }
  doc.setFillColor(...brand);
  doc.roundedRect(x, y, size, size, 2.5, 2.5, "F");
  doc.setTextColor(...contrastText(brand));
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(companyInitials(meta.companyName), x + size / 2, y + size / 2 + 1.4, { align: "center" });
}

function addPageChrome(
  doc: jsPDF,
  meta: PayslipMeta,
  logoDataUrl: string | null,
  brand: RGB,
  pageNumber: number,
  pageCount: number,
): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const rightX = pageWidth - MARGIN;
  const accent = readableOnWhite(brand);
  const period = `${formatDate(meta.periodFrom)} to ${formatDate(meta.periodTo)}`;

  doc.setFillColor(...brand);
  doc.rect(0, 0, pageWidth, 2, "F");

  if (pageNumber === 1) {
    drawLogo(doc, meta, logoDataUrl, brand, MARGIN, 10, 22);

    const infoX = MARGIN + 27;
    const infoWidth = pageWidth - infoX - MARGIN - 58;
    let infoY = 14.5;
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(fitLines(doc, meta.companyName || "Company", infoWidth, 1), infoX, infoY);
    infoY += 4.6;

    const legalName = meta.companyLegalName && meta.companyLegalName !== meta.companyName
      ? meta.companyLegalName
      : "";
    const identityLines = [
      legalName,
      meta.companyAddress || "",
      [meta.companyEmail, meta.companyPhone, meta.companyWebsite].filter(Boolean).join(" | "),
      [
        meta.companyRegistrationNumber ? `Reg No: ${meta.companyRegistrationNumber}` : "",
        meta.companyTaxNumber ? `Tax No: ${meta.companyTaxNumber}` : "",
        meta.companyVatRegistered && meta.companyVatNumber ? `VAT No: ${meta.companyVatNumber}` : "",
      ].filter(Boolean).join(" | "),
    ].filter(Boolean);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    for (const value of identityLines) {
      const lines = fitLines(doc, value, infoWidth, 2);
      if (!lines.length) continue;
      doc.text(lines, infoX, infoY);
      infoY += lines.length * 3.1;
    }

    doc.setTextColor(...accent);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(21);
    doc.text("PAYSLIP", rightX, 18, { align: "right" });
    doc.setTextColor(...MUTED);
    doc.setFontSize(6.5);
    doc.text("PAY PERIOD", rightX, 24.5, { align: "right" });
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(period, rightX, 29, { align: "right" });

    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, FIRST_PAGE_TOP - 5, rightX, FIRST_PAGE_TOP - 5);
  } else {
    // Later pages only need to say whose payslip they belong to.
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(fitLines(doc, meta.companyName || "Company", 70, 1), MARGIN, 11);
    doc.setTextColor(...MUTED);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    const driver = fitLines(doc, meta.driverName || "Driver", 60, 1)[0] || "Driver";
    doc.text(`Payslip | ${driver} | ${period}`, rightX, 11, { align: "right" });
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.line(MARGIN, 14.5, rightX, 14.5);
  }

  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.25);
  doc.line(MARGIN, pageHeight - 14, rightX, pageHeight - 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text(`Generated ${new Intl.DateTimeFormat("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date())}`, MARGIN, pageHeight - 9);
  doc.text(`Page ${pageNumber} of ${pageCount}`, rightX, pageHeight - 9, { align: "right" });
}

/** Shared look for the detail tables, with headings aligned to their numbers. */
function tableOptions(accent: RGB, tint: RGB, rightColumns: number[]) {
  return {
    margin: { left: MARGIN, right: MARGIN, top: LATER_PAGE_TOP, bottom: 20 },
    theme: "plain" as const,
    styles: { font: "helvetica", fontSize: 7.8, textColor: BODY, cellPadding: { top: 2, bottom: 2, left: 2, right: 2 }, lineColor: LINE, lineWidth: { bottom: 0.15 } },
    headStyles: { fontStyle: "bold" as const, fontSize: 7, textColor: MUTED, lineColor: accent, lineWidth: { bottom: 0.45 } },
    footStyles: { fontStyle: "bold" as const, fontSize: 8, textColor: INK, fillColor: tint, lineWidth: 0 },
    showHead: "everyPage" as const,
    showFoot: "lastPage" as const,
    rowPageBreak: "avoid" as const,
    didParseCell: (data: { section: string; column: { index: number }; cell: { styles: { halign: string } } }) => {
      if (rightColumns.includes(data.column.index)) data.cell.styles.halign = "right";
    },
  };
}

export const driverPayslipService = {
  /** Render one company's driver pay record for download or email. */
  async generatePayslipPdf(meta: PayslipMeta, summary: DriverPaySummary): Promise<Blob> {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const fmtMoney = buildFmt(meta);
    const brand = parseColor(meta.companyBrandColor);
    const accent = readableOnWhite(brand);
    const tint = mix(brand, WHITE, 0.93);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const rightX = pageWidth - MARGIN;
    const contentWidth = pageWidth - MARGIN * 2;
    const logoDataUrl = await loadLogoPngDataUrl(meta.companyLogoUrl);
    const totals = summary.totals;

    let y = FIRST_PAGE_TOP;

    // Who was paid, and whether the payment has been recorded.
    const panelHeight = 25;
    const gap = 4;
    const driverWidth = contentWidth * 0.56;
    const paymentX = MARGIN + driverWidth + gap;
    const paymentWidth = contentWidth - driverWidth - gap;
    doc.setFillColor(...PANEL);
    doc.roundedRect(MARGIN, y, driverWidth, panelHeight, 2, 2, "F");
    doc.roundedRect(paymentX, y, paymentWidth, panelHeight, 2, 2, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text("DRIVER", MARGIN + 5, y + 6);
    doc.setFontSize(12);
    doc.setTextColor(...INK);
    doc.text(fitLines(doc, meta.driverName || "Driver", driverWidth - 10, 1), MARGIN + 5, y + 12.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.6);
    doc.setTextColor(...MUTED);
    const driverContacts = [meta.driverEmail, meta.driverPhone].filter(Boolean).join(" | ");
    const driverContactLines = fitLines(doc, driverContacts, driverWidth - 10, 2);
    if (driverContactLines.length) doc.text(driverContactLines, MARGIN + 5, y + 18);

    const exactPaid = meta.payoutStatus === "paid";
    const payoutStatus = exactPaid ? "PAID" : meta.payoutStatus ? "UNPAID" : "NOT RECORDED";
    const statusColor: RGB = exactPaid ? [22, 101, 66] : meta.payoutStatus ? [146, 84, 14] : [84, 93, 106];
    const statusFill = mix(statusColor, WHITE, 0.86);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text("PAYMENT", paymentX + 5, y + 6);
    doc.setFontSize(7.2);
    const badgeWidth = doc.getTextWidth(payoutStatus) + 6;
    doc.setFillColor(...statusFill);
    doc.roundedRect(paymentX + paymentWidth - 5 - badgeWidth, y + 2.8, badgeWidth, 5, 2.5, 2.5, "F");
    doc.setTextColor(...statusColor);
    doc.text(payoutStatus, paymentX + paymentWidth - 5 - badgeWidth / 2, y + 6.3, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.6);
    doc.setTextColor(...BODY);
    const paymentLines = exactPaid
      ? [
          `Method: ${methodLabel(meta.payoutMethod)}`,
          meta.paidAt ? `Paid: ${formatTimestamp(meta.paidAt)}` : "",
          meta.payoutReference ? `Reference: ${meta.payoutReference}` : "",
        ].filter(Boolean)
      : ["No paid payout recorded for this period"];
    const clippedPayment = paymentLines.flatMap((line) => fitLines(doc, line, paymentWidth - 10, 1)).slice(0, 3);
    doc.text(clippedPayment, paymentX + 5, y + 12.5, { lineHeightFactor: 1.35 });
    y += panelHeight + gap;

    // Total pay is the strongest figure on the page, next to what it is made of.
    const heroHeight = 27;
    doc.setFillColor(...tint);
    doc.roundedRect(MARGIN, y, contentWidth, heroHeight, 2, 2, "F");
    doc.setFillColor(...brand);
    doc.rect(MARGIN, y + 3, 1.2, heroHeight - 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text("TOTAL DRIVER PAY", MARGIN + 6, y + 9);
    doc.setFontSize(22);
    doc.setTextColor(...accent);
    doc.text(fmtMoney(totals.grand_total), MARGIN + 6, y + 19.5);

    const dispatchCount = summary.deliveries.length;
    const parts: Array<[string, number, string]> = [
      ["Hourly pay", totals.hourly_pay, `${totals.hours_total.toFixed(2)} hours worked`],
      ["Distance pay", totals.distance_pay, `${totals.distance_total_km.toFixed(1)} km driven`],
      ["Callout pay", totals.callout_pay, `${dispatchCount} completed dispatch${dispatchCount === 1 ? "" : "es"}`],
    ];
    const partsX = MARGIN + contentWidth * 0.42;
    const partWidth = (rightX - partsX) / parts.length;
    parts.forEach(([label, amount, basis], index) => {
      const x = partsX + index * partWidth;
      doc.setDrawColor(...mix(brand, WHITE, 0.75));
      doc.setLineWidth(0.2);
      doc.line(x, y + 6, x, y + heroHeight - 6);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.5);
      doc.setTextColor(...MUTED);
      doc.text(label.toUpperCase(), x + 3.5, y + 9);
      doc.setFontSize(10);
      doc.setTextColor(...INK);
      doc.text(fmtMoney(amount), x + 3.5, y + 15);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.4);
      doc.setTextColor(...MUTED);
      doc.text(fitLines(doc, basis, partWidth - 5, 1), x + 3.5, y + 19.5);
    });
    y += heroHeight + 8;

    const startSection = (title: string, count: string): number => {
      if (y > pageHeight - 52) {
        doc.addPage();
        y = LATER_PAGE_TOP;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...INK);
      doc.text(title, MARGIN, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text(count, rightX, y, { align: "right" });
      y += 2.5;
      return y;
    };

    if (summary.shifts.length > 0) {
      const shiftCount = summary.shifts.length;
      const shiftStart = startSection("Shift detail", `${shiftCount} shift${shiftCount === 1 ? "" : "s"}`);
      const shiftRows = summary.shifts.map((shift) => {
        const buckets = (shift as any).bcea_buckets as
          | Array<{ overtimeHours: number }>
          | undefined;
        const rate = `${fmtMoney(shift.hourly_rate)}/h${shift.multiplier !== 1 ? ` x ${shift.multiplier}` : ""}`;
        const note = buckets?.some((bucket) => bucket.overtimeHours > 0) ? "Includes overtime" : "";
        return [
          formatDate(shift.shift_date),
          note,
          `${shift.hours.toFixed(2)} h`,
          rate,
          fmtMoney(shift.pay),
        ];
      });
      autoTable(doc, {
        ...tableOptions(accent, tint, [2, 3, 4]),
        startY: shiftStart,
        head: [["Date", "Notes", "Hours", "Rate", "Pay"]],
        body: shiftRows,
        foot: [["Total", "", `${totals.hours_total.toFixed(2)} h`, "", fmtMoney(totals.hourly_pay)]],
        columnStyles: {
          0: { cellWidth: 32 },
          2: { cellWidth: 26 },
          3: { cellWidth: 38 },
          4: { cellWidth: 34, fontStyle: "bold" },
        },
      } as any);
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    if (summary.deliveries.length > 0) {
      const deliveryStart = startSection("Delivery detail", `${dispatchCount} dispatch${dispatchCount === 1 ? "" : "es"}`);
      const deliveryRows = summary.deliveries.map((delivery) => {
        const reference = delivery.order_number || `${delivery.order_id.slice(0, 8)}...`;
        const job = delivery.event_name && delivery.event_name.toLowerCase() !== "untitled"
          ? `${reference}\n${delivery.event_name}`
          : reference;
        return [
          job,
          `${delivery.distance_km.toFixed(1)} km`,
          `${fmtMoney(delivery.distance_rate)}/km`,
          fmtMoney(delivery.distance_pay),
          fmtMoney(delivery.callout_fee),
          fmtMoney(delivery.total),
        ];
      });
      autoTable(doc, {
        ...tableOptions(accent, tint, [1, 2, 3, 4, 5]),
        startY: deliveryStart,
        head: [["Order / job", "Distance", "Rate", "Distance pay", "Callout", "Total"]],
        body: deliveryRows,
        foot: [[
          "Total",
          `${totals.distance_total_km.toFixed(1)} km`,
          "",
          fmtMoney(totals.distance_pay),
          fmtMoney(totals.callout_pay),
          fmtMoney(totals.distance_pay + totals.callout_pay),
        ]],
        columnStyles: {
          1: { cellWidth: 22 },
          2: { cellWidth: 25 },
          3: { cellWidth: 28 },
          4: { cellWidth: 26 },
          5: { cellWidth: 30, fontStyle: "bold" },
        },
      } as any);
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    if (summary.shifts.length === 0 && summary.deliveries.length === 0) {
      doc.setFillColor(...PANEL);
      doc.roundedRect(MARGIN, y, contentWidth, 14, 2, 2, "F");
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      doc.text("No shift or delivery line items were recorded for this period.", pageWidth / 2, y + 8.3, { align: "center" });
    }

    const pageCount = doc.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      addPageChrome(doc, meta, logoDataUrl, brand, page, pageCount);
    }

    return doc.output("blob");
  },
};
