/**
 * GET /api/cron/cleaning-missed-clock-in-check
 *
 * Wave 40.4 cron worker. Cleaning-side mirror of
 * /api/cron/missed-clock-in-check.ts (kitchen) and
 * /api/cron/driver-missed-clock-in-check.ts (driver).
 *
 * Walks today's kitchen_shifts where:
 *   - shift_type IN ('cleaning', 'kitchen_and_cleaning')
 *   - status = 'scheduled'
 *   - planned_start was 15+ minutes ago
 *   - actual_start IS NULL
 *
 * Broadcasts a high-priority in-app notification to admin/owner
 * roles so the catering company knows when a cleaner no-shows
 * for a setup/break-down shift on event day.
 *
 * Auto-promotes shifts >4h late to status='missed' so the alert
 * loop stops + the schedule grid surfaces the no-show.
 *
 * Vercel cron: every 15 minutes (configured in vercel.json).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";

const CRON_NAME = "cleaning-missed-clock-in-check";
const ALERT_TYPE = "cleaning_missed_clock_in";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const supabase: any = getServiceSupabase();
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const cutoff = new Date(now.getTime() - 15 * 60 * 1000);
  const cutoffHM = `${String(cutoff.getHours()).padStart(2, "0")}:${String(cutoff.getMinutes()).padStart(2, "0")}`;
  const farCutoff = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  const farCutoffHM = `${String(farCutoff.getHours()).padStart(2, "0")}:${String(farCutoff.getMinutes()).padStart(2, "0")}`;

  const { data: rows, error } = await supabase
    .from("kitchen_shifts")
    .select("id, company_id, staff_id, shift_date, planned_start, planned_end, actual_start, status, shift_type")
    .eq("shift_date", todayIso)
    .eq("status", "scheduled")
    .in("shift_type", ["cleaning", "kitchen_and_cleaning"])
    .is("actual_start", null)
    .is("deleted_at", null)
    .not("planned_start", "is", null)
    .limit(500);

  if (error) {
    console.error("[cron/cleaning-missed-clock-in-check] read failed:", error);
    await recordCronHeartbeat(supabase, CRON_NAME, "error", { source: auth.source, error_message: error.message });
    return res.status(500).json({ error: error.message });
  }

  let alerted = 0;
  let skipped = 0;
  let promoted = 0;
  const errors: string[] = [];

  // Pull staff names in one batch.
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
      if (!shift.planned_start || shift.planned_start > cutoffHM) {
        continue;
      }

      // Auto-promote to status='missed' once the cleaner is >4h late.
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

      // 24h dedup on shift_id in the message body.
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

      const profile = profileMap.get(shift.staff_id);
      const label = profile?.full_name || profile?.email || "A rostered cleaner";
      const minutesLate = Math.floor(
        (now.getTime() - new Date(`${shift.shift_date}T${shift.planned_start}`).getTime()) / 60000,
      );

      try {
        const { notificationService } = await import("@/services/notificationService");
        const { UserRole } = await import("@/types/app");
        await (notificationService as any).broadcastNotification(
          {
            companyId: shift.company_id,
            type: ALERT_TYPE,
            title: `Cleaner no-show: ${label}`,
            message:
              `${label} is rostered for ${shift.planned_start} today but hasn't clocked in. ` +
              `${minutesLate} minute${minutesLate === 1 ? "" : "s"} late. Shift ${shift.id}.`,
            priority: "high",
            link: `/admin/cleaning-schedule`,
            relatedEntityType: "kitchen_shift",
            relatedEntityId: shift.id,
            targetRoles: [
              UserRole.SUPER_ADMIN,
              UserRole.COMPANY_ADMIN,
              UserRole.ADMIN,
              "owner" as any,
            ],
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

  await recordCronHeartbeat(supabase, CRON_NAME, errors.length > 0 ? "error" : "ok", {
    source: auth.source,
    checked: (rows || []).length,
    alerted, skipped,
    promoted_to_missed: promoted,
    errors_count: errors.length,
  });
  return res.status(200).json({
    ok: true,
    checked: (rows || []).length,
    alerted,
    skipped,
    promoted_to_missed: promoted,
    errors: errors.slice(0, 20),
  });
}
