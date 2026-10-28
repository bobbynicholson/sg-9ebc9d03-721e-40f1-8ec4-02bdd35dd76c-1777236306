/**
 * /api/admin/invoices/[id]/apply-credit
 *
 * Lets the team use a client's store credit when they record a payment
 * (the client pays the rest by EFT or cash). Before this, credit could
 * only be spent by the client on the online payment page.
 *
 *   GET  -> { ok, available, balanceDue, maxApplicable }
 *   POST { amount, requestId } -> spends up to `amount` of credit on this
 *        invoice via redeem_client_credit_once (same RPC as the payment
 *        page). `requestId` (uuid) makes a retry return the first result
 *        instead of spending the credit twice.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";
import { getClientCreditBalance } from "@/services/cancellation/clientCreditBalance";

const ALLOWED_ROLES = new Set(["super_admin", "company_admin", "admin", "owner", "sales_admin", "region_admin"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const invoiceId = typeof req.query.id === "string" ? req.query.id : "";
  if (!UUID.test(invoiceId)) return res.status(400).json({ error: "Valid invoice id required" });

  const ssr = createPagesServerClient({ req, res });
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return res.status(401).json({ error: "Not signed in" });
  const { data: profile } = await ssr.from("profiles").select("role, active_role, company_id").eq("id", user.id).maybeSingle();
  const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
  if (!ALLOWED_ROLES.has(role)) return res.status(403).json({ error: "Admin only" });
  const companyId = (profile as any)?.company_id as string | undefined;
  if (!companyId) return res.status(400).json({ error: "No company on profile" });

  const { data: invoice } = await ssr.from("invoices")
    .select("id, company_id, client_id, order_id, balance_due, status")
    .eq("company_id", companyId).eq("id", invoiceId).maybeSingle();
  if (!invoice) return res.status(404).json({ error: "Invoice not found in your company" });

  const admin: any = getServiceSupabase();
  const clientId = (invoice as any).client_id as string | null;
  const balanceDue = Number((invoice as any).balance_due) || 0;
  const balance = clientId ? await getClientCreditBalance(admin, { companyId, clientId }) : { available: 0 };
  const maxApplicable = Number(Math.min(balance.available, balanceDue).toFixed(2));

  if (req.method === "GET") {
    return res.status(200).json({ ok: true, available: balance.available, balanceDue, maxApplicable });
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const amount = typeof body.amount === "number" ? Number(body.amount.toFixed(2)) : NaN;
  const requestId = typeof body.requestId === "string" && UUID.test(body.requestId) ? body.requestId : null;
  if (!clientId) return res.status(400).json({ error: "This invoice has no client record, so there is no credit to use." });
  if (!requestId) return res.status(400).json({ error: "Missing request id. Close and reopen the window, then try again." });
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "Enter how much credit to use." });

  const { data: result, error } = await admin.rpc("redeem_client_credit_once", {
    p_company_id: companyId,
    p_client_id: clientId,
    p_invoice_id: invoiceId,
    p_order_id: (invoice as any).order_id ?? null,
    p_requested_amount: amount,
    p_created_by_user_id: user.id,
    p_request_id: requestId,
  });
  if (error) {
    console.error("[admin/invoices/apply-credit] redeem failed:", error);
    return res.status(error.code === "22023" ? 400 : 503).json({ error: "The credit could not be used on this invoice. Nothing was changed; please try again." });
  }
  const used = Number((result as any)?.redeemed_amount) || 0;
  const { data: after } = await admin.from("invoices").select("status, amount_paid, balance_due").eq("id", invoiceId).maybeSingle();

  try {
    await admin.from("audit_logs").insert({
      company_id: companyId, user_id: user.id, action: "invoice_credit_applied",
      entity_type: "invoice", entity_id: invoiceId,
      details: { requested: amount, used, replayed: (result as any)?.replayed === true },
    });
  } catch (auditErr) {
    console.warn("[admin/invoices/apply-credit] audit insert failed:", auditErr);
  }

  return res.status(200).json({
    ok: true,
    used,
    balanceDue: Number((after as any)?.balance_due ?? balanceDue - used),
    invoiceStatus: (after as any)?.status ?? null,
  });
}

export default withApiLogging(handler);
