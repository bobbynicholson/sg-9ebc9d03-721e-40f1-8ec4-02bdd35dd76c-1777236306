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
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";
import { hasEventDatePassed } from "@/lib/eventDateGuard";


const CRON_NAME = "quote-followup-send";

/**
 * Wave 50 C1 - automated quote follow-up sender.
 *
 * Audit (Specialist 4) found quoteFollowupService computed the
 * traffic-light state per quote, but no cron actually sent the
 * emails. recordFollowupSent was operator-driven only.
 *
 * Strategy: every run, walk every active tenant's open quotes,
 * compute the state, fire the next follow-up email for any quote in
 * 'amber' (ready) or 'rose' (overdue) state.
 *
 * Auth: Vercel cron bearer OR super_admin session.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const sb: any = getServiceSupabase();
  try {
    const now = new Date();

    const { data: tenants, error: tenantErr } = await sb
      .from("companies")
      .select("id, timezone")
      .eq("auto_followups_enabled", true);
    if (tenantErr) {
      console.error("[quote-followup-send] tenant fetch failed:", tenantErr);
      await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: tenantErr.message });
      return res.status(500).json({ error: tenantErr.message });
    }
    if (!tenants || tenants.length === 0) {
      await recordCronHeartbeat(sb, CRON_NAME, "ok", { source: auth.source, tenantsConsidered: 0 });
      return res.status(200).json({ ok: true, tenantsConsidered: 0 });
    }

    let totalConsidered = 0;
    let totalSent = 0;
    let totalSkippedPastEvent = 0;
    const errors: string[] = [];

    for (const tenant of tenants as any[]) {
      const cadence = DEFAULT_FOLLOWUP_CADENCE;

      const { data: quotes, error: qErr } = await sb
        .from("quotes")
        .select("id, status, sent_at, accepted_at, client_email, client_name, quote_number, quote_name, event_date")
        .eq("company_id", tenant.id)
        .not("sent_at", "is", null)
        .not("status", "in", "(accepted,rejected,expired)")
        .is("deleted_at", null)
        .limit(500);
      if (qErr) {
        errors.push(`tenant ${tenant.id} quotes: ${qErr.message}`);
        continue;
      }
      if (!quotes || quotes.length === 0) continue;

      const quoteIds = quotes.map((q: any) => q.id);

      const { data: logRowsRaw } = await sb
        .from("quote_followup_log")
        .select("id, quote_id, sequence_position, template_key, channel, status, sent_at")
        .in("quote_id", quoteIds);
      const byQuote: Record<string, FollowupLogRow[]> = {};
      for (const r of (logRowsRaw || []) as FollowupLogRow[]) {
        (byQuote[r.quote_id] = byQuote[r.quote_id] || []).push(r);
      }

      for (const quote of quotes as any[]) {
        totalConsidered += 1;
        // A quote can remain technically open after its event. Never send
        // an automated chase for an event that has already happened.
        if (hasEventDatePassed(quote.event_date, now, tenant.timezone)) {
          totalSkippedPastEvent += 1;
          continue;
        }
        const state = computeFollowupState(quote, byQuote[quote.id] || [], cadence, now);
        if (state.light !== "amber" && state.light !== "rose") continue;
        if (!state.nextPosition) continue;
        if (!quote.client_email) continue;

        const templateKey = templateKeyFor(state.nextPosition, "email");
        try {
          const { resolveEmailTemplate } = await import("@/services/email/templateResolver");
          const { deliverAutomatedEmail } = await import("@/lib/email/automatedDelivery");

          const variables: Record<string, string> = {
            client_name: quote.client_name || "there",
            first_name: (quote.client_name || "there").split(" ")[0],
            quote_number: quote.quote_number || quote.id,
            event_name: (quote as any).quote_name || "your event",
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
                `Happy to tweak anything - just hit reply.\n\n` +
                `Thanks!`,
            },
          });

          // Never chase a client twice with the same follow-up: earlier runs
          // sent some without recording them, and a client with two open
          // quotes for one event would get one per quote. When this exact
          // follow-up already went to this client since the quote was sent,
          // record it for this quote and move on.
          const { data: alreadySent, error: historyErr } = await sb
            .from("email_automation_log")
            .select("id")
            .eq("user_id", tenant.id)
            .eq("status", "sent")
            .ilike("recipient_email", String(quote.client_email).trim().replace(/([%_\\])/g, "\\$1"))
            .eq("subject", resolved.subject)
            .gte("created_at", quote.sent_at)
            .limit(1);
          if (historyErr) throw new Error(`Follow-up history check failed: ${historyErr.message}`);
          if (alreadySent && alreadySent.length > 0) {
            const recorded = await recordFollowupSent({
              companyId: tenant.id,
              quoteId: quote.id,
              position: state.nextPosition,
              templateKey,
              channel: "email",
              sentByUserId: null,
              notes: "already sent to this client - not sent again",
              status: "sent",
              client: sb,
            });
            if (!recorded.ok) errors.push(`quote ${quote.id}: follow-up not recorded: ${recorded.error}`);
            continue;
          }

          const delivery = await deliverAutomatedEmail(sb, {
            companyId: tenant.id,
            to: quote.client_email,
            recipientName: quote.client_name || null,
            subject: resolved.subject,
            body: resolved.bodyHtml,
            template: templateKey,
            templateType: templateKey,
            variables: { ...variables, _followup_position: String(state.nextPosition) },
            triggerEvent: "quote.followup",
            triggerRefId: quote.id,
            quoteId: quote.id,
            idempotencyKey: `quote-followup/${quote.id}/${state.nextPosition}`,
            // Service-role client: cron runs unauthenticated, so without
            // it the provider lookup is RLS-blocked and the send silently
            // no-ops (logged "sent" but never delivered).
          } as any);
          // Resend refuses a repeat of a follow-up it already sent in the
          // last 24 hours (same idempotency key): the client has it, so
          // record it instead of trying again tomorrow.
          const alreadyDelivered = !delivery.success
            && /idempotency key has been used/i.test(String(delivery.error || ""));
          if (!delivery.success && !alreadyDelivered) throw new Error(delivery.error || "Follow-up email was not sent");

          // Turned off in Email settings: nothing was sent, so nothing is
          // recorded and the cadence does not advance.
          if (delivery.skippedBySettings) continue;

          const recorded = await recordFollowupSent({
            companyId: tenant.id,
            quoteId: quote.id,
            position: state.nextPosition,
            templateKey,
            channel: "email",
            sentByUserId: null,
            notes: alreadyDelivered
              ? "already sent to this client in the last 24 hours - not sent again"
              : "auto-sent by quote-followup-send cron",
            status: "sent",
            client: sb,
          });
          // An unrecorded follow-up would be sent again on the next run.
          if (!recorded.ok) errors.push(`quote ${quote.id}: follow-up not recorded: ${recorded.error}`);
          if (!alreadyDelivered && !(delivery as any).skipped_duplicate) totalSent += 1;
        } catch (e: any) {
          errors.push(`quote ${quote.id}: ${e?.message || e}`);
        }
      }
    }

    await recordCronHeartbeat(sb, CRON_NAME, errors.length > 0 ? "error" : "ok", {
      source: auth.source,
      tenantsConsidered: tenants.length,
      quotesConsidered: totalConsidered,
      sent: totalSent,
      skipped_past_event: totalSkippedPastEvent,
      errors_count: errors.length,
    });
    return res.status(200).json({
      ok: true,
      tenantsConsidered: tenants.length,
      quotesConsidered: totalConsidered,
      sent: totalSent,
      skippedPastEvent: totalSkippedPastEvent,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: any) {
    console.error("[quote-followup-send] crashed:", e);
    await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: e?.message || "crash" });
    return res.status(500).json({ error: e?.message || "crash" });
  }
}

export default withApiLogging(handler);
