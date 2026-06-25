/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import { isCommsAllowed } from "@/services/commsGuardService";

export interface WhatsAppConfig {
  phoneNumberId: string;
  accessToken: string;
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

export const whatsappIntegrationService = {
  async connectWhatsApp(config: {
    phoneNumberId: string;
    accessToken: string;
    businessAccountId: string;
  }): Promise<boolean> {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user) throw new Error("User not authenticated");

      const response = await fetch(
        `https://graph.facebook.com/v18.0/${config.phoneNumberId}`,
        {
          headers: {
            Authorization: `Bearer ${config.accessToken}`
          }
        }
      );

      if (!response.ok) {
        throw new Error("Invalid WhatsApp Business credentials");
      }

      // Audit (May 2026, Wave 7): integrations row is now keyed on
      // company_id so EVERY admin on the same tenant resolves the
      // same connection. The previous user_id-only keying meant the
      // connection was visible only to the admin who connected it;
      // a second admin saw "WhatsApp not connected" or, worse, picked
      // up a different user's stale connection.
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.user.id)
        .maybeSingle();
      const companyId = (profile as any)?.company_id || null;
      if (!companyId) {
        throw new Error("Cannot connect WhatsApp: profile has no company_id.");
      }

      await supabase
        .from("integrations")
        .upsert({
          company_id: companyId,
          user_id: user.user.id, // who connected it, for audit
          integration_type: "whatsapp",
          credentials: {
            phoneNumberId: config.phoneNumberId,
            accessToken: config.accessToken,
            businessAccountId: config.businessAccountId
          },
          is_active: true,
          connected_at: new Date().toISOString()
        }, { onConflict: "company_id,integration_type" } as any);

      return true;
    } catch (error) {
      console.error("Error connecting to WhatsApp:", error);
      return false;
    }
  },

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

  async sendWhatsAppMessage(
    message: WhatsAppMessage,
    meta?: { companyId?: string; bypassPause?: boolean },
  ): Promise<boolean> {
    try {
      // Comms guard. Skips the send if the recipient sits on the
      // company block list, or is in import quarantine. Email path is
      // gated centrally in pages/api/send-email.ts; WhatsApp used to
      // skip the gates entirely (Agent 4 audit). Passing `companyId`
      // is what activates the check - callers without it (legacy
      // callers / tests) are not gated, but every production caller
      // in this file passes it.
      if (meta?.companyId) {
        const guard = await isCommsAllowed({
          companyId: meta.companyId,
          channel: "whatsapp",
          phone: message.to,
          bypassPause: meta.bypassPause,
        });
        if (!guard.allowed) {
          console.log(`[whatsapp] send refused: ${guard.detail || guard.reason}`);
          return false;
        }
      }

      // Resolve the tenant's WhatsApp connection. Audit (May 2026,
      // Wave 7): scope by company_id (preferring the meta-passed
      // value, falling back to the caller's profile) instead of
      // user_id so every admin on the same tenant sees the same
      // connection.
      let connectionCompanyId = meta?.companyId || null;
      if (!connectionCompanyId) {
        const { data: user } = await supabase.auth.getUser();
        if (!user?.user) throw new Error("User not authenticated");
        const { data: profile } = await supabase
          .from("profiles")
          .select("company_id")
          .eq("id", user.user.id)
          .maybeSingle();
        connectionCompanyId = (profile as any)?.company_id || null;
      }
      if (!connectionCompanyId) {
        throw new Error("WhatsApp send: company_id could not be resolved.");
      }

      const { data: integration, error: integrationErr } = await supabase
        .from("integrations")
        .select("*")
        .eq("company_id", connectionCompanyId)
        .eq("integration_type", "whatsapp")
        .eq("is_active", true)
        .maybeSingle();
      if (integrationErr) console.error("[whatsappIntegrationService/sendWhatsAppMessage] integrations lookup failed:", integrationErr);

      if (!integration) {
        throw new Error("WhatsApp integration not connected");
      }

      const credentials = integration.credentials as any;

      const response = await fetch(
        `https://graph.facebook.com/v18.0/${credentials.phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: message.to,
            type: message.type,
            ...(message.type === "text" ? { text: message.text } : {}),
            ...(message.type === "template" ? { template: message.template } : {})
          })
        }
      );

      if (!response.ok) {
        throw new Error("Failed to send WhatsApp message");
      }

      return true;
    } catch (error) {
      console.error("Error sending WhatsApp message:", error);
      return false;
    }
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
  async enqueueWhatsAppMessage(args: {
    companyId: string;
    recipientPhone: string;
    recipientName?: string | null;
    body: string;
    relatedEntityType?: string | null;
    relatedEntityId?: string | null;
    dedupKey?: string | null;
    enqueuedBy?: string | null;
  }): Promise<string | null> {
    try {
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

      const message: WhatsAppMessage = {
        to: profile.phone,
        type: "text",
        text: {
          body: `✅ Order Confirmed!\n\n` +
                `Order #${order.id.substring(0, 8).toUpperCase()}\n` +
                `Event Date: ${order.event_date}\n` +
                `Location: ${(order as any).event_location || "TBD"}\n\n` +
                `Thank you for your order! We'll send you updates as your delivery progresses.\n\n` +
                `Track your order: ${process.env.NEXT_PUBLIC_APP_URL}/client-portal/tracking?orderId=${order.id}`
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

      const message: WhatsAppMessage = {
        to: profile.phone,
        type: "text",
        text: {
          body: `${statusMessages[status] || "📦 Order Update"}\n\n` +
                `Order #${order.id.substring(0, 8).toUpperCase()}\n\n` +
                `Track live: ${process.env.NEXT_PUBLIC_APP_URL}/client-portal/tracking?orderId=${order.id}`
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

      const message: WhatsAppMessage = {
        to: profile.phone,
        type: "text",
        text: {
          body: `💳 Payment Reminder\n\n` +
                `Order #${order.id.substring(0, 8).toUpperCase()}\n` +
                `Amount Due: ${order.currency || "R"} ${order.total_amount}\n` +
                `Due Date: ${order.event_date}\n\n` +
                `Please complete your payment to confirm your booking.\n\n` +
                `Pay now: ${process.env.NEXT_PUBLIC_APP_URL}/client-portal/billing?order=${order.id}`
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
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user) return null;

      const { data: integration, error: integrationErr } = await supabase
        .from("integrations")
        .select("*")
        .eq("user_id", user.user.id)
        .eq("integration_type", "whatsapp")
        .eq("is_active", true)
        .single();
      if (integrationErr && (integrationErr as any).code !== "PGRST116") console.error("[whatsappIntegrationService/getWhatsAppConnection] integrations lookup failed:", integrationErr);

      if (!integration) return null;

      const credentials = integration.credentials as any;

      return {
        phoneNumberId: credentials.phoneNumberId,
        accessToken: credentials.accessToken,
        businessAccountId: credentials.businessAccountId,
        connected: integration.is_active
      };
    } catch (error) {
      console.error("Error getting WhatsApp connection:", error);
      return null;
    }
  }
};
