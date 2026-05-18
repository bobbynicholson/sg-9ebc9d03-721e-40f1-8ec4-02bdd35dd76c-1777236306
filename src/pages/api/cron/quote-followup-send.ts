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
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const sb: any = getServiceSupabase();
  try {
    const now = new Date();

    const { data: tenants, error: tenantErr } = await sb
      .from("companies")
      .select("id")
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
    const errors: string[] = [];

    for (const tenant of tenants as any[]) {
      const cadence = DEFAULT_FOLLOWUP_CADENCE;

      const { data: quotes, error: qErr } = await sb
        .from("quotes")
        .select("id, status, sent_at, accepted_at, client_email, client_name, quote_number, event_name")
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
        const state = computeFollowupState(quote, byQuote[quote.id] || [], cadence, now);
        if (state.light !== "amber" && state.light !== "rose") continue;
        if (!state.nextPosition) continue;
        if (!quote.client_email) continue;

        const templateKey = templateKeyFor(state.nextPosition, "email");
        try {
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
                `Happy to tweak anything - just hit reply.\n\n` +
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

    await recordCronHeartbeat(sb, CRON_NAME, errors.length > 0 ? "error" : "ok", {
      source: auth.source,
      tenantsConsidered: tenants.length,
      quotesConsidered: totalConsidered,
      sent: totalSent,
      errors_count: errors.length,
    });
    return res.status(200).json({
      ok: true,
      tenantsConsidered: tenants.length,
      quotesConsidered: totalConsidered,
      sent: totalSent,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: any) {
    console.error("[quote-followup-send] crashed:", e);
    await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: e?.message || "crash" });
    return res.status(500).json({ error: e?.message || "crash" });
  }
}
