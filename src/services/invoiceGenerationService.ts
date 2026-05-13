import { supabase as defaultSupabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { PayFastService } from "@/lib/payfastService";
import { resolveClientUserId } from "@/services/lifecycle/resolveClientUserId";
import { notificationService } from "@/services/notificationService";
import { emailService } from "@/services/emailService";
import { resolveEmailTemplate } from "@/services/email/templateResolver";

// Server-safe client injection. Browser callers pass nothing and get
// the global anon-key client (RLS-gated). Server callers (the
// post-order cascade, leads route, future webhooks) inject a
// service-role client so the same code can run without a user
// session. Every supabase call inside this module reads from the
// resolved client below.
type SupabaseLike = typeof defaultSupabase;
const resolveClient = (c?: SupabaseLike): SupabaseLike => (c || defaultSupabase);

// Module-scope alias for the original `supabase` symbol so functions
// that haven't been refactored to accept an injected client (e.g.
// generateInvoicePaymentLink) keep working unchanged.
const supabase = defaultSupabase;

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
  /** When true, the document is titled 'Tax Invoice' and totals
   *  read 'incl. VAT'. SARS rule: only VAT-registered businesses
   *  may issue Tax Invoices. */
  companyVatRegistered?: boolean;
  
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
  companyId: string,
  client?: SupabaseLike,
): Promise<{ success: boolean; data?: InvoiceData; error?: string }> {
  const supabase = resolveClient(client);
  try {
    // 1. Fetch order details
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(`
        *,
        clients (
          client_name,
          email,
          phone,
          billing_address_line1,
          billing_address_line2,
          billing_city,
          billing_postal_code
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
    const invoiceNumber = await getNextInvoiceNumber(companyId, supabase);

    // 4. Calculate financial details
    const orderData = order as any;
    const companyData = company as any;

    // Line items live in order_items, not on the orders row. The
    // earlier path read orderData.menu_items (a column that only
    // exists on quotes) and always produced an empty array, leaving
    // the invoice preview blank with R 0.00 totals. Pull the
    // canonical rows here, falling back to a legacy menu_items JSONB
    // column on the off-chance an old order pre-dates the migration.
    const { data: orderItemsRows, error: orderItemsError } = await supabase
      .from("order_items")
      .select("item_name, description, quantity, unit_price, line_total")
      .eq("order_id", orderId);
    if (orderItemsError) {
      console.warn(
        "[invoiceGenerationService] order_items lookup failed, will fall back:",
        orderItemsError,
      );
    }
    const orderItems = (orderItemsRows || []) as any[];
    let items: Array<{
      description: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }> = orderItems.map((row: any) => {
      const quantity = Number(row.quantity ?? 1) || 1;
      const unitPrice = Number(row.unit_price ?? 0) || 0;
      const lineTotal =
        row.line_total != null
          ? Number(row.line_total)
          : quantity * unitPrice;
      const description =
        [row.item_name, row.description].filter(Boolean).join(" -- ") ||
        row.item_name ||
        "Item";
      return {
        description,
        quantity,
        unitPrice,
        total: lineTotal,
      };
    });

    if (items.length === 0) {
      // Legacy fallback. A handful of imported orders carried their
      // line items in a JSONB menu_items column before the
      // order_items table was the source of truth. Use them only
      // when there's nothing in order_items to avoid double-counting.
      const legacyMenuItems = (orderData.menu_items || []) as any[];
      items = legacyMenuItems.map((item: any) => {
        const quantity = Number(item.quantity ?? 1) || 1;
        const unitPrice = Number(item.unit_price ?? item.price ?? 0) || 0;
        const lineTotal =
          item.total != null ? Number(item.total) : quantity * unitPrice;
        return {
          description: item.name || item.description || "Item",
          quantity,
          unitPrice,
          total: lineTotal,
        };
      });
    }

    // Surface delivery + waiter charges as their own line items so
    // the client can see the breakdown that built the total. They're
    // already rolled into orders.subtotal at confirmation time, so we
    // skip adding them again to the maths -- this is a presentation
    // step, not a totals adjustment.
    const deliveryFee = Number(orderData.delivery_fee || 0);
    if (deliveryFee > 0) {
      // Show the km breakdown only when the saved fee matches the
      // canonical round-trip auto-calc (distance * 2 * rate). When
      // the operator overrode the fee with a flat amount, the km
      // hint is misleading -- collapse to plain "Delivery" so the
      // invoice + the public quote show the same flat figure.
      const dist = Number(orderData.delivery_distance_km) || 0;
      const rate = Number(orderData.delivery_rate_per_km) || 0;
      const roundTrip = dist * 2 * rate;
      const isFlatFee = !dist || Math.abs(deliveryFee - roundTrip) > 0.01;
      items.push({
        description: isFlatFee
          ? "Delivery"
          : `Delivery (${dist.toFixed(1)} km × 2)`,
        quantity: 1,
        unitPrice: deliveryFee,
        total: deliveryFee,
      });
    }
    const waiterFee = Number(orderData.waiter_total_fee || 0);
    if (waiterFee > 0) {
      items.push({
        description: orderData.waiter_duration_hours
          ? `Waiter service (${Number(orderData.waiter_duration_hours).toFixed(1)} hrs)`
          : "Waiter service",
        quantity: 1,
        unitPrice: waiterFee,
        total: waiterFee,
      });
    }

    // Prefer the order's stored subtotal so the invoice agrees with
    // the figure the client signed off on the quote. Fall back to
    // summing the line items if the order row has no subtotal yet
    // (legacy / partial data).
    const computedSubtotal = items.reduce((sum, item) => sum + item.total, 0);
    const storedSubtotal = Number(orderData.subtotal || 0);
    const subtotal =
      storedSubtotal > 0 ? storedSubtotal : computedSubtotal;
    // Resolve VAT through the branch settings resolver so a JHB order
    // honours JHB's vat_rate override instead of falling back to head
    // office. Async fetch happens up front so the rest of the function
    // stays synchronous.
    let taxRatePct: number;
    try {
      const { resolveBranchSettings } = await import("@/services/branchSettingsService");
      const branch = await resolveBranchSettings(
        companyId,
        (orderData.region_id as string | null) ?? null,
      );
      // resolver returns a decimal (0.15); the rest of this function
      // works in percentage points. Honour vat_registered so an
      // unregistered branch generates a 0% VAT invoice even when the
      // company has a rate set.
      taxRatePct = branch.vatRegistered ? Number(branch.vatRate) * 100 : 0;
    } catch (e) {
      console.warn("[invoiceGenerationService] branch resolver failed, falling back to company default:", e);
      // Unit normalisation: companies.vat_rate is stored as percentage
      // points (15.00) but companies.tax_rate / tax_percentage are
      // legacy aliases that may be either decimal (0.15) or % (15).
      // Detect: any value <= 1 is treated as a decimal and lifted to %
      // points; otherwise assumed to be % already. Same shape rule the
      // resolver applies, so we never multiply tax 100x on the catch
      // path. Honour vat_registered if it's set on the company row.
      const rawRate = Number(
        companyData.vat_rate ?? companyData.tax_rate ?? companyData.tax_percentage ?? 15,
      );
      const normalisedPct = rawRate <= 1 ? rawRate * 100 : rawRate;
      const isRegistered = companyData.vat_registered !== false;
      taxRatePct = isRegistered ? normalisedPct : 0;
    }
    const taxRate = taxRatePct;
    // Honour the tenant's pricing convention. In inc-VAT mode the
    // line item totals already include VAT, so we treat `subtotal`
    // (sum of line item totals) as the GROSS and divide back to get
    // the ex-VAT figure that gets shown as the invoice subtotal.
    // In ex-VAT mode (the historic default) VAT is added on top.
    const incVat = (companyData as any)?.pricing_includes_vat === true;
    const rateDecimal = taxRate / 100;
    let invoiceSubtotal: number;
    let taxAmount: number;
    let total: number;
    if (incVat) {
      total = Number(subtotal.toFixed(2));
      invoiceSubtotal = rateDecimal > 0 ? Number((total / (1 + rateDecimal)).toFixed(2)) : total;
      taxAmount = Number((total - invoiceSubtotal).toFixed(2));
    } else {
      invoiceSubtotal = Number(subtotal.toFixed(2));
      taxAmount = Number((invoiceSubtotal * rateDecimal).toFixed(2));
      total = Number((invoiceSubtotal + taxAmount).toFixed(2));
    }
    const depositPaid = orderData.amount_paid || 0;
    const balanceDue = total - depositPaid;

    // 5. Format client details
    const client = (orderData.clients || {}) as any;
    const clientName = client.client_name || "Unknown client";
    const clientAddress = [
      client.billing_address_line1,
      client.billing_address_line2,
      client.billing_city,
      client.billing_postal_code,
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
      companyVatRegistered: !!companyData.vat_registered,
      
      clientName,
      clientEmail: client.email,
      clientPhone: client.phone,
      clientAddress,
      
      orderId: orderData.id,
      // Display-only fallback. The order_number column is now always
      // populated for new orders via consume_next_document_number,
      // so this branch only fires for legacy rows that pre-date the
      // numbering migration.
      orderNumber: orderData.order_number || orderData.id,
      eventDate: orderData.event_date || "",
      eventTime: orderData.event_time || "",
      venue: orderData.venue_name || "",
      guestCount: orderData.guest_count || 0,
      
      items,
      subtotal: invoiceSubtotal,
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
 * Get next invoice number for company.
 *
 * Backed by the per-tenant company_number_settings table + the
 * consume_next_document_number RPC, which atomically returns and
 * advances the sequence. Auto-creates the settings row with sane
 * defaults on first call. Falls back to a timestamp-based number
 * only if the RPC fails outright -- never blocks invoice creation.
 */
async function getNextInvoiceNumber(companyId: string, client?: SupabaseLike): Promise<string> {
  const supabase = resolveClient(client);
  const { data, error } = await (supabase as any).rpc("consume_next_document_number", {
    p_company_id: companyId,
    p_document_type: "invoice",
  });
  if (error || !data) {
    console.error("[invoice-numbering] RPC failed, falling back:", error);
    return `INV-${Date.now().toString().slice(-6)}`;
  }
  return data as string;
}

/**
 * Create invoice record in database
 */
export async function createInvoiceRecord(
  invoiceData: InvoiceData,
  orderId: string,
  companyId: string,
  client?: SupabaseLike,
): Promise<{ success: boolean; invoiceId?: string; error?: string }> {
  const supabase = resolveClient(client);
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
 * Idempotent: ensure an invoice exists for the given order. Used by
 * the order workflow so confirming an order auto-generates its
 * invoice without the admin needing to click "Generate Invoice".
 *
 * Returns the existing invoice's id if one is already on file
 * (so callers don't duplicate invoices). Skips imported orders --
 * they had their financials handled in the prior system.
 */
export async function ensureInvoiceForOrder(
  orderId: string,
  companyId: string,
  client?: SupabaseLike,
  opts?: { origin?: string },
): Promise<{ success: boolean; invoiceId?: string; alreadyExisted?: boolean; skipped?: string; error?: string }> {
  const supabase = resolveClient(client);
  try {
    // 1. Skip if there's already a live invoice for this order.
    const { data: existing } = await supabase
      .from("invoices")
      .select("id")
      .eq("order_id", orderId)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .maybeSingle();
    if (existing?.id) {
      return { success: true, invoiceId: (existing as any).id, alreadyExisted: true };
    }

    // 2. Skip imported / quarantined orders -- their financials are
    // historical and already settled in the prior system.
    const { data: orderRow } = await supabase
      .from("orders")
      .select("imported_at, comms_paused_until")
      .eq("id", orderId)
      .maybeSingle();
    if (orderRow) {
      const importedAt = (orderRow as any).imported_at;
      const paused = (orderRow as any).comms_paused_until;
      if (importedAt || (paused && new Date(paused) > new Date())) {
        return { success: true, skipped: "import_quarantine" };
      }
    }

    // 3. Build + persist.
    const built = await generateInvoiceData(orderId, companyId, supabase);
    if (!built.success || !built.data) {
      return { success: false, error: built.error || "Could not build invoice data" };
    }
    const created = await createInvoiceRecord(built.data, orderId, companyId, supabase);
    if (!created.success) {
      return { success: false, error: created.error };
    }

    // Fire-and-forget accounting sync. Routes to whichever provider
    // the tenant has connected (Xero or QuickBooks). The endpoints
    // short-circuit when nothing's connected, so it's safe to call
    // both speculatively. Server-to-server auth via x-cms-internal:
    // CRON_SECRET. Failures here don't unwind the invoice creation;
    // sync errors are written to invoices.sync_error for the admin
    // dashboard to surface.
    if (created.invoiceId) {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
      const cronSecret = process.env.CRON_SECRET;
      if (cronSecret) {
        // Fire to whichever provider is connected. The endpoint
        // short-circuits with 409 when not connected, which is fine
        // for fire-and-forget. Both endpoints write the external_id
        // back onto invoices, so the next invocation no-ops via the
        // alreadySynced check -- meaning we can't double-sync even
        // if both providers ever became connected at once.
        void fetch(`${baseUrl}/api/accounting/xero/sync-invoice`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-cms-internal": cronSecret },
          body: JSON.stringify({ invoice_id: created.invoiceId }),
        }).catch((e) => console.warn("[ensureInvoiceForOrder] xero sync fire failed:", e));
        void fetch(`${baseUrl}/api/accounting/quickbooks/sync-invoice`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-cms-internal": cronSecret },
          body: JSON.stringify({ invoice_id: created.invoiceId }),
        }).catch((e) => console.warn("[ensureInvoiceForOrder] quickbooks sync fire failed:", e));
      }
    }

    // Client-facing comms. Today an invoice row is inserted but the
    // client only sees it if they proactively open the portal -- the
    // audit flagged this as a silent moment. Push an email + in-app
    // notification with a deep-link to the billing page. Fire-and-
    // forget: a bad email config must never undo the invoice.
    if (created.invoiceId) {
      void notifyClientOfInvoiceIssued(orderId, companyId, created.invoiceId, built.data, supabase, opts?.origin);
    }

    return { success: true, invoiceId: created.invoiceId, alreadyExisted: false };
  } catch (e: any) {
    return { success: false, error: e?.message || "ensureInvoiceForOrder crashed" };
  }
}

/**
 * Email + in-app push to the client when a deposit invoice is issued.
 *
 * Idempotency: skips if a notifications row with notification_type=
 * 'invoice_issued' and related_entity_id=<invoice_id> already exists,
 * so a retry on ensureInvoiceForOrder can't double-notify.
 *
 * Subject line is intentionally generic; Agent C personalises subjects
 * via the central messageTemplates registry separately.
 */
async function notifyClientOfInvoiceIssued(
  orderId: string,
  companyId: string,
  invoiceId: string,
  invoiceData: InvoiceData,
  client?: SupabaseLike,
  originOverride?: string,
): Promise<void> {
  const supabase = resolveClient(client);
  try {
    // Idempotency gate. One client notification per invoice.
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("related_entity_id", invoiceId)
      .eq("notification_type", "invoice_issued")
      .limit(1);
    if (existing && existing.length > 0) return;

    // Pull order + tenant once for the message body.
    const { data: order } = await supabase
      .from("orders")
      .select("id, client_id, client_email, event_name")
      .eq("id", orderId)
      .maybeSingle();

    const { data: company } = await supabase
      .from("companies")
      .select("company_name")
      .eq("id", companyId)
      .maybeSingle();

    const tenantName = (company as any)?.company_name || "Your catering team";
    const eventName =
      (order as any)?.event_name ||
      invoiceData.orderNumber ||
      "your event";
    const amountLabel = `R ${Number(invoiceData.total || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;
    const summary = `${tenantName} issued invoice ${invoiceData.invoiceNumber} for ${eventName}. Total: ${amountLabel}. Pay via the link or EFT.`;
    const portalLink = `/client-portal/billing?invoiceId=${invoiceId}`;

    // 1. In-app notification. resolveClientUserId returns null for
    // un-linked portal-token clients -- skip the in-app push in that
    // case so we don't insert a row no auth user can read.
    try {
      const clientAuthUid = await resolveClientUserId(supabase, (order as any)?.client_id || null);
      if (clientAuthUid) {
        // Pass `supabase` (the resolved client -- could be browser anon
        // or service-role depending on caller context) so the bell row
        // inserts under the right auth surface. Without this, server-
        // context cascades silently dropped the in-app push because the
        // global anon client had no session.
        await notificationService.createNotification({
          company_id: companyId,
          recipient_id: clientAuthUid,
          user_id: clientAuthUid,
          notification_type: "invoice_issued",
          title: "Invoice ready",
          message: summary,
          priority: "normal",
          link: portalLink,
          related_entity_type: "invoice",
          related_entity_id: invoiceId,
        }, supabase);
      }
    } catch (e) {
      console.warn("[notifyClientOfInvoiceIssued] in-app push failed:", e);
    }

    // 2. Email. Mirrors the in-app body so a client who reads either
    // channel gets the same single-line summary + the same deep link.
    try {
      const recipient = invoiceData.clientEmail || (order as any)?.client_email || null;
      if (recipient) {
        // Origin priority: explicit caller override (server context can
        // pass req-derived host) -> NEXT_PUBLIC_APP_URL -> NEXT_PUBLIC_SITE_URL
        // -> empty (relative link). Browser callers leave originOverride
        // unset so existing behaviour is unchanged.
        const baseUrl =
          originOverride ||
          process.env.NEXT_PUBLIC_APP_URL ||
          process.env.NEXT_PUBLIC_SITE_URL ||
          "";
        const origin = baseUrl.startsWith("http") ? baseUrl : (baseUrl ? `https://${baseUrl}` : "");
        const fullLink = origin ? `${origin}${portalLink}` : portalLink;

        // Server-render the invoice PDF and attach it. Mirrors the
        // attachQuotePdf pattern Phase 3D set up for quotes -- older
        // clients expect a saveable document inline. Render is wrapped
        // in its own try / catch so a failure here doesn't block the
        // email; the recipient still gets the link to the billing page.
        const attachments: Array<{ filename: string; content: Buffer; contentType?: string }> = [];
        try {
          const pdfAttachment = await renderInvoicePdfAttachment(invoiceId, companyId, invoiceData, supabase);
          if (pdfAttachment) {
            attachments.push(pdfAttachment);
          }
        } catch (pdfErr: any) {
          console.warn("[notifyClientOfInvoiceIssued] invoice PDF render failed (non-blocking):", pdfErr?.message || pdfErr);
        }

        // Pick deposit_invoice_issued vs balance_invoice_issued based
        // on whether a deposit has already been paid on this order.
        // First invoice (depositPaid = 0) is the deposit invoice; an
        // invoice raised after a deposit landed is the balance.
        // Subject + body resolve through the centralised resolver --
        // tenant override beats global default beats the inline
        // fallback.
        const firstName = String(invoiceData.clientName || "there").split(" ")[0] || "there";
        const isBalance = Number(invoiceData.depositPaid || 0) > 0;
        const templateType = isBalance ? "balance_invoice_issued" : "deposit_invoice_issued";

        const fallbackBody =
          `Hi {{first_name}},\n\n` +
          `{{tenant_name}} issued invoice {{invoice_number}} for {{event_name}}. Total: {{amount}}.\n\n` +
          `Open the invoice: {{invoice_link}}\n\n` +
          `Thanks,\n{{tenant_name}}`;

        const resolved = await resolveEmailTemplate({
          companyId,
          templateType,
          variables: {
            first_name: firstName,
            client_name: invoiceData.clientName,
            tenant_name: tenantName,
            event_name: eventName,
            invoice_number: invoiceData.invoiceNumber,
            amount: amountLabel,
            deposit_amount: isBalance ? "" : amountLabel,
            balance_amount: isBalance ? amountLabel : "",
            invoice_link: fullLink,
          },
          fallback: {
            subject: `Invoice ${invoiceData.invoiceNumber} ready -- ${eventName}`,
            bodyHtml: fallbackBody,
          },
        });

        await emailService.sendEmail({
          companyId,
          to: recipient,
          subject: resolved.subject,
          body: resolved.bodyHtml,
          ...(attachments.length > 0 ? { attachments } : {}),
          // Forward the injected client so emailService can read
          // email_settings + write email_automation_log under the
          // same auth context (service-role from server callers,
          // anon from browser callers).
          _client: supabase,
        } as any);
      }
    } catch (e) {
      console.warn("[notifyClientOfInvoiceIssued] email failed:", e);
    }
  } catch (e) {
    console.warn("[notifyClientOfInvoiceIssued] crashed (non-blocking):", e);
  }
}

/**
 * Hydrate InvoicePdfData from invoices + clients + orders + companies
 * and render to a Buffer suitable for an email attachment. Returns
 * null if the invoice row isn't readable (caller treats that as a
 * non-blocking skip, not an error).
 *
 * Address note: InvoiceDocument expects a single client.address
 * string, so we flatten the billing_* columns here -- the document
 * layer stays decoupled from the clients schema.
 *
 * Cache: keyed on (invoice.updated_at, order.updated_at,
 * company.updated_at) so a second send within 30 minutes reuses the
 * rendered buffer. See pdfCache.ts for the eviction policy.
 */
async function renderInvoicePdfAttachment(
  invoiceId: string,
  companyId: string,
  fallbackData: InvoiceData,
  injectedClient?: SupabaseLike,
): Promise<{ filename: string; content: Buffer; contentType: string } | null> {
  const supabase = resolveClient(injectedClient);
  const { data: invRow } = await supabase
    .from("invoices")
    .select(`
      id, invoice_number, invoice_date, due_date, status,
      subtotal, tax_amount, total_amount, amount_paid, balance_due,
      notes, invoice_data, updated_at,
      client:client_id (
        client_name, email, phone,
        billing_address_line1, billing_address_line2,
        billing_city, billing_postal_code
      ),
      order:order_id (
        id, order_number, event_name, event_date, updated_at
      ),
      company:company_id (
        company_name, legal_name, logo_url, email, phone,
        address_line1, address_line2, city, state_province,
        postal_code, country, primary_color,
        vat_registered, vat_number, vat_rate,
        registration_number, tax_number,
        payment_terms,
        updated_at
      )
    `)
    .eq("id", invoiceId)
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!invRow) {
    console.warn(`[renderInvoicePdfAttachment] invoice ${invoiceId} not found`);
    return null;
  }

  const invAny = invRow as any;
  const client = invAny.client || {};
  const order = invAny.order || {};
  const company = invAny.company || {};

  const clientAddress =
    [
      client.billing_address_line1,
      client.billing_address_line2,
      client.billing_city,
      client.billing_postal_code,
    ]
      .filter(Boolean)
      .join(", ") || fallbackData.clientAddress || null;

  const lineItems = Array.isArray(fallbackData.items)
    ? fallbackData.items.map((it) => ({
        name: it.description || "Item",
        description: null,
        quantity: it.quantity ?? null,
        unit_price: it.unitPrice ?? null,
        total: it.total ?? null,
      }))
    : [];

  const { renderInvoicePdf, sanitiseFilename } = await import("@/services/pdf");
  const pdfBuffer = await renderInvoicePdf(
    {
      invoice_number: invAny.invoice_number,
      invoice_date: invAny.invoice_date,
      due_date: invAny.due_date,
      status: invAny.status,
      client: {
        name: client.client_name || fallbackData.clientName || "",
        email: client.email || fallbackData.clientEmail || null,
        phone: client.phone || fallbackData.clientPhone || null,
        address: clientAddress,
      },
      order_number: order.order_number || fallbackData.orderNumber || null,
      event_name: order.event_name || null,
      event_date: order.event_date || fallbackData.eventDate || null,
      line_items: lineItems,
      subtotal: invAny.subtotal ?? fallbackData.subtotal,
      tax_amount: invAny.tax_amount ?? fallbackData.taxAmount,
      total_amount: Number(invAny.total_amount ?? fallbackData.total ?? 0),
      amount_paid: invAny.amount_paid ?? fallbackData.depositPaid,
      balance_due: invAny.balance_due ?? fallbackData.balanceDue,
      notes: invAny.notes || fallbackData.notes || null,
      payment_terms: company.payment_terms || fallbackData.paymentTerms || null,
      company: {
        company_name: company.company_name,
        legal_name: company.legal_name,
        logo_url: company.logo_url,
        email: company.email,
        phone: company.phone,
        address_line1: company.address_line1,
        address_line2: company.address_line2,
        city: company.city,
        state_province: company.state_province,
        postal_code: company.postal_code,
        country: company.country,
        primary_color: company.primary_color,
        vat_registered: company.vat_registered,
        vat_number: company.vat_number,
        vat_rate: company.vat_rate,
        registration_number: company.registration_number,
        tax_number: company.tax_number,
      },
    },
    {
      cacheKey: {
        invoiceId,
        invoiceUpdatedAt: invAny.updated_at ?? null,
        orderUpdatedAt: order.updated_at ?? null,
        companyUpdatedAt: company.updated_at ?? null,
      },
    },
  );

  return {
    filename: `Invoice-${sanitiseFilename(invAny.invoice_number || invoiceId)}.pdf`,
    content: pdfBuffer,
    contentType: "application/pdf",
  };
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
    // 1. Get invoice with company details. We pull public_token too so
    //    the customer-facing URL is /pay/i/[token] instead of the old
    //    /pay/invoice/[id] form (the id route now 308s to the token
    //    one anyway, but new emails go straight to the canonical URL).
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("*, public_token, companies!inner(*)")
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

    const paymentPageUrl = invoiceData.public_token
      ? `${baseUrl}/pay/i/${invoiceData.public_token}`
      : `${baseUrl}/pay/invoice/${invoiceId}`;

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
  <title>${data.companyVatRegistered ? "Tax Invoice" : "Invoice"} ${data.invoiceNumber}</title>
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
      <h2>${data.companyVatRegistered ? "TAX INVOICE" : "INVOICE"}</h2>
      <div style="margin-top: 10px;">
        <div class="label">${data.companyVatRegistered ? "Tax Invoice Number" : "Invoice Number"}</div>
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
 * Send invoice via email.
 *
 * Routes through /api/send-email (the canonical send pipeline -- auth
 * gates, blocked-contact + paused-comms checks, Resend/SMTP via
 * email_settings, audit row in email_automation_log) and asks the
 * server to attach the rendered Invoice PDF. Subject + body resolve
 * through the central template resolver so a tenant override beats
 * the inline fallback.
 *
 * Old path went to /api/send-invoice-email which was a console.log
 * stub -- the success toast lied. This path actually delivers.
 */
export interface SendInvoiceEmailResult {
  success: boolean;
  error?: string;
  error_code?: string;
  fix_link?: string;
  context?: Record<string, any>;
}

export async function sendInvoiceEmail(
  invoiceData: InvoiceData,
  recipientEmail: string,
  options: {
    invoiceId: string;
    companyId: string;
    /** Optional caller-supplied overrides for review-before-send. */
    subject?: string;
    body?: string;
    cc?: string;
    bcc?: string;
    attachInvoicePdf?: boolean;
  },
): Promise<SendInvoiceEmailResult> {
  try {
    if (!options?.invoiceId || !options?.companyId) {
      return { success: false, error: "invoiceId and companyId are required", error_code: "missing_fields" };
    }
    if (!recipientEmail) {
      return { success: false, error: "Recipient email is missing", error_code: "missing_fields" };
    }

    const firstName = String(invoiceData.clientName || "there").split(" ")[0] || "there";
    const isBalance = Number(invoiceData.depositPaid || 0) > 0;
    // Mirror the auto-issuance flow's template selection so manual
    // sends and auto sends look identical to the client.
    const templateType = isBalance ? "balance_invoice_issued" : "deposit_invoice_issued";
    const amountLabel = `R${Number(invoiceData.balanceDue || invoiceData.total || 0).toFixed(2)}`;
    const eventLabel = (invoiceData as any).eventName || invoiceData.orderNumber || "your event";

    const fallbackBody =
      options.body ||
      `Hi {{first_name}},\n\n` +
      `{{tenant_name}} issued invoice {{invoice_number}} for {{event_name}}. Total: {{amount}}.\n\n` +
      `Open the invoice in your portal to download or pay.\n\n` +
      `Thanks,\n{{tenant_name}}`;

    // When the operator has reviewed + edited the body in the send
    // dialog we DON'T re-resolve the template -- they're sending the
    // exact text they saw. Drop the template so the server uses the
    // body verbatim. Same for the subject.
    const useTemplateLookup = !options.body;

    const response = await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: options.companyId,
        to: recipientEmail,
        subject: options.subject || `Invoice ${invoiceData.invoiceNumber} ready -- ${eventLabel}`,
        body: fallbackBody,
        ...(useTemplateLookup ? { template: templateType } : {}),
        variables: {
          first_name: firstName,
          client_name: invoiceData.clientName,
          tenant_name: invoiceData.companyName,
          event_name: eventLabel,
          invoice_number: invoiceData.invoiceNumber,
          amount: amountLabel,
          deposit_amount: isBalance ? "" : amountLabel,
          balance_amount: isBalance ? amountLabel : "",
        },
        emailType: templateType,
        attachInvoicePdf: options.attachInvoicePdf !== false,
        invoiceId: options.invoiceId,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.success === false) {
      return {
        success: false,
        error: payload?.error || "Failed to send email",
        error_code: payload?.error_code,
        fix_link: payload?.fix_link,
        context: payload?.context,
      };
    }
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error?.message || "Send failed", error_code: "unknown" };
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