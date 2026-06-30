/**
 * notifyInvoicePaid
 *
 * Fire the notifications that a payment was recorded against an
 * invoice/order: the company owner/admin gets "payment received", and the
 * client gets a confirmation that their booking is secure / paid.
 *
 * Best-effort: every step is wrapped so a notification failure can never
 * break the payment recording itself. recipient_id MUST be an auth uid -
 * owner_id (a profiles FK) and the resolveClientUserId result both qualify;
 * orders.client_id (a clients.id FK) does NOT, so the client path always
 * goes through resolveClientUserId.
 *
 */
import { resolveClientUserId } from "@/services/lifecycle/resolveClientUserId";
import { emailService } from "@/services/emailService";

export interface InvoicePaidNotifyInput {
  /** Service-role supabase client (bypasses RLS for the inserts). */
  admin: any;
  companyId: string;
  orderId: string | null;
  invoiceId?: string | null;
  invoiceNumber: string | null;
  clientId: string | null;
  /** Amount just recorded, in major units (rand). */
  amount: number;
  currency?: string | null;
  /** True when this payment settled the invoice in full. */
  fullyPaid: boolean;
  skipOwnerInApp?: boolean;
  skipClientInApp?: boolean;
  skipOwnerEmail?: boolean;
  skipClientEmail?: boolean;
}

function formatMoney(amount: number, currency: string | null | undefined): string {
  const cur = (currency || "ZAR").toUpperCase();
  const prefix = cur === "ZAR" ? "R" : `${cur} `;
  return `${prefix}${Number(amount || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function notifyInvoicePaid(input: InvoicePaidNotifyInput): Promise<void> {
  const {
    admin,
    companyId,
    invoiceId,
    amount,
    currency,
    fullyPaid,
    skipOwnerInApp,
    skipClientInApp,
    skipOwnerEmail,
    skipClientEmail,
  } = input;
  const amountFmt = formatMoney(amount, currency);
  const amountBare = Number(amount || 0).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const isDepositReceipt = !fullyPaid;

  let orderId = input.orderId || null;
  let invoiceNumber = input.invoiceNumber || null;
  let clientId = input.clientId || null;
  let invoiceLink = "";
  let invoiceData: any = {};
  if (invoiceId) {
    try {
      const { data: invoice } = await admin
        .from("invoices")
        .select("id, invoice_number, public_token, order_id, client_id, invoice_data")
        .eq("id", invoiceId)
        .maybeSingle();
      if (invoice) {
        invoiceNumber = invoiceNumber || (invoice as any).invoice_number || null;
        orderId = orderId || (invoice as any).order_id || null;
        clientId = clientId || (invoice as any).client_id || null;
        invoiceData = (invoice as any).invoice_data && typeof (invoice as any).invoice_data === "object"
          ? (invoice as any).invoice_data
          : {};
        const token = (invoice as any).public_token;
        const origin = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
        if (token && origin) invoiceLink = `${origin}/pay/i/${token}`;
      }
    } catch (e) {
      console.warn("[notifyInvoicePaid] invoice lookup failed:", e);
    }
  }

  // Order context for nicer copy and email fallbacks.
  let order: any = null;
  let orderNumber: string | null = null;
  let eventName = String(invoiceData.eventName || invoiceData.event_name || "your event");
  let eventDate = String(invoiceData.eventDate || invoiceData.event_date || "");
  let venue = String(invoiceData.venue || invoiceData.venueAddress || "");
  let clientName = String(invoiceData.clientName || invoiceData.client_name || "there");
  let clientEmail = String(invoiceData.clientEmail || invoiceData.client_email || "");
  if (orderId) {
    try {
      const { data: o } = await admin
        .from("orders")
        .select("order_number, client_name, client_email, event_name, event_date, venue_address")
        .eq("id", orderId)
        .maybeSingle();
      order = o || null;
      orderNumber = (o as any)?.order_number ?? null;
      if ((o as any)?.event_name) eventName = (o as any).event_name;
      if ((o as any)?.event_date) {
        eventDate = new Date((o as any).event_date).toLocaleDateString("en-ZA", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });
      }
      if ((o as any)?.venue_address) venue = (o as any).venue_address;
      if ((o as any)?.client_name) clientName = (o as any).client_name;
      if ((o as any)?.client_email) clientEmail = (o as any).client_email;
    } catch (e) {
      console.warn("[notifyInvoicePaid] order lookup failed:", e);
    }
  }
  void order;

  if (clientId && !clientEmail) {
    try {
      const { data: clientRow } = await admin
        .from("clients")
        .select("email, client_name")
        .eq("id", clientId)
        .maybeSingle();
      if ((clientRow as any)?.email) clientEmail = (clientRow as any).email;
      if ((clientRow as any)?.client_name) clientName = (clientRow as any).client_name;
    } catch (e) {
      console.warn("[notifyInvoicePaid] client lookup failed:", e);
    }
  }

  const ref = invoiceNumber ? `invoice ${invoiceNumber}` : orderNumber ? `order ${orderNumber}` : "an invoice";
  const orderTail = orderNumber ? ` for order ${orderNumber}` : "";

  // Company context for owner in-app and caterer email.
  let ownerId: string | null = null;
  let companyEmail: string | null = null;
  let companyName = "Your caterer";
  try {
    const { data: company } = await admin
      .from("companies")
      .select("owner_id, email, company_name")
      .eq("id", companyId)
      .maybeSingle();
    ownerId = (company as any)?.owner_id || null;
    companyEmail = (company as any)?.email || null;
    companyName = (company as any)?.company_name || companyName;
    if (!companyEmail && ownerId) {
      const { data: ownerProfile } = await admin
        .from("profiles")
        .select("email")
        .eq("id", ownerId)
        .maybeSingle();
      companyEmail = (ownerProfile as any)?.email || null;
    }
  } catch (e) {
    console.warn("[notifyInvoicePaid] company lookup failed:", e);
  }

  // 1. Owner / admin in-app notification.
  if (!skipOwnerInApp) {
    try {
      if (ownerId) {
        await admin.from("notifications").insert([{
          company_id: companyId,
          user_id: ownerId,
          recipient_id: ownerId,
          notification_type: "payment_received",
          title: `Payment received - ${ref}`,
          message: `${amountFmt} recorded${fullyPaid ? " (invoice fully paid)" : " (deposit/part payment)"}${orderTail}.`,
          priority: "high",
        }]);
      } else {
        console.warn(`[notifyInvoicePaid] company ${companyId} has no owner_id; skipping owner notification`);
      }
    } catch (e) {
      console.warn("[notifyInvoicePaid] owner notification failed:", e);
    }
  }

  // 2. Client in-app notification - only when we can resolve an auth uid.
  if (clientId && !skipClientInApp) {
    try {
      const clientUserId = await resolveClientUserId(admin, clientId);
      if (clientUserId) {
        await admin.from("notifications").insert([{
          company_id: companyId,
          user_id: clientUserId,
          recipient_id: clientUserId,
          notification_type: "payment_received",
          title: isDepositReceipt ? "Deposit received" : `Payment received${orderTail}`,
          message: isDepositReceipt
            ? `We received your deposit of ${amountFmt}. Your booking is secure.`
            : fullyPaid
              ? `We received your payment of ${amountFmt}. Your booking is fully paid.`
              : `We received your payment of ${amountFmt}. Thank you.`,
          priority: "high",
          link: orderId ? `/client-portal/billing?orderId=${orderId}` : null,
        }]);
      }
    } catch (e) {
      console.warn("[notifyInvoicePaid] client notification failed:", e);
    }
  }

  // 3. Client email receipt.
  if (clientEmail && !skipClientEmail) {
    try {
      const firstName = String(clientName || "there").trim().split(/\s+/)[0] || "there";
      const template = isDepositReceipt ? "deposit_payment_received" : "balance_payment_received";
      const subject = isDepositReceipt
        ? `Deposit received - your booking is secure`
        : `Payment received - invoice ${invoiceNumber || orderNumber || ""}`.trim();
      const body = isDepositReceipt
        ? `Hi {{first_name}},\n\n` +
          `We received your deposit of {{amount_formatted}} for {{event_name}}.\n\n` +
          `Your booking is secure and your event date is locked in. ` +
          (invoiceLink ? `You can view the updated invoice here: {{invoice_link}}\n\n` : `\n\n`) +
          `Thanks,\n{{tenant_name}}`
        : `Hi {{first_name}},\n\n` +
          `Thanks for your payment of {{amount_formatted}} against invoice {{invoice_number}}.\n\n` +
          (fullyPaid ? `This invoice is now fully paid.\n\n` : ``) +
          (invoiceLink ? `You can view the updated invoice here: {{invoice_link}}\n\n` : ``) +
          `Thanks,\n{{tenant_name}}`;
      await emailService.sendEmail({
        companyId,
        to: clientEmail,
        subject,
        body,
        template,
        variables: {
          first_name: firstName,
          client_name: clientName,
          tenant_name: companyName,
          company_name: companyName,
          event_name: eventName,
          event_date: eventDate,
          venue,
          amount: amountBare,
          amount_formatted: amountFmt,
          invoice_number: invoiceNumber || orderNumber || "",
          order_number: orderNumber || invoiceNumber || "",
          invoice_link: invoiceLink,
          payment_link: invoiceLink,
          clientName,
          companyName,
        },
        orderId: orderId || undefined,
        bypassQuarantine: true,
        _client: admin,
      } as any);
    } catch (e) {
      console.warn("[notifyInvoicePaid] client email failed:", e);
    }
  }

  // 4. Caterer email alert.
  if (companyEmail && !skipOwnerEmail) {
    try {
      const subject = isDepositReceipt
        ? `Deposit received - ${clientName || "client"} booking secure`
        : `Payment received - ${clientName || "client"}`;
      const statusLine = isDepositReceipt
        ? "The booking is now secure."
        : fullyPaid
          ? "The invoice is now fully paid."
          : "A part payment was recorded.";
      const body =
        `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;line-height:1.5;max-width:560px;">` +
        `<h2 style="margin:0 0 12px;">${isDepositReceipt ? "Deposit received" : "Payment received"}</h2>` +
        `<p style="margin:0 0 8px;"><strong>${clientName || "Client"}</strong> paid <strong>${amountFmt}</strong>${invoiceNumber ? ` against invoice <strong>${invoiceNumber}</strong>` : ""}.</p>` +
        `<p style="margin:0 0 8px;">${statusLine}</p>` +
        `<p style="margin:0 0 8px;">Event: ${eventName || "your event"}${eventDate ? `<br/>Date: ${eventDate}` : ""}${venue ? `<br/>Venue: ${venue}` : ""}${orderNumber ? `<br/>Order: ${orderNumber}` : ""}</p>` +
        `</div>`;
      await emailService.sendEmail({
        companyId,
        to: companyEmail,
        subject,
        body,
        orderId: orderId || undefined,
        skipUnsubscribeFooter: true,
        _client: admin,
      } as any);
    } catch (e) {
      console.warn("[notifyInvoicePaid] caterer email failed:", e);
    }
  }
}
