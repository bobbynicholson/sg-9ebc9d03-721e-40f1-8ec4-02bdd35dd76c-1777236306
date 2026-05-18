/**
 * GET /api/cron/missed-clock-in-check
 *
 * Wave 36.2 cron worker. Walks today's kitchen_shifts where:
 *   - status = 'scheduled' (still expected to land)
 *   - planned_start was 15+ minutes ago
 *   - actual_start IS NULL (chef hasn't clocked in yet)
 *   - shift_date = today (no point alerting about past days)
 *
 * For each, broadcasts a high-priority in-app notification to
 * head-chef / company-admin / owner roles. Mirrors the pattern in
 * /api/cron/late-event-check.ts (idempotent per shift_id within
 * 24h, RLS-safe via service-role client, CRON_SECRET-gated).
 *
 * Vercel cron: every 15 minutes (configured in vercel.json).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";

const ALERT_TYPE = "kitchen_missed_clock_in";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Auth gate: matches /api/cron/late-event-check.ts.
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  if (expected && auth !== `Bearer ${expected}`) {
    return res.status(401).json({ error: "Unauthorised" });
  }

  const supabase: any = getServiceSupabase();
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  // Anything starting more than 15 minutes ago counts as late.
  // Anything starting >4h ago is auto-promoted to status='missed'
  // (the chef won't be coming - close it out).
  const cutoff = new Date(now.getTime() - 15 * 60 * 1000);
  const cutoffHM = `${String(cutoff.getHours()).padStart(2, "0")}:${String(cutoff.getMinutes()).padStart(2, "0")}`;
  const farCutoff = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  const farCutoffHM = `${String(farCutoff.getHours()).padStart(2, "0")}:${String(farCutoff.getMinutes()).padStart(2, "0")}`;

  // Pull today's scheduled shifts with their planned_start in the
  // past. PostgREST can't compare a TIME column to a JS time without
  // round-tripping through SQL, so we filter by date here and
  // refine in JS.
  // Wave 41 (CRITICAL FIX): scope to kitchen-only shift_types.
  // Wave 40.4 added 'cleaning' + 'kitchen_and_cleaning' values to
  // kitchen_shifts.shift_type. The cleaning-side cron at
  // /api/cron/cleaning-missed-clock-in-check.ts handles those rows
  // (it filters to ['cleaning', 'kitchen_and_cleaning']). Without
  // this filter both crons would fire on the same kitchen_and_
  // cleaning row and the catering team would get duplicate alerts
  // (one labelled "Chef no-show", one labelled "Cleaner no-show")
  // for the same human.
  const { data: rows, error } = await supabase
    .from("kitchen_shifts")
    .select("id, company_id, staff_id, shift_date, planned_start, planned_end, actual_start, status")
    .eq("shift_date", todayIso)
    .eq("status", "scheduled")
    .eq("shift_type", "kitchen")
    .is("actual_start", null)
    .is("deleted_at", null)
    .limit(500);

  if (error) {
    console.error("[cron/missed-clock-in-check] read failed:", error);
    return res.status(500).json({ error: error.message });
  }

  let alerted = 0;
  let skipped = 0;
  let promoted = 0;
  const errors: string[] = [];

  // Pull staff names in one batch for the alert text.
  const staffIds = Array.from(new Set((rows || []).map((r: any) => r.staff_id))).filter(Boolean);
  const profileMap = new Map<string, { full_name: string | null; email: string | null }>();
  if (staffIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", staffIds);
    for (const p of (profiles || []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
      profileMap.set(p.id, { full_name: p.full_name, email: p.email });
    }
  }

  for (const shift of rows || []) {
    try {
      // Skip shifts whose planned_start is still in the future or
      // less than 15min late.
      if (!shift.planned_start || shift.planned_start > cutoffHM) {
        continue;
      }

      // Auto-promote to status='missed' once the chef is >4h late.
      // Stops the alert loop forever and surfaces the no-show on
      // the schedule grid.
      if (shift.planned_start <= farCutoffHM) {
        try {
          await supabase
            .from("kitchen_shifts")
            .update({ status: "missed" })
            .eq("id", shift.id);
          promoted += 1;
        } catch (promErr: any) {
          errors.push(`${shift.id}: promote failed: ${promErr?.message || promErr}`);
        }
        continue;
      }

      // Idempotency: did we already alert about this exact shift in
      // the last 24h? Match on shift_id in the message body.
      const { count: recentAlerts, error: countErr } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("company_id", shift.company_id)
        .eq("notification_type", ALERT_TYPE)
        .ilike("message", `%${shift.id}%`)
        .gte("created_at", dayAgo);
      if (countErr) {
        errors.push(`${shift.id}: dedupe check failed: ${countErr.message}`);
        continue;
      }
      if (typeof recentAlerts === "number" && recentAlerts > 0) {
        skipped += 1;
        continue;
      }

      const chefProfile = profileMap.get(shift.staff_id);
      const chefLabel = chefProfile?.full_name || chefProfile?.email || "A rostered chef";
      const minutesLate = Math.floor((now.getTime() - new Date(`${shift.shift_date}T${shift.planned_start}`).getTime()) / 60000);

      // Broadcast to admin/owner roles in this company. Use
      // notificationService.broadcastNotification for the same fan-
      // out pattern Wave 28.6 uses.
      try {
        const { notificationService } = await import("@/services/notificationService");
        const { UserRole } = await import("@/types/app");
        await (notificationService as any).broadcastNotification(
          {
            companyId: shift.company_id,
            type: ALERT_TYPE,
            title: `Chef no-show: ${chefLabel}`,
            message:
              `${chefLabel} is rostered for ${shift.planned_start} today but hasn't clocked in. ` +
              `${minutesLate} minute${minutesLate === 1 ? "" : "s"} late. Shift ${shift.id}.`,
            priority: "high",
            link: `/admin/kitchen-schedule`,
            relatedEntityType: "kitchen_shift",
            relatedEntityId: shift.id,
            targetRoles: [
              UserRole.SUPER_ADMIN,
              UserRole.COMPANY_ADMIN,
              UserRole.ADMIN,
              "owner" as any,
            ],
            // 60-min broadcast-level dedup as a second layer of
            // defence against the cron firing twice in a window.
            dedup: true,
            dedupWindowMinutes: 60,
          },
          supabase,
        );
        alerted += 1;
      } catch (broadcastErr: any) {
        errors.push(`${shift.id}: broadcast failed: ${broadcastErr?.message || broadcastErr}`);
      }
    } catch (loopErr: any) {
      errors.push(`${shift.id}: ${loopErr?.message || loopErr}`);
    }
  }

  return res.status(200).json({
    ok: true,
    checked: (rows || []).length,
    alerted,
    skipped,
    promoted_to_missed: promoted,
    errors: errors.slice(0, 20),
  });
}
