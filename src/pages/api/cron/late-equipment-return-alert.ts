/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";

const CRON_NAME = "late-equipment-return-alert";
const ALERT_AFTER_HOURS = 20;

function orderLabel(order: any, fallbackId: string): string {
  return order?.order_number || order?.event_name || fallbackId.slice(0, 8);
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const sb: any = getServiceSupabase();
  const cutoffIso = new Date(Date.now() - ALERT_AFTER_HOURS * 60 * 60 * 1000).toISOString();

  try {
    const { data: handovers, error } = await sb
      .from("cleaning_event_handovers")
      .select("id, company_id, order_id, expected_at, total_items_expected, total_items_returned")
      .eq("status", "expected")
      .not("expected_at", "is", null)
      .lt("expected_at", cutoffIso)
      .is("deleted_at", null)
      .limit(1000);

    if (error) {
      await recordCronHeartbeat(sb, CRON_NAME, "error", {
        source: auth.source,
        error_message: error.message,
      });
      return res.status(500).json({ error: error.message });
    }

    if (!handovers?.length) {
      await recordCronHeartbeat(sb, CRON_NAME, "ok", {
        source: auth.source,
        considered: 0,
        notified: 0,
      });
      return res.status(200).json({ ok: true, considered: 0, notified: 0 });
    }

    const orderIds = Array.from(new Set((handovers as any[]).map((h) => h.order_id).filter(Boolean)));
    const { data: orders } = orderIds.length
      ? await sb
          .from("orders")
          .select("id, company_id, region_id, order_number, event_name, client_name, venue_name, venue_address, event_date, event_time, event_end_date, status")
          .in("id", orderIds)
      : { data: [] };
    const orderById = new Map<string, any>((orders || []).map((o: any) => [o.id, o]));
    const { notificationService } = await import("@/services/notificationService");

    let notified = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const handover of handovers as any[]) {
      const order = orderById.get(handover.order_id);
      if (!order || ["cancelled", "rejected"].includes(String(order.status || "").toLowerCase())) {
        skipped += 1;
        continue;
      }

      const label = orderLabel(order, handover.order_id);
      const dueLabel = handover.expected_at
        ? new Date(handover.expected_at).toLocaleString("en-ZA", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "the expected return time";
      const expected = Number(handover.total_items_expected || 0);
      const returned = Number(handover.total_items_returned || 0);
      const outstanding = expected > 0 ? Math.max(0, expected - returned) : null;

      try {
        const sent = await notificationService.broadcastNotification({
          companyId: handover.company_id,
          regionId: order.region_id || null,
          targetRoles: ["company_admin" as any, "admin" as any, "owner" as any, "cleaning_staff" as any],
          type: "equipment_return_late",
          title: `Equipment return overdue: ${label}`,
          message:
            `Equipment for ${order.client_name || label} was expected back by ${dueLabel}` +
            `${outstanding != null ? ` and ${outstanding} item${outstanding === 1 ? "" : "s"} remain outstanding` : ""}.`,
          priority: "high",
          link: `/team-portal/cleaning/handovers/${handover.id}`,
          relatedEntityType: "cleaning_event_handover",
          relatedEntityId: handover.id,
          dedup: true,
          dedupWindowMinutes: 18 * 60,
        }, sb);
        if ((sent || 0) > 0) notified += 1;
      } catch (notifyErr: any) {
        errors.push(`${handover.id}: ${notifyErr?.message || notifyErr}`);
      }
    }

    await recordCronHeartbeat(sb, CRON_NAME, errors.length ? "error" : "ok", {
      source: auth.source,
      considered: handovers.length,
      notified,
      skipped,
      errors_count: errors.length,
    });

    return res.status(200).json({
      ok: true,
      considered: handovers.length,
      notified,
      skipped,
      errors,
    });
  } catch (err: any) {
    await recordCronHeartbeat(sb, CRON_NAME, "error", {
      source: auth.source,
      error_message: err?.message || String(err),
    });
    return res.status(500).json({ error: err?.message || "Late return alert failed" });
  }
}

export default withApiLogging(handler);
