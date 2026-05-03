/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";
import { whatsappIntegrationService } from "./whatsappIntegrationService";
import { notificationService } from "./notificationService";
import { AppOrder, Quote } from "@/types/app";
import { regionService } from "./regionService";
import { lifecycleService } from "./lifecycleService";

export const quoteService = {
  async getQuotes(companyId: string): Promise<Quote[]> {
    const { data, error } = await supabase
      .from("quotes")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
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
      .is("deleted_at", null)
      .single();

    if (error) {
      console.error("Error fetching quote:", error);
      return null;
    }

    return data;
  },

  async createQuote(quote: Quote): Promise<Quote | null> {
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

        const companyName = profile?.company_name || profile?.full_name || "Your Catering Company";

        // ✅ Use API route instead of emailService directly
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId: quote.user_id,
            to: quote.client_email,
            subject: 'Quote Request Confirmation',
            template: 'quote-request-confirmation',
            variables: {
                clientName: quote.client_name,
                companyName: companyName,
                quoteNumber: data.id,
            }
          })
        });
        console.log("✅ Quote request confirmation email sent to:", quote.client_email);
      } catch (emailError) {
        console.error("⚠️ Failed to send quote request confirmation (non-blocking):", emailError);
      }
    }

    return data;
  },

  async updateQuote(quoteId: string, updates: Partial<Quote>): Promise<Quote | null> {
    // Status transition guard rails. The audit (May 2026) flagged
    // that admins could flip a quote from any status to any status
    // with no warning -- e.g. accepted -> draft, which silently
    // discards the client's acceptance signal. We don't block the
    // user (some legitimate edge cases need overrides) but we DO
    // refuse the transitions that have downstream consequences:
    //
    //   - sent -> draft: the client may have already viewed/clicked
    //     the link; reverting to draft is almost always a mistake.
    //   - accepted -> anything except 'accepted' or 'expired':
    //     accepted is a commitment from the client; reverting it
    //     loses the audit trail and orphans the converted order.
    //   - expired -> draft: no real harm but wrong workflow; user
    //     should "duplicate as draft" instead.
    //
    // To override, pass updates with __force_status_change: true (we
    // strip it before the actual update). Used by support tools or
    // admin recovery flows.
    const updatesLoose: any = updates;
    const force: boolean = updatesLoose.__force_status_change === true;
    if (force) {
      delete updatesLoose.__force_status_change;
    }

    if (updates.status && !force) {
      try {
        const { data: current } = await supabase
          .from("quotes")
          .select("status")
          .eq("id", quoteId)
          .maybeSingle();
        const from = (current as any)?.status as string | undefined;
        const to = updates.status as string;
        if (from && from !== to) {
          const protectedFrom: Record<string, string[]> = {
            sent:     ["draft"],
            accepted: ["draft", "sent", "rejected"],
            expired:  ["draft"],
          };
          const blocked = protectedFrom[from] || [];
          if (blocked.includes(to)) {
            const err: any = new Error(
              `Quote status transition blocked: ${from} -> ${to}. ` +
              `Use the "duplicate as draft" action or pass __force_status_change=true if you really meant this.`,
            );
            err.code = "QUOTE_STATUS_TRANSITION_BLOCKED";
            err.from = from;
            err.to = to;
            throw err;
          }
        }
      } catch (e: any) {
        // Re-throw guard errors; suppress only read failures.
        if (e?.code === "QUOTE_STATUS_TRANSITION_BLOCKED") throw e;
        console.warn("[quoteService] guard rail read failed, allowing through:", e);
      }
    }

    // Detect status transitions that need side-effects. The audit
    // (May 2026) found that quotes were sometimes flipped to 'sent' by
    // direct supabase calls in pages/admin/quotes/* that bypassed
    // sendQuoteToClient -- meaning the client email never went out
    // even though the quote was marked as sent. Centralising the
    // "transition to sent" check here means every code path picks up
    // the email automatically.
    let wasTransitioningToSent = false;
    if (updates.status === "sent") {
      try {
        const { data: current } = await supabase
          .from("quotes")
          .select("status")
          .eq("id", quoteId)
          .maybeSingle();
        wasTransitioningToSent = !!current && (current as any).status !== "sent";
      } catch {
        // If we can't read the current row we assume it IS a transition --
        // worst case we send the email twice, vs missing it entirely.
        wasTransitioningToSent = true;
      }
    }

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

    if (wasTransitioningToSent) {
      // Fire-and-forget. We don't want a slow email send to block the
      // UI's "quote saved" toast, and we don't want a failed send to
      // make the user think the quote didn't save.
      void this._fireQuoteSentEmail(quoteId).catch((e) =>
        console.warn("[quoteService] post-update quote-sent email fire failed:", e),
      );
    }

    return data;
  },

  /**
   * Internal: send the "your quote is ready" email to the client.
   * Pulled out of sendQuoteToClient so updateQuote can fire it on the
   * draft->sent transition without duplicating the call. Idempotent
   * to a degree (Resend deduplicates on idempotency keys we don't
   * currently send, so multiple calls = multiple emails -- but the
   * transition guard in updateQuote prevents that in normal use).
   */
  async _fireQuoteSentEmail(quoteId: string): Promise<void> {
    const quote = await this.getQuote(quoteId);
    if (!quote) {
      console.warn(`[quoteService] _fireQuoteSentEmail: quote ${quoteId} not found`);
      return;
    }
    if (!quote.client_email) {
      console.warn(`[quoteService] _fireQuoteSentEmail: quote ${quoteId} has no client_email`);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, company_name")
      .eq("id", quote.user_id)
      .single();
    const companyName =
      profile?.company_name || profile?.full_name || "Your Catering Company";

    await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: quote.user_id,
        to: quote.client_email,
        subject: `Your Quote from ${companyName} is Ready!`,
        template: "custom-quote-ready",
        variables: {
          clientName: quote.client_name,
          companyName: companyName,
          quoteNumber: quoteId,
          totalAmount: `${quote.currency} ${quote.total.toFixed(2)}`,
        },
      }),
    });
  },

  /**
   * Soft-delete (not hard). publicQuoteService + admin lists already
   * filter `deleted_at IS NULL`, so a hard delete would orphan
   * downstream references (orders.quote_id, invoices) and lose the
   * audit trail. Restoring is just clearing deleted_at.
   */
  async deleteQuote(quoteId: string): Promise<boolean> {
    const { error } = await supabase
      .from("quotes")
      .update({ deleted_at: new Date().toISOString() } as any)
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

    // Lifecycle backbone: orders.client_id is NOT NULL on the schema,
    // so we MUST have a client_id before inserting. If this quote came
    // from a lead that was never promoted to a client (the historical
    // common case), promote them now -- creates the clients row,
    // stamps leads.converted_to_client_id, marks lead status='won'.
    // Idempotent so re-acceptance of the same quote is safe.
    const resolvedClientId = await lifecycleService.resolveQuoteClientId({
      id: quote.id,
      client_id: quote.client_id ?? null,
      lead_id: (quote as any).lead_id ?? null,
    });

    // Why "confirmed" and not "pending"? (Audit + Bobby, May 2026)
    //
    // Orders go straight to "confirmed" because acceptance IS the
    // commitment moment -- adding a pending review step here would
    // give the catering team a "back out" lever after the client has
    // psychologically committed, and the quote review already
    // happens BEFORE send.
    //
    // What the team needs instead is a way to handle late changes
    // -- adjusted guest counts, last-minute menu swaps, time / venue
    // tweaks. That's the order amendment workflow, owned by the
    // order_amendment_requests table (migration 20260503170000):
    //
    //   - companies.amendment_cutoff_days controls how close to the
    //     event the client can still request changes (default 3).
    //   - is_order_amendable(order_id) RPC tells the UI whether a
    //     given order is still inside the amendment window.
    //   - Clients submit a structured diff via /api/orders/amendment-request.
    //   - Admin reviews + approves; approval cascades to kitchen
    //     prep regen, shopping list refresh, inventory deduction
    //     diff, and an updated invoice if the total changed.
    //
    // So this code path stays simple: born confirmed, lifecycle
    // continues through preparing -> ready -> in_transit ->
    // delivered -> completed. Amendments live alongside, not in
    // line, with the order itself.
    const orderData = {
      ...quote,
      quote_id: quote.id,
      user_id: quote.user_id,
      client_id: resolvedClientId,
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

    // Mark quote accepted + back-link to the order so future audits can
    // trace forwards (quote -> order) as well as backwards
    // (orders.quote_id -> quote).
    await this.updateQuote(quoteId, {
      status: "accepted",
      accepted_at: new Date().toISOString(),
      converted_to_order_id: newOrder.id,
    } as any);

    // Auto-invoice. The order was just inserted with status='confirmed'
    // so updateOrderStatus's hook never fired -- trigger explicitly
    // here. Idempotent + skips imported orders.
    try {
      const { ensureInvoiceForOrder } = await import("./invoiceGenerationService");
      const inv = await ensureInvoiceForOrder(newOrder.id, newOrder.company_id);
      if (!inv.success) {
        console.warn("[quoteService] auto-invoice on convert failed:", inv.error);
      }
    } catch (e) {
      console.warn("[quoteService] auto-invoice on convert crashed (non-blocking):", e);
    }

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

        const companyName = profile?.company_name || profile?.full_name || "Your Catering Company";

        // ✅ Use API route instead of emailService directly
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyId: quote.user_id,
            to: quote.client_email,
            subject: `Order Confirmed - #${newOrder.order_number}`,
            template: 'order-confirmation',
            variables: {
                clientName: quote.client_name,
                orderNumber: newOrder.order_number || newOrder.id,
                eventDate: new Date(quote.event_date).toLocaleDateString(),
                totalAmount: `${quote.currency} ${quote.total.toFixed(2)}`,
            }
          })
        });
        console.log("✅ Order confirmation email sent after quote acceptance to:", quote.client_email);
      } catch (emailError) {
        console.error("⚠️ Failed to send order confirmation email (non-blocking):", emailError);
      }
    }

    // Transform to fix type issues before returning
    return {
        ...newOrder,
        menu_items: typeof newOrder.menu_items === 'string' ? JSON.parse(newOrder.menu_items) : (newOrder.menu_items || []),
        equipment_items: typeof newOrder.equipment_items === 'string' ? JSON.parse(newOrder.equipment_items) : (newOrder.equipment_items || []),
    };
  },

  /**
   * Explicit "send this quote to the client" action.
   *
   * Now a thin wrapper over updateQuote -- updateQuote detects the
   * draft->sent transition and fires the email itself, so this method
   * just exists for callers that want a single explicit verb. Kept
   * so existing UI buttons (admin Quote list "Send" action, etc.)
   * keep working without refactor.
   */
  async sendQuoteToClient(quoteId: string): Promise<boolean> {
    try {
      const result = await this.updateQuote(quoteId, {
        status: "sent",
        sent_at: new Date().toISOString(),
      });
      return !!result;
    } catch (error) {
      console.error("Failed to send custom quote email:", error);
      return false;
    }
  }
};
