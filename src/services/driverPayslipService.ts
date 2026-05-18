/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * Phase 4 #7: driver payslip PDF generator.
 *
 * Browser-side PDF render using jsPDF + jspdf-autotable - same
 * dependencies invoiceService already pulls in, so no new bundle
 * weight. The payslip mirrors what /admin/driver-settlement shows
 * on screen: per-driver pay summary for a period, with the BCEA
 * breakdown when shifts crossed midnight or included overtime.
 *
 * Returns a Blob so the caller can offer a Download or pass it
 * straight into emailService for the driver to receive their
 * payslip by email.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { DriverPaySummary } from "./driverPayService";

export interface PayslipMeta {
  companyName: string;
  companyAddress?: string | null;
  companyEmail?: string | null;
  companyPhone?: string | null;
  companyLogoUrl?: string | null;
  driverName: string;
  driverEmail?: string | null;
  driverPhone?: string | null;
  periodFrom: string; // 'YYYY-MM-DD'
  periodTo: string;
  currencyLabel?: string; // defaults 'R'
}

const fmt = (n: number, sym = "R") => `${sym} ${Number(n || 0).toFixed(2)}`;

export const driverPayslipService = {
  /**
   * Render a payslip PDF for a single driver and return a Blob. The
   * caller decides whether to .saveAs() (download), upload to
   * storage, or attach to an email.
   */
  generatePayslipPdf(meta: PayslipMeta, summary: DriverPaySummary): Blob {
    const doc = new jsPDF();
    const sym = meta.currencyLabel || "R";
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let y = 20;

    // Header
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("PAYSLIP", pageWidth / 2, y, { align: "center" });
    y += 10;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(meta.companyName, margin, y);
    doc.text(
      `Period: ${meta.periodFrom} -> ${meta.periodTo}`,
      pageWidth - margin,
      y,
      { align: "right" },
    );
    y += 6;
    if (meta.companyAddress) {
      doc.text(meta.companyAddress, margin, y);
      y += 5;
    }
    if (meta.companyEmail || meta.companyPhone) {
      doc.text(
        [meta.companyEmail, meta.companyPhone].filter(Boolean).join(" | "),
        margin,
        y,
      );
      y += 5;
    }
    y += 4;

    // Driver block
    doc.setFont("helvetica", "bold");
    doc.text("Driver", margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.text(meta.driverName, margin, y);
    y += 5;
    if (meta.driverEmail) {
      doc.text(meta.driverEmail, margin, y);
      y += 5;
    }
    if (meta.driverPhone) {
      doc.text(meta.driverPhone, margin, y);
      y += 5;
    }
    y += 4;

    // Totals strip
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Totals", margin, y);
    y += 6;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const tot = summary.totals;
    const totalsRows: Array<[string, string]> = [
      ["Hours worked", `${tot.hours_total.toFixed(2)} h`],
      ["Hourly pay", fmt(tot.hourly_pay, sym)],
      ["Distance covered", `${tot.distance_total_km.toFixed(1)} km`],
      ["Distance pay", fmt(tot.distance_pay, sym)],
      ["Callout pay", fmt(tot.callout_pay, sym)],
      ["Grand total", fmt(tot.grand_total, sym)],
    ];
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [],
      body: totalsRows,
      theme: "plain",
      styles: { fontSize: 10, cellPadding: 1.5 },
      columnStyles: {
        0: { fontStyle: "normal" },
        1: { halign: "right", fontStyle: "bold" },
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 8;

    // Shifts table
    if (summary.shifts.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.text("Shifts", margin, y);
      y += 5;
      const shiftRows = summary.shifts.map((s) => {
        const buckets = (s as any).bcea_buckets as
          | Array<{ date: string; hours: number; dayMultiplier: number; overtimeHours: number; pay: number }>
          | undefined;
        const mult = s.multiplier !== 1 ? ` x ${s.multiplier}` : "";
        const ot = !!buckets?.some((b) => b.overtimeHours > 0);
        const note = ot ? " (includes OT)" : "";
        return [
          `${s.hours.toFixed(2)} h @ ${fmt(s.hourly_rate, sym)}/hr${mult}${note}`,
          fmt(s.pay, sym),
        ];
      });
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [["Detail", "Pay"]],
        body: shiftRows,
        theme: "striped",
        headStyles: { fillColor: [241, 245, 249], textColor: 50 },
        styles: { fontSize: 9, cellPadding: 2 },
        columnStyles: { 1: { halign: "right" } },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = (doc as any).lastAutoTable.finalY + 6;
    }

    // Deliveries table
    if (summary.deliveries.length > 0) {
      if (y > 240) { doc.addPage(); y = 20; }
      doc.setFont("helvetica", "bold");
      doc.text("Deliveries", margin, y);
      y += 5;
      const deliveryRows = summary.deliveries.map((d) => [
        d.order_id.slice(0, 8) + "...",
        `${d.distance_km.toFixed(1)} km`,
        fmt(d.distance_pay, sym),
        fmt(d.callout_fee, sym),
        fmt(d.total, sym),
      ]);
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [["Order", "Distance", "Distance pay", "Callout", "Total"]],
        body: deliveryRows,
        theme: "striped",
        headStyles: { fillColor: [241, 245, 249], textColor: 50 },
        styles: { fontSize: 9, cellPadding: 2 },
        columnStyles: {
          1: { halign: "right" },
          2: { halign: "right" },
          3: { halign: "right" },
          4: { halign: "right", fontStyle: "bold" },
        },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      y = (doc as any).lastAutoTable.finalY + 6;
    }

    // Footer
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.text(
      `Generated ${new Date().toLocaleString("en-ZA")} - this is a system-generated payslip.`,
      pageWidth / 2,
      285,
      { align: "center" },
    );

    return doc.output("blob");
  },
};
