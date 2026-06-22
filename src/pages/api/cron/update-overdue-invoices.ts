/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { requireCronAuth } from "@/lib/cronAuth";
import { recordCronHeartbeat } from "@/lib/cronHeartbeat";
import { withApiLogging } from "@/lib/withApiLogging";


const CRON_NAME = "update-overdue-invoices";

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
 * Auth: Vercel cron bearer OR super_admin session.
 */
async function handler(req: NextApiRequest, res: NextApiResponse) {
  const auth = await requireCronAuth(req, res);
  if (!auth.ok) return;

  const sb: any = getServiceSupabase();
  try {
    const { data, error } = await sb.rpc("update_overdue_invoices");
    if (error) {
      console.error("[update-overdue-invoices] RPC failed:", error);
      await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: error.message });
      return res.status(500).json({ error: error.message });
    }
    const flipped = typeof data === "number" ? data : 0;

    // The RPC flips status silently. Tell each tenant's admins what's
    // overdue so the aging list isn't something they have to remember to
    // open. One digest per company per day (this cron runs once daily).
    let notified = 0;
    try {
      const { data: overdue } = await sb
        .from("invoices")
        .select("company_id, balance_due")
        .eq("status", "overdue")
        .gt("balance_due", 0)
        .is("deleted_at", null)
        .limit(5000);
      if (overdue && overdue.length) {
        const byCo = new Map<string, { count: number; total: number }>();
        for (const inv of overdue as any[]) {
          const e = byCo.get(inv.company_id) || { count: 0, total: 0 };
          e.count += 1;
          e.total += Number(inv.balance_due || 0);
          byCo.set(inv.company_id, e);
        }
        const { notificationService } = await import("@/services/notificationService");
        for (const [companyId, agg] of byCo.entries()) {
          try {
            const totalLabel = `R${agg.total.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            const sent = await notificationService.broadcastNotification(
              {
                companyId,
                targetRoles: ["company_admin" as any, "admin" as any, "owner" as any],
                title: `💸 ${agg.count} invoice${agg.count === 1 ? "" : "s"} overdue`,
                message: `${agg.count} invoice${agg.count === 1 ? "" : "s"} past due, ${totalLabel} outstanding. Review the aging list and chase payment.`,
                type: "invoices_overdue_digest",
                priority: "high",
                link: "/admin/invoices?status=overdue",
                relatedEntityType: "company",
                relatedEntityId: companyId,
                dedup: true,
                dedupWindowMinutes: 20 * 60,
              },
              sb,
            );
            if ((sent || 0) > 0) notified += 1;
          } catch (e: any) {
            console.warn("[update-overdue-invoices] notify failed for company", companyId, e?.message || e);
          }
        }
      }
    } catch (notifyErr: any) {
      console.warn("[update-overdue-invoices] digest pass failed (non-blocking):", notifyErr?.message || notifyErr);
    }

    await recordCronHeartbeat(sb, CRON_NAME, "ok", { source: auth.source, flipped, notified });
    return res.status(200).json({ ok: true, flipped, notified });
  } catch (e: any) {
    console.error("[update-overdue-invoices] crashed:", e);
    await recordCronHeartbeat(sb, CRON_NAME, "error", { source: auth.source, error_message: e?.message || "crash" });
    return res.status(500).json({ error: e?.message || "crash" });
  }
}

export default withApiLogging(handler);
