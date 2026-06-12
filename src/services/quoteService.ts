/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import { whatsappIntegrationService } from "./whatsappIntegrationService";
import { notificationService } from "./notificationService";
import { AppOrder, Quote } from "@/types/app";
import { regionService } from "./regionService";
import { lifecycleService } from "./lifecycleService";
import { formatQuoteSubject } from "@/lib/email/subjectFormatters";

/**
 * Phase 15 #3: clone an existing quote. Mirrors duplicateOrder
 * (Phase 8 #9). Used for repeat clients (corporate weekly drops,
 * recurring weddings on the same package). Copies the quotes row,
 * mints a new quote_number with a -COPY suffix, resets every
 * lifecycle stamp + token so the clone starts as a fresh draft.
 *
 * Caller passes the new event_date (YYYY-MM-DD) so a duplicate
 * doesn't silently land on the source quote's date and confuse
 * the diary.
 */
export async function duplicateQuote(
  sourceQuoteId: string,
  newEventDate: string,
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    const { data: src, error: readErr } = await supabase
      .from("quotes")
      .select("*")
      .eq("id", sourceQuoteId)
      .is("deleted_at", null)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!src) return { success: false, error: "Source quote not found" };
    const s: any = src;

    // Strip fields that should NOT carry over to the clone.
    const STRIP = new Set([
      "id", "quote_number", "created_at", "updated_at", "deleted_at",
      "sent_at", "viewed_at", "accepted_at", "rejected_at",
      "public_token", "converted_to_order_id", "converted_at",
    ]);
    const clone: any = {};
    for (const [k, v] of Object.entries(s)) {
      if (!STRIP.has(k)) clone[k] = v;
    }
    clone.event_date = newEventDate;
    clone.status = "draft";

    // DB constraint quote_has_lead_or_client requires at least one of
    // lead_id / client_id. Carry both forward from the source so the
    // duplicate is always linkable (same client, same lead pipeline).
    clone.lead_id   = s.lead_id   || null;
    clone.client_id = s.client_id || null;

    // Use the same sequential numbering RPC as createQuote so the
    // duplicate gets the next real number (e.g. QUO-000022) instead
    // of a -COPY-XXXX suffix that pollutes the quote list.
    const cid = s.company_id || s.user_id;
    if (cid) {
      try {
        const { data: numData, error: numErr } = await (supabase as any).rpc(
          "consume_next_document_number",
          { p_company_id: cid, p_document_type: "quote" },
        );
        if (!numErr && numData) {
          clone.quote_number = numData as string;
        } else {
          console.warn("[duplicateQuote] numbering RPC failed:", numErr);
          clone.quote_number = `${(s.quote_number || "QUO")}-COPY`;
        }
      } catch (e) {
        console.warn("[duplicateQuote] numbering RPC threw:", e);
        clone.quote_number = `${(s.quote_number || "QUO")}-COPY`;
      }
    } else {
      clone.quote_number = `${(s.quote_number || "QUO")}-COPY`;
    }

    // Wave 50 C11 - preserve the rebook chain.
    clone.parent_quote_id = sourceQuoteId;

    const { data: inserted, error: insertErr } = await supabase
      .from("quotes")
      .insert(clone)
      .select()
      .single();
    if (insertErr) throw insertErr;
    return { success: true, data: inserted };
  } catch (error: any) {
    console.error("[duplicateQuote] failed:", error);
    return { success: false, error: error?.message || "Duplicate failed" };
  }
}

/**
 * Default soft cap for getQuotes. Phase 6 follow-up audit found this
 * fn previously had no limit / range - on a tenant that has run
 * thousands of quotes the /admin/quotes load was unbounded. Cap at
 * 500 by default; callers needing more pass `{ limit: N }`.
 */
const DEFAULT_QUOTES_LIMIT = 500;

export interface GetQuotesOpts {
  limit?: number;
  offset?: number;
  /**
   * SHAPE-A (task #97, 2026-05-24): light vs heavy payload mode.
   *
   * - "full" (default): every quote column including the heavy
   *   jsonb / long-text fields (menu_items, equipment_items,
   *   addons, notes, terms_and_conditions). The /admin/quotes
   *   list + editor consume these directly.
   * - "light": list-shape columns only. Drops the heavy jsonb /
   *   text fields. For consumers that aggregate / search / display
   *   row-level metadata only (financial-dashboard,
   *   cashflow-dashboard, command-palette, notification copy).
   *
   * On a tenant with detailed quotes the heavy fields can be MB
   * each - "light" typically cuts payload by 80%+.
   */
  mode?: "full" | "light";
}

// SHAPE-A: explicit light-mode select. Lists every base column
// the list page genuinely needs - intentionally omits the heavy
// jsonb / text fields (menu_items, equipment_items, addons,
// notes, terms_and_conditions, custom_message, sales_pitch).
// Adding new light-safe columns: extend this constant and the
// LightQuote type below.
const LIGHT_QUOTE_SELECT = [
  "id", "company_id", "region_id", "quote_number", "quote_name",
  "client_name", "client_email", "client_phone", "contact_name",
  "event_date", "event_time", "event_type", "guest_count",
  "venue_address",
  "status", "source", "tags", "lost_reason",
  "lead_id", "client_id", "parent_quote_id", "prepared_by",
  "subtotal", "tax_amount", "discount_amount", "total_amount",
  "deposit_percentage", "delivery_fee",
  "valid_until", "created_at", "updated_at", "sent_at",
  "accepted_at", "viewed_at", "rejected_at",
  "converted_to_order_id",
  "public_token", "deleted_at",
].join(", ");

export const quoteService = {
  duplicateQuote,
  async getQuotes(companyId: string, opts: GetQuotesOpts = {}): Promise<Quote[]> {
    const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_QUOTES_LIMIT, 2000));
    const offset = Math.max(0, opts.offset ?? 0);
    const mode = opts.mode ?? "full";

    // Two distinct .select() calls so PostgREST's typed parser
    // can statically infer each branch's shape.
    if (mode === "light") {
      const { data, error } = await (supabase as any)
        .from("quotes")
        .select(LIGHT_QUOTE_SELECT)
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        console.error("Error fetching quotes:", error);
        return [];
      }
      return (data || []) as Quote[];
    }

    const { data, error } = await supabase
      .from("quotes")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Error fetching quotes:", error);
      return [];
    }

    return (data || []) as Quote[];
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

  async createQuote(
    quote: Quote,
    options?: { skipClientNotification?: boolean; skipLeadAdvance?: boolean },
  ): Promise<Quote | null> {
    // Per-tenant numbering. Skip the RPC if the caller already supplied
    // a quote_number (e.g. legacy QT-YYYYMMDD-XXXXXX from admin/quotes/
    // new.tsx, or REQ- from the client portal rebook flow). Otherwise
    // pull from consume_next_document_number so every new quote gets a
    // sequential, configurable QUO- number that respects the company's
    // settings.
    if (!(quote as any).quote_number) {
      const cid = (quote as any).company_id || (quote as any).user_id;
      if (cid) {
        try {
          const { data: numData, error: numErr } = await (supabase as any).rpc(
            "consume_next_document_number",
            { p_company_id: cid, p_document_type: "quote" },
          );
          if (!numErr && numData) {
            (quote as any).quote_number = numData as string;
          } else if (numErr) {
            console.warn("[quoteService.createQuote] numbering RPC failed:", numErr);
          }
        } catch (e) {
          console.warn("[quoteService.createQuote] numbering RPC threw:", e);
        }
      }
    }

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
    // (admin/quotes/new.tsx:946) already does this - mirror it here
    // so API-driven quote creation doesn't leave leads stuck at "new"
    // until they convert to "won".
    //
    // Wave 11 #8: admin builder autosaves on empty / R0 quotes used
    // to push leads to 'quoted' on every keystroke. Caller can pass
    // skipLeadAdvance=true to keep the linkage stamped without
    // claiming the lead is qualified yet.
    if (data && (quote as any).lead_id && !options?.skipLeadAdvance) {
      // Atomic advance: a single UPDATE...WHERE status IN (...) avoids the
      // read-then-write race the previous two-query pattern allowed and
      // fails LOUD rather than silently if the policy or constraint
      // rejects the write [P1-02]. We still don't throw - a failed lead
      // status advance shouldn't roll back the quote - but we do surface
      // the row count and any error so a caller / dashboard can spot
      // funnel drift instead of discovering it months later.
      const advancable = ["new", "contacted", "qualified"];
      const { data: updated, error: leadErr, count } = await (supabase as any)
        .from("leads")
        .update({ status: "quoted" })
        .eq("id", (quote as any).lead_id)
        .in("status", advancable)
        .select("id, status", { count: "exact" });
      if (leadErr) {
        // Real DB-level failure (RLS, constraint). Worth flagging.
        console.warn(
          "[quoteService.createQuote] lead status advance DB error:",
          { lead_id: (quote as any).lead_id, error: leadErr.message },
        );
        (data as any)._lead_status_advance_error = leadErr.message;
      } else if ((count || 0) === 0 && Array.isArray(updated) && updated.length === 0) {
        // No-op: lead was already past 'quoted'. Expected for re-quotes
        // and conversion-then-rebook flows. Not an error.
      }
    }

    // ✅ FIX BUG #16.1: Send quote request confirmation to client
    // Wave 11 #9: admin-builder callers (admin/quotes/new persistQuote)
    // route through this path now too. They don't want the
    // "we received your request" email firing on every draft save --
    // that email belongs to the client-initiated flow only. Pass
    // skipClientNotification when the create came from the admin builder.
    if (data && quote.client_email && !options?.skipClientNotification) {
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
            // Template type aligns with the seed [P0-14].
            template: 'quote_request_received',
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
    // with no warning - e.g. accepted -> draft, which silently
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
    // sendQuoteToClient - meaning the client email never went out
    // even though the quote was marked as sent. Centralising the
    // "transition to sent" check here means every code path picks up
    // the email automatically.
    let wasTransitioningToSent = false;
    if (updates.status === "sent") {
      try {
        const { data: current, error: currentErr2 } = await supabase
          .from("quotes")
          .select("status")
          .eq("id", quoteId)
          .maybeSingle();
        if (currentErr2) {
          console.error("[quoteService] quotes fetch failed:", currentErr2);
        }
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

    // Wave 51 - propagate the edit to the linked order + cascade
    // artefacts (kitchen prep, equipment bookings, collection trip,
    // pre-event reminders). Pre-Wave-51 every quote edit drifted
    // silently from its order. The propagation service is best-effort
    // and never throws - the receipt is attached to the returned
    // quote so the caller's toast can surface what changed.
    let propagationReceipt: any = null;
    try {
      const { propagateQuoteEditToOrder } = await import("./quote/propagateQuoteEdit");
      propagationReceipt = await propagateQuoteEditToOrder(quoteId, null);
    } catch (propErr) {
      console.warn("[quoteService] propagateQuoteEditToOrder crashed (non-blocking):", propErr);
    }

    if (propagationReceipt) {
      (data as any)._propagationReceipt = propagationReceipt;
    }

    return data;
  },

  /**
   * Internal: send the "your quote is ready" email to the client.
   * Pulled out of sendQuoteToClient so updateQuote can fire it on the
   * draft->sent transition without duplicating the call. Idempotent
   * to a degree (Resend deduplicates on idempotency keys we don't
   * currently send, so multiple calls = multiple emails - but the
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
    // call protects against in-flight races - worst case the email
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

    const { data: profile, error: profileErr2 } = await supabase
      .from("profiles")
      .select("full_name, company_name")
      .eq("id", quote.user_id)
      .single();
    if (profileErr2) {
      console.error("[quoteService] profiles fetch failed:", profileErr2);
    }
    const companyName =
      profile?.company_name || profile?.full_name || "Your Catering Company";
    // Currency + slug live on companies. Fetch both in one query.
    let currencyCode = "ZAR";
    let companySlug: string | null = null;
    if ((quote as any).company_id) {
      try {
        const { data: companyRow, error: companyRowErr } = await supabase
          .from("companies")
          .select("currency, slug")
          .eq("id", (quote as any).company_id)
          .maybeSingle();
        if (companyRowErr) {
          console.error("[quoteService] companies fetch failed:", companyRowErr);
        }
        if ((companyRow as any)?.currency) currencyCode = (companyRow as any).currency;
        companySlug = (companyRow as any)?.slug ?? null;
      } catch { /* fall back to defaults */ }
    }

    const q = quote as any;
    const eventName: string = q.event_name ?? q.quote_name ?? "";
    const quoteNumber: string = q.quote_number ?? quoteId;
    const clientFullName: string = q.client_name ?? "";
    const firstName: string = clientFullName.split(" ")[0] || clientFullName;
    const { fmtMoney } = await import("@/lib/email/subjectFormatters");
    const totalFormatted = fmtMoney(q.total ?? q.total_amount ?? 0, currencyCode);
    const eventDateFormatted = q.event_date
      ? new Date(q.event_date).toLocaleDateString("en-ZA", {
          day: "numeric", month: "long", year: "numeric",
        })
      : "";

    // Build the public quote link so templates can include {{quote_url}}.
    const appOrigin =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.NEXT_PUBLIC_VERCEL_URL
        ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
        : "");
    const publicToken: string = q.public_token ?? "";
    const quoteUrl = appOrigin && publicToken
      ? companySlug
        ? `${appOrigin}/${companySlug}/q/${publicToken}`
        : `${appOrigin}/q/${publicToken}`
      : "";

    const subject = formatQuoteSubject({
      eventName: eventName || null,
      tenantName: companyName,
      total: typeof quote.total === "number" ? quote.total : null,
      quoteNumber,
      currencyCode,
    });

    await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: quote.user_id,
        to: quote.client_email,
        subject,
        template: "email_quote_sent",
        quoteId,
        // Server-render + attach Quote-{quote_number}.pdf. Older
        // recipients want a saveable document, not just a link to
        // /q/[token]. The link still ships in the email body for the
        // click-through accept flow. PDF render failure is logged and
        // non-blocking on the API side - the email still goes out.
        attachQuotePdf: true,
        variables: {
          // camelCase aliases (legacy callers + some templates)
          clientName:   clientFullName,
          companyName:  companyName,
          quoteNumber:  quoteNumber,
          totalAmount:  totalFormatted,
          quoteUrl:     quoteUrl,
          // snake_case — matches the registry template vars and the
          // email_templates editor placeholder list
          first_name:   firstName,
          client_name:  clientFullName,
          tenant_name:  companyName,
          company_name: companyName,
          from_name:    companyName,
          event_name:   eventName,
          event_date:   eventDateFormatted,
          guest_count:  q.guest_count != null ? String(q.guest_count) : "",
          quote_number: quoteNumber,
          quote_url:    quoteUrl,
          total:        totalFormatted,
          total_zar:    totalFormatted,
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
      /** Set when the operator has acknowledged that the quote has
       *  no client_email and they want to proceed anyway (e.g. cash
       *  walk-in, WhatsApp-only contact). Without this flag,
       *  convertQuoteToOrder refuses to create an order whose
       *  client can't be reached for the deposit invoice + payment
       *  receipt + portal magic-link, all of which key on email.
       *  See audit Sales G8 - silent breakage at the moment that
       *  matters most. */
      allowMissingEmail?: boolean;
      /** Service-role client for server-side callers (API routes, webhooks).
       *  When provided, all DB operations in the function use this client
       *  instead of the module-level anon browser client, so RLS doesn't
       *  block the INSERT into orders from an unauthenticated context. */
      _client?: any;
    },
  ): Promise<{
    order: AppOrder | null;
    invoice: { ok: boolean; number?: string | null; amount?: number | null; error?: string };
    email:   { sent: boolean; skipped: boolean; reason?: string };
    kitchen: { ok: boolean; tasksCreated: number; reason?: string };
    deposit: { recorded: boolean; amount?: number; method?: string };
    error?: string;
    error_code?: string;
  }> {
    // Use the caller-supplied client when available (server-side / API
    // routes pass the service-role client; browser callers fall back to
    // the module-level anon client as before).
    const db: any = options?._client ?? supabase;

    const { data: quote, error: quoteFetchErr } = await db
      .from("quotes")
      .select("*")
      .eq("id", quoteId)
      .is("deleted_at", null)
      .maybeSingle();
    if (quoteFetchErr || !quote) {
      if (quoteFetchErr) console.error("[convertQuoteToOrder] quote fetch failed:", quoteFetchErr);
      return {
        order: null,
        invoice: { ok: false, error: "Quote not found" },
        email: { sent: false, skipped: true, reason: "no_quote" },
        kitchen: { ok: false, tasksCreated: 0, reason: "no_quote" },
        deposit: { recorded: false },
        error: "Quote not found",
      };
    }

    // Gate: refuse to convert a quote with no client_email unless
    // the operator passed allowMissingEmail. Otherwise the order is
    // created, the deposit invoice is generated, and then the email
    // step silently no-ops - client gets a confirmation by nobody
    // and finds out at the venue. Surfaced loudly here so the UI
    // can prompt the operator to add an email (or confirm walk-in).
    const clientEmail = String((quote as any).client_email || "").trim();
    if (!clientEmail && !options?.allowMissingEmail) {
      return {
        order: null,
        invoice: { ok: false, error: "Quote has no client email" },
        email: { sent: false, skipped: true, reason: "no_client_email" },
        kitchen: { ok: false, tasksCreated: 0, reason: "no_client_email" },
        deposit: { recorded: false },
        error:
          "This quote has no client email on file. The deposit invoice, confirmation email and portal magic-link all rely on it. Add an email to the quote, or accept this quote with the walk-in / cash-only override.",
        error_code: "no_client_email",
      };
    }

    // Gate: orders.guest_count is NOT NULL on the schema, but
    // guest_count is optional at quote-draft stage. Converting a
    // no-guest-count quote used to crash the INSERT with a raw
    // `null value in column "guest_count" ... violates not-null
    // constraint` at the worst possible moment - acceptance. Refuse
    // with a fixable message instead; kitchen prep + per-guest
    // pricing both key off this number, so silently defaulting it
    // (e.g. to 0) would corrupt downstream production reports.
    const rawGuestCount = (quote as any).guest_count;
    const resolvedGuestCount = rawGuestCount == null ? null : Number(rawGuestCount);
    if (resolvedGuestCount == null || !Number.isFinite(resolvedGuestCount)) {
      return {
        order: null,
        invoice: { ok: false, error: "Quote has no guest count" },
        email: { sent: false, skipped: true, reason: "no_guest_count" },
        kitchen: { ok: false, tasksCreated: 0, reason: "no_guest_count" },
        deposit: { recorded: false },
        error:
          "This quote has no guest count. Edit the quote, set the number of guests, then convert - kitchen prep and per-guest pricing depend on it.",
        error_code: "no_guest_count",
      };
    }

    // Lifecycle backbone: orders.client_id is NOT NULL on the schema,
    // so we MUST have a client_id before inserting. If this quote came
    // from a lead that was never promoted to a client (the historical
    // common case), promote them now - creates the clients row,
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
    // commitment moment - adding a pending review step here would
    // give the catering team a "back out" lever after the client has
    // psychologically committed, and the quote review already
    // happens BEFORE send.
    //
    // What the team needs instead is a way to handle late changes
    // - adjusted guest counts, last-minute menu swaps, time / venue
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
    // accidentally shipped quote-only columns - accepted_at,
    // valid_until, viewed_at, public_token, etc. - into the orders
    // insert and PostgREST blew up with "Could not find the
    // 'accepted_at' column of 'orders' in the schema cache"). Listing
    // the columns explicitly here = no surprises when quotes gains a
    // new column the orders table doesn't have.
    const q = quote as any;
    // Wave 12 follow-up: currency lives on companies, not quotes.
    // The previous `q.currency ?? "ZAR"` always wrote ZAR for non-ZA
    // tenants because q.currency is undefined. Resolve from the
    // company row up front so orders.currency reflects the tenant's
    // actual setting.
    let resolvedCurrency = "ZAR";
    try {
      const { data: companyRow, error: companyRowErr2 } = await db
        .from("companies")
        .select("currency")
        .eq("id", q.company_id)
        .maybeSingle();
      if (companyRowErr2) {
        console.error("[quoteService] companies fetch failed:", companyRowErr2);
      }
      if ((companyRow as any)?.currency) resolvedCurrency = (companyRow as any).currency;
    } catch { /* fall back to ZAR */ }
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
      guest_count: resolvedGuestCount,
      venue_address: q.venue_address ?? null,
      venue_lat: q.venue_lat ?? null,
      venue_lng: q.venue_lng ?? null,
      // Line-level data (JSON)
      // (orders has no menu_items/equipment_items columns - they live
      //  in order_items / order_equipment. Skipped here.)
      // Money. Quote uses `total`; orders only stores `total_amount`.
      subtotal: q.subtotal ?? null,
      discount_amount: q.discount_amount ?? null,
      tax_amount: q.tax_amount ?? q.tax ?? null,
      tax: q.tax ?? q.tax_amount ?? null,
      total_amount: q.total ?? q.total_amount ?? null,
      currency: resolvedCurrency,
      deposit_percentage: q.deposit_percentage ?? null,
      // Delivery - carried forward so the agreed breakdown survives
      delivery_fee: q.delivery_fee ?? null,
      delivery_distance_km: q.delivery_distance_km ?? null,
      delivery_rate_per_km: q.delivery_rate_per_km ?? null,
      delivery_duration_minutes: null,
      delivery_route_optimized: false,
      // Notes - quote.notes maps to internal_notes on orders
      internal_notes: q.notes ?? null,
      // Lifecycle
      status: "confirmed",
      // Stamp confirmed_at here so downstream tiles (Booked revenue,
      // financial dashboard, dispatch queue gates) treat this order as
      // confirmed from the moment it's created. The orderWorkflow
      // stamp covers later status moves but the initial INSERT was
      // skipping the column, leaving 'confirmed but unstamped' rows.
      confirmed_at: new Date().toISOString(),
      // order_number is assigned inside the convert_quote_to_order RPC
      // via consume_next_document_number(company_id, 'order') so the
      // sequence is atomic and per-tenant-configurable. Anything we
      // pass here is ignored by the RPC.
      whatsapp_notifications_sent: [],
      xero_invoice_id: null,
      xero_synced_at: null,
    };

    // Stamp orders.balance_due_date from companies.balance_due_days.
    // Was previously left null because the only writer
    // (paymentProcessingService.initializePaymentSchedule) is dead
    // code - meaning the per-tenant "balance must clear N days
    // before the event" setting drove nothing. Now that Settings ->
    // Financial persists balance_due_days to the companies column,
    // resolve it here and stamp the date so the balance-reminder
    // cadence + the public PaymentScheduleCard both have something
    // to honour.
    try {
      const { data: companyRow, error: companyRowErr3 } = await db
        .from("companies")
        .select("balance_due_days")
        .eq("id", q.company_id)
        .maybeSingle();
      if (companyRowErr3) {
        console.error("[quoteService] companies fetch failed:", companyRowErr3);
      }
      const days = Number((companyRow as any)?.balance_due_days ?? 7);
      const eventDateStr = (q.event_date as string | null) || null;
      if (eventDateStr && Number.isFinite(days) && days > 0) {
        // Build the date in local terms so a midnight rollover in a
        // distant timezone doesn't swing the due date by a day.
        const ev = new Date(`${eventDateStr}T00:00:00`);
        if (!isNaN(ev.getTime())) {
          ev.setDate(ev.getDate() - Math.floor(days));
          const yyyy = ev.getFullYear();
          const mm = String(ev.getMonth() + 1).padStart(2, "0");
          const dd = String(ev.getDate()).padStart(2, "0");
          orderData.balance_due_date = `${yyyy}-${mm}-${dd}`;
        }
      }
    } catch (e) {
      console.warn("[convertQuoteToOrder] balance_due_date stamp failed:", e);
    }

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
      // payment_status: 'partial' when client has paid part of the
      // total (deposit captured), 'paid' when the deposit covers
      // the full balance. Was previously writing 'deposit_paid'
      // which is NOT a valid payment_status enum value - the
      // convert_quote_to_order RPC blew up with an enum violation
      // on every partial deposit, leaving the operator with a
      // generic "Conversion failed" toast and no order.
      orderData.payment_status = paid >= totalAmt - 0.01 ? "paid" : "partial";
      orderData.balance_amount = Math.max(0, totalAmt - paid);
    }

    // Atomic INSERT orders + UPDATE quotes via a Postgres function so
    // the pair shares one transaction. Previously these were two
    // separate round-trips and a network blip between them left orphan
    // orders with no quote linkage. The RPC locks the quote row,
    // validates it isn't already converted, inserts the order, and
    // back-links the quote - all or nothing. See migration
    // 20260506110000_convert_quote_to_order_function.sql.
    //
    // resolveQuoteClientId stays OUTSIDE the transaction on purpose:
    // it may INSERT a clients row, and we want that committed
    // independently so a later cascade failure doesn't roll back a
    // legitimate new client. The resolved id is folded into the
    // payload below.
    const { data: rpcOrder, error: rpcError } = await db.rpc("convert_quote_to_order", {
      p_quote_id:      quoteId,
      p_company_id:    q.company_id,
      p_actor_user_id: quote.user_id ?? null,
      p_order_payload: orderData,
    });

    if (rpcError || !rpcOrder) {
      console.error("Error converting quote to order:", rpcError);
      const msg = rpcError?.message || "Could not convert the quote (transaction rolled back).";
      return {
        order: null,
        invoice: { ok: false, error: msg },
        email: { sent: false, skipped: true, reason: "conversion_failed" },
        kitchen: { ok: false, tasksCreated: 0, reason: "conversion_failed" },
        deposit: { recorded: false },
        error: msg,
      };
    }

    // The function returns a single orders row. Supabase wraps
    // single-row function returns as either an object or a one-element
    // array depending on the PostgREST version - normalise here.
    const newOrder: any = Array.isArray(rpcOrder) ? rpcOrder[0] : rpcOrder;

    // Wave 50 C10 - carry quotes.source onto orders.lead_source so
    // attribution survives into order analytics. The convert RPC
    // doesn't know about this column yet (signature is fixed); a
    // single follow-up update is the cheapest path. Best-effort.
    if ((q as any).source) {
      try {
        await db
          .from("orders")
          .update({ lead_source: (q as any).source })
          .eq("id", newOrder.id);
      } catch (sourceErr) {
        console.warn("[convertQuoteToOrder] lead_source mirror failed (non-blocking):", sourceErr);
      }
    }

    // ── Steps 2-4: Server-safe cascade ─────────────────────────────
    // The audit consolidated invoice / email / kitchen-prep into one
    // helper so server callers (leads convert-to-order, future
    // webhooks) get the same side effects without re-implementing
    // each branch. Browser callers pass the existing supabase client
    // through; the helper internally falls back to the global anon
    // client when nothing is injected.
    const { postOrderCreationCascade } = await import("./order/postCreationCascade");
    const cascade = await postOrderCreationCascade(
      db,
      newOrder.id,
      newOrder.company_id,
      quote.user_id ?? null,
      {},
    );

    // Map the cascade receipt onto the legacy shape that callers
    // (admin/quotes/[id], rebook flows) already read.
    let invoiceReceipt: { ok: boolean; number?: string | null; amount?: number | null; error?: string };
    if (cascade.invoice.ok && cascade.invoice.invoiceId) {
      // Fetch the friendly invoice number + amount so the toast can
      // surface them. ensureInvoiceForOrder only returns the id.
      const { data: row, error: rowErr } = await db
        .from("invoices")
        .select("invoice_number, total_amount")
        .eq("id", cascade.invoice.invoiceId)
        .maybeSingle();
      if (rowErr) {
        console.error("[quoteService] invoices fetch failed:", rowErr);
      }
      // If the operator captured a deposit, stamp the invoice paid
      // (or partially paid) so the invoice record matches the order
      // and the public payment page doesn't ask the client to pay
      // what they already paid.
      if (options?.depositPaid && options.depositPaid.amount > 0 && row) {
        const total = Number((row as any).total_amount) || 0;
        const paid = Number(options.depositPaid.amount);
        const balance = Math.max(0, total - paid);
        await db
          .from("invoices")
          .update({
            amount_paid: paid,
            balance_due: balance,
            paid_at: balance < 0.01 ? new Date().toISOString() : null,
            status: balance < 0.01 ? "paid" : "sent",
          })
          .eq("id", cascade.invoice.invoiceId);

        // Flow audit Leg C P0-3: when an admin accepts on behalf and
        // captures the deposit at the same time, the order + invoice
        // were stamped with amount_paid but NO row was ever inserted
        // into `payments`. Result: the finance dashboard's payment
        // ledger missed the deposit, the per-client receipt list was
        // empty, and the receivables aging report under-reported
        // collected cash. Best-effort insert here - the cascade is
        // already non-fatal for any single sub-step, so the order
        // still lands cleanly if the payments policy denies the write.
        try {
          const txnId = `accept-${newOrder.id}-deposit`;
          await db.from("payments").insert({
            company_id: newOrder.company_id,
            order_id: newOrder.id,
            invoice_id: cascade.invoice.invoiceId,
            client_id: newOrder.client_id ?? null,
            amount: paid,
            payment_type: "deposit",
            payment_method: options.depositPaid.method,
            payment_reference: options.depositPaid.reference || null,
            transaction_id: txnId,
            payment_status: "completed",
            processed_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
          });
        } catch (e) {
          console.warn("[convertQuoteToOrder] deposit payments insert failed (non-blocking):", e);
        }
      }
      invoiceReceipt = {
        ok: true,
        number: (row as any)?.invoice_number || null,
        amount: (row as any)?.total_amount ?? null,
      };
    } else if (cascade.invoice.ok && (cascade.invoice as any).skipped) {
      invoiceReceipt = { ok: true, error: `Skipped: ${(cascade.invoice as any).skipped}` };
    } else {
      invoiceReceipt = { ok: false, error: cascade.invoice.reason || "Invoice generation returned failure" };
    }

    const emailReceipt: { sent: boolean; skipped: boolean; reason?: string } = {
      sent: !!cascade.email.ok && !cascade.email.skipped,
      skipped: !!cascade.email.skipped,
      reason: cascade.email.reason,
    };

    const kitchenReceipt: { ok: boolean; tasksCreated: number; reason?: string } = {
      ok: cascade.kitchen.ok,
      tasksCreated: cascade.kitchen.tasksCreated ?? 0,
      reason: cascade.kitchen.reason,
    };

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
   * Now a thin wrapper over updateQuote - updateQuote detects the
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
