/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import {
  computeFollowupState,
  templateKeyFor,
  recordFollowupSent,
  DEFAULT_FOLLOWUP_CADENCE,
  type FollowupLogRow,
} from "@/services/quoteFollowupService";

/**
 * Wave 50 C1 -- automated quote follow-up sender.
 *
 * Audit (Specialist 4) found quoteFollowupService computed the
 * traffic-light state per quote (FU 1 ready / FU 2 due in Nd / FU 3
 * overdue), but no cron actually sent the emails. recordFollowupSent
 * was operator-driven only, despite the per-tenant
 * autoFollowUpDays / secondFollowUpDays / thirdFollowUpDays settings
 * being read.
 *
 * Strategy: every run, walk every active tenant's open quotes
 * (status IN draft/sent/viewed/negotiating with sent_at NOT NULL),
 * load each quote's existing follow-up log, compute the state, and
 * for every quote whose state.light is 'amber' (ready) or 'rose'
 * (overdue) send the next follow-up email + insert the log row.
 * Idempotent via the log row -- a re-run after a successful send
 * sees the new log entry and the state flips to slate / green.
 *
 * Tenant-gated: only fires when companies.auto_followups_enabled is
 * TRUE (same flag that gates the after-sales drip). Honours quote
 * comms-pause + customer email allow-list via the email service.
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const provided = req.headers.authorization || "";
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (expected && provided !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const sb = getServiceSupabase();
    const now = new Date();

    // 1. Tenants opted in to auto-followups. Cadence days are a
    // single platform-wide default today (per-tenant override is
    // tracked separately in admin localStorage); the global
    // DEFAULT_FOLLOWUP_CADENCE applies until that lands as a column.
    const { data: tenants, error: tenantErr } = await (sb as any)
      .from("companies")
      .select("id")
      .eq("auto_followups_enabled", true);
    if (tenantErr) {
      console.error("[quote-followup-send] tenant fetch failed:", tenantErr);
      return res.status(500).json({ error: tenantErr.message });
    }
    if (!tenants || tenants.length === 0) {
      return res.status(200).json({ ok: true, tenantsConsidered: 0 });
    }

    let totalConsidered = 0;
    let totalSent = 0;
    const errors: string[] = [];

    for (const tenant of tenants as any[]) {
      const cadence = DEFAULT_FOLLOWUP_CADENCE;

      // 2. Open quotes for this tenant. We treat any non-terminal
      // status as eligible -- computeFollowupState will skip terminal
      // states defensively even if the DB filter misses one.
      const { data: quotes, error: qErr } = await (sb as any)
        .from("quotes")
        .select("id, status, sent_at, accepted_at, client_email, client_name, quote_number, event_name")
        .eq("company_id", tenant.id)
        .not("sent_at", "is", null)
        .not("status", "in", "(accepted,rejected,expired,converted)")
        .is("deleted_at", null)
        .limit(500);
      if (qErr) {
        errors.push(`tenant ${tenant.id} quotes: ${qErr.message}`);
        continue;
      }
      if (!quotes || quotes.length === 0) continue;

      const quoteIds = quotes.map((q: any) => q.id);

      // 3. Load existing follow-up log for these quotes.
      const { data: logRowsRaw } = await (sb as any)
        .from("quote_followup_log")
        .select("id, quote_id, sequence_position, template_key, channel, status, sent_at")
        .in("quote_id", quoteIds);
      const byQuote: Record<string, FollowupLogRow[]> = {};
      for (const r of (logRowsRaw || []) as FollowupLogRow[]) {
        (byQuote[r.quote_id] = byQuote[r.quote_id] || []).push(r);
      }

      // 4. Per quote, compute state + fire when ready / overdue.
      for (const quote of quotes as any[]) {
        totalConsidered += 1;
        const state = computeFollowupState(quote, byQuote[quote.id] || [], cadence, now);
        if (state.light !== "amber" && state.light !== "rose") continue;
        if (!state.nextPosition) continue;
        if (!quote.client_email) continue;

        const templateKey = templateKeyFor(state.nextPosition, "email");
        try {
          // Lazy import to keep cold-start light + avoid circular deps.
          const { resolveEmailTemplate } = await import("@/services/email/templateResolver");
          const { emailService } = await import("@/services/emailService");

          const variables: Record<string, string> = {
            client_name: quote.client_name || "there",
            first_name: (quote.client_name || "there").split(" ")[0],
            quote_number: quote.quote_number || quote.id,
            event_name: quote.event_name || "your event",
            position: String(state.nextPosition),
          };

          const resolved = await resolveEmailTemplate({
            companyId: tenant.id,
            templateType: templateKey,
            variables,
            fallback: {
              subject: state.nextPosition === 1
                ? `Just checking in on ${variables.event_name}`
                : state.nextPosition === 2
                ? `Anything we can tweak on ${variables.event_name}?`
                : `Last nudge on ${variables.event_name}`,
              bodyHtml:
                `Hi ${variables.first_name},\n\n` +
                `Just circling back on the quote we sent for ${variables.event_name}. ` +
                `Happy to tweak anything -- just hit reply.\n\n` +
                `Thanks!`,
            },
          });

          await emailService.sendEmail({
            companyId: tenant.id,
            to: quote.client_email,
            subject: resolved.subject,
            body: resolved.bodyHtml,
          } as any);

          await recordFollowupSent({
            companyId: tenant.id,
            quoteId: quote.id,
            position: state.nextPosition,
            templateKey,
            channel: "email",
            sentByUserId: null,
            notes: "auto-sent by quote-followup-send cron",
            status: "sent",
          });
          totalSent += 1;
        } catch (e: any) {
          errors.push(`quote ${quote.id}: ${e?.message || e}`);
        }
      }
    }

    return res.status(200).json({
      ok: true,
      tenantsConsidered: tenants.length,
      quotesConsidered: totalConsidered,
      sent: totalSent,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: any) {
    console.error("[quote-followup-send] crashed:", e);
    return res.status(500).json({ error: e?.message || "crash" });
  }
}
