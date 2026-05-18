/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";

const CRON_NAME = "deposit-paid-sweeper";

/**
 * Wave 50 C8 - safety-net sweeper for deposit_paid-but-still-pending orders.
 *
 * Audit (Specialist 4) flagged orders sitting at deposit_paid=true
 * AND status IN ('pending','draft') as a silent gap. Manual EFT
 * captures (operator forgets to flip status), gateway IPN edge cases
 * (race between webhook + admin status edit), and historical data
 * imports all leave orders in this stuck state. processDepositPayment
 * + processManualDepositPayment fix new flows; this sweeper catches
 * the historical drift.
 *
 * Strategy: hourly walk for orders with deposit_paid=true AND status
 * IN ('pending','draft'). Drive each through updateOrderStatus to
 * 'confirmed' so the kitchen prep tasks + pre-event reminders +
 * confirmation email all run. Idempotent (the status filter excludes
 * already-confirmed orders).
 *
 * Auth: Vercel cron bearer OR super_admin session.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const sb: any = getServiceSupabase();
  try {
    // `order_status` enum is (pending, confirmed, preparing, ready,
    // in_transit, delivered, completed, cancelled, paused). Prior
    // code listed "draft" alongside "pending", but draft isn't in
    // the enum - the .in filter raised a CHECK violation at the DB
    // layer and the sweeper returned 500 with no rows processed.
    // Deposits-paid-but-stuck only happens at status='pending'
    // anyway (orders never spend time at 'draft' between pay + flip).
    const { data: stuck, error } = await sb
      .from("orders")
      .select("id")
      .eq("deposit_paid", true)
      .eq("status", "pending")
      .is("deleted_at", null)
      .limit(100);
    if (error) {
      console.error("[deposit-paid-sweeper] fetch failed:", error);
      await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: error.message });
      return res.status(500).json({ error: error.message });
    }
    if (!stuck || stuck.length === 0) {
      await recordCronHeartbeat(sb, CRON_NAME, "ok", { source: auth.source, considered: 0, swept: 0 });
      return res.status(200).json({ ok: true, swept: 0 });
    }

    const { updateOrderStatus } = await import("@/services/order/orderWorkflow");
    let swept = 0;
    const errors: string[] = [];

    for (const o of stuck as any[]) {
      try {
        const r = await updateOrderStatus(o.id, "confirmed" as any);
        if ((r as any).success) {
          swept += 1;
        } else {
          errors.push(`${o.id}: ${(r as any).error}`);
        }
      } catch (e: any) {
        errors.push(`${o.id}: ${e?.message || e}`);
      }
    }

    await recordCronHeartbeat(sb, CRON_NAME, errors.length > 0 ? "error" : "ok", {
      source: auth.source,
      considered: stuck.length,
      swept,
      errors_count: errors.length,
    });
    return res.status(200).json({
      ok: true,
      considered: stuck.length,
      swept,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: any) {
    console.error("[deposit-paid-sweeper] crashed:", e);
    await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: e?.message || "crash" });
    return res.status(500).json({ error: e?.message || "crash" });
  }
}
