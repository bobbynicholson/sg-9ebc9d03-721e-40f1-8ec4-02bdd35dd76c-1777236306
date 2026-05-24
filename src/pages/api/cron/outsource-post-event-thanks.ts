/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth, type CronAuthSource } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";

const CRON_NAME = "outsource-post-event-thanks";

/**
 * Wave 67.3 - outsource provider post-event thanks + invoice nudge.
 *
 * 24-48h after the event date for any assignment in accepted /
 * on_site / completed status that hasn't been invoiced yet, send a
 * short thanks + "please invoice us within X days" prompt. Closes
 * the loop and prompts the provider to send their invoice early
 * rather than 6 weeks later.
 *
 * Idempotent via email_automation_log.
 *
 * Schedule: daily (the 24-48h window keeps it from firing twice
 * even if cron skips a day).
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Wave 70.4 - dry-run mode for E2E verification. See the sibling
  // pre-event reminder cron for the full rationale. Auth: SSR owner /
  // admin in dry-run, CRON_SECRET in production.
  const dryRun = String(req.query.dryRun || "").trim() === "1" || String(req.query.dry || "").trim() === "1";

  let authSource: CronAuthSource | "owner_dryrun" = "cron";
  // OUT-B: same cross-tenant fix as the pre-event sibling. Scope the
  // dry-run by company_id and tighten role gate.
  let dryRunCompanyId: string | null = null;
  if (!dryRun) {
    const auth = await requireCronAuth(req, res);
    if (!auth.ok) return;
    authSource = auth.source;
  } else {
    try {
      const { createPagesServerClient } = await import("@/lib/supabase/server");
      const ssr = createPagesServerClient({ req, res });
      const { data: { user } } = await ssr.auth.getUser();
      if (!user) return res.status(401).json({ error: "Sign in required for dry-run" });
      const { data: profile } = await ssr
        .from("profiles")
        .select("role, active_role, company_id")
        .eq("id", user.id)
        .maybeSingle();
      const role = (((profile as { role?: string; active_role?: string; company_id?: string } | null)?.active_role) || ((profile as { role?: string; active_role?: string; company_id?: string } | null)?.role) || "") as string;
      if (!new Set(["super_admin", "company_admin", "owner"]).has(role)) {
        return res.status(403).json({ error: "Owner / company admin / super admin only" });
      }
      dryRunCompanyId = (profile as { company_id?: string } | null)?.company_id || null;
      if (!dryRunCompanyId) {
        return res.status(403).json({ error: "No company on profile" });
      }
      authSource = "owner_dryrun";
    } catch (e: unknown) {
      return res.status(500).json({ error: e instanceof Error ? e.message : "auth check failed" });
    }
  }

  const sb: any = getServiceSupabase();
  try {
    const now = new Date();
    // Window: event was between 24-72h ago. Tight enough that we don't
    // hit older completed jobs but loose enough that a missed cron run
    // doesn't drop the message.
    const windowEnd = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const windowStart = new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString();

    // OUT-B: tenant-scope dry-runs.
    let assignmentsQuery = (sb as any)
      .from("outsource_assignments")
      .select(`
        id, company_id, order_id, provider_id, status,
        required_on_site_at, service_description,
        quoted_cost, cost_currency, rate_type,
        invoice_received,
        provider:provider_id ( provider_name, contact_person, email, payment_terms_days )
      `)
      .in("status", ["accepted", "on_site", "completed"])
      .eq("invoice_received", false)
      .gte("required_on_site_at", windowStart)
      .lte("required_on_site_at", windowEnd)
      .is("deleted_at", null);
    if (dryRun && dryRunCompanyId) {
      assignmentsQuery = assignmentsQuery.eq("company_id", dryRunCompanyId);
    }
    const { data: assignments, error } = await assignmentsQuery;

    if (error) {
      console.error("[outsource-post-event-thanks] fetch failed:", error);
      await recordCronHeartbeat(sb, CRON_NAME, "error", { source: authSource, error_message: error.message });
      return res.status(500).json({ error: error.message });
    }
    if (!assignments || assignments.length === 0) {
      await recordCronHeartbeat(sb, CRON_NAME, "ok", { source: authSource, candidates: 0, sent: 0 });
      return res.status(200).json({ ok: true, sent: 0 });
    }

    const { emailService } = dryRun
      ? { emailService: { sendEmail: async (_args: any) => true } as { sendEmail: (args: any) => Promise<boolean> } }
      : await import("@/services/emailService");
    const recentIso = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];
    const preview: Array<{ assignment_id: string; provider_email: string; order_id: string; subject: string }> = [];

    for (const a of assignments as any[]) {
      try {
        const providerEmail = (a.provider?.email as string | null | undefined) || null;
        const providerName = (a.provider?.provider_name as string | null | undefined) || "there";
        if (!providerEmail) {
          skipped += 1;
          continue;
        }

        // Idempotency: 7-day lookback per (order_id, recipient_email,
        // template_type) since email_automation_log has no entity_id.
        const { count: recentCount } = await (sb as any)
          .from("email_automation_log")
          .select("id", { count: "exact", head: true })
          .eq("order_id", a.order_id)
          .eq("recipient_email", providerEmail)
          .eq("template_type", "outsource_post_event_thanks")
          .gte("sent_at", recentIso);
        if (recentCount && recentCount > 0) {
          skipped += 1;
          continue;
        }

        const { data: order } = await (sb as any)
          .from("orders")
          .select("order_number, event_date, client_name")
          .eq("id", a.order_id)
          .maybeSingle();

        const firstName = (a.provider?.contact_person || providerName).split(" ")[0];
        const eventLabel = (order as any)?.event_date
          ? new Date((order as any).event_date).toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" })
          : "the event";
        const fee = `${a.cost_currency || "ZAR"} ${Number(a.quoted_cost || 0).toLocaleString("en-ZA", { maximumFractionDigits: 2 })}`;
        const paymentTerms = a.provider?.payment_terms_days
          ? `${a.provider.payment_terms_days} days`
          : "7 days";

        const subject = `Thanks for ${eventLabel} - invoice us when you're ready`;
        const bodyText = [
          `Hi ${firstName},`,
          ``,
          `Thanks for your work on ${eventLabel}${(order as any)?.order_number ? ` (${(order as any).order_number})` : ""}.`,
          ``,
          `When you have a moment, please send through your invoice for ${fee} so we can settle within ${paymentTerms}.`,
          ``,
          `Reply to this email or send via your usual channel.`,
          ``,
          `Cheers!`,
        ].filter(Boolean).join("\n");

        if (dryRun) {
          preview.push({ assignment_id: a.id, provider_email: providerEmail, order_id: a.order_id, subject });
          sent += 1;
          continue;
        }

        const result = await emailService.sendEmail({
          companyId: a.company_id,
          to: providerEmail,
          subject,
          body: `<pre style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; white-space: pre-wrap;">${bodyText
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`,
          orderId: a.order_id,
          templateType: "outsource_post_event_thanks",
        } as any);
        if (result) sent += 1;
        else skipped += 1;
      } catch (e: any) {
        errors.push(`${a.id}: ${e?.message || e}`);
        console.error("[outsource-post-event-thanks] assignment failed:", a.id, e);
      }
    }

    await recordCronHeartbeat(sb, CRON_NAME, errors.length > 0 ? "error" : "ok", {
      source: authSource,
      dryRun,
      candidates: assignments.length,
      sent, skipped,
      errors_count: errors.length,
    });
    return res.status(200).json({
      ok: true,
      dryRun,
      windowStart,
      windowEnd,
      candidates: assignments.length,
      sent,
      skipped,
      errors,
      ...(dryRun ? { preview } : {}),
    });
  } catch (err: any) {
    console.error("[outsource-post-event-thanks] crashed:", err);
    await recordCronHeartbeat(sb, CRON_NAME, "error", { source: authSource, error_message: err?.message || "Cron crashed" });
    return res.status(500).json({ error: err?.message || "Cron crashed" });
  }
}
