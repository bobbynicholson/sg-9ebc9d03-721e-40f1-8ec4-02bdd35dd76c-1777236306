import { supabase } from "@/integrations/supabase/client";

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

      await supabase
        .from("integrations")
        .upsert({
          user_id: user.user.id,
          integration_type: "whatsapp",
          credentials: {
            phoneNumberId: config.phoneNumberId,
            accessToken: config.accessToken,
            businessAccountId: config.businessAccountId
          },
          is_active: true,
          connected_at: new Date().toISOString()
        });

      return true;
    } catch (error) {
      console.error("Error connecting to WhatsApp:", error);
      return false;
    }
  },

  async disconnectWhatsApp(): Promise<void> {
    const { data: user } = await supabase.auth.getUser();
    if (!user?.user) throw new Error("User not authenticated");

    await supabase
      .from("integrations")
      .update({ is_active: false, disconnected_at: new Date().toISOString() })
      .eq("user_id", user.user.id)
      .eq("integration_type", "whatsapp");
  },

  async sendWhatsAppMessage(message: WhatsAppMessage): Promise<boolean> {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user) throw new Error("User not authenticated");

      const { data: integration } = await supabase
        .from("integrations")
        .select("*")
        .eq("user_id", user.user.id)
        .eq("integration_type", "whatsapp")
        .eq("is_active", true)
        .single();

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

  async sendOrderConfirmation(orderId: string): Promise<boolean> {
    try {
      const { data: order } = await supabase
        .from("orders")
        .select(`
          *,
          profiles:client_id (full_name, phone, email)
        `)
        .eq("id", orderId)
        .single();

      if (!order) {
        throw new Error("Order not found");
      }

      const profile = Array.isArray((order as any).profiles)
        ? (order as any).profiles[0]
        : (order as any).profiles;

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
                `Track your order: ${process.env.NEXT_PUBLIC_APP_URL}/tracking/client?order=${order.id}`
        }
      };

      return await this.sendWhatsAppMessage(message);
    } catch (error) {
      console.error("Error sending order confirmation:", error);
      return false;
    }
  },

  async sendDeliveryUpdate(orderId: string, status: string): Promise<boolean> {
    try {
      const { data: order } = await supabase
        .from("orders")
        .select(`
          *,
          profiles:client_id (full_name, phone, email)
        `)
        .eq("id", orderId)
        .single();

      if (!order) {
        throw new Error("Order not found");
      }

      const profile = Array.isArray((order as any).profiles)
        ? (order as any).profiles[0]
        : (order as any).profiles;

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
                `Track live: ${process.env.NEXT_PUBLIC_APP_URL}/tracking/client?order=${order.id}`
        }
      };

      return await this.sendWhatsAppMessage(message);
    } catch (error) {
      console.error("Error sending delivery update:", error);
      return false;
    }
  },

  async sendPaymentReminder(orderId: string): Promise<boolean> {
    try {
      const { data: order } = await supabase
        .from("orders")
        .select(`
          *,
          profiles:client_id (full_name, phone, email)
        `)
        .eq("id", orderId)
        .single();

      if (!order) {
        throw new Error("Order not found");
      }

      const profile = Array.isArray((order as any).profiles)
        ? (order as any).profiles[0]
        : (order as any).profiles;

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
                `Pay now: ${process.env.NEXT_PUBLIC_APP_URL}/client-portal?order=${order.id}`
        }
      };

      return await this.sendWhatsAppMessage(message);
    } catch (error) {
      console.error("Error sending payment reminder:", error);
      return false;
    }
  },

  async getWhatsAppConnection(): Promise<WhatsAppConfig | null> {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user) return null;

      const { data: integration } = await supabase
        .from("integrations")
        .select("*")
        .eq("user_id", user.user.id)
        .eq("integration_type", "whatsapp")
        .eq("is_active", true)
        .single();

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