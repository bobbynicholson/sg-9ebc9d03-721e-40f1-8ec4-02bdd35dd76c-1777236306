import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Quote, AppOrder } from "@/types";
import { regionService } from "./regionService";
import { emailAutomationService } from "./emailAutomationService";

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

    // ✅ FIX BUG #16.1: Send quote request confirmation to client
    if (data && quote.client_email) {
      try {
        // Get company name from user profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, company_name")
          .eq("id", quote.user_id)
          .single();

        await emailAutomationService.sendQuoteRequestConfirmation(
          quote.client_email,
          quote.client_name,
          profile?.company_name || profile?.full_name || "Your Catering Company",
          data.id
        );
        console.log("✅ Quote request confirmation email sent to:", quote.client_email);
      } catch (emailError) {
        console.error("⚠️ Failed to send quote request confirmation (non-blocking):", emailError);
      }
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

  async convertQuoteToOrder(quoteId: string): Promise<AppOrder | null> {
    const quote = await this.getQuote(quoteId);
    if (!quote) return null;

    const orderData = {
      ...quote,
      quote_id: quote.id,
      user_id: quote.user_id,
      client_id: quote.client_id,
      region_id: quote.region_id,
      status: "confirmed",
      order_number: `ORD-${quote.id.substring(0, 8).toUpperCase()}`,
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
    delete (orderData as any).quotes;

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

    // ✅ FIX BUG #16.2: Send order confirmation after quote acceptance
    if (quote.client_email) {
      try {
        const paymentUrl = `${typeof window !== "undefined" ? window.location.origin : "https://cateringms.com"}/checkout?orderId=${newOrder.id}`;
        
        // Get company name
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, company_name")
          .eq("id", quote.user_id)
          .single();

        await emailAutomationService.sendOrderConfirmationEmail(
          quote.client_email,
          quote.client_name,
          profile?.company_name || profile?.full_name || "Your Catering Company",
          newOrder.order_number || newOrder.id,
          new Date(quote.event_date).toLocaleDateString(),
          `${quote.currency} ${quote.total.toFixed(2)}`,
          `${quote.currency} 0.00`, // Deposit to be paid
          `${quote.currency} ${quote.total.toFixed(2)}`, // Full balance due
          paymentUrl
        );
        console.log("✅ Order confirmation email sent after quote acceptance to:", quote.client_email);
      } catch (emailError) {
        console.error("⚠️ Failed to send order confirmation email (non-blocking):", emailError);
      }
    }

    return newOrder;
  },

  /**
   * Send custom quote to client with pricing details
   * NEW FUNCTION - Completes Bug #16 fix
   */
  async sendQuoteToClient(quoteId: string): Promise<boolean> {
    try {
      const quote = await this.getQuote(quoteId);
      if (!quote) {
        throw new Error("Quote not found");
      }

      if (!quote.client_email) {
        throw new Error("Client email not available");
      }

      // Get company details
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, company_name")
        .eq("id", quote.user_id)
        .single();

      const companyName = profile?.company_name || profile?.full_name || "Your Catering Company";
      const quoteUrl = `${typeof window !== "undefined" ? window.location.origin : "https://cateringms.com"}/client-portal?quoteId=${quoteId}`;

      // TODO: Generate PDF quote and get download URL
      const pdfUrl = undefined; // Will be implemented with PDF generation

      await emailAutomationService.sendCustomQuoteEmail(
        quote.client_email,
        quote.client_name,
        companyName,
        quoteId,
        `${quote.currency} ${quote.total.toFixed(2)}`,
        quoteUrl,
        pdfUrl
      );

      // Update quote status to 'sent'
      await this.updateQuote(quoteId, { 
        status: "sent",
        sent_at: new Date().toISOString()
      });

      console.log("✅ Custom quote email sent to:", quote.client_email);
      return true;
    } catch (error) {
      console.error("⚠️ Failed to send custom quote email:", error);
      return false;
    }
  }
};
