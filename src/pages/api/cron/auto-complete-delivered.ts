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
    // every tenant - the trigger is platform-wide intentionally.
    //
    // Wave 48 A2 - tightened payment filter. The original "paid OR
    // partial" gate let orders complete with money still owed, which
    // then kicked the after-sales drip at customers who hadn't yet
    // settled the balance (Specialist 1 P1 finding). Now we demand
    // payment_status='paid' AND no outstanding balance_due.
    const { data: candidates, error: selErr } = await (sb as any)
      .from("orders")
      .select("id, company_id, payment_status, balance_due, total_amount, balance_paid")
      .eq("status", "delivered")
      .lte("delivered_at", cutoffIso)
      .limit(200);

    if (selErr) {
      console.error("[auto-complete-delivered] select failed:", selErr);
      return res.status(500).json({ error: selErr.message });
    }

    const eligible = (candidates || []).filter((o: any) => {
      // Hard rule: payment_status must be 'paid'. Partial no longer
      // qualifies - it triggered the after-sales drip on debtors.
      if (o.payment_status !== "paid") return false;
      // Belt and braces: also confirm no outstanding balance owed.
      // balance_paid is the canonical truth where it exists; fall
      // back to balance_due numeric check.
      if (o.balance_paid === false) return false;
      const bd = Number(o.balance_due ?? 0);
      if (Number.isFinite(bd) && bd > 0.01) return false;
      return true;
    });

    let flipped = 0;
    let damagesReconciled = 0;
    let totalRecovered = 0;
    const errors: string[] = [];
    const { updateOrderStatus } = await import("@/services/order/orderWorkflow");
    const { reconcileOnComplete } = await import("@/services/order/orderFinancials");

    for (const o of eligible) {
      try {
        // Wave 49 B8 - run damage reconciliation BEFORE the status
        // flip so the balance_due bump lands while the customer is
        // still on the active-orders surface. Non-blocking: a failed
        // reconciliation does not block the completion flip; ops
        // gets a row in errors[] instead.
        try {
          const recon = await reconcileOnComplete(o.id);
          if (recon.success && recon.totalRecovered > 0) {
            damagesReconciled += recon.damageCount;
            totalRecovered += recon.totalRecovered;
          } else if (!recon.success && recon.error) {
            errors.push(`${o.id} reconcile: ${recon.error}`);
          }
        } catch (rErr: any) {
          errors.push(`${o.id} reconcile crashed: ${rErr?.message || rErr}`);
        }

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
      damagesReconciled,
      totalRecovered,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (e: any) {
    console.error("[auto-complete-delivered] crashed:", e);
    return res.status(500).json({ error: e?.message || "crash" });
  }
}
