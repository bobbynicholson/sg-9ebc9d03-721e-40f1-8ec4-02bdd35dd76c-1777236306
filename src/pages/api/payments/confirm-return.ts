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
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { withApiLogging } from "@/lib/withApiLogging";
import { notifyInvoicePaid } from "@/services/payments/notifyInvoicePaid";

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
      .select("id, company_id, order_id, balance_due, total_amount, status, client_id, deleted_at, invoice_data")
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

    const balance = Number(invoice.balance_due) || 0;

    // Record the amount the client ACTUALLY chose to pay now, not the
    // whole outstanding balance. create-session persists the exact gateway
    // charge (e.g. a 50% deposit) + a per-attempt nonce on invoice_data;
    // read it back here so a deposit payment records as a deposit and the
    // invoice/order land in 'partially_paid' / 'partial' rather than fully
    // "paid". Without this the backstop recorded the full balance and the
    // booking looked settled after a deposit (the reported bug).
    const data =
      invoice.invoice_data && typeof invoice.invoice_data === "object"
        ? invoice.invoice_data
        : {};
    const pending = Number((data as any).pendingGatewayAmount);
    const nonce =
      typeof (data as any).paySessionNonce === "string" ? (data as any).paySessionNonce : null;

    let amount =
      Number.isFinite(pending) && pending > 0 ? Math.min(pending, balance) : 0;

    // Fallback for a payment started before this field existed: prefer the
    // order's unpaid deposit over the full balance so we never silently
    // over-record a part-payment.
    if (amount <= 0) {
      let depositDefault = 0;
      if (invoice.order_id) {
        try {
          const { data: ord } = await sb
            .from("orders")
            .select("deposit_paid, deposit_amount")
            .eq("id", invoice.order_id)
            .maybeSingle();
          if (ord && !(ord as any).deposit_paid && Number((ord as any).deposit_amount) > 0) {
            depositDefault = Math.min(Number((ord as any).deposit_amount), balance);
          }
        } catch { /* fall through to balance */ }
      }
      amount = depositDefault > 0 ? depositDefault : (balance || Number(invoice.total_amount) || 0);
    }

    if (amount <= 0) {
      return res.status(200).json({ ok: true, paid: true });
    }

    // Per-attempt transaction id (nonce) so a later balance payment is not
    // deduped against the earlier deposit. Repeated returns for the SAME
    // attempt keep the same id and stay idempotent.
    const transactionId = nonce
      ? `return-confirm-${invoice.id}-${nonce}`
      : `return-confirm-${invoice.id}`;

    const { data: rpcResult, error: rpcErr } = await sb.rpc("record_invoice_payment", {
      p_invoice_id: invoice.id,
      p_amount: amount,
      p_payment_method: "payfast",
      p_transaction_id: transactionId,
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

      // Mirror the invoice's fresh paid state onto the ORDER so every
      // order-based surface (Finance section, timeline closeout, order list)
      // reflects the payment in real time - not just the invoice/billing
      // surfaces. Previously only deposit_paid was stamped, so a fully-paid
      // balance still read "outstanding / partial" on every order page.
      try {
        const { data: freshInv } = await sb
          .from("invoices")
          .select("amount_paid, balance_due")
          .eq("id", invoice.id)
          .maybeSingle();
        if (freshInv) {
          const paidToDate = Number((freshInv as any).amount_paid || 0);
          const bal = Math.max(0, Number((freshInv as any).balance_due ?? 0));
          const fullyPaid = bal <= 0.009;
          const patch: any = {
            amount_paid: paidToDate,
            balance_amount: bal,
            balance_paid: fullyPaid,
            payment_status: fullyPaid ? "paid" : paidToDate > 0 ? "partial" : "pending",
            updated_at: new Date().toISOString(),
          };
          if (fullyPaid) patch.balance_paid_at = new Date().toISOString();
          await sb.from("orders").update(patch).eq("id", invoice.order_id);
        }
      } catch (e) {
        console.warn("[confirm-return] order payment reconcile failed:", e);
      }
    }

    if ((rpcResult as any)?.idempotent !== true) {
      try {
        const { data: freshInvoice } = await sb
          .from("invoices")
          .select("invoice_number, status, balance_due, order_id, client_id")
          .eq("id", invoice.id)
          .maybeSingle();
        await notifyInvoicePaid({
          admin: sb,
          companyId: invoice.company_id,
          orderId: (freshInvoice as any)?.order_id || invoice.order_id || null,
          invoiceId: invoice.id,
          invoiceNumber: (freshInvoice as any)?.invoice_number || null,
          clientId: (freshInvoice as any)?.client_id || invoice.client_id || null,
          amount,
          currency: "ZAR",
          fullyPaid:
            String((freshInvoice as any)?.status || "").toLowerCase() === "paid" ||
            Number((freshInvoice as any)?.balance_due || 0) <= 0.009,
        });
      } catch (notifyErr) {
        console.warn("[confirm-return] notifyInvoicePaid failed:", notifyErr);
      }
    }

    return res.status(200).json({
      ok: true,
      paid: true,
      idempotent: (rpcResult as any)?.idempotent === true,
    });
  } catch (e: any) {
    console.error("[confirm-return] crashed:", e);
    return res.status(500).json({ error: dbErrorMessage(e) || "crash" });
  }
}

export default withApiLogging(handler);
