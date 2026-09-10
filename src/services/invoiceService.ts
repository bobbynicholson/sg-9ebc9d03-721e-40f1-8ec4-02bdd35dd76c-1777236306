/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toLocalISO } from "@/lib/localDate";

export interface InvoiceCompanyDetails {
  name: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  phone: string;
  email: string;
  vatNumber?: string;
  taxNumber?: string;
  registrationNumber?: string;
}

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  supplier: InvoiceCompanyDetails;
  customer: InvoiceCompanyDetails;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  vatAmount: number;
  total: number;
  currency: string;
  notes?: string;
  paymentTerms?: string;
}

export const invoiceService = {
  async generateInvoicePDF(data: InvoiceData): Promise<Blob> {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let yPosition = 20;

    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.text("TAX INVOICE", pageWidth / 2, yPosition, { align: "center" });
    yPosition += 15;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    const supplierX = margin;
    const customerX = pageWidth / 2 + 5;

    doc.setFont("helvetica", "bold");
    doc.text("FROM:", supplierX, yPosition);
    doc.text("TO:", customerX, yPosition);
    yPosition += 6;

    doc.setFont("helvetica", "normal");
    doc.text(data.supplier.name, supplierX, yPosition);
    doc.text(data.customer.name, customerX, yPosition);
    yPosition += 5;

    doc.text(data.supplier.address, supplierX, yPosition);
    doc.text(data.customer.address, customerX, yPosition);
    yPosition += 5;

    doc.text(`${data.supplier.city}, ${data.supplier.postalCode}`, supplierX, yPosition);
    doc.text(`${data.customer.city}, ${data.customer.postalCode}`, customerX, yPosition);
    yPosition += 5;

    doc.text(data.supplier.country, supplierX, yPosition);
    doc.text(data.customer.country, customerX, yPosition);
    yPosition += 5;

    doc.text(`Phone: ${data.supplier.phone}`, supplierX, yPosition);
    if (data.customer.phone) {
      doc.text(`Phone: ${data.customer.phone}`, customerX, yPosition);
    }
    yPosition += 5;

    doc.text(`Email: ${data.supplier.email}`, supplierX, yPosition);
    doc.text(`Email: ${data.customer.email}`, customerX, yPosition);
    yPosition += 5;

    if (data.supplier.vatNumber) {
      doc.text(`VAT No: ${data.supplier.vatNumber}`, supplierX, yPosition);
    }
    if (data.customer.vatNumber) {
      doc.text(`VAT No: ${data.customer.vatNumber}`, customerX, yPosition);
    }
    yPosition += 10;

    doc.setFont("helvetica", "bold");
    doc.text(`Invoice Number: ${data.invoiceNumber}`, margin, yPosition);
    yPosition += 5;
    doc.text(`Invoice Date: ${data.invoiceDate}`, margin, yPosition);
    yPosition += 5;
    doc.text(`Due Date: ${data.dueDate}`, margin, yPosition);
    yPosition += 10;

    const tableData = data.lineItems.map(item => [
      item.description,
      item.quantity.toString(),
      `${data.currency} ${item.unitPrice.toFixed(2)}`,
      `${data.currency} ${item.total.toFixed(2)}`
    ]);

    autoTable(doc, {
      startY: yPosition,
      head: [["Description", "Quantity", "Unit Price", "Total"]],
      body: tableData,
      theme: "striped",
      headStyles: {
        fillColor: [147, 51, 234],
        textColor: [255, 255, 255],
        fontStyle: "bold"
      },
      styles: {
        fontSize: 10,
        cellPadding: 5
      },
      columnStyles: {
        0: { cellWidth: 80 },
        1: { cellWidth: 30, halign: "center" },
        2: { cellWidth: 35, halign: "right" },
        3: { cellWidth: 35, halign: "right" }
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY + 10;

    const summaryX = pageWidth - 80;
    let summaryY = finalY;

    doc.setFont("helvetica", "normal");
    doc.text("Subtotal:", summaryX, summaryY);
    doc.text(`${data.currency} ${data.subtotal.toFixed(2)}`, summaryX + 30, summaryY, { align: "right" });
    summaryY += 6;

    // Compute the rate from subtotal/vatAmount so the label reflects
    // the tenant's actual rate (ZA 15%, UK 20%, zero-rated, etc.)
    // rather than the historical hardcoded "VAT (15%)" [P1-15].
    const ratePct = data.subtotal > 0 ? (data.vatAmount / data.subtotal) * 100 : 0;
    const vatLabel = ratePct > 0 ? `VAT (${ratePct.toFixed(ratePct < 10 ? 1 : 0)}%):` : "VAT:";
    doc.text(vatLabel, summaryX, summaryY);
    doc.text(`${data.currency} ${data.vatAmount.toFixed(2)}`, summaryX + 30, summaryY, { align: "right" });
    summaryY += 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Total:", summaryX, summaryY);
    doc.text(`${data.currency} ${data.total.toFixed(2)}`, summaryX + 30, summaryY, { align: "right" });

    if (data.notes) {
      summaryY += 15;
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("Notes:", margin, summaryY);
      summaryY += 5;
      doc.setFont("helvetica", "normal");
      const splitNotes = doc.splitTextToSize(data.notes, pageWidth - 2 * margin);
      doc.text(splitNotes, margin, summaryY);
    }

    if (data.paymentTerms) {
      summaryY += 15;
      doc.setFont("helvetica", "bold");
      doc.text("Payment Terms:", margin, summaryY);
      summaryY += 5;
      doc.setFont("helvetica", "normal");
      const splitTerms = doc.splitTextToSize(data.paymentTerms, pageWidth - 2 * margin);
      doc.text(splitTerms, margin, summaryY);
    }

    const footerY = doc.internal.pageSize.getHeight() - 20;
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.text(
      "Thank you for your business!",
      pageWidth / 2,
      footerY,
      { align: "center" }
    );

    return doc.output("blob");
  },

  async generateSubscriptionInvoice(subscriptionId: string): Promise<Blob> {
    const { data: subscription, error: subscriptionErr } = await supabase
      .from("subscriptions")
      .select(`
        *,
        profiles:user_id (
          full_name,
          email,
          company_name,
          phone
        )
      `)
      .eq("id", subscriptionId)
      .single();
    if (subscriptionErr) {
      console.error("[invoiceService] subscriptions fetch failed:", subscriptionErr);
    }

    if (!subscription) {
      throw new Error("Subscription not found");
    }

    const profileData = Array.isArray((subscription as any).profiles) 
      ? (subscription as any).profiles[0] 
      : (subscription as any).profiles;

    if (!profileData) {
      throw new Error("Customer profile not found for subscription");
    }

    const profile: any = profileData;

    const invoiceNumber = `INV-${subscription.id.substring(0, 8).toUpperCase()}`;
    const invoiceDate = toLocalISO(new Date());
    const dueDate = toLocalISO(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));

    const invoiceData: InvoiceData = {
      invoiceNumber,
      invoiceDate,
      dueDate,
      supplier: {
        name: "CateringMS (A product of Skylight Digital)",
        address: "17 Swalle Street, Golden Acre",
        city: "Cape Town",
        postalCode: "8000",
        country: "South Africa",
        phone: "083 652 5755",
        email: "billing@cateringms.com",
        vatNumber: "VAT123456789",
        registrationNumber: "2025/123456/07"
      },
      customer: {
        name: profile.company_name || profile.full_name || "Customer",
        address: profile.address || "N/A",
        city: profile.city || "N/A",
        postalCode: profile.postal_code || "N/A",
        country: profile.country || "South Africa",
        phone: profile.phone || "N/A",
        email: profile.email || "N/A",
        vatNumber: profile.vat_number,
        taxNumber: profile.tax_number
      },
      lineItems: [
        {
          description: `CateringMS ${(subscription as any).plan_type} Plan - Monthly Subscription`,
          quantity: 1,
          unitPrice: subscription.amount,
          total: subscription.amount
        }
      ],
      // subscription.amount is what PayFast actually charges the tenant,
      // and SA subscription prices are quoted VAT-inclusive. The old code
      // added 15% ON TOP, so the tax invoice showed a total (amount * 1.15)
      // the tenant was never charged. Back-compute an inclusive 15% split
      // so the document total equals the real charge.
      subtotal: Math.round((subscription.amount / 1.15) * 100) / 100,
      vatAmount: Math.round((subscription.amount - subscription.amount / 1.15) * 100) / 100,
      total: subscription.amount,
      currency: subscription.currency || "R",
      paymentTerms: "Payment due within 30 days of invoice date"
    };

    return await this.generateInvoicePDF(invoiceData);
  },

  async generateOrderInvoice(orderId: string, edits?: Partial<InvoiceData>): Promise<Blob> {
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select(`
        *,
        profiles:client_id (
          full_name:client_name,
          email,
          phone
        )
      `)
      .eq("id", orderId)
      .single();
    if (orderErr) {
      console.error("[invoiceService] orders fetch failed:", orderErr);
    }

    if (!order) {
      throw new Error("Order not found");
    }

    const { data: user, error: userErr } = await supabase.auth.getUser();
    if (userErr) {
      console.error("[invoiceService] supabase op failed:", userErr);
    }
    const { data: supplierProfile, error: supplierProfileErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user?.user?.id)
      .single();
    if (supplierProfileErr) {
      console.error("[invoiceService] profiles fetch failed:", supplierProfileErr);
    }

    const profileData = Array.isArray((order as any).profiles) 
      ? (order as any).profiles[0] 
      : (order as any).profiles;

    if (!profileData) {
      throw new Error("Customer profile not found for order");
    }

    const profile: any = profileData;
    const supplier: any = supplierProfile;

    // Line items come from the order_items table. Orders do NOT have
    // menu_items/equipment_items columns -- those live on quotes -- so
    // the old code read undefined and rendered an EMPTY, R0 invoice PDF.
    // unit_price/line_total are the saved per-line figures, so per-person
    // items already reflect guest count.
    const { data: orderItemRows, error: orderItemsErr } = await supabase
      .from("order_items")
      .select("item_name, description, quantity, unit_price, line_total")
      .eq("order_id", order.id)
      .order("created_at", { ascending: true });
    if (orderItemsErr) {
      console.error("[invoiceService] order_items fetch failed:", orderItemsErr);
    }
    const lineItems: InvoiceLineItem[] = (orderItemRows || []).map((item: any) => ({
      description: item.item_name || item.description || "Item",
      quantity: Number(item.quantity) || 1,
      unitPrice: Number(item.unit_price) || 0,
      total:
        Number(item.line_total) ||
        (Number(item.quantity) || 1) * (Number(item.unit_price) || 0),
    }));

    // Prefer the SAVED invoice's money (subtotal / tax / total) so the
    // downloaded PDF agrees with the real invoice on every surface. Only
    // when no invoice row exists yet do we derive a VAT split from the
    // tenant's registration + rate (SARS: non-registered tenants get no
    // VAT line; other regions may not be 15%).
    const { data: savedInv, error: savedInvErr } = await supabase
      .from("invoices")
      .select("invoice_number, subtotal, tax_amount, total_amount")
      .eq("order_id", order.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (savedInvErr) {
      console.error("[invoiceService] invoices fetch failed:", savedInvErr);
    }
    const computedSubtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
    let subtotal: number;
    let vatAmount: number;
    let total: number;
    if (savedInv && Number((savedInv as any).total_amount) > 0) {
      subtotal = Number((savedInv as any).subtotal) || computedSubtotal;
      vatAmount = Number((savedInv as any).tax_amount) || 0;
      total = Number((savedInv as any).total_amount);
    } else {
      const { data: companyRow, error: companyRowErr } = await (supabase as any)
        .from("companies")
        .select("vat_registered, tax_rate:vat_rate")
        .eq("id", (order as any).company_id)
        .maybeSingle();
      if (companyRowErr) {
        console.error("[invoiceService] companies fetch failed:", companyRowErr);
      }
      const vatRegistered = !!(companyRow as any)?.vat_registered;
      const vatRatePct = Number((companyRow as any)?.tax_rate ?? 15);
      const vatRate = vatRegistered ? vatRatePct / 100 : 0;
      subtotal = computedSubtotal;
      vatAmount = subtotal * vatRate;
      total = subtotal + vatAmount;
    }

    // Prefer an explicit override, then the saved invoice's number.
    // Final fallback consumes a fresh per-tenant number via the RPC
    // instead of slicing the order UUID (collision risk).
    let invoiceNumber: string | undefined =
      edits?.invoiceNumber || (savedInv as any)?.invoice_number || undefined;
    if (!invoiceNumber) {
      try {
        const { data: numData } = await (supabase as any).rpc(
          "consume_next_document_number",
          { p_company_id: (order as any).company_id, p_document_type: "invoice" },
        );
        if (numData) invoiceNumber = numData as string;
      } catch {
        // fall through
      }
    }
    if (!invoiceNumber) {
      invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
    }
    const invoiceDate = edits?.invoiceDate || toLocalISO(new Date());
    const dueDate = edits?.dueDate || order.event_date || toLocalISO(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

    const invoiceData: InvoiceData = {
      invoiceNumber,
      invoiceDate,
      dueDate,
      supplier: edits?.supplier || {
        name: supplier?.company_name || supplier?.full_name || "Catering Company",
        address: supplier?.address || "N/A",
        city: supplier?.city || "N/A",
        postalCode: supplier?.postal_code || "N/A",
        country: supplier?.country || "South Africa",
        phone: supplier?.phone || "N/A",
        email: supplier?.email || "N/A",
        vatNumber: supplier?.vat_number,
        taxNumber: supplier?.tax_number
      },
      customer: edits?.customer || {
        name: profile.company_name || profile.full_name || "Customer",
        address: profile.address || (order as any).event_location || "N/A",
        city: profile.city || "N/A",
        postalCode: profile.postal_code || "N/A",
        country: profile.country || "South Africa",
        phone: profile.phone || "N/A",
        email: profile.email || "N/A",
        vatNumber: profile.vat_number,
        taxNumber: profile.tax_number
      },
      lineItems: edits?.lineItems || lineItems,
      subtotal: edits?.subtotal || subtotal,
      vatAmount: edits?.vatAmount || vatAmount,
      total: edits?.total || total,
      currency: order.currency || "R",
      notes: edits?.notes,
      paymentTerms: edits?.paymentTerms || "Payment due on event date"
    };

    return await this.generateInvoicePDF(invoiceData);
  },

  // Audit (May 2026): emailInvoice + the /api/send-invoice-email
  // endpoint were both removed. Canonical send path is
  // /api/send-email with attachInvoicePdf=true + invoiceId, wired
  // through invoiceGenerationService.sendInvoiceEmail. There were
  // zero remaining callers.

  downloadInvoice(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }
};
