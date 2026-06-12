/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/payments/confirm-return  { public_token }
 *
 * Backstop for PayFast's unreliable SANDBOX ITN delivery. PayFast only
 * redirects the buyer to our return_url after a completed payment, so
 * when they land on /pay/i/{token}/success we can record the payment
 * even if the IPN never arrived.
 *
 * SAFETY: this auto-records ONLY when the company's active gateway is
 * in TEST mode. In production the authoritative path is the signed
 * PayFast ITN (webhooks/payment-confirmation) - live PayFast delivers
 * it reliably - so we never blindly trust a return URL with real
 * money. A live-mode call returns { pending: true } and changes
 * nothing.
 *
 * Idempotent: records with a deterministic transaction id
 * ('return-confirm-<invoiceId>'), and record_invoice_payment dedups
 * on it, so repeated returns / a later ITN never double-charge.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = typeof req.body?.public_token === "string" ? req.body.public_token.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(token)) {
    return res.status(400).json({ error: "Invalid token" });
  }

  const sb: any = getServiceSupabase();
  try {
    const { data: invoice } = await sb
      .from("invoices")
      .select("id, company_id, order_id, balance_due, total_amount, status, client_id, deleted_at")
      .eq("public_token", token)
      .maybeSingle();
    if (!invoice || invoice.deleted_at) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    if (invoice.status === "paid" || Number(invoice.balance_due || 0) <= 0) {
      return res.status(200).json({ ok: true, paid: true, alreadyPaid: true });
    }

    // Resolve the company's active gateway test flag.
    let isTest = false;
    try {
      const { paymentGatewayService } = await import("@/services/paymentGatewayService");
      const cfg = await paymentGatewayService.getActiveWithCredentials(invoice.company_id, sb);
      isTest = !!(cfg?.gateway as any)?.is_test;
    } catch (e) {
      console.warn("[confirm-return] gateway lookup failed:", e);
    }

    if (!isTest) {
      // Live mode: never auto-record off a return URL. The signed ITN
      // is the source of truth and PayFast delivers it reliably.
      return res.status(200).json({ ok: true, paid: false, pending: true });
    }

    const amount = Number(invoice.balance_due) || Number(invoice.total_amount) || 0;
    if (amount <= 0) {
      return res.status(200).json({ ok: true, paid: true });
    }

    const { data: rpcResult, error: rpcErr } = await sb.rpc("record_invoice_payment", {
      p_invoice_id: invoice.id,
      p_amount: amount,
      p_payment_method: "payfast",
      p_transaction_id: `return-confirm-${invoice.id}`,
      p_company_id: invoice.company_id,
      p_client_id: invoice.client_id,
      p_currency: "ZAR",
      p_gateway_provider: "payfast",
    });
    if (rpcErr) {
      console.error("[confirm-return] record_invoice_payment failed:", rpcErr);
      return res.status(500).json({ error: "Could not confirm payment" });
    }

    // Best-effort: stamp the linked order's deposit flag so the
    // deposit-reminder cron stops and the order reads "deposit paid".
    if (invoice.order_id) {
      try {
        await sb
          .from("orders")
          .update({
            deposit_paid: true,
            deposit_paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", invoice.order_id)
          .eq("deposit_paid", false);
      } catch (e) {
        console.warn("[confirm-return] deposit flag update failed:", e);
      }
    }

    return res.status(200).json({
      ok: true,
      paid: true,
      idempotent: (rpcResult as any)?.idempotent === true,
    });
  } catch (e: any) {
    console.error("[confirm-return] crashed:", e);
    return res.status(500).json({ error: e?.message || "crash" });
  }
}

export default withApiLogging(handler);
