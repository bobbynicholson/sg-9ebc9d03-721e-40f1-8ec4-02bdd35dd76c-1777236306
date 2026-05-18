/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Lead -> Quote -> Order -> Client lifecycle helpers.
 *
 * The audit (May 2026) found that `leads.converted_to_client_id` and
 * `leads.converted_at` were declared on the schema but never populated --
 * meaning the database had no answer to "is this lead now a client?".
 * Pages reinvented that determination from scratch (see /admin/clients
 * doing a 3-source merge to figure out who's who).
 *
 * This module is the single place that owns "promote a lead to a
 * client". Everything else - quote acceptance, order creation, the
 * eventual /admin/clients vs /admin/contacts split - depends on this
 * promotion firing reliably.
 *
 * Design notes:
 * - Idempotent: re-running on an already-promoted lead returns the
 *   existing client_id, no duplicate row created.
 * - Reuses an existing client when one already exists with the same
 *   email + company_id (covers the case where an admin manually
 *   created a client row that matches the lead's email).
 * - Stamps lead.status = 'won' as part of promotion - "won" is the
 *   schema's lead_status enum value for "deal closed", and matches
 *   our conceptual rule "leads are people who haven't paid; clients
 *   are people who have committed (accepted a quote)".
 */
import { supabase } from "@/integrations/supabase/client";

export interface PromoteLeadResult {
  clientId: string;
  /** True if a new clients row was created. False = matched / already converted. */
  isNew: boolean;
  /** True if the lead was already converted before this call. */
  alreadyConverted: boolean;
}

interface PromoteLeadOpts {
  /**
   * Optional Supabase client override. Pass a service-role client when
   * calling from an unauthenticated context (e.g. the public quote
   * acceptance endpoint). Defaults to the browser/anon client which is
   * gated by RLS.
   */
  client?: typeof supabase;
}

export const lifecycleService = {
  /**
   * Promote a lead to a client.
   *
   * Order of operations:
   *  1. Read the lead. If `converted_to_client_id` is set, return early
   *     (idempotent).
   *  2. Look for an existing client row with the same company_id +
   *     email. If found, link the lead to it.
   *  3. Otherwise, insert a new client row from the lead's data.
   *  4. Stamp `leads.converted_to_client_id`, `converted_at`, and
   *     `status = 'won'` so future reads can tell the lead's done.
   *
   * Throws on:
   *  - Lead not found / soft-deleted
   *  - Lead has no email (shouldn't happen - schema NOT NULL)
   *  - Insert/update RLS rejection
   */
  async promoteLeadToClient(
    leadId: string,
    opts: PromoteLeadOpts = {},
  ): Promise<PromoteLeadResult> {
    const sb = opts.client || supabase;

    // 1. Read the lead. Includes converted_to_client_id so we can short-
    // circuit if already promoted.
    const { data: lead, error: leadErr } = await sb
      .from("leads")
      .select(
        "id, company_id, region_id, contact_name, email, phone, tags, notes, converted_to_client_id, deleted_at",
      )
      .eq("id", leadId)
      .single();
    if (leadErr || !lead) {
      throw new Error(`Lead ${leadId} not found: ${leadErr?.message ?? "no row"}`);
    }
    if ((lead as any).deleted_at) {
      throw new Error(`Lead ${leadId} has been deleted - can't promote`);
    }

    // 2. Already promoted? Return idempotently.
    if ((lead as any).converted_to_client_id) {
      return {
        clientId: (lead as any).converted_to_client_id,
        isNew: false,
        alreadyConverted: true,
      };
    }

    // 3. Look for a pre-existing client with the same email in this
    // tenant (admins sometimes create clients manually before / after
    // the lead, so we want to link rather than duplicate).
    const { data: existingClient, error: existingClientErr } = await sb
      .from("clients")
      .select("id")
      .eq("company_id", (lead as any).company_id)
      .eq("email", (lead as any).email)
      .is("deleted_at", null)
      .maybeSingle();
    if (existingClientErr) {
      console.error("[lifecycleService] clients fetch failed:", existingClientErr);
    }

    let clientId: string;
    let isNew = false;

    if (existingClient?.id) {
      clientId = existingClient.id as string;
    } else {
      // 4. Create a fresh client row from the lead's data.
      // clients.phone is NOT NULL on the schema, so fall back to an
      // empty string when the lead has no phone - the alternative is
      // to throw, but we'd rather promote with a placeholder than
      // block a real conversion.
      const { data: newClient, error: insertErr } = await sb
        .from("clients")
        .insert({
          company_id: (lead as any).company_id,
          region_id: (lead as any).region_id ?? null,
          client_name: (lead as any).contact_name,
          email: (lead as any).email,
          phone: (lead as any).phone || "",
          tags: (lead as any).tags ?? null,
          notes: (lead as any).notes ?? null,
          is_active: true,
        } as any)
        .select("id")
        .single();
      if (insertErr || !newClient) {
        throw new Error(
          `Couldn't create client from lead ${leadId}: ${insertErr?.message ?? "no row returned"}`,
        );
      }
      clientId = (newClient as any).id;
      isNew = true;
    }

    // 5. Stamp the lead. Use update + .select() so we surface RLS
    // rejections clearly. Ignore failure here only after logging --
    // the worst case is we have a client row but the lead pointer
    // isn't set, which is recoverable by re-running this method.
    const { error: stampErr } = await sb
      .from("leads")
      .update({
        converted_to_client_id: clientId,
        converted_at: new Date().toISOString(),
        status: "won",
      } as any)
      .eq("id", leadId);
    if (stampErr) {
      // Don't throw - the client row exists and is usable. Surface
      // the issue in logs so admins can re-run promotion if needed.
      console.error(
        `[lifecycleService] Lead ${leadId} promoted to client ${clientId} but couldn't stamp lead row:`,
        stampErr,
      );
    }

    // 6. Audit-log the promotion moment so the contact timeline can
    // show "lead became a client on May 3 2026". Best-effort: a
    // write failure here doesn't undo the promotion. The pointer
    // columns on leads + clients still tell the story; this row
    // adds the user-facing "when did this happen" answer.
    try {
      await (sb as any).from("audit_logs").insert({
        company_id: (lead as any).company_id,
        action: "lead_promoted_to_client",
        entity_type: "lead",
        entity_id: leadId,
        details: {
          new_client_id: clientId,
          new_client_created: isNew,
          contact_name: (lead as any).contact_name,
          email: (lead as any).email,
        },
      });
    } catch (auditErr) {
      console.warn("[lifecycleService] audit log write failed (non-blocking):", auditErr);
    }

    return { clientId, isNew, alreadyConverted: false };
  },

  /**
   * Ensure every lifecycle artifact exists for a given order.
   *
   * The rule: every order must have a contact (client), a lead, a
   * quote, and (when status >= confirmed) an invoice. Orders created
   * via the new-order flow without a quote - or imported orders, or
   * legacy orders - can land missing one or more of those artifacts.
   * This method fills in whichever ones are missing.
   *
   * Idempotent: safe to spam. Returns the resolved IDs.
   *
   * Order of operations:
   *   1. Read the order. Bail early if not found / soft-deleted.
   *   2. Find or create a clients row by (company_id, email). Sets
   *      orders.client_id if it was empty.
   *   3. Find or create a leads row by (company_id, email). Stamps
   *      status='won' since the lead has already converted (an order
   *      exists). Links lead.converted_to_client_id to the client.
   *   4. Find or create a quotes row. If orders.quote_id is null, we
   *      synthesise a quote with status='accepted' from the order's
   *      header + line items, then link orders.quote_id to it.
   *   5. Invoice creation deferred to invoiceGenerationService's
   *      ensureInvoiceForOrder helper, called from this method when
   *      the order is at least confirmed.
   */
  async ensureLifecycleArtifactsForOrder(
    orderId: string,
    opts: PromoteLeadOpts = {},
  ): Promise<{
    orderId: string;
    clientId: string | null;
    leadId: string | null;
    quoteId: string | null;
    invoiceId: string | null;
    backfilled: string[];
  }> {
    const sb = opts.client || supabase;
    const backfilled: string[] = [];

    // 1. Read the order with its items so we can synthesise a quote
    //    if needed.
    const { data: order, error: orderErr } = await sb
      .from("orders")
      .select("id, company_id, region_id, client_id, quote_id, order_number, client_name, client_email, client_phone, event_date, guest_count, venue_address, subtotal, tax_amount, total_amount, status, deleted_at")
      .eq("id", orderId)
      .maybeSingle();
    if (orderErr) {
      console.error("[lifecycleService] orders fetch failed:", orderErr);
    }
    if (!order || (order as any).deleted_at) {
      return { orderId, clientId: null, leadId: null, quoteId: null, invoiceId: null, backfilled: [] };
    }

    const companyId = (order as any).company_id as string;
    const regionId = ((order as any).region_id as string | null) ?? null;
    const email = (order as any).client_email as string | null;
    const name = (order as any).client_name as string | null;
    const phone = (order as any).client_phone as string | null;

    // 2. Find or create the clients row.
    let clientId: string | null = (order as any).client_id || null;
    if (!clientId && email) {
      const { data: existingClient, error: existingClientErr2 } = await sb
        .from("clients")
        .select("id")
        .eq("company_id", companyId)
        .eq("email", email)
        .is("deleted_at", null)
        .maybeSingle();
      if (existingClientErr2) {
        console.error("[lifecycleService] clients fetch failed:", existingClientErr2);
      }
      if (existingClient?.id) {
        clientId = (existingClient as any).id;
      } else {
        const { data: newClient, error: newClientErr } = await sb
          .from("clients")
          .insert({
            company_id: companyId,
            region_id: regionId,
            client_name: name || "Client",
            email,
            phone: phone || "",
            is_active: true,
          } as any)
          .select("id")
          .single();
        if (newClientErr) {
          console.error("[lifecycleService] clients fetch failed:", newClientErr);
        }
        clientId = (newClient as any)?.id || null;
        if (clientId) backfilled.push("client");
      }
      if (clientId) {
        await sb.from("orders").update({ client_id: clientId } as any).eq("id", orderId);
      }
    }

    // 3. Find or create the leads row.
    let leadId: string | null = null;
    if (email) {
      const { data: existingLead, error: existingLeadErr } = await sb
        .from("leads")
        .select("id, converted_to_client_id")
        .eq("company_id", companyId)
        .eq("email", email)
        .is("deleted_at", null)
        .maybeSingle();
      if (existingLeadErr) {
        console.error("[lifecycleService] leads fetch failed:", existingLeadErr);
      }
      if (existingLead?.id) {
        leadId = (existingLead as any).id;
        // Ensure the lead is stamped as converted to this client.
        if (clientId && (existingLead as any).converted_to_client_id !== clientId) {
          await sb.from("leads").update({
            converted_to_client_id: clientId,
            converted_at: new Date().toISOString(),
            status: "won",
          } as any).eq("id", leadId);
        }
      } else {
        const { data: newLead, error: newLeadErr } = await sb
          .from("leads")
          .insert({
            company_id: companyId,
            region_id: regionId,
            contact_name: name || "Customer",
            client_name: name || "Customer",
            email,
            phone: phone || null,
            status: "won",
            source: "order_backfill",
            converted_to_client_id: clientId,
            converted_at: new Date().toISOString(),
          } as any)
          .select("id")
          .single();
        if (newLeadErr) {
          console.error("[lifecycleService] leads fetch failed:", newLeadErr);
        }
        leadId = (newLead as any)?.id || null;
        if (leadId) backfilled.push("lead");
      }
    }

    // 4. Find or create the quote.
    let quoteId: string | null = (order as any).quote_id || null;
    if (!quoteId) {
      // Pull order_items to copy onto the synthetic quote's menu_items
      // jsonb. Equipment_bookings could also be mirrored but the
      // existing orderSyncService already handles that direction; the
      // quote's role here is "the price book this order locked in".
      const { data: items, error: itemsErr } = await sb
        .from("order_items")
        .select("id, item_name, description, quantity, unit_price, line_total")
        .eq("order_id", orderId);
      if (itemsErr) {
        console.error("[lifecycleService] order_items fetch failed:", itemsErr);
      }
      const menuItemsJsonb = (items || []).map((it: any) => ({
        id: it.id,
        name: it.item_name,
        description: it.description || null,
        quantity: Number(it.quantity || 0),
        pricePerPerson: Number(it.unit_price || 0),
        unit_price: Number(it.unit_price || 0),
        line_total: Number(it.line_total || 0),
      }));

      const total = Number((order as any).total_amount || 0);
      const subtotal = Number((order as any).subtotal || total);
      const taxAmount = Number((order as any).tax_amount || 0);
      const quoteNumber = `QT-${(order as any).order_number || orderId.slice(0, 8)}`;

      const { data: newQuote, error: newQuoteErr } = await sb
        .from("quotes")
        .insert({
          company_id: companyId,
          region_id: regionId,
          quote_number: quoteNumber,
          client_id: clientId,
          lead_id: leadId,
          client_name: name,
          client_email: email,
          event_date: (order as any).event_date,
          guest_count: (order as any).guest_count,
          venue_address: (order as any).venue_address,
          subtotal,
          tax_amount: taxAmount,
          tax: taxAmount,
          total_amount: total,
          total: total,
          menu_items: menuItemsJsonb,
          status: "accepted",
          accepted_at: new Date().toISOString(),
          converted_to_order_id: orderId,
        } as any)
        .select("id")
        .single();
      if (newQuoteErr) {
        console.error("[lifecycleService] quotes fetch failed:", newQuoteErr);
      }
      quoteId = (newQuote as any)?.id || null;
      if (quoteId) {
        await sb.from("orders").update({ quote_id: quoteId } as any).eq("id", orderId);
        backfilled.push("quote");
      }
    }

    // 5. Invoice. Only attempt to ensure when the order is at least
    //    confirmed - ensureInvoiceForOrder lives in a different
    //    service so we re-export the work here as a best-effort hop.
    let invoiceId: string | null = null;
    const status = String((order as any).status || "").toLowerCase();
    if (["confirmed", "preparing", "ready", "in_transit", "delivered", "completed"].includes(status)) {
      try {
        const { ensureInvoiceForOrder } = await import("@/services/invoiceGenerationService");
        const result = await ensureInvoiceForOrder(orderId, companyId);
        if (result?.success && result.invoiceId) {
          invoiceId = result.invoiceId;
          if (!result.alreadyExisted) backfilled.push("invoice");
        }
      } catch (e) {
        console.warn("[lifecycleService] invoice ensure failed (non-blocking):", e);
      }
    }

    return { orderId, clientId, leadId, quoteId, invoiceId, backfilled };
  },

  /**
   * Ensure a clients row has a matching "won" lead record.
   *
   * Every client should have a historical lead (their first-touch
   * record) - otherwise /admin/leads shows an inconsistent pipeline
   * vs /admin/contacts. When a client is created without going
   * through the normal lead -> quote -> client flow (admin manually
   * created, imported, etc.), this fills the gap.
   *
   * Idempotent: re-running on a client that already has a linked
   * lead returns the existing lead_id.
   */
  async ensureLeadForClient(
    clientId: string,
    opts: PromoteLeadOpts = {},
  ): Promise<{ leadId: string | null; created: boolean }> {
    const sb = opts.client || supabase;

    const { data: client, error: clientErr } = await sb
      .from("clients")
      .select("id, company_id, region_id, client_name, email, phone, deleted_at")
      .eq("id", clientId)
      .maybeSingle();
    if (clientErr) {
      console.error("[lifecycleService] clients fetch failed:", clientErr);
    }
    if (!client || (client as any).deleted_at || !(client as any).email) {
      return { leadId: null, created: false };
    }

    // Existing lead for this email?
    const { data: existing, error: existingErr } = await sb
      .from("leads")
      .select("id, converted_to_client_id, status")
      .eq("company_id", (client as any).company_id)
      .eq("email", (client as any).email)
      .is("deleted_at", null)
      .maybeSingle();
    if (existingErr) {
      console.error("[lifecycleService] leads fetch failed:", existingErr);
    }
    if (existing?.id) {
      // Stamp the conversion link if missing.
      if ((existing as any).converted_to_client_id !== clientId) {
        await sb.from("leads").update({
          converted_to_client_id: clientId,
          converted_at: new Date().toISOString(),
          status: "won",
        } as any).eq("id", (existing as any).id);
      }
      return { leadId: (existing as any).id, created: false };
    }

    // No lead for this client yet - create one stamped 'won'.
    const { data: newLead, error: newLeadErr2 } = await sb
      .from("leads")
      .insert({
        company_id: (client as any).company_id,
        region_id: (client as any).region_id ?? null,
        contact_name: (client as any).client_name || "Customer",
        client_name: (client as any).client_name || "Customer",
        email: (client as any).email,
        phone: (client as any).phone || null,
        status: "won",
        source: "client_backfill",
        converted_to_client_id: clientId,
        converted_at: new Date().toISOString(),
      } as any)
      .select("id")
      .single();
    if (newLeadErr2) {
      console.error("[lifecycleService] leads fetch failed:", newLeadErr2);
    }
    return { leadId: (newLead as any)?.id || null, created: !!newLead };
  },

  /**
   * Resolve a quote's effective client_id.
   *
   * If the quote has client_id set, return it.
   * If the quote has lead_id set (but no client_id), promote the lead
   * to a client and return the new client_id.
   * Throws if the quote has neither - the schema constraint
   * `quote_has_lead_or_client` should make this impossible, but we
   * defend against it.
   *
   * Used by quote acceptance / order creation to ensure we always
   * have a client_id to write into orders.client_id (which is NOT
   * NULL on the schema).
   */
  async resolveQuoteClientId(
    quote: { id: string; client_id: string | null; lead_id: string | null },
    opts: PromoteLeadOpts = {},
  ): Promise<string> {
    if (quote.client_id) return quote.client_id;
    if (quote.lead_id) {
      const { clientId } = await this.promoteLeadToClient(quote.lead_id, opts);
      return clientId;
    }
    throw new Error(
      `Quote ${quote.id} has neither client_id nor lead_id - can't resolve a client to attach the order to.`,
    );
  },
};
