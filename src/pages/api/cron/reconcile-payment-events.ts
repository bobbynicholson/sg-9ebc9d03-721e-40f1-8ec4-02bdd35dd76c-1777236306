import type { NextApiRequest, NextApiResponse } from "next";
import { requireCronAuth } from "@/lib/cronAuth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { recoverVerifiedPaymentEvents } from "@/lib/paymentRecovery";
import { drainPaymentReceipts } from "@/lib/paymentReceiptOutbox";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!["GET", "POST"].includes(req.method || "")) return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireCronAuth(req, res); if (!auth.ok) return;
  const admin = getServiceSupabase();
  try {
    const events = await recoverVerifiedPaymentEvents(admin);
    const receipts = await drainPaymentReceipts(admin);
    const errors = [...events.errors, ...receipts.errors];
    await recordCronHeartbeat(admin, "reconcile-payment-events", errors.length ? "error" : "ok", {
      source: auth.source, recovered: events.recovered, receipts_delivered: receipts.delivered, errors_count: errors.length,
    });
    return res.status(errors.length ? 503 : 200).json({ ok: errors.length === 0, events, receipts });
  } catch (failure) {
    console.error("reconcile-payment-events failed", failure);
    await recordCronHeartbeat(admin, "reconcile-payment-events", "error", { source: auth.source });
    return res.status(503).json({ ok: false, error: "Payment recovery could not complete" });
  }
}
export default withApiLogging(handler);
