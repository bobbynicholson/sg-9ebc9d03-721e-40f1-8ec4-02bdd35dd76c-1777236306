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
 *   - shift_date = today (in the TENANT's timezone)
 *
 * For each, broadcasts a high-priority in-app notification to
 * dispatch / company_admin / owner roles.
 *
 * Also auto-promotes shifts >4h late to status='missed' so the
 * alert loop stops + the schedule grid surfaces the no-show.
 *
 * Timezone note (fixed 2026-07-02): the original pass compared a UTC
 * calendar date (toISOString().slice(0,10)) against a server-local
 * HH:MM (cutoff.getHours()). On Vercel (UTC servers) that meant an
 * SA tenant's 07:00 shift only alerted from 07:00 UTC = 09:00 SAST,
 * two hours late, and shifts after 22:00 SAST were checked against
 * the wrong calendar day entirely. Both sides of the comparison now
 * live in the tenant's own timezone (companies.timezone, same recipe
 * as /api/cron/recurring-invoices.ts).
 *
 * Vercel cron: every 15 minutes (configured in vercel.json).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";
import { toZonedISO, DEFAULT_TENANT_TIMEZONE } from "@/lib/localDate";


const CRON_NAME = "driver-missed-clock-in-check";
const ALERT_TYPE = "driver_missed_clock_in";
const LATE_ALERT_MINUTES = 15;
const AUTO_MISS_MINUTES = 4 * 60;

/** Wall-clock minutes-since-midnight for `d` in an IANA timezone.
 *  Falls back to the server-local clock on a bad timezone string. */
function zonedMinutesOfDay(d: Date, timezone: string): number {
  try {
    const hm = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(d);
    const [h, m] = hm.split(":").map(Number);
    if (Number.isFinite(h) && Number.isFinite(m)) return h * 60 + m;
  } catch {
    // fall through to server-local
  }
  return d.getHours() * 60 + d.getMinutes();
}

/** "HH:MM[:SS]" -> minutes since midnight, or null if unparseable. */
function parseHM(value: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value || "").trim());
  if (!m) return null;
  const mins = Number(m[1]) * 60 + Number(m[2]);
  return Number.isFinite(mins) ? mins : null;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const supabase: any = getServiceSupabase();
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // Loose UTC pre-filter: "today" differs per tenant timezone, so
  // pull shift_date in [UTC today - 1, UTC today + 1] and re-check
  // each row against ITS tenant's local calendar day below. The
  // one-day pad covers every timezone offset in either direction.
  const utcTodayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dateWindowFrom = new Date(utcTodayMs - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dateWindowTo = new Date(utcTodayMs + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data: rows, error } = await supabase
    .from("driver_shifts")
    .select("id, company_id, driver_id, shift_date, planned_start, actual_start, status")
    .gte("shift_date", dateWindowFrom)
    .lte("shift_date", dateWindowTo)
    .eq("status", "scheduled")
    .is("actual_start", null)
    .is("deleted_at", null)
    .not("planned_start", "is", null)
    .limit(500);

  if (error) {
    console.error("[cron/driver-missed-clock-in-check] read failed:", error);
    await recordCronHeartbeat(supabase, CRON_NAME, "error", { source: auth.source, error_message: error.message });
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

  // Tenant timezones in one batch so each shift is judged on its own
  // company's wall clock.
  const companyIds = Array.from(new Set((rows || []).map((r: any) => r.company_id))).filter(Boolean);
  const timezoneByCompany = new Map<string, string>();
  if (companyIds.length > 0) {
    const { data: companies, error: companiesError } = await supabase
      .from("companies")
      .select("id, timezone")
      .in("id", companyIds);
    if (companiesError) {
      // Not fatal: rows fall back to the platform default timezone.
      errors.push(`companies timezone fetch failed: ${companiesError.message}`);
    }
    for (const c of (companies || []) as Array<{ id: string; timezone: string | null }>) {
      timezoneByCompany.set(c.id, c.timezone || DEFAULT_TENANT_TIMEZONE);
    }
  }

  for (const shift of rows || []) {
    try {
      const tenantTz = timezoneByCompany.get(shift.company_id) || DEFAULT_TENANT_TIMEZONE;
      const tenantTodayIso = toZonedISO(now, tenantTz);

      // Only today's roster, on THIS tenant's calendar.
      if (String(shift.shift_date) !== tenantTodayIso) {
        continue;
      }

      const plannedMinutes = parseHM(shift.planned_start);
      if (plannedMinutes === null) {
        continue;
      }

      // Both sides in tenant wall-clock minutes. shift_date equals
      // tenant-today, so planned_start is today's tenant wall time.
      const nowMinutes = zonedMinutesOfDay(now, tenantTz);
      const minutesLate = nowMinutes - plannedMinutes;

      if (minutesLate < LATE_ALERT_MINUTES) {
        continue;
      }

      // Auto-promote shifts >4h late to status='missed' (mirrors
      // the kitchen logic).
      if (minutesLate >= AUTO_MISS_MINUTES) {
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

export default withApiLogging(handler);
