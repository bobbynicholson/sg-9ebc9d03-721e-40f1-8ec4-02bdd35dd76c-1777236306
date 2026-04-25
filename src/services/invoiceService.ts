/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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

    doc.text("VAT (15%):", summaryX, summaryY);
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
    const { data: subscription } = await supabase
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
    const invoiceDate = new Date().toISOString().split("T")[0];
    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

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
      subtotal: subscription.amount,
      vatAmount: subscription.amount * 0.15,
      total: subscription.amount * 1.15,
      currency: subscription.currency || "R",
      paymentTerms: "Payment due within 30 days of invoice date"
    };

    return await this.generateInvoicePDF(invoiceData);
  },

  async generateOrderInvoice(orderId: string, edits?: Partial<InvoiceData>): Promise<Blob> {
    const { data: order } = await supabase
      .from("orders")
      .select(`
        *,
        profiles:client_id (
          full_name,
          email,
          company_name,
          phone
        )
      `)
      .eq("id", orderId)
      .single();

    if (!order) {
      throw new Error("Order not found");
    }

    const { data: user } = await supabase.auth.getUser();
    const { data: supplierProfile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user?.user?.id)
      .single();

    const profileData = Array.isArray((order as any).profiles) 
      ? (order as any).profiles[0] 
      : (order as any).profiles;

    if (!profileData) {
      throw new Error("Customer profile not found for order");
    }

    const profile: any = profileData;
    const supplier: any = supplierProfile;

    const items = [...((order as any).menu_items || []), ...((order as any).equipment_items || [])];
    const lineItems: InvoiceLineItem[] = items.map((item: any) => ({
      description: item.name || item.description || "Item",
      quantity: item.quantity || 1,
      unitPrice: item.pricePerPerson || item.rentalPrice || 0,
      total: (item.quantity || 1) * (item.pricePerPerson || item.rentalPrice || 0)
    }));

    const subtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
    const vatAmount = subtotal * 0.15;
    const total = subtotal + vatAmount;

    const invoiceNumber = edits?.invoiceNumber || `INV-${order.id.substring(0, 8).toUpperCase()}`;
    const invoiceDate = edits?.invoiceDate || new Date().toISOString().split("T")[0];
    const dueDate = edits?.dueDate || order.event_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

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

  async emailInvoice(
    recipientEmail: string,
    invoiceBlob: Blob,
    invoiceNumber: string,
    subject?: string
  ): Promise<boolean> {
    try {
      const formData = new FormData();
      formData.append("to", recipientEmail);
      formData.append("subject", subject || `Tax Invoice ${invoiceNumber}`);
      formData.append(
        "html",
        `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #9333ea;">Tax Invoice</h2>
          <p>Dear Valued Customer,</p>
          <p>Please find attached your tax invoice <strong>${invoiceNumber}</strong>.</p>
          <p>If you have any questions, please don't hesitate to contact us.</p>
          <p>Best regards,<br/>CateringMS Team</p>
        </div>
        `
      );
      formData.append("invoice", invoiceBlob, `invoice-${invoiceNumber}.pdf`);

      const response = await fetch("/api/send-invoice-email", {
        method: "POST",
        body: formData
      });

      return response.ok;
    } catch (error) {
      console.error("Error sending invoice email:", error);
      return false;
    }
  },

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
