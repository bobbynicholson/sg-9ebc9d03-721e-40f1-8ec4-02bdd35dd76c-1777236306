import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";

const CRON_NAME = "notification-digests";

/**
 * Sends the optional per-user daily summary and weekly report. The digest is
 * built from the same in-app notification rows the user can review in their
 * portal, so the email and bell cannot drift into two different definitions
 * of "activity".
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const sb: any = getServiceSupabase();
  const now = new Date();
  const isMonday = now.getUTCDay() === 1;
  const digests: Array<{ field: "daily_summary" | "weekly_report"; template: string; label: string; days: number }> = [
    { field: "daily_summary", template: "daily_summary", label: "Daily summary", days: 1 },
  ];
  if (isMonday) {
    digests.push({ field: "weekly_report", template: "weekly_report", label: "Weekly report", days: 7 });
  }

  try {
    const { data: preferenceRows, error: preferenceError } = await sb
      .from("email_notification_preferences")
      .select("user_id, daily_summary, weekly_report")
      .or("daily_summary.eq.true,weekly_report.eq.true");
    if (preferenceError) throw preferenceError;

    const userIds = Array.from(new Set((preferenceRows || []).map((row: any) => row.user_id).filter(Boolean)));
    if (userIds.length === 0) {
      await recordCronHeartbeat(sb, CRON_NAME, "ok", { source: auth.source, recipients: 0, sent: 0 });
      return res.status(200).json({ ok: true, recipients: 0, sent: 0 });
    }

    const { data: profiles, error: profileError } = await sb
      .from("profiles")
      .select("id, company_id, email, full_name")
      .in("id", userIds);
    if (profileError) throw profileError;

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const digest of digests) {
      const cutoff = new Date(now.getTime() - digest.days * 86_400_000).toISOString();
      for (const profile of (profiles || []) as Array<any>) {
        const preference = (preferenceRows || []).find((row: any) => row.user_id === profile.id);
        if (!preference?.[digest.field] || !profile.email || !profile.company_id) {
          skipped += 1;
          continue;
        }

        const { count: alreadySent } = await sb
          .from("email_automation_log")
          .select("id", { count: "exact", head: true })
          .eq("template_type", digest.template)
          .ilike("recipient_email", String(profile.email).trim())
          .gte("created_at", cutoff);
        if (alreadySent && alreadySent > 0) {
          skipped += 1;
          continue;
        }

        const { data: notifications, error: notificationError } = await sb
          .from("notifications")
          .select("title, message, created_at")
          .eq("recipient_id", profile.id)
          .gte("created_at", cutoff)
          .order("created_at", { ascending: false })
          .limit(10);
        if (notificationError) {
          failed += 1;
          continue;
        }
        if (!notifications || notifications.length === 0) {
          skipped += 1;
          continue;
        }

        const periodLabel = digest.field === "daily_summary" ? "the last day" : "the last week";
        const lines = (notifications as Array<any>).map((item) => `- ${item.title}: ${item.message}`);
        const body = [
          `Hi ${String(profile.full_name || "there").trim().split(/\s+/)[0] || "there"},`,
          "",
          `Here is your ${digest.label.toLowerCase()} for ${periodLabel}.`,
          "",
          ...lines,
          "",
          "Open CateringMS to review the full notification history.",
        ].join("\n");

        const { emailService } = await import("@/services/emailService");
        const result = await emailService.sendEmailDetailed({
          companyId: profile.company_id,
          to: profile.email,
          subject: `${digest.label} - CateringMS`,
          template: digest.template,
          body,
          notificationPreference: digest.field,
          _client: sb,
        } as any);
        if (result.success) sent += 1;
        else if (result.error_code === "notification_disabled") skipped += 1;
        else failed += 1;
      }
    }

    await recordCronHeartbeat(sb, CRON_NAME, failed > 0 ? "error" : "ok", {
      source: auth.source,
      recipients: profiles?.length || 0,
      sent,
      skipped,
      failed,
    });
    return res.status(200).json({ ok: failed === 0, recipients: profiles?.length || 0, sent, skipped, failed });
  } catch (error: any) {
    await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: error?.message || String(error) });
    return res.status(500).json({ error: error?.message || "Notification digest failed" });
  }
}

export default handler;
