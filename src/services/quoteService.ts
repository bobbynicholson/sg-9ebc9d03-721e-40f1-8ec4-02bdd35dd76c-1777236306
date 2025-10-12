import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { type Order } from "@/services/orderService";

export type Quote = Tables<"quotes">;

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

    const order: Omit<Order, "id" | "created_at" | "updated_at"> = {
      user_id: quote.user_id,
      region_id: quote.region_id,
      quote_id: quoteId,
      order_number: `ORD-${Date.now()}`,
      client_name: quote.client_name,
      client_email: quote.client_email,
      client_phone: quote.client_phone,
      event_date: quote.event_date,
      event_time: quote.event_time,
      venue_address: quote.venue_address,
      venue_lat: null,
      venue_lng: null,
      guest_count: quote.guest_count,
      menu_items: quote.menu_items,
      equipment_items: quote.equipment_items,
      subtotal: quote.subtotal,
      tax: quote.tax,
      total: quote.total,
      currency: quote.currency,
      payment_status: "pending",
      amount_paid: 0,
      status: "confirmed",
      assigned_driver_id: null,
      assigned_chef_id: null,
      delivery_status: "pending",
      pickup_time: null,
      delivery_time: null,
      collection_time: null,
      special_instructions: quote.notes,
      internal_notes: null
    };

    const { data, error } = await supabase
      .from("orders")
      .insert(order) // Correctly pass the single object
      .select()
      .single();

    if (error) {
      console.error("Error converting quote to order:", error);
      throw error;
    }

    await this.updateQuote(quoteId, { status: "accepted", accepted_at: new Date().toISOString() });

    return data;
  }
};
