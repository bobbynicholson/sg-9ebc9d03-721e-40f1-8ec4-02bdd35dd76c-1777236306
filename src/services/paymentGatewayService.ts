/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type PaymentGateway = Database["public"]["Tables"]["payment_gateways"]["Row"];
type PaymentGatewayInsert = Database["public"]["Tables"]["payment_gateways"]["Insert"];

export const paymentGatewayService = {
  async getPaymentGateways(userId: string): Promise<PaymentGateway[]> {
    const { data, error } = await supabase
      .from("payment_gateways")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching payment gateways:", error);
      return [];
    }

    return data || [];
  },

  async getActiveGateways(userId: string): Promise<PaymentGateway[]> {
    const { data, error } = await supabase
      .from("payment_gateways")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("gateway_name");

    if (error) {
      console.error("Error fetching active payment gateways:", error);
      return [];
    }

    return data || [];
  },

  async createPaymentGateway(gateway: PaymentGatewayInsert): Promise<PaymentGateway | null> {
    const { data, error } = await supabase
      .from("payment_gateways")
      .insert([gateway])
      .select()
      .single();

    if (error) {
      console.error("Error creating payment gateway:", error);
      throw error;
    }

    return data;
  },

  async updatePaymentGateway(gatewayId: string, updates: Partial<PaymentGateway>): Promise<PaymentGateway | null> {
    const { data, error } = await supabase
      .from("payment_gateways")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", gatewayId)
      .select()
      .single();

    if (error) {
      console.error("Error updating payment gateway:", error);
      throw error;
    }

    return data;
  },

  async toggleGatewayStatus(gatewayId: string, isActive: boolean): Promise<PaymentGateway | null> {
    const { data, error } = await supabase
      .from("payment_gateways")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", gatewayId)
      .select()
      .single();

    if (error) {
      console.error("Error toggling gateway status:", error);
      throw error;
    }

    return data;
  },

  async deletePaymentGateway(gatewayId: string): Promise<boolean> {
    const { error } = await supabase
      .from("payment_gateways")
      .delete()
      .eq("id", gatewayId);

    if (error) {
      console.error("Error deleting payment gateway:", error);
      throw error;
    }

    return true;
  },

  getSupportedGateways() {
    return [
      {
        id: "payfast",
        name: "PayFast",
        type: "south_africa",
        description: "South African payment gateway supporting credit cards, EFT, and instant EFT",
        currencies: ["ZAR"],
        testMode: true
      },
      {
        id: "paygate",
        name: "PayGate",
        type: "south_africa",
        description: "Leading South African payment gateway with multiple payment options",
        currencies: ["ZAR"],
        testMode: true
      },
      {
        id: "ozow",
        name: "Ozow",
        type: "south_africa",
        description: "Instant EFT payments in South Africa",
        currencies: ["ZAR"],
        testMode: true
      },
      {
        id: "stripe",
        name: "Stripe",
        type: "international",
        description: "Global payment platform supporting 135+ currencies",
        currencies: ["USD", "EUR", "GBP", "ZAR", "AUD", "CAD"],
        testMode: true
      },
      {
        id: "paypal",
        name: "PayPal",
        type: "international",
        description: "Trusted global payment solution",
        currencies: ["USD", "EUR", "GBP", "ZAR", "AUD", "CAD"],
        testMode: true
      },
      {
        id: "square",
        name: "Square",
        type: "international",
        description: "Payment processing for businesses worldwide",
        currencies: ["USD", "CAD", "AUD", "GBP", "EUR"],
        testMode: true
      }
    ];
  }
};
