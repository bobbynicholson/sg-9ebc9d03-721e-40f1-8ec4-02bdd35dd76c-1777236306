/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/payments/use-credit
 *
 * A client paying by EFT spends their store credit first, so they only
 * transfer the rest. Card payers already get this inside create-session;
 * EFT payers had no way to use part of their credit.
 *
 * Same access as /api/payments/credit-balance: the invoice's pay-link
 * token, or the signed-in client who owns the invoice.
 *
 * Body:  { invoice_id, public_token?, amount, request_id (uuid) }
 * Reply: { ok, used, balanceDue, invoiceStatus, creditLeft }
 *
 * `request_id` makes a retry or double click return the first result
 * instead of spending the credit twice (redeem_client_credit_once).
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getClientCreditBalance } from "@/services/cancellation/clientCreditBalance";
import { withApiLogging } from "@/lib/withApiLogging";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const body = (req.body || {}) as any;
  const invoiceId = typeof body.invoice_id === "string" ? body.invoice_id : "";
  const publicToken = typeof body.public_token === "string" ? body.public_token.trim() : "";
  const requestId = typeof body.request_id === "string" && UUID.test(body.request_id) ? body.request_id : null;
  const amount = typeof body.amount === "number" && Number.isFinite(body.amount) ? Number(body.amount.toFixed(2)) : NaN;
  if (!UUID.test(invoiceId)) return res.status(400).json({ error: "Invalid invoice" });
  if (!requestId || !(amount > 0)) return res.status(400).json({ error: "Refresh the page and try again." });

  const { data: { user } } = await createPagesServerClient({ req, res }).auth.getUser();
  if (!user && !publicToken) return res.status(401).json({ error: "Sign in or use the pay link" });

  const admin: any = getServiceSupabase();
  const { data: invoice } = await admin.from("invoices")
    .select("id, company_id, client_id, order_id, balance_due, status, deleted_at, public_token")
    .eq("id", invoiceId).maybeSingle();
  if (!invoice || invoice.deleted_at) return res.status(404).json({ error: "Invoice not found" });

  let allowed = !!publicToken && !!invoice.public_token && publicToken === invoice.public_token;
  if (!allowed && user) {
    const { data: row } = await admin.from("clients").select("id")
      .eq("id", invoice.client_id).eq("user_id", user.id).eq("company_id", invoice.company_id).maybeSingle();
    allowed = !!row;
  }
  if (!allowed) return res.status(403).json({ error: "Not your invoice" });
  if (!invoice.client_id) return res.status(400).json({ error: "There is no credit linked to this invoice." });

  // A transfer already being checked was claimed against the old balance;
  // lowering the balance now could make that transfer an overpayment.
  const { data: pendingClaims } = await admin.from("payments").select("id")
    .eq("invoice_id", invoiceId).eq("payment_method", "eft").eq("payment_status", "pending").limit(1);
  if ((pendingClaims || []).length > 0) {
    return res.status(409).json({ error: "Your bank transfer is still being checked. Your credit can be used once that is done, or ask the team to apply it." });
  }

  const { data: result, error } = await admin.rpc("redeem_client_credit_once", {
    p_company_id: invoice.company_id,
    p_client_id: invoice.client_id,
    p_invoice_id: invoiceId,
    p_order_id: invoice.order_id ?? null,
    p_requested_amount: amount,
    p_created_by_user_id: user?.id ?? null,
    p_request_id: requestId,
  });
  if (error) {
    console.error("[payments/use-credit] redeem failed:", error.code);
    return res.status(error.code === "22023" ? 400 : 503).json({ error: "Your credit could not be used just now. Nothing was changed; please try again." });
  }

  const used = Number((result as any)?.redeemed_amount) || 0;
  const { data: after } = await admin.from("invoices").select("balance_due, status").eq("id", invoiceId).maybeSingle();
  const balance = await getClientCreditBalance(admin, { companyId: invoice.company_id, clientId: invoice.client_id });
  return res.status(200).json({
    ok: true,
    used,
    balanceDue: Number(after?.balance_due ?? Number(invoice.balance_due) - used),
    invoiceStatus: after?.status ?? null,
    creditLeft: balance.available,
  });
}

export default withApiLogging(handler);
