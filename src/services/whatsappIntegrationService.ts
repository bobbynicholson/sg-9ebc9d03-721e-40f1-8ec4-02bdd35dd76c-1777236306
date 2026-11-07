/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import { isCommsAllowed } from "@/services/commsGuardService";
import { buildPayInvoiceUrlServer, mintOrderCustomerLink } from "@/lib/customerLinksServer";

export interface WhatsAppConfig {
  phoneNumberId: string;
  businessAccountId: string;
  connected: boolean;
}

export interface WhatsAppMessage {
  to: string;
  type: "text" | "template";
  text?: {
    body: string;
  };
  template?: {
    name: string;
    language: { code: string };
    components: Array<{
      type: string;
      parameters: Array<{ type: string; text: string }>;
    }>;
  };
}

async function buildCustomerOrderLink(order: any, label: string): Promise<string> {
  return mintOrderCustomerLink({
    sb: supabase as any,
    companyId: order.company_id,
    orderId: order.id,
    label,
  });
}

async function buildOrderPaymentLink(order: any): Promise<string> {
  const portalFallback = `${process.env.NEXT_PUBLIC_APP_URL || "https://cateringms.com"}/c/order/${order.id}`;
  let fallback = portalFallback;
  try {
    fallback = await buildCustomerOrderLink(order, "whatsapp-payment-reminder");
  } catch (e) {
    console.warn("[whatsappIntegrationService] customer order fallback failed:", e);
  }
  try {
    const { data } = await supabase
      .from("invoices")
      .select("public_token")
      .eq("order_id", order.id)
      .is("deleted_at", null)
      .gt("balance_due", 0)
      .neq("status", "paid")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    return buildPayInvoiceUrlServer((data as any)?.public_token) || fallback;
  } catch (e) {
    console.warn("[whatsappIntegrationService] payment link lookup failed:", e);
    return fallback || portalFallback;
  }
}

export const whatsappIntegrationService = {
  async disconnectWhatsApp(): Promise<void> {
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) throw new Error("User not authenticated");

    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.user.id)
      .maybeSingle();
    const companyId = (profile as any)?.company_id || null;
    if (!companyId) return;

    await supabase
      .from("integrations")
      .update({ is_active: false, disconnected_at: new Date().toISOString() } as any)
      .eq("company_id", companyId)
      .eq("integration_type", "whatsapp");
  },

  /**
   * Older automatic send path. Companies now choose what sends on the WhatsApp
   * page, and lib/whatsapp/runAutomations queues only those messages, so this
   * refuses every message. Callers already treat false as "not sent".
   */
  async sendWhatsAppMessage(
    _message: WhatsAppMessage,
    _meta?: { companyId?: string; bypassPause?: boolean },
  ): Promise<boolean> {
    console.log("[whatsapp] send skipped: automatic messages are chosen on the WhatsApp page.");
    return false;
  },

  /**
   * WA-A (task #99, 2026-05-24): asynchronous enqueue path.
   * Writes a row to whatsapp_messages at status='pending' and
   * lets /api/cron/whatsapp-drain pick it up on the next tick.
   *
   * Returns the inserted row id on success, or null when the
   * comms guard refused (recipient on block list, paused, etc).
   * Caller decides whether a null is fatal or just a noop.
   *
   * Use this instead of sendWhatsAppMessage when the caller
   * doesn't need to wait for the gateway response - notification
   * fan-out, after-sales drips, anything that should survive a
   * network blip or a queued retry.
   */
  /**
   * Is WhatsApp actually connected for this tenant?
   *
   * enqueueWhatsAppMessage always writes a pending row and returns an
   * id regardless of connection - the drain cron then soft-no-ops when
   * the tenant has no active integration (sendWhatsAppMessage above,
   * "integration not connected"). So an enqueue "success" does NOT mean
   * the message will ever deliver. UIs that broadcast (e.g. the kitchen
   * prep-list) should call this first so they can warn the operator
   * honestly instead of reporting "Queued N messages" for a channel
   * that will silently drop them.
   */
  async isWhatsAppConnected(companyId: string): Promise<boolean> {
    if (!companyId) return false;
    try {
      const { data, error } = await supabase
        .from("integrations")
        .select("id")
        .eq("company_id", companyId)
        .eq("integration_type", "whatsapp")
        .eq("is_active", true)
        .maybeSingle();
      if (error) {
        console.error("[whatsapp/isWhatsAppConnected] lookup failed:", error);
        return false;
      }
      return !!data;
    } catch (e) {
      console.error("[whatsapp/isWhatsAppConnected] threw:", e);
      return false;
    }
  },

  async enqueueWhatsAppMessage(args: {
    companyId: string;
    recipientPhone: string;
    recipientName?: string | null;
    body: string;
    relatedEntityType?: string | null;
    relatedEntityId?: string | null;
    dedupKey?: string | null;
    enqueuedBy?: string | null;
    /** True only when a person chose to send this, such as a team broadcast. */
    manual?: boolean;
  }): Promise<string | null> {
    try {
      // Automatic messages are chosen on the WhatsApp page and queued by
      // lib/whatsapp/runAutomations. Nothing else may queue one by itself.
      if (!args.manual) return null;
      const guard = await isCommsAllowed({
        companyId: args.companyId,
        channel: "whatsapp",
        phone: args.recipientPhone,
      });
      if (!guard.allowed) {
        console.log(`[whatsapp/enqueue] refused: ${guard.detail || guard.reason}`);
        return null;
      }

      const row = {
        company_id: args.companyId,
        recipient_phone: args.recipientPhone,
        recipient_name: args.recipientName ?? null,
        message_type: "text" as const,
        message_content: args.body,
        status: "pending" as const,
        related_entity_type: args.relatedEntityType ?? null,
        related_entity_id: args.relatedEntityId ?? null,
        dedup_key: args.dedupKey ?? null,
        enqueued_by: args.enqueuedBy ?? null,
      };

      // eslint-disable-next-line no-restricted-syntax -- whatsapp_messages migration (20260524210000) predates types regen
      const { data, error } = await (supabase as any)
        .from("whatsapp_messages")
        .insert(row)
        .select("id")
        .maybeSingle();

      if (error) {
        // Dedup conflict is expected for retries - swallow silently.
        if (String(error.code) === "23505") return null;
        console.error("[whatsapp/enqueue] insert failed:", error);
        return null;
      }
      return (data as { id: string } | null)?.id ?? null;
    } catch (e) {
      console.error("[whatsapp/enqueue] threw:", e);
      return null;
    }
  },

  async sendOrderConfirmation(orderId: string): Promise<boolean> {
    try {
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .select(`
          *,
          clients:client_id (client_name, phone, email)
        `)
        .eq("id", orderId)
        .single();
      if (orderErr) console.error("[whatsappIntegrationService/sendOrderConfirmation] orders lookup failed:", orderErr);

      if (!order) {
        throw new Error("Order not found");
      }

      // Audit (May 2026, Wave 7): orders.client_id references the
      // clients table, NOT profiles - the previous join returned
      // null and every WhatsApp confirmation/update silently exited
      // with "phone not available".
      const profile = Array.isArray((order as any).clients)
        ? (order as any).clients[0]
        : (order as any).clients;

      if (!profile?.phone) {
        console.warn("Customer phone number not available");
        return false;
      }

      const trackingLink = await buildCustomerOrderLink(order, "whatsapp-order-confirmation");
      const message: WhatsAppMessage = {
        to: profile.phone,
        type: "text",
        text: {
          body: `✅ Order Confirmed!\n\n` +
                `Order #${order.id.substring(0, 8).toUpperCase()}\n` +
                `Event Date: ${order.event_date}\n` +
                `Location: ${(order as any).event_location || "TBD"}\n\n` +
                `Thank you for your order! We'll send you updates as your delivery progresses.\n\n` +
                `Track your order: ${trackingLink}`
        }
      };

      return await this.sendWhatsAppMessage(message, { companyId: (order as any).company_id });
    } catch (error) {
      console.error("Error sending order confirmation:", error);
      return false;
    }
  },

  async sendDeliveryUpdate(orderId: string, status: string): Promise<boolean> {
    try {
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .select(`
          *,
          clients:client_id (client_name, phone, email)
        `)
        .eq("id", orderId)
        .single();
      if (orderErr) console.error("[whatsappIntegrationService/sendDeliveryUpdate] orders lookup failed:", orderErr);

      if (!order) {
        throw new Error("Order not found");
      }

      // Audit (May 2026, Wave 7): orders.client_id references the
      // clients table, NOT profiles - the previous join returned
      // null and every WhatsApp confirmation/update silently exited
      // with "phone not available".
      const profile = Array.isArray((order as any).clients)
        ? (order as any).clients[0]
        : (order as any).clients;

      if (!profile?.phone) {
        console.warn("Customer phone number not available");
        return false;
      }

      const statusMessages: Record<string, string> = {
        preparing: "🍳 Your order is being prepared in our kitchen!",
        ready: "✅ Your order is ready for delivery!",
        in_transit: "🚗 Your delivery is on the way!",
        arrived: "📍 Your driver has arrived at the venue!",
        delivered: "✨ Your order has been delivered. Enjoy!"
      };

      const trackingLink = await buildCustomerOrderLink(order, `whatsapp-delivery-${status}`);
      const message: WhatsAppMessage = {
        to: profile.phone,
        type: "text",
        text: {
          body: `${statusMessages[status] || "📦 Order Update"}\n\n` +
                `Order #${order.id.substring(0, 8).toUpperCase()}\n\n` +
                `Track live: ${trackingLink}`
        }
      };

      return await this.sendWhatsAppMessage(message, { companyId: (order as any).company_id });
    } catch (error) {
      console.error("Error sending delivery update:", error);
      return false;
    }
  },

  async sendPaymentReminder(orderId: string): Promise<boolean> {
    try {
      const { data: orderData, error: orderDataErr } = await supabase
        .from("orders")
        .select(`
          *,
          clients:client_id (client_name, phone, email)
        `)
        .eq("id", orderId)
        .single();
      if (orderDataErr) console.error("[whatsappIntegrationService/sendPaymentReminder] orders lookup failed:", orderDataErr);

      if (!orderData) {
        throw new Error("Order not found");
      }

      const order = orderData as any;

      const profile = Array.isArray(order.clients)
        ? order.clients[0]
        : order.clients;

      if (!profile?.phone) {
        console.warn("Customer phone number not available");
        return false;
      }

      const paymentLink = await buildOrderPaymentLink(order);
      const message: WhatsAppMessage = {
        to: profile.phone,
        type: "text",
        text: {
          body: `💳 Payment Reminder\n\n` +
                `Order #${order.id.substring(0, 8).toUpperCase()}\n` +
                `Amount Due: ${order.currency || "R"} ${order.total_amount}\n` +
                `Due Date: ${order.event_date}\n\n` +
                `Please complete your payment to confirm your booking.\n\n` +
                `Pay now: ${paymentLink}`
        }
      };

      return await this.sendWhatsAppMessage(message, { companyId: order.company_id });
    } catch (error) {
      console.error("Error sending payment reminder:", error);
      return false;
    }
  },

  async getWhatsAppConnection(): Promise<WhatsAppConfig | null> {
    try {
      const response = await fetch("/api/admin/whatsapp/settings", { credentials: "same-origin" });
      if (!response.ok) return null;
      const result = await response.json();
      if (!result?.connected || !result.phoneNumberId || !result.businessAccountId) return null;
      return {
        phoneNumberId: String(result.phoneNumberId),
        businessAccountId: String(result.businessAccountId),
        connected: true,
      };
    } catch (error) {
      console.error("Could not check WhatsApp connection status");
      return null;
    }
  }
};
