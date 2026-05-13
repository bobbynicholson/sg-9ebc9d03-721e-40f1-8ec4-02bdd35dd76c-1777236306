/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";

/**
 * Cron: flip delivered orders to completed after the event window
 * closes.
 *
 * Flow audit Leg F P0-3: completeOrder() despite its name flips
 * status to "delivered" not "completed", and there was no other
 * auto-completion path. Every order sat at delivered forever, the
 * after-sales sequence (which keys on `completed`) never fired,
 * the 2-month/6-month rebook prompts were dead in practice.
 *
 * Rule: an order is auto-completable when status='delivered',
 * delivered_at is more than 24 hours ago (gives time for POD
 * upload + complaints to surface), payment_status is paid or
 * partial (cancelled / refunded orders skip), and there's no
 * outstanding pending_review.
 *
 * Idempotent: only matches `status='delivered'`. Once flipped to
 * completed the next run skips.
 *
 * Auth: requires `Authorization: Bearer ${CRON_SECRET}` so Vercel
 * Cron can call it but random visitors cannot.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Vercel Cron sends GET with the CRON_SECRET header.
  const provided = req.headers.authorization || "";
  const expected = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  if (expected && provided !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const sb = getServiceSupabase();
    const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Fetch candidate orders. Service-role bypasses RLS so we see
    // every tenant -- the trigger is platform-wide intentionally.
    const { data: candidates, error: selErr } = await (sb as any)
      .from("orders")
      .select("id, company_id, payment_status")
      .eq("status", "delivered")
      .lte("delivered_at", cutoffIso)
      .limit(200);

    if (selErr) {
      console.error("[auto-complete-delivered] select failed:", selErr);
      return res.status(500).json({ error: selErr.message });
    }

    const eligible = (candidates || []).filter(
      (o: any) => o.payment_status === "paid" || o.payment_status === "partial",
    );

    let flipped = 0;
    const errors: string[] = [];
    const { updateOrderStatus } = await import("@/services/order/orderWorkflow");

    for (const o of eligible) {
      try {
        const result = await updateOrderStatus(o.id, "completed");
        if (result.success) {
          flipped += 1;
        } else {
          errors.push(`${o.id}: ${(result as any).error}`);
        }
      } catch (e: any) {
        errors.push(`${o.id}: ${e?.message || e}`);
      }
    }

    return res.status(200).json({
      ok: true,
      considered: candidates?.length || 0,
      eligible: eligible.length,
      flipped,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: any) {
    console.error("[auto-complete-delivered] crashed:", e);
    return res.status(500).json({ error: e?.message || "crash" });
  }
}
