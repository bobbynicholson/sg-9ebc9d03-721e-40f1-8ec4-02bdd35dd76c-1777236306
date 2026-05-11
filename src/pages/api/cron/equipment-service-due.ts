/**
 * GET / POST /api/cron/equipment-service-due
 *
 * Phase 4 #6: daily sweep for equipment whose service is due. For
 * each tenant, finds equipment.next_service_due <= today + 7 days
 * that hasn't been notified about in the last 7 days, and broadcasts
 * an 'equipment_service_due' notification to admin/owner roles so
 * the operator schedules a service visit before the kit goes out
 * unserviced.
 *
 * De-duped per-equipment using audit_logs so we don't spam every day
 * for the same fridge.
 *
 * Schedule via Vercel cron at 05:00 UTC daily.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { createPagesServerClient } from "@/lib/supabase/server";

const LOOKAHEAD_DAYS = 7;
const DEDUPE_DAYS = 7;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Auth: cron secret OR super_admin session. Same pattern as the
  // currency-check and reconcile-payfast crons.
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  const isCron = !!expected && auth === `Bearer ${expected}`;

  let isSuperAdmin = false;
  if (!isCron) {
    try {
      const ssr = createPagesServerClient({ req, res });
      const { data: { user } } = await ssr.auth.getUser();
      if (user) {
        const { data: profile } = await ssr
          .from("profiles")
          .select("role, active_role")
          .eq("id", user.id)
          .maybeSingle();
        const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
        isSuperAdmin = role === "super_admin";
      }
    } catch {
      // fall through
    }
  }

  if (!isCron && !isSuperAdmin) {
    return res.status(401).json({ error: "Unauthorised" });
  }

  const sb: any = getServiceSupabase();

  // Cutoff date for "due soon": today + lookahead.
  const today = new Date();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + LOOKAHEAD_DAYS);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const { data: dueEquipment, error: equipErr } = await sb
    .from("equipment")
    .select("id, company_id, name, next_service_due, last_serviced_at")
    .lte("next_service_due", cutoffIso)
    .not("next_service_due", "is", null);

  if (equipErr) {
    console.error("[equipment-service-due] equipment lookup failed:", equipErr);
    return res.status(500).json({ error: equipErr.message });
  }

  // Phase 6 #3: same sweep for vehicles. The schema mirrors
  // equipment, so we can fan into a single loop below using a
  // discriminator field.
  const { data: dueVehicles, error: vehErr } = await sb
    .from("vehicles")
    .select("id, company_id, plate, nickname, next_service_due, last_serviced_at")
    .lte("next_service_due", cutoffIso)
    .not("next_service_due", "is", null)
    .is("deleted_at", null);
  if (vehErr) {
    console.warn("[equipment-service-due] vehicle lookup failed (non-blocking):", vehErr);
  }

  let notified = 0;
  let skipped = 0;

  // Pull recent dedupe history once -- DEDUPE_DAYS lookback. Same
  // table for both equipment and vehicle alerts; we key by
  // {action, entity_id} so the equipment-due dedupe doesn't suppress
  // a separate vehicle-due ping.
  const dedupeCutoff = new Date(today.getTime() - DEDUPE_DAYS * 86400_000).toISOString();
  const { data: recentAlerts } = await sb
    .from("audit_logs")
    .select("action, entity_id, created_at")
    .in("action", ["equipment_service_due_notified", "vehicle_service_due_notified"])
    .gte("created_at", dedupeCutoff);
  const recentSet = new Set<string>(
    (recentAlerts || []).map((r: any) => `${r.action}|${r.entity_id || ""}`),
  );

  // Normalise both lists into a single shape so the notify loop
  // doesn't fork on kind.
  type DueRow = {
    id: string;
    company_id: string;
    name: string;
    next_service_due: string | null;
    kind: "equipment" | "vehicle";
  };
  const dueRows: DueRow[] = [
    ...((dueEquipment || []) as any[]).map((eq) => ({
      id: eq.id,
      company_id: eq.company_id,
      name: eq.name || "Unnamed equipment",
      next_service_due: eq.next_service_due,
      kind: "equipment" as const,
    })),
    ...((dueVehicles || []) as any[]).map((v) => ({
      id: v.id,
      company_id: v.company_id,
      name: v.nickname || v.plate || "Unnamed vehicle",
      next_service_due: v.next_service_due,
      kind: "vehicle" as const,
    })),
  ];

  for (const row of dueRows) {
    const auditAction =
      row.kind === "equipment"
        ? "equipment_service_due_notified"
        : "vehicle_service_due_notified";
    if (recentSet.has(`${auditAction}|${row.id}`)) {
      skipped += 1;
      continue;
    }
    try {
      const dueDate = row.next_service_due
        ? new Date(row.next_service_due).toLocaleDateString("en-ZA", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : "soon";
      const overdue = row.next_service_due
        ? new Date(row.next_service_due).getTime() < today.getTime()
        : false;
      const kindLabel = row.kind === "vehicle" ? "Vehicle" : "Equipment";
      const link =
        row.kind === "vehicle"
          ? `/admin/vehicles?id=${row.id}`
          : `/admin/equipment?id=${row.id}`;
      const { notificationService } = await import("@/services/notificationService");
      await notificationService.broadcastNotification(
        {
          companyId: row.company_id,
          targetRoles: ["company_admin" as any, "admin" as any, "owner" as any],
          title: overdue ? `Service overdue: ${row.name}` : `Service due: ${row.name}`,
          message: overdue
            ? `${kindLabel} '${row.name}' was due for service on ${dueDate}. Log a service entry to reset the cycle.`
            : `${kindLabel} '${row.name}' is due for service on ${dueDate}. Schedule it in advance so it stays available.`,
          type:
            row.kind === "vehicle" ? "vehicle_service_due" : "equipment_service_due",
          priority: overdue ? "high" : "normal",
          link,
          relatedEntityType: row.kind,
          relatedEntityId: row.id,
        },
        sb,
      );
      await sb.from("audit_logs").insert({
        company_id: row.company_id,
        action: auditAction,
        entity_type: row.kind,
        entity_id: row.id,
        details: { next_service_due: row.next_service_due, overdue },
      });
      notified += 1;
    } catch (e: any) {
      console.warn("[equipment-service-due] notify failed for", row.kind, row.id, e?.message);
    }
  }

  return res.status(200).json({
    ok: true,
    checked: dueRows.length,
    checked_equipment: dueEquipment?.length ?? 0,
    checked_vehicles: dueVehicles?.length ?? 0,
    notified,
    skipped_dedupe: skipped,
  });
}
