import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Quote, AppOrder as Order } from "@/types";
import { regionService } from "./regionService";

export const quoteService = {
  async getQuotes(userId: string): Promise<Quote[]> {
    const { data, error } = await supabase
      .from("quotes")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching quotes:", error);
      return [];
    }

    return data || [];
  },

  async getQuote(quoteId: string): Promise<Quote | null> {
    const { data, error } = await supabase
      .from("quotes")
      .select("*")
      .eq("id", quoteId)
      .single();

    if (error) {
      console.error("Error fetching quote:", error);
      return null;
    }

    return data;
  },

  async createQuote(quote: Omit<Quote, "id" | "created_at" | "updated_at">): Promise<Quote | null> {
    const { data, error } = await supabase
      .from("quotes")
      .insert([quote])
      .select()
      .single();

    if (error) {
      console.error("Error creating quote:", error);
      throw error;
    }

    return data;
  },

  async updateQuote(quoteId: string, updates: Partial<Quote>): Promise<Quote | null> {
    const { data, error } = await supabase
      .from("quotes")
      .update(updates)
      .eq("id", quoteId)
      .select()
      .single();

    if (error) {
      console.error("Error updating quote:", error);
      throw error;
    }

    return data;
  },

  async deleteQuote(quoteId: string): Promise<boolean> {
    const { error } = await supabase
      .from("quotes")
      .delete()
      .eq("id", quoteId);

    if (error) {
      console.error("Error deleting quote:", error);
      throw error;
    }

    return true;
  },

  async convertQuoteToOrder(quoteId: string): Promise<Order | null> {
    const quote = await this.getQuote(quoteId);
    if (!quote) return null;

    const orderData = {
      ...quote,
      quote_id: quote.id,
      user_id: quote.user_id,
      client_id: quote.client_id,
      region_id: quote.region_id,
      status: "confirmed", // or 'pending_payment'
      order_number: `ORD-${quote.id.substring(0, 8).toUpperCase()}`,
      // Add default values for new fields
      delivery_distance_km: null,
      delivery_duration_minutes: null,
      delivery_route_optimized: false,
      whatsapp_notifications_sent: [],
      xero_invoice_id: null,
      xero_synced_at: null,
    };

    delete (orderData as any).id;
    delete (orderData as any).created_at;
    delete (orderData as any).updated_at;
    delete (orderData as any).quotes; // remove nested quotes relation if it exists

    const { data: newOrder, error: orderError } = await supabase
      .from("orders")
      .insert(orderData)
      .select()
      .single();

    if (orderError) {
      console.error("Error converting quote to order:", orderError);
      throw orderError;
    }

    await this.updateQuote(quoteId, { status: "accepted", accepted_at: new Date().toISOString() });

    return newOrder;
  }
};
