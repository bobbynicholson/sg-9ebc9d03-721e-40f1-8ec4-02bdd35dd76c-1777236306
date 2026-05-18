/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";

/**
 * Cron: flip past-due unpaid invoices to status='overdue'.
 *
 * Wave 14 orphan audit: public.update_overdue_invoices() existed in the
 * database since the invoice-status overhaul but had ZERO callers. The
 * /admin/invoices "overdue" filter, the bulk-remind "overdue" scope,
 * the aging dashboard's overdue column, and the InvoiceAgingCard all
 * key off status='overdue' - which nothing was ever setting. Invoices
 * stayed at 'sent' indefinitely past their due_date, so the operator's
 * "show me what's late" views were always empty regardless of how
 * many invoices were actually overdue.
 *
 * The RPC walks invoices where due_date < CURRENT_DATE AND status IN
 * ('sent','partially_paid') AND balance_due > 0, flips them to
 * 'overdue', and returns the count. Idempotent on repeat runs.
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
    const { data, error } = await (sb as any).rpc("update_overdue_invoices");
    if (error) {
      console.error("[update-overdue-invoices] RPC failed:", error);
      return res.status(500).json({ error: error.message });
    }
    const flipped = typeof data === "number" ? data : 0;
    return res.status(200).json({ ok: true, flipped });
  } catch (e: any) {
    console.error("[update-overdue-invoices] crashed:", e);
    return res.status(500).json({ error: e?.message || "crash" });
  }
}
