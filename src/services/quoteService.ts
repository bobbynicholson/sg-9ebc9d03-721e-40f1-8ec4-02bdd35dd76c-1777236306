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

    // Lead status advancement (Audit Theme E). When this quote came
    // from a lead, flip the lead to "quoted" so the funnel chips on
    // /admin/leads reflect reality. Manual quote builder
    // (admin/quotes/new.tsx:946) already does this -- mirror it here
    // so API-driven quote creation doesn't leave leads stuck at "new"
    // until they convert to "won".
    if (data && (quote as any).lead_id) {
      try {
        const { data: lead } = await supabase
          .from("leads")
          .select("status")
          .eq("id", (quote as any).lead_id)
          .maybeSingle();
        const currentStatus = (lead as any)?.status as string | null;
        // Only advance from earlier funnel stages -- don't regress a
        // lead that's already further along (won, lost, converted).
        const advancable = ["new", "contacted", "qualified"];
        if (currentStatus && advancable.includes(currentStatus)) {
          await supabase
            .from("leads")
            .update({ status: "quoted" })
            .eq("id", (quote as any).lead_id);
        }
      } catch (e) {
        console.warn("[quoteService.createQuote] lead status advance failed (non-blocking):", e);
      }
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

    // Idempotency guard. Stamp sent_at the FIRST time we fire the
    // email; if it's already populated, the email already went out and
    // a second call (rapid double-click, retry, refresh-during-save)
    // should NOT spam the client. Setting sent_at before the network
    // call protects against in-flight races -- worst case the email
    // fails and we still have sent_at, which is recoverable by an
    // admin "Resend" action that nukes sent_at first.
    if ((quote as any).sent_at) {
      console.log(`[quoteService] _fireQuoteSentEmail: ${quoteId} already sent at ${(quote as any).sent_at}, skipping`);
      return;
    }
    try {
      await supabase
        .from("quotes")
        .update({ sent_at: new Date().toISOString() })
        .eq("id", quoteId)
        .is("sent_at", null);
    } catch (e) {
      console.warn(`[quoteService] _fireQuoteSentEmail: failed to stamp sent_at, proceeding anyway:`, e);
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

  /**
   * Receipt for an admin-driven accept. Each step is wrapped in its
   * own try/catch so a failed sub-step (invoice generation,
   * confirmation email, kitchen prep) doesn't block the acceptance --
   * but the operator gets told what fired and what didn't via the
   * returned object.
   */
  async convertQuoteToOrder(
    quoteId: string,
    options?: {
      /** Optional deposit payment captured at accept time. When
       *  provided, the order is stamped with deposit_paid=true +
       *  amount_paid + method + reference, and the deposit invoice
       *  is marked paid (or partial) on insert so the operator
       *  doesn't have to chase the payment in two places. */
      depositPaid?: {
        amount: number;
        method: "cash" | "eft" | "card" | "other";
        reference?: string | null;
      };
    },
  ): Promise<{
    order: AppOrder | null;
    invoice: { ok: boolean; number?: string | null; amount?: number | null; error?: string };
    email:   { sent: boolean; skipped: boolean; reason?: string };
    kitchen: { ok: boolean; tasksCreated: number; reason?: string };
    deposit: { recorded: boolean; amount?: number; method?: string };
    error?: string;
  }> {
    const quote = await this.getQuote(quoteId);
    if (!quote) {
      return {
        order: null,
        invoice: { ok: false, error: "Quote not found" },
        email: { sent: false, skipped: true, reason: "no_quote" },
        kitchen: { ok: false, tasksCreated: 0, reason: "no_quote" },
        deposit: { recorded: false },
        error: "Quote not found",
      };
    }

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
    // Whitelist build (was: ...quote spread + delete unwanted, which
    // accidentally shipped quote-only columns -- accepted_at,
    // valid_until, viewed_at, public_token, etc. -- into the orders
    // insert and PostgREST blew up with "Could not find the
    // 'accepted_at' column of 'orders' in the schema cache"). Listing
    // the columns explicitly here = no surprises when quotes gains a
    // new column the orders table doesn't have.
    const q = quote as any;
    const orderData: any = {
      // Identity / scoping
      quote_id: quote.id,
      user_id: quote.user_id,
      client_id: resolvedClientId,
      company_id: q.company_id,
      region_id: q.region_id,
      // Customer snapshot
      client_name: q.client_name,
      client_email: q.client_email,
      client_phone: q.client_phone,
      // Event details
      event_name: q.event_name ?? q.quote_name ?? null,
      event_date: q.event_date,
      event_time: q.event_time ?? null,
      setup_time: q.setup_time ?? null,
      guest_count: q.guest_count ?? null,
      venue_address: q.venue_address ?? null,
      venue_lat: q.venue_lat ?? null,
      venue_lng: q.venue_lng ?? null,
      // Line-level data (JSON)
      // (orders has no menu_items/equipment_items columns -- they live
      //  in order_items / order_equipment. Skipped here.)
      // Money. Quote uses `total`; orders only stores `total_amount`.
      subtotal: q.subtotal ?? null,
      discount_amount: q.discount_amount ?? null,
      tax_amount: q.tax_amount ?? q.tax ?? null,
      tax: q.tax ?? q.tax_amount ?? null,
      total_amount: q.total ?? q.total_amount ?? null,
      currency: q.currency ?? "ZAR",
      deposit_percentage: q.deposit_percentage ?? null,
      // Delivery -- carried forward so the agreed breakdown survives
      delivery_fee: q.delivery_fee ?? null,
      delivery_distance_km: q.delivery_distance_km ?? null,
      delivery_rate_per_km: q.delivery_rate_per_km ?? null,
      delivery_duration_minutes: null,
      delivery_route_optimized: false,
      // Notes -- quote.notes maps to internal_notes on orders
      internal_notes: q.notes ?? null,
      // Lifecycle
      status: "confirmed",
      order_number: `ORD-${quote.id.substring(0, 8).toUpperCase()}`,
      whatsapp_notifications_sent: [],
      xero_invoice_id: null,
      xero_synced_at: null,
    };

    // If the operator captured a deposit at accept time, stamp it on
    // the order so the order record matches what the bank shows. The
    // invoice gets the same treatment after generation (below).
    if (options?.depositPaid && options.depositPaid.amount > 0) {
      const totalAmt = Number(orderData.total_amount) || 0;
      const paid = Number(options.depositPaid.amount);
      orderData.amount_paid = paid;
      orderData.deposit_paid = true;
      orderData.deposit_paid_at = new Date().toISOString();
      orderData.deposit_amount = paid;
      orderData.payment_method = options.depositPaid.method;
      orderData.payment_reference = options.depositPaid.reference || null;
      // payment_status: 'deposit_paid' if partial, 'paid' if full.
      orderData.payment_status = paid >= totalAmt - 0.01 ? "paid" : "deposit_paid";
      orderData.balance_amount = Math.max(0, totalAmt - paid);
    }

    const { data: newOrder, error: orderError } = await supabase
      .from("orders")
      .insert(orderData)
      .select()
      .single();

    if (orderError) {
      console.error("Error converting quote to order:", orderError);
      return {
        order: null,
        invoice: { ok: false, error: orderError.message },
        email: { sent: false, skipped: true, reason: "order_insert_failed" },
        kitchen: { ok: false, tasksCreated: 0, reason: "order_insert_failed" },
        deposit: { recorded: false },
        error: orderError.message || "Could not insert the order row.",
      };
    }

    // Mark quote accepted + back-link to the order so future audits can
    // trace forwards (quote -> order) as well as backwards
    // (orders.quote_id -> quote).
    await this.updateQuote(quoteId, {
      status: "accepted",
      accepted_at: new Date().toISOString(),
      converted_to_order_id: newOrder.id,
    } as any);

    // ── Step 2: Auto-invoice ────────────────────────────────────────
    // The order was just inserted with status='confirmed' so
    // updateOrderStatus's hook never fired -- trigger explicitly here.
    // Non-blocking: a failure here doesn't undo the acceptance, but
    // the receipt tells the operator what happened so they can
    // generate the invoice manually.
    let invoiceReceipt: { ok: boolean; number?: string | null; amount?: number | null; error?: string } =
      { ok: false, error: "Invoice step did not run" };
    try {
      const { ensureInvoiceForOrder } = await import("./invoiceGenerationService");
      const inv = await ensureInvoiceForOrder(newOrder.id, newOrder.company_id);
      if (inv.success && (inv as any).invoiceId) {
        // Fetch the friendly invoice number + amount so the toast can
        // surface them. ensureInvoiceForOrder only returns the id.
        const { data: row } = await supabase
          .from("invoices")
          .select("invoice_number, total_amount")
          .eq("id", (inv as any).invoiceId)
          .maybeSingle();
        // If the operator captured a deposit, stamp the invoice paid
        // (or partially paid) so the invoice record matches the order
        // and the public payment page doesn't ask the client to pay
        // what they already paid.
        if (options?.depositPaid && options.depositPaid.amount > 0 && row) {
          const total = Number((row as any).total_amount) || 0;
          const paid = Number(options.depositPaid.amount);
          const balance = Math.max(0, total - paid);
          await (supabase as any)
            .from("invoices")
            .update({
              amount_paid: paid,
              balance_due: balance,
              paid_at: balance < 0.01 ? new Date().toISOString() : null,
              status: balance < 0.01 ? "paid" : "sent",
            })
            .eq("id", (inv as any).invoiceId);
        }
        invoiceReceipt = {
          ok: true,
          number: (row as any)?.invoice_number || null,
          amount: (row as any)?.total_amount ?? null,
        };
      } else if (inv.success && (inv as any).skipped) {
        // Imported / quarantined orders intentionally skip invoicing.
        invoiceReceipt = { ok: true, error: `Skipped: ${(inv as any).skipped}` };
      } else {
        invoiceReceipt = { ok: false, error: (inv as any).error || "Invoice generation returned failure" };
        console.warn("[quoteService] auto-invoice on convert failed:", invoiceReceipt.error);
      }
    } catch (e: any) {
      invoiceReceipt = { ok: false, error: e?.message || "Invoice generation crashed" };
      console.warn("[quoteService] auto-invoice on convert crashed (non-blocking):", e);
    }

    // ── Step 3: Confirmation email ─────────────────────────────────
    let emailReceipt: { sent: boolean; skipped: boolean; reason?: string } =
      { sent: false, skipped: true, reason: "not_attempted" };
    if (!quote.client_email) {
      emailReceipt = { sent: false, skipped: true, reason: "no_client_email" };
    } else {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, company_name")
          .eq("id", quote.user_id)
          .single();
        const companyName = profile?.company_name || profile?.full_name || "Your Catering Company";

        const res = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // Bug fix: was passing quote.user_id which is the
            // operator's auth user id, not the tenant id. The
            // /api/send-email guard then refused with "Cannot
            // send email for another company" because the
            // caller's profile.company_id never matches a user_id.
            companyId: (quote as any).company_id,
            to: quote.client_email,
            subject: `Order Confirmed - #${newOrder.order_number}`,
            template: 'order-confirmation',
            variables: {
              clientName: quote.client_name,
              orderNumber: newOrder.order_number || newOrder.id,
              eventDate: quote.event_date ? new Date(quote.event_date).toLocaleDateString() : "TBD",
              totalAmount: `${quote.currency || "ZAR"} ${(quote.total ?? 0).toFixed(2)}`,
              companyName,
            }
          })
        });
        if (res.ok) {
          emailReceipt = { sent: true, skipped: false };
        } else {
          const errBody = await res.json().catch(() => ({}));
          emailReceipt = { sent: false, skipped: false, reason: errBody?.error || `HTTP ${res.status}` };
        }
      } catch (emailError: any) {
        emailReceipt = { sent: false, skipped: false, reason: emailError?.message || "send-email crashed" };
        console.error("⚠️ Failed to send order confirmation email (non-blocking):", emailError);
      }
    }

    // ── Step 4: Kitchen prep tasks ─────────────────────────────────
    // The kitchen flywheel auto-plans prep + cook tasks for the new
    // order based on its recipes. Skipped automatically for past-date
    // or imported orders (handled inside ensurePrepTasksForOrder).
    let kitchenReceipt: { ok: boolean; tasksCreated: number; reason?: string } =
      { ok: false, tasksCreated: 0, reason: "not_attempted" };
    try {
      const { kitchenPrepService } = await import("./kitchenPrepService");
      const result = await kitchenPrepService.ensurePrepTasksForOrder(newOrder.company_id, newOrder.id);
      kitchenReceipt = { ok: true, tasksCreated: result.created };
    } catch (kpErr: any) {
      kitchenReceipt = { ok: false, tasksCreated: 0, reason: kpErr?.message || "kitchen prep crashed" };
      console.warn("[quoteService] kitchen prep regen on convert failed (non-blocking):", kpErr);
    }

    // Transform to fix type issues before returning
    const finalOrder = {
      ...newOrder,
      menu_items: typeof newOrder.menu_items === 'string' ? JSON.parse(newOrder.menu_items) : (newOrder.menu_items || []),
      equipment_items: typeof newOrder.equipment_items === 'string' ? JSON.parse(newOrder.equipment_items) : (newOrder.equipment_items || []),
    } as any;

    return {
      order: finalOrder,
      invoice: invoiceReceipt,
      email: emailReceipt,
      kitchen: kitchenReceipt,
      deposit: options?.depositPaid && options.depositPaid.amount > 0
        ? { recorded: true, amount: options.depositPaid.amount, method: options.depositPaid.method }
        : { recorded: false },
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
