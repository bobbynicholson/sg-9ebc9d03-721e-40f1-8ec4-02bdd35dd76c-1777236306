/**
 * notifyInvoicePaid
 *
 * Fire the in-app notifications that a payment was recorded against an
 * invoice/order: the company owner/admin gets "payment received", and the
 * client (when we can resolve their auth uid) gets a confirmation that
 * their booking is paid. Mirrors what the PayFast webhook
 * (payment-confirmation.ts) already does for gateway payments, so MANUAL
 * payments (admin "Mark paid" / bulk "Mark all paid") are no longer silent.
 *
 * Best-effort: every step is wrapped so a notification failure can never
 * break the payment recording itself. recipient_id MUST be an auth uid -
 * owner_id (a profiles FK) and the resolveClientUserId result both qualify;
 * orders.client_id (a clients.id FK) does NOT, so the client path always
 * goes through resolveClientUserId.
 *
 * NOTE: this does in-app notifications only. Client email goes through the
 * Resend channel which is not configured in prod yet (see project memory),
 * so we deliberately don't attempt email here - the in-app bell is the
 * reliable surface.
 */
import { resolveClientUserId } from "@/services/lifecycle/resolveClientUserId";

export interface InvoicePaidNotifyInput {
  /** Service-role supabase client (bypasses RLS for the inserts). */
  admin: any;
  companyId: string;
  orderId: string | null;
  invoiceNumber: string | null;
  clientId: string | null;
  /** Amount just recorded, in major units (rand). */
  amount: number;
  currency?: string | null;
  /** True when this payment settled the invoice in full. */
  fullyPaid: boolean;
}

function formatMoney(amount: number, currency: string | null | undefined): string {
  const cur = (currency || "ZAR").toUpperCase();
  const prefix = cur === "ZAR" ? "R" : `${cur} `;
  return `${prefix}${Number(amount || 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function notifyInvoicePaid(input: InvoicePaidNotifyInput): Promise<void> {
  const { admin, companyId, orderId, invoiceNumber, clientId, amount, currency, fullyPaid } = input;
  const amountFmt = formatMoney(amount, currency);

  // Order context for nicer copy (order rows don't carry company_name).
  let orderNumber: string | null = null;
  if (orderId) {
    try {
      const { data: o } = await admin
        .from("orders")
        .select("order_number")
        .eq("id", orderId)
        .maybeSingle();
      orderNumber = (o as any)?.order_number ?? null;
    } catch (e) {
      console.warn("[notifyInvoicePaid] order lookup failed:", e);
    }
  }
  const ref = invoiceNumber ? `invoice ${invoiceNumber}` : orderNumber ? `order ${orderNumber}` : "an invoice";
  const orderTail = orderNumber ? ` for order ${orderNumber}` : "";

  // 1. Owner / admin in-app notification.
  try {
    const { data: company } = await admin
      .from("companies")
      .select("owner_id")
      .eq("id", companyId)
      .maybeSingle();
    const ownerId = (company as any)?.owner_id;
    if (ownerId) {
      await admin.from("notifications").insert([{
        company_id: companyId,
        user_id: ownerId,
        recipient_id: ownerId,
        notification_type: "payment_received",
        title: `Payment received - ${ref}`,
        message: `${amountFmt} recorded${fullyPaid ? " (invoice fully paid)" : " (partial payment)"}${orderTail}.`,
        priority: "high",
      }]);
    } else {
      console.warn(`[notifyInvoicePaid] company ${companyId} has no owner_id; skipping owner notification`);
    }
  } catch (e) {
    console.warn("[notifyInvoicePaid] owner notification failed:", e);
  }

  // 2. Client in-app notification - only when we can resolve an auth uid.
  if (clientId) {
    try {
      const clientUserId = await resolveClientUserId(admin, clientId);
      if (clientUserId) {
        await admin.from("notifications").insert([{
          company_id: companyId,
          user_id: clientUserId,
          recipient_id: clientUserId,
          notification_type: "payment_received",
          title: fullyPaid ? `Payment received${orderTail}` : `Payment received`,
          message: fullyPaid
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
}
