/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";

/**
 * Wave 50 C8 -- safety-net sweeper for deposit_paid-but-still-pending orders.
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
 * Auth: Authorization: Bearer ${CRON_SECRET}
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const provided = req.headers.authorization || "";
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (expected && provided !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const sb = getServiceSupabase();

    const { data: stuck, error } = await (sb as any)
      .from("orders")
      .select("id")
      .eq("deposit_paid", true)
      .in("status", ["pending", "draft"])
      .is("deleted_at", null)
      .limit(100);
    if (error) {
      console.error("[deposit-paid-sweeper] fetch failed:", error);
      return res.status(500).json({ error: error.message });
    }
    if (!stuck || stuck.length === 0) {
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

    return res.status(200).json({
      ok: true,
      considered: stuck.length,
      swept,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: any) {
    console.error("[deposit-paid-sweeper] crashed:", e);
    return res.status(500).json({ error: e?.message || "crash" });
  }
}
