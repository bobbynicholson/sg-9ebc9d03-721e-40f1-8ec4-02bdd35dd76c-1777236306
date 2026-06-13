/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth, type CronAuthSource } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";


const CRON_NAME = "outsource-pre-event-reminder";

/**
 * Wave 67.3 - outsource provider pre-event reminder.
 *
 * For every accepted outsource_assignments row whose event is in the
 * next 24-36 hours, send the provider a "see you tomorrow" email with
 * venue, time, scope, agreed cost and the magic-link if they need to
 * look anything up. Idempotent via email_automation_log lookup.
 *
 * Schedule: hourly. Tight window (24-36h) makes the dedup safe even
 * if the cron over-runs.
 *
 * WhatsApp-preferred providers get the email anyway when email is on
 * file; tenants who want WhatsApp comms send manually via the
 * Outsourced fulfilment panel (wa.me link).
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Wave 70.4 - E2E test support. When dryRun=1 we skip the
  // CRON_SECRET check (still require an authenticated owner / admin
  // via Supabase SSR) and return a list of who would have been
  // emailed without actually calling emailService. Lets admins
  // sanity-check the window + dedup logic on prod data without
  // sending a single email.
  const dryRun = String(req.query.dryRun || "").trim() === "1" || String(req.query.dry || "").trim() === "1";

  let authSource: CronAuthSource | "owner_dryrun" = "cron";
  // OUT-B (2026-05-24): the dry-run path previously ran the
  // assignments query with no company_id scope - any owner clicking
  // "Test pre-event" got a preview list of provider emails / order ids
  // across every tenant on the platform. Cross-tenant data leak. Fix:
  // resolve caller's company_id from the SSR profile and scope the
  // fetch. Tighten the role gate at the same time (drop plain `admin`
  // per the audit; super_admin / company_admin / owner only).
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
    const windowStart = now.toISOString();
    const windowEnd = new Date(now.getTime() + 36 * 60 * 60 * 1000).toISOString();

    // Pull accepted assignments inside the 36h window. OUT-B: scope
    // by company_id when running as a tenant dry-run; full-platform
    // sweep only for the cron-secret path.
    let assignmentsQuery = (sb as any)
      .from("outsource_assignments")
      .select(`
        id, company_id, order_id, provider_id, status,
        required_on_site_at, service_description, scope_notes,
        quoted_cost, cost_currency, rate_type, accept_token,
        provider:provider_id ( provider_name, contact_person, email )
      `)
      .eq("status", "accepted")
      .gte("required_on_site_at", windowStart)
      .lte("required_on_site_at", windowEnd)
      .is("deleted_at", null);
    if (dryRun && dryRunCompanyId) {
      assignmentsQuery = assignmentsQuery.eq("company_id", dryRunCompanyId);
    }
    const { data: assignments, error } = await assignmentsQuery;

    if (error) {
      console.error("[outsource-pre-event-reminder] fetch failed:", error);
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
    const yesterdayIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

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

        // Idempotency: scoped by (order_id, recipient_email,
        // template_type) since email_automation_log has no entity_id.
        // For multi-provider orders the recipient_email is unique
        // per provider, so dedup is per-assignment in practice.
        const { count: recentCount } = await (sb as any)
          .from("email_automation_log")
          .select("id", { count: "exact", head: true })
          .eq("order_id", a.order_id)
          .eq("recipient_email", providerEmail)
          .eq("template_type", "outsource_pre_event_reminder")
          .gte("sent_at", yesterdayIso);
        if (recentCount && recentCount > 0) {
          skipped += 1;
          continue;
        }

        // Pull the order context for the email body. OUT-B: include
        // event_name (the subject formatter reads it; the previous
        // SELECT was missing the column so the subject always fell
        // through to order_number).
        const { data: order } = await (sb as any)
          .from("orders")
          .select("order_number, event_name, event_date, event_time, client_name, venue_address, guest_count, setup_time")
          .eq("id", a.order_id)
          .maybeSingle();
        if (!order) {
          skipped += 1;
          continue;
        }

        const firstName = (a.provider?.contact_person || providerName).split(" ")[0];
        const eventWhen = (order as any).event_date
          ? new Date(`${(order as any).event_date}T${((order as any).event_time || "12:00").slice(0, 5)}:00`)
              .toLocaleString("en-ZA", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })
          : "tomorrow";
        const onSite = a.required_on_site_at
          ? new Date(a.required_on_site_at).toLocaleString("en-ZA", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
          : "as agreed";
        const venue = (order as any).venue_address || "venue TBC";
        const guests = (order as any).guest_count != null ? `${(order as any).guest_count} guests` : "guest count TBC";
        const fee = `${a.cost_currency || "ZAR"} ${Number(a.quoted_cost || 0).toLocaleString("en-ZA", { maximumFractionDigits: 2 })}`;
        const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://cateringms.com";
        const acceptLink = a.accept_token ? `${origin.replace(/\/$/, "")}/p/accept/${a.accept_token}` : null;

        const subject = `Reminder: ${(order as any).event_name || (order as any).order_number || "Booking"} - ${eventWhen}`;
        const bodyText = [
          `Hi ${firstName},`,
          ``,
          `Quick reminder that you're booked for the following:`,
          ``,
          `${a.service_description}`,
          ``,
          `Event: ${eventWhen}`,
          `Venue: ${venue}`,
          `Guests: ${guests}`,
          `On site by: ${onSite}`,
          `Agreed rate: ${fee} (${(a.rate_type || "per_event").replace(/_/g, " ")})`,
          a.scope_notes ? `\nNotes: ${a.scope_notes}` : "",
          ``,
          acceptLink ? `Booking details: ${acceptLink}` : "",
          ``,
          `Thanks!`,
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
          templateType: "outsource_pre_event_reminder",
          // Service-role client: cron runs unauthenticated, so without it
          // the provider lookup is RLS-blocked and the send silently
          // no-ops (logged "sent" but never delivered).
          _client: sb,
        } as any);
        if (result) sent += 1;
        else skipped += 1;
      } catch (e: any) {
        errors.push(`${a.id}: ${e?.message || e}`);
        console.error("[outsource-pre-event-reminder] assignment failed:", a.id, e);
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
    console.error("[outsource-pre-event-reminder] crashed:", err);
    await recordCronHeartbeat(sb, CRON_NAME, "error", { source: authSource, error_message: err?.message || "Cron crashed" });
    return res.status(500).json({ error: err?.message || "Cron crashed" });
  }
}

export default withApiLogging(handler);
