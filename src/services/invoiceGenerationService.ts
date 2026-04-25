import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { PayFastService } from "@/lib/payfastService";

/**
 * Invoice Generation Service
 * Generates PDF invoices for orders and integrates with accounting systems
 */

interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  
  // Company Details
  companyName: string;
  companyLogo?: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyVAT?: string;
  
  // Client Details
  clientName: string;
  clientEmail: string;
  clientPhone?: string;
  clientAddress?: string;
  
  // Order Details
  orderId: string;
  orderNumber: string;
  eventDate: string;
  eventTime: string;
  venue: string;
  guestCount: number;
  
  // Financial Details
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  
  // Payment Details
  depositPaid: number;
  balanceDue: number;
  paymentTerms: string;
  bankDetails?: {
    bankName: string;
    accountName: string;
    accountNumber: string;
    branchCode: string;
  };
  
  // Additional
  notes?: string;
  footer?: string;
}

interface GenerateInvoiceOptions {
  orderId: string;
  companyId: string;
  sendEmail?: boolean;
  emailRecipient?: string;
}

interface AccountingSyncOptions {
  provider: "xero" | "quickbooks" | "sage";
  invoiceId: string;
  companyId: string;
}

/**
 * Generate invoice data from order
 */
export async function generateInvoiceData(
  orderId: string,
  companyId: string
): Promise<{ success: boolean; data?: InvoiceData; error?: string }> {
  try {
    // 1. Fetch order details
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(`
        *,
        clients (
          first_name,
          last_name,
          email,
          phone,
          company_name,
          address_line1,
          address_line2,
          city,
          state_province,
          postal_code
        )
      `)
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return { success: false, error: "Order not found" };
    }

    // 2. Fetch company details
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      return { success: false, error: "Company not found" };
    }

    // 3. Get or create invoice number
    const invoiceNumber = await getNextInvoiceNumber(companyId);

    // 4. Calculate financial details
    const orderData = order as any;
    const companyData = company as any;
    
    const menuItems = (orderData.menu_items || []) as any[];
    const items = menuItems.map((item: any) => ({
      description: item.name || "Item",
      quantity: item.quantity || 1,
      unitPrice: item.price || 0,
      total: (item.quantity || 1) * (item.price || 0),
    }));

    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const taxRate = companyData.tax_rate || companyData.tax_percentage || 15; // Default 15% VAT
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;
    const depositPaid = orderData.amount_paid || 0;
    const balanceDue = total - depositPaid;

    // 5. Format client details
    const client = orderData.clients as any;
    const clientName = client.company_name || 
      `${client.first_name || ""} ${client.last_name || ""}`.trim();
    const clientAddress = [
      client.address_line1,
      client.address_line2,
      client.city,
      client.state_province,
      client.postal_code
    ].filter(Boolean).join(", ");

    // 6. Build invoice data
    const invoiceData: InvoiceData = {
      invoiceNumber,
      invoiceDate: format(new Date(), "yyyy-MM-dd"),
      dueDate: format(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"), // 30 days
      
      companyName: companyData.company_name,
      companyLogo: companyData.logo_url,
      companyAddress: [
        companyData.address_line1,
        companyData.address_line2,
        companyData.city,
        companyData.state_province,
        companyData.postal_code,
        companyData.country
      ].filter(Boolean).join(", "),
      companyPhone: companyData.phone_number || companyData.phone || "",
      companyEmail: companyData.email || "",
      companyVAT: companyData.vat_number || companyData.tax_number || "",
      
      clientName,
      clientEmail: client.email,
      clientPhone: client.phone,
      clientAddress,
      
      orderId: orderData.id,
      orderNumber: orderData.order_number || `ORD-${orderData.id.slice(-8)}`,
      eventDate: orderData.event_date || "",
      eventTime: orderData.event_time || "",
      venue: orderData.venue_name || "",
      guestCount: orderData.guest_count || 0,
      
      items,
      subtotal,
      taxRate,
      taxAmount,
      total,
      depositPaid,
      balanceDue,
      
      paymentTerms: companyData.payment_terms || "Payment due within 30 days",
      bankDetails: companyData.bank_details ? (typeof companyData.bank_details === 'string' ? JSON.parse(companyData.bank_details) : companyData.bank_details) : undefined,
      
      notes: orderData.special_instructions,
      footer: `Thank you for your business! For any queries, contact us at ${companyData.email || ""} or ${companyData.phone_number || companyData.phone || ""}`
    };

    return { success: true, data: invoiceData };
  } catch (error: any) {
    console.error("Generate invoice data error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get next invoice number for company
 */
async function getNextInvoiceNumber(companyId: string): Promise<string> {
  const { data: lastInvoice } = await supabase
    .from("invoices")
    .select("invoice_number")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (lastInvoice?.invoice_number) {
    const match = lastInvoice.invoice_number.match(/INV-(\d+)/);
    if (match) {
      const nextNum = parseInt(match[1]) + 1;
      return `INV-${nextNum.toString().padStart(6, "0")}`;
    }
  }

  return "INV-000001";
}

/**
 * Create invoice record in database
 */
export async function createInvoiceRecord(
  invoiceData: InvoiceData,
  orderId: string,
  companyId: string
): Promise<{ success: boolean; invoiceId?: string; error?: string }> {
  try {
    const { data: order } = await supabase.from("orders").select("client_id").eq("id", orderId).single();

    const insertPayload: any = {
      company_id: companyId,
      order_id: orderId,
      client_id: order?.client_id,
      invoice_number: invoiceData.invoiceNumber,
      invoice_date: invoiceData.invoiceDate,
      due_date: invoiceData.dueDate,
      subtotal: invoiceData.subtotal,
      tax_amount: invoiceData.taxAmount,
      total_amount: invoiceData.total,
      amount_paid: invoiceData.depositPaid,
      balance_due: invoiceData.balanceDue,
      status: invoiceData.balanceDue > 0 ? "sent" : "paid",
      invoice_data: invoiceData as any,
    };

    const { data: invoice, error } = await supabase
      .from("invoices")
      .insert(insertPayload)
      .select("id")
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, invoiceId: invoice.id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Generate payment link for invoice
 * Bug #22 FIX: Integrate with PayFast to generate actual payment form/URL
 */
export async function generateInvoicePaymentLink(
  invoiceId: string,
  companyId: string
): Promise<{ success: boolean; paymentUrl?: string; error?: string }> {
  try {
    // 1. Get invoice with company details
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("*, companies!inner(*)")
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      return { success: false, error: "Invoice not found" };
    }

    const invoiceData = invoice as any;
    
    if (invoiceData.balance_due <= 0) {
      return { success: false, error: "Invoice already paid" };
    }

    // 2. Check if PayFast is configured
    const merchantId = process.env.NEXT_PUBLIC_PAYFAST_MERCHANT_ID;
    const merchantKey = process.env.NEXT_PUBLIC_PAYFAST_MERCHANT_KEY;
    const passphrase = process.env.NEXT_PUBLIC_PAYFAST_PASSPHRASE;
    const testMode = process.env.NODE_ENV !== "production";

    // If PayFast not configured, return simple payment page URL
    const baseUrl = typeof window !== "undefined" 
      ? window.location.origin 
      : process.env.NEXT_PUBLIC_APP_URL || "https://cateringms.com";
    
    const paymentPageUrl = `${baseUrl}/pay/invoice/${invoiceId}`;

    if (!merchantId || !merchantKey) {
      console.warn("PayFast credentials not configured - returning payment page URL");
      return { success: true, paymentUrl: paymentPageUrl };
    }

    // 3. PayFast is configured - return payment page that will redirect to PayFast
    return { success: true, paymentUrl: paymentPageUrl };

  } catch (error) {
    console.error("Error generating invoice payment link:", error);
    return { success: false, error: "Failed to generate payment link" };
  }
}

/**
 * Generate HTML invoice for PDF conversion or email
 */
export function generateInvoiceHTML(data: InvoiceData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice ${data.invoiceNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 12px;
      line-height: 1.6;
      color: #333;
      padding: 40px;
    }
    .invoice-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 3px solid #0950c6;
    }
    .company-logo {
      max-width: 200px;
      max-height: 80px;
    }
    .company-details {
      text-align: left;
    }
    .company-details h1 {
      color: #0950c6;
      font-size: 24px;
      margin-bottom: 10px;
    }
    .invoice-title {
      text-align: right;
    }
    .invoice-title h2 {
      color: #0950c6;
      font-size: 32px;
      font-weight: bold;
    }
    .invoice-meta {
      display: flex;
      justify-content: space-between;
      margin-bottom: 30px;
    }
    .invoice-meta > div {
      flex: 1;
    }
    .label {
      font-weight: bold;
      color: #666;
      margin-bottom: 5px;
    }
    .value {
      margin-bottom: 15px;
    }
    .section-title {
      background: #0950c6;
      color: white;
      padding: 8px 12px;
      font-weight: bold;
      margin-top: 30px;
      margin-bottom: 15px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    thead {
      background: #f4f4f4;
    }
    th {
      text-align: left;
      padding: 12px;
      font-weight: bold;
      border-bottom: 2px solid #ddd;
    }
    td {
      padding: 10px 12px;
      border-bottom: 1px solid #eee;
    }
    .text-right {
      text-align: right;
    }
    .totals {
      margin-left: auto;
      width: 300px;
      margin-top: 20px;
    }
    .totals table {
      margin-bottom: 0;
    }
    .totals td {
      padding: 8px 12px;
    }
    .totals .grand-total {
      background: #0950c6;
      color: white;
      font-weight: bold;
      font-size: 16px;
    }
    .payment-info {
      background: #f9f9f9;
      padding: 20px;
      margin-top: 30px;
      border-left: 4px solid #0950c6;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      text-align: center;
      color: #666;
      font-size: 11px;
    }
    .highlight {
      color: #0950c6;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div class="invoice-header">
    <div class="company-details">
      ${data.companyLogo ? `<img src="${data.companyLogo}" alt="${data.companyName}" class="company-logo">` : `<h1>${data.companyName}</h1>`}
      <div style="margin-top: 15px;">
        <div>${data.companyAddress}</div>
        <div>Tel: ${data.companyPhone}</div>
        <div>Email: ${data.companyEmail}</div>
        ${data.companyVAT ? `<div>VAT: ${data.companyVAT}</div>` : ""}
      </div>
    </div>
    <div class="invoice-title">
      <h2>INVOICE</h2>
      <div style="margin-top: 10px;">
        <div class="label">Invoice Number</div>
        <div class="value highlight" style="font-size: 16px;">${data.invoiceNumber}</div>
        <div class="label">Invoice Date</div>
        <div class="value">${format(new Date(data.invoiceDate), "dd MMM yyyy")}</div>
        <div class="label">Due Date</div>
        <div class="value">${format(new Date(data.dueDate), "dd MMM yyyy")}</div>
      </div>
    </div>
  </div>

  <div class="invoice-meta">
    <div>
      <div class="section-title">BILL TO</div>
      <div style="font-size: 14px; font-weight: bold; margin-bottom: 5px;">${data.clientName}</div>
      ${data.clientAddress ? `<div>${data.clientAddress}</div>` : ""}
      <div>Email: ${data.clientEmail}</div>
      ${data.clientPhone ? `<div>Phone: ${data.clientPhone}</div>` : ""}
    </div>
    <div>
      <div class="section-title">EVENT DETAILS</div>
      <div class="label">Order Number</div>
      <div class="value">${data.orderNumber}</div>
      <div class="label">Event Date</div>
      <div class="value">${data.eventDate ? format(new Date(data.eventDate), "dd MMM yyyy") : "TBD"}</div>
      <div class="label">Event Time</div>
      <div class="value">${data.eventTime || "TBD"}</div>
      <div class="label">Venue</div>
      <div class="value">${data.venue || "TBD"}</div>
      <div class="label">Guest Count</div>
      <div class="value highlight">${data.guestCount} guests</div>
    </div>
  </div>

  <div class="section-title">ITEMS</div>
  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="text-right">Quantity</th>
        <th class="text-right">Unit Price</th>
        <th class="text-right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${data.items.map(item => `
        <tr>
          <td>${item.description}</td>
          <td class="text-right">${item.quantity}</td>
          <td class="text-right">R ${item.unitPrice.toFixed(2)}</td>
          <td class="text-right">R ${item.total.toFixed(2)}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>

  <div class="totals">
    <table>
      <tr>
        <td>Subtotal</td>
        <td class="text-right">R ${data.subtotal.toFixed(2)}</td>
      </tr>
      <tr>
        <td>VAT (${data.taxRate}%)</td>
        <td class="text-right">R ${data.taxAmount.toFixed(2)}</td>
      </tr>
      <tr class="grand-total">
        <td>TOTAL</td>
        <td class="text-right">R ${data.total.toFixed(2)}</td>
      </tr>
      ${data.depositPaid > 0 ? `
        <tr>
          <td>Deposit Paid</td>
          <td class="text-right">R ${data.depositPaid.toFixed(2)}</td>
        </tr>
        <tr style="background: #fff3cd; font-weight: bold;">
          <td>BALANCE DUE</td>
          <td class="text-right">R ${data.balanceDue.toFixed(2)}</td>
        </tr>
      ` : ""}
    </table>
  </div>

  ${data.bankDetails ? `
    <div class="payment-info">
      <div class="section-title" style="margin-top: 0;">PAYMENT DETAILS</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 10px;">
        <div>
          <div class="label">Bank Name</div>
          <div class="value">${data.bankDetails.bankName}</div>
        </div>
        <div>
          <div class="label">Account Name</div>
          <div class="value">${data.bankDetails.accountName}</div>
        </div>
        <div>
          <div class="label">Account Number</div>
          <div class="value highlight">${data.bankDetails.accountNumber}</div>
        </div>
        <div>
          <div class="label">Branch Code</div>
          <div class="value">${data.bankDetails.branchCode}</div>
        </div>
      </div>
      <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #ddd;">
        <div class="label">Payment Terms</div>
        <div>${data.paymentTerms}</div>
      </div>
    </div>
  ` : ""}

  ${data.notes ? `
    <div style="margin-top: 30px;">
      <div class="section-title">NOTES</div>
      <div style="padding: 15px; background: #f9f9f9;">${data.notes}</div>
    </div>
  ` : ""}

  <div class="footer">
    ${data.footer || ""}
  </div>
</body>
</html>
  `.trim();
}

/**
 * Send invoice via email
 */
export async function sendInvoiceEmail(
  invoiceData: InvoiceData,
  recipientEmail: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const htmlContent = generateInvoiceHTML(invoiceData);

    const response = await fetch("/api/send-invoice-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: recipientEmail,
        subject: `Invoice ${invoiceData.invoiceNumber} - ${invoiceData.companyName}`,
        html: htmlContent,
        invoiceNumber: invoiceData.invoiceNumber,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.message || "Failed to send email" };
    }

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * ============================================
 * ACCOUNTING SYSTEM INTEGRATION (PLACEHOLDER)
 * ============================================
 * 
 * These functions are prepared for future integration with
 * Xero, QuickBooks, Sage, or other accounting systems.
 * 
 * Implementation steps:
 * 1. Set up OAuth with accounting provider
 * 2. Store access tokens securely
 * 3. Map invoice data to provider's format
 * 4. Handle sync errors and retries
 * 5. Track sync status in database
 */

/**
 * Sync invoice to accounting system (PLACEHOLDER)
 * 
 * @example
 * await syncInvoiceToAccounting({
 *   provider: "xero",
 *   invoiceId: "invoice-uuid",
 *   companyId: "company-uuid"
 * });
 */
export async function syncInvoiceToAccounting(
  options: AccountingSyncOptions
): Promise<{ success: boolean; externalId?: string; error?: string }> {
  // TODO: Implement accounting system integration
  
  console.log(`[ACCOUNTING SYNC] Provider: ${options.provider}`);
  console.log(`[ACCOUNTING SYNC] Invoice ID: ${options.invoiceId}`);
  console.log(`[ACCOUNTING SYNC] Company ID: ${options.companyId}`);
  
  // PLACEHOLDER: This will be implemented when accounting integration is set up
  
  /*
  switch (options.provider) {
    case "xero":
      return await syncToXero(options);
    case "quickbooks":
      return await syncToQuickBooks(options);
    case "sage":
      return await syncToSage(options);
    default:
      return { success: false, error: "Unsupported provider" };
  }
  */
  
  return {
    success: false,
    error: "Accounting integration not yet configured. Contact support to enable."
  };
}

/**
 * Xero integration (PLACEHOLDER)
 */
async function syncToXero(options: AccountingSyncOptions) {
  // TODO: Implement Xero API integration
  // 1. Get Xero access token
  // 2. Format invoice data for Xero
  // 3. POST to Xero API
  // 4. Store external invoice ID
  return { success: false, error: "Xero integration pending" };
}

/**
 * QuickBooks integration (PLACEHOLDER)
 */
async function syncToQuickBooks(options: AccountingSyncOptions) {
  // TODO: Implement QuickBooks API integration
  return { success: false, error: "QuickBooks integration pending" };
}

/**
 * Sage integration (PLACEHOLDER)
 */
async function syncToSage(options: AccountingSyncOptions) {
  // TODO: Implement Sage API integration
  return { success: false, error: "Sage integration pending" };
}

/**
 * Check if accounting integration is configured
 */
export async function isAccountingConfigured(
  companyId: string,
  provider: "xero" | "quickbooks" | "sage"
): Promise<boolean> {
  // TODO: Check if company has accounting credentials stored
  // For now, return false (not configured)
  return false;
}