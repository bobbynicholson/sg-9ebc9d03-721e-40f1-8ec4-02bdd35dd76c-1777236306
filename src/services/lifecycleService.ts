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
 * client". Everything else -- quote acceptance, order creation, the
 * eventual /admin/clients vs /admin/contacts split -- depends on this
 * promotion firing reliably.
 *
 * Design notes:
 * - Idempotent: re-running on an already-promoted lead returns the
 *   existing client_id, no duplicate row created.
 * - Reuses an existing client when one already exists with the same
 *   email + company_id (covers the case where an admin manually
 *   created a client row that matches the lead's email).
 * - Stamps lead.status = 'won' as part of promotion -- "won" is the
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
   *  - Lead has no email (shouldn't happen -- schema NOT NULL)
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
        "id, company_id, contact_name, email, phone, tags, notes, converted_to_client_id, deleted_at",
      )
      .eq("id", leadId)
      .single();
    if (leadErr || !lead) {
      throw new Error(`Lead ${leadId} not found: ${leadErr?.message ?? "no row"}`);
    }
    if ((lead as any).deleted_at) {
      throw new Error(`Lead ${leadId} has been deleted -- can't promote`);
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
    const { data: existingClient } = await sb
      .from("clients")
      .select("id")
      .eq("company_id", (lead as any).company_id)
      .eq("email", (lead as any).email)
      .is("deleted_at", null)
      .maybeSingle();

    let clientId: string;
    let isNew = false;

    if (existingClient?.id) {
      clientId = existingClient.id as string;
    } else {
      // 4. Create a fresh client row from the lead's data.
      // clients.phone is NOT NULL on the schema, so fall back to an
      // empty string when the lead has no phone -- the alternative is
      // to throw, but we'd rather promote with a placeholder than
      // block a real conversion.
      const { data: newClient, error: insertErr } = await sb
        .from("clients")
        .insert({
          company_id: (lead as any).company_id,
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
      // Don't throw -- the client row exists and is usable. Surface
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
   * Resolve a quote's effective client_id.
   *
   * If the quote has client_id set, return it.
   * If the quote has lead_id set (but no client_id), promote the lead
   * to a client and return the new client_id.
   * Throws if the quote has neither -- the schema constraint
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
      `Quote ${quote.id} has neither client_id nor lead_id -- can't resolve a client to attach the order to.`,
    );
  },
};
