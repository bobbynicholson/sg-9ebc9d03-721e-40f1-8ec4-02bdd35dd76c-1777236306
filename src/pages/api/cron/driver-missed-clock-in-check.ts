/**
 * GET /api/cron/driver-missed-clock-in-check
 *
 * Wave 37 cron worker. Driver-side mirror of
 * /api/cron/missed-clock-in-check.ts (Wave 36.2 kitchen version).
 *
 * Walks today's driver_shifts where:
 *   - status = 'scheduled' (still expected to land)
 *   - planned_start was 15+ minutes ago
 *   - actual_start IS NULL (driver hasn't clocked in yet)
 *   - shift_date = today
 *
 * For each, broadcasts a high-priority in-app notification to
 * dispatch / company_admin / owner roles.
 *
 * Also auto-promotes shifts >4h late to status='missed' so the
 * alert loop stops + the schedule grid surfaces the no-show.
 *
 * Vercel cron: every 15 minutes (configured in vercel.json).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";

const ALERT_TYPE = "driver_missed_clock_in";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const expected = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  if (expected && auth !== `Bearer ${expected}`) {
    return res.status(401).json({ error: "Unauthorised" });
  }

  const supabase: any = getServiceSupabase();
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const cutoff = new Date(now.getTime() - 15 * 60 * 1000);
  const cutoffHM = `${String(cutoff.getHours()).padStart(2, "0")}:${String(cutoff.getMinutes()).padStart(2, "0")}`;
  const farCutoff = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  const farCutoffHM = `${String(farCutoff.getHours()).padStart(2, "0")}:${String(farCutoff.getMinutes()).padStart(2, "0")}`;

  const { data: rows, error } = await supabase
    .from("driver_shifts")
    .select("id, company_id, driver_id, shift_date, planned_start, actual_start, status")
    .eq("shift_date", todayIso)
    .eq("status", "scheduled")
    .is("actual_start", null)
    .is("deleted_at", null)
    .not("planned_start", "is", null)
    .limit(500);

  if (error) {
    console.error("[cron/driver-missed-clock-in-check] read failed:", error);
    return res.status(500).json({ error: error.message });
  }

  let alerted = 0;
  let skipped = 0;
  let promoted = 0;
  const errors: string[] = [];

  // Pull driver names in one batch.
  const driverIds = Array.from(new Set((rows || []).map((r: any) => r.driver_id))).filter(Boolean);
  const profileMap = new Map<string, { full_name: string | null; email: string | null }>();
  if (driverIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", driverIds);
    for (const p of (profiles || []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
      profileMap.set(p.id, { full_name: p.full_name, email: p.email });
    }
  }

  for (const shift of rows || []) {
    try {
      if (!shift.planned_start || shift.planned_start > cutoffHM) {
        continue;
      }

      // Auto-promote shifts >4h late to status='missed' (mirrors
      // the kitchen logic).
      if (shift.planned_start <= farCutoffHM) {
        try {
          await supabase
            .from("driver_shifts")
            .update({ status: "missed" })
            .eq("id", shift.id);
          promoted += 1;
        } catch (promErr: any) {
          errors.push(`${shift.id}: promote failed: ${promErr?.message || promErr}`);
        }
        continue;
      }

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

      const driverProfile = profileMap.get(shift.driver_id);
      const driverLabel = driverProfile?.full_name || driverProfile?.email || "A rostered driver";
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
            title: `Driver no-show: ${driverLabel}`,
            message:
              `${driverLabel} is rostered for ${shift.planned_start} today but hasn't clocked in. ` +
              `${minutesLate} minute${minutesLate === 1 ? "" : "s"} late. Shift ${shift.id}.`,
            priority: "high",
            link: `/admin/driver-schedule`,
            relatedEntityType: "driver_shift",
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

  return res.status(200).json({
    ok: true,
    checked: (rows || []).length,
    alerted,
    skipped,
    promoted_to_missed: promoted,
    errors: errors.slice(0, 20),
  });
}
