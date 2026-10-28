/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";
import { extraNotSavedMessage, parseExtraHandling, recordOverpaymentExtra } from "@/lib/payments/overpaymentExtra";
const ADMIN_ROLES = new Set(["owner", "company_admin", "admin", "sales_admin", "region_admin", "super_admin"]);
async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { data: { user } } = await createPagesServerClient({ req, res }).auth.getUser();
    if (!user) return res.status(401).json({ error: "Sign in first" });
    const { payment_id, action, reason } = req.body || {};
    if (typeof payment_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payment_id) ||
        !["confirm", "reject"].includes(action)) return res.status(400).json({ error: "Invalid payment or action" });
    const admin: any = getServiceSupabase();
    const { data: profile, error: profileError } = await admin.from("profiles").select("role, company_id").eq("id", user.id).maybeSingle();
    if (profileError) return res.status(503).json({ error: "Could not verify permission" });
    if (!profile || !ADMIN_ROLES.has(profile.role)) return res.status(403).json({ error: "Admin only" });
    const { data: payment, error: paymentError } = await admin.from("payments")
      .select("company_id, payment_proof_path, amount, payment_status, gateway_response, client_id, order_id, invoice_id, currency, invoices:invoice_id ( invoice_number )")
      .eq("id", payment_id).maybeSingle();
    if (paymentError) return res.status(503).json({ error: "Could not load payment" });
    if (!payment) return res.status(404).json({ error: "Payment not found" });
    if (profile.role !== "super_admin" && profile.company_id !== payment.company_id) return res.status(403).json({ error: "Wrong company" });
    if (action === "confirm" && !payment.payment_proof_path) {
      return res.status(409).json({ error: "Payment proof is required before confirming an EFT claim" });
    }
    if (action === "confirm" && req.body?.bank_statement_verified !== true) {
      return res.status(400).json({ error: "Confirm that you verified the payment on the bank statement" });
    }
    // The client said they transferred more than the balance (claim-eft-proof
    // capped the claim). The team decides what happens to the extra.
    const reported = Number(payment.gateway_response?.client_reported_amount);
    const extra = action === "confirm" && payment.payment_status === "pending" && Number.isFinite(reported)
      ? Number((reported - Number(payment.amount || 0)).toFixed(2)) : 0;
    const extraHandling = parseExtraHandling(req.body?.extra_handling);
    if (extra > 0.01 && !extraHandling) {
      return res.status(400).json({ error: `The client says they transferred R ${reported.toFixed(2)}, R ${extra.toFixed(2)} more than this claim. Choose whether to keep the extra as client credit or refund it.` });
    }
    if (extra > 0.01 && extraHandling === "credit" && !payment.client_id) {
      return res.status(400).json({ error: "This claim has no client record, so the extra can't be kept as credit. Choose to refund it instead." });
    }
    // Refund: the full transfer is the payment (it is in the bank); the
    // pending refund nets the extra back out once paid. Credit: the claim
    // stays at what was owed and the extra becomes client credit.
    if (extra > 0.01 && extraHandling === "refund") {
      const { error: amountErr } = await admin.from("payments").update({ amount: reported })
        .eq("id", payment_id).eq("payment_status", "pending");
      if (amountErr) return res.status(503).json({ error: "Could not update the claim amount. Nothing was confirmed; please retry." });
    }
    const { data, error } = await admin.rpc("verify_eft_payment_claim", {
      p_payment_id: payment_id, p_company_id: payment.company_id, p_action: action,
      p_reason: typeof reason === "string" ? reason.trim().slice(0, 500) : null,
    });
    if (error && extra > 0.01 && extraHandling === "refund") {
      // Put the claim back as it was, so a retry still sees the extra.
      await admin.from("payments").update({ amount: Number(payment.amount) }).eq("id", payment_id).eq("payment_status", "pending");
    }
    if (error) return res.status(error.code === "23505" ? 409 : error.code === "22023" ? 400 : 503)
      .json({ error: error.code === "23505" ? "This claim was already resolved by another action" : "Could not verify this EFT claim" });
    let extraWarning: string | null = null;
    if (extra > 0.01 && extraHandling && payment.invoice_id) {
      const saved = await recordOverpaymentExtra(admin, {
        companyId: payment.company_id,
        clientId: payment.client_id ?? null,
        orderId: payment.order_id ?? null,
        invoiceId: payment.invoice_id,
        invoiceNumber: payment.invoices?.invoice_number ?? null,
        extra,
        received: reported,
        owed: Number(payment.amount || 0),
        handling: extraHandling,
        currency: payment.currency || "ZAR",
        userId: user.id,
        key: `eft-claim:${payment_id}:overpayment-${extraHandling}`,
      });
      if (saved.error) {
        console.error("verify-claim: overpayment record failed:", saved.error);
        extraWarning = extraNotSavedMessage(extra, extraHandling);
      }
    }
    // Notifications/receipts are queued in the same transaction, and retried
    // by reconcile-payment-events. Repeated confirmation does not add money.
    return res.status(200).json({ ok: true, ...data, ...(extra > 0.01 ? { extraAmount: extra, extraHandling, extraWarning } : {}) });
  } catch (error) {
    console.error("verify-claim failed", error);
    return res.status(503).json({ error: "Could not commit EFT verification. Please retry." });
  }
}
export default withApiLogging(handler);
