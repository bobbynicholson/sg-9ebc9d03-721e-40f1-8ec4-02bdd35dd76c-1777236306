/**
 * POST /api/admin/invoices/[id]/mark-paid
 *
 * Wave 66.5 - single-invoice manual-payment recording with operator
 * metadata. The companion to bulk-mark-paid: same canonical RPC
 * (record_invoice_payment) so the payments ledger + orders.payment_status
 * + invoices.status all stay coherent, but accepts per-row metadata
 * (amount, payment method, reference, internal note) so the operator's
 * MarkPaidDialog can record a real payment instead of a placeholder.
 *
 * Bulk-mark-paid stayed untouched - it has zero per-row metadata and
 * is wired to the checkbox toolbar; this endpoint is wired to the
 * per-row "$ Mark paid" button + dialog.
 *
 * Auth: signed-in admin/owner/sales_admin/region_admin on the tenant.
 * The invoice is filtered to company_id == caller's company_id before
 * we touch it, so a compromised account can't pay another tenant's
 * invoices.
 *
 * Body:
 *   {
 *     amount?: number,           // defaults to balance_due
 *     paymentMethod?: string,    // 'bank_transfer' | 'cash' | 'eft' | 'card' | 'manual'
 *     reference?: string,        // free text shown to bookkeeping; doubles as transaction_id for idempotency
 *     note?: string,             // optional, written to audit_logs.details.note
 *   }
 * Returns: { ok, paymentId?, amountPaid, balanceDue, invoiceStatus }
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";
import { notifyInvoicePaid } from "@/services/payments/notifyInvoicePaid";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { extraNotSavedMessage, parseExtraHandling, recordOverpaymentExtra } from "@/lib/payments/overpaymentExtra";


const ALLOWED_ROLES = new Set([
  "super_admin",
  "company_admin",
  "admin",
  "owner",
  "sales_admin",
  "region_admin",
]);

const ALLOWED_METHODS = new Set([
  "bank_transfer",
  "cash",
  "eft",
  "card",
  "cheque",
  "manual",
]);

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const invoiceId = typeof req.query.id === "string" ? req.query.id : null;
    if (!invoiceId || !/^[0-9a-f-]{36}$/i.test(invoiceId)) {
      return res.status(400).json({ error: "Valid invoice id required" });
    }

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Not signed in" });

    const { data: profile, error: profileErr } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileErr) {
      console.error("[admin/invoices/mark-paid] profiles fetch failed:", profileErr);
    }
    const role = ((profile as any)?.active_role || (profile as any)?.role || "") as string;
    if (!ALLOWED_ROLES.has(role)) return res.status(403).json({ error: "Admin only" });
    const companyId = (profile as any)?.company_id as string | undefined;
    if (!companyId) return res.status(400).json({ error: "No company on profile" });

    const body = (req.body || {}) as Record<string, unknown>;
    const rawAmount = body.amount;
    const rawMethod = body.paymentMethod;
    const rawReference = body.reference;
    const rawNote = body.note;
    const rawKey = body.idempotencyKey;

    const paymentMethod = (typeof rawMethod === "string" && ALLOWED_METHODS.has(rawMethod))
      ? rawMethod
      : "manual";
    const reference = typeof rawReference === "string" && rawReference.trim().length > 0
      ? rawReference.trim().slice(0, 120)
      : null;
    const note = typeof rawNote === "string" && rawNote.trim().length > 0
      ? rawNote.trim().slice(0, 500)
      : null;
    const attemptKey = typeof rawKey === "string" && /^[\w-]{8,80}$/.test(rawKey) ? rawKey : null;

    // Tenant-scoped read so we can surface a useful error if the id
    // is wrong or belongs to another company. RLS would already block
    // a cross-tenant write, but we double-check here for the message.
    const { data: invoice, error: readErr } = await ssr
      .from("invoices")
      // invoices has no currency column; currency is resolved from the company below.
      .select("id, company_id, client_id, total_amount, balance_due, status, invoice_number, order_id")
      .eq("company_id", companyId)
      .eq("id", invoiceId)
      .maybeSingle();
    if (readErr) {
      console.error("[admin/invoices/mark-paid] read failed:", readErr);
      return res.status(500).json({ error: dbErrorMessage(readErr) });
    }
    if (!invoice) return res.status(404).json({ error: "Invoice not found in your company" });
    const isPaid = (invoice as any).status === "paid";
    // A paid invoice can still take money the client sent again or on top
    // (e.g. paid twice by mistake), but only as credit or a refund.
    if (isPaid && !parseExtraHandling(body.extraHandling)) {
      return res.status(409).json({ error: "Invoice is already fully paid. To record money the client sent on top, choose to keep it as credit or refund it." });
    }

    const defaultAmount = isPaid ? 0 : Number((invoice as any).balance_due ?? (invoice as any).total_amount ?? 0);
    const amount = typeof rawAmount === "number" && Number.isFinite(rawAmount) && rawAmount > 0
      ? Number(rawAmount.toFixed(2))
      : defaultAmount;
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "Amount must be greater than zero" });
    }
    // A client who pays more than is owed: the operator must say what
    // happens to the extra, so it is never silently lost or silently kept.
    //   credit -> the invoice takes what is owed; the extra becomes store
    //             credit (credit_issue) the client can use next time.
    //   refund -> the full amount received is recorded (it is in the bank)
    //             and a pending refund for the extra goes to Refunds &
    //             Credits, the same way an order reduced after payment is
    //             handled in refresh-from-order.
    const extra = Number((amount - defaultAmount).toFixed(2));
    const extraHandling = parseExtraHandling(body.extraHandling);
    if (extra > 0.01 && !extraHandling) {
      return res.status(400).json({
        error: `Amount R ${amount.toFixed(2)} is more than the outstanding R ${defaultAmount.toFixed(2)}. Choose whether to keep the extra R ${extra.toFixed(2)} as client credit or refund it.`,
      });
    }
    if (extra > 0.01 && extraHandling === "credit" && !(invoice as any).client_id) {
      return res.status(400).json({
        error: "This invoice has no client record, so the extra can't be kept as credit. Choose to refund it instead.",
      });
    }
    const handlesExtra = extra > 0.01 && !!extraHandling;
    const invoiceAmount = handlesExtra && extraHandling === "credit" ? defaultAmount : amount;

    let admin: any;
    try {
      admin = getServiceSupabase();
    } catch {
      return res.status(500).json({ error: "Server not configured" });
    }

    // Resolve currency from invoice -> fall back to company default.
    let currency = ((invoice as any).currency as string) || "ZAR";
    if (!(invoice as any).currency) {
      try {
        const { data: companyRow } = await ssr
          .from("companies")
          .select("currency")
          .eq("id", companyId)
          .maybeSingle();
        if ((companyRow as any)?.currency) currency = (companyRow as any).currency;
      } catch {
        // non-fatal
      }
    }

    // transaction_id is the RPC's duplicate-protection key. It must NOT
    // be the operator's reference: the dialog pre-fills the reference
    // with the invoice number, so a second payment on the same invoice
    // (deposit, then balance) matched the first and was silently
    // dropped while the receipt emails still went out. Use the
    // dialog's per-submission key; the reference is stamped onto the
    // payment row afterwards.
    const transactionId = attemptKey
      ? `manual-${attemptKey}`
      : `manual-${user.id.slice(0, 8)}-${Date.now()}`;

    // Nothing goes on the invoice when it was already paid and the whole
    // amount is kept as credit; only the credit is written below.
    let rpcResult: { idempotent?: boolean; payment_id?: string } = {};
    if (invoiceAmount > 0) {
      const { data: rpcData, error: rpcErr } = await admin.rpc("record_invoice_payment", {
        p_invoice_id: invoiceId,
        p_amount: invoiceAmount,
        p_payment_method: paymentMethod,
        p_transaction_id: transactionId,
        p_company_id: companyId,
        p_client_id: (invoice as any).client_id ?? null,
        p_currency: currency,
        p_gateway_provider: paymentMethod === "card" ? "manual_card" : "manual",
      });
      if (rpcErr) {
        console.error("[admin/invoices/mark-paid] RPC failed:", rpcErr);
        return res.status(500).json({ error: dbErrorMessage(rpcErr) });
      }
      rpcResult = (rpcData || {}) as { idempotent?: boolean; payment_id?: string };
    }
    const { data: invoiceAfter } = await admin
      .from("invoices")
      .select("id, status, amount_paid, balance_due")
      .eq("id", invoiceId)
      .maybeSingle();

    // Same submission arrived twice (double click / retry): it was
    // recorded the first time. Don't audit or email it again.
    if (rpcResult.idempotent) {
      return res.status(200).json({
        ok: true,
        duplicate: true,
        amountPaid: (invoiceAfter as any)?.amount_paid ?? 0,
        balanceDue: (invoiceAfter as any)?.balance_due ?? 0,
        invoiceStatus: (invoiceAfter as any)?.status ?? "partially_paid",
      });
    }

    // Keep the operator's reference on the payment for bookkeeping.
    if (reference && rpcResult.payment_id) {
      const { error: refErr } = await admin
        .from("payments")
        .update({ payment_reference: reference })
        .eq("id", rpcResult.payment_id)
        .eq("company_id", companyId);
      if (refErr) console.warn("[admin/invoices/mark-paid] reference stamp failed:", refErr);
    }

    // Record what happens to the extra. The payment above is already in, so
    // a failure here is reported back for the team to add by hand rather
    // than failing the whole payment.
    let extraPaymentId: string | null = null;
    let extraWarning: string | null = null;
    if (handlesExtra && extraHandling) {
      const saved = await recordOverpaymentExtra(admin, {
        companyId,
        clientId: (invoice as any).client_id ?? null,
        orderId: (invoice as any).order_id ?? null,
        invoiceId,
        invoiceNumber: (invoice as any).invoice_number ?? null,
        extra,
        received: amount,
        owed: defaultAmount,
        handling: extraHandling,
        currency,
        userId: user.id,
        key: `${transactionId}:overpayment-${extraHandling}`,
      });
      if (saved.error) {
        console.error("[admin/invoices/mark-paid] overpayment record failed:", saved.error);
        extraWarning = extraNotSavedMessage(extra, extraHandling);
        // Nothing at all was recorded when the whole amount was meant as credit.
        if (invoiceAmount <= 0) return res.status(500).json({ error: `Could not save the R ${extra.toFixed(2)} as client credit. Nothing was recorded; please try again.` });
      } else {
        extraPaymentId = saved.id;
        // Credit-only retry of a submission already saved: no second audit or email.
        if (saved.existed && invoiceAmount <= 0) {
          return res.status(200).json({ ok: true, duplicate: true, amountPaid: (invoiceAfter as any)?.amount_paid ?? 0,
            balanceDue: (invoiceAfter as any)?.balance_due ?? 0, invoiceStatus: (invoiceAfter as any)?.status ?? "paid",
            extraAmount: extra, extraHandling, extraWarning: null });
        }
      }
    }

    // Read back the updated invoice so the client can refresh state
    // optimistically without re-fetching the whole list.
    const updated = invoiceAfter;

    // Audit row - single source of truth for the manual mark-paid
    // trail. The RPC already writes the payments row; this captures
    // the operator's note + reference for future reconciliation.
    try {
      await admin.from("audit_logs").insert({
        company_id: companyId,
        user_id: user.id,
        action: "invoice_mark_paid_single",
        entity_type: "invoice",
        entity_id: invoiceId,
        details: {
          invoice_number: (invoice as any).invoice_number,
          amount,
          currency,
          payment_method: paymentMethod,
          reference,
          note,
          ...(handlesExtra ? {
            amount_owed: defaultAmount,
            extra_amount: extra,
            extra_handling: extraHandling,
            extra_payment_id: extraPaymentId,
          } : {}),
        },
      });
    } catch (auditErr) {
      console.warn("[admin/invoices/mark-paid] audit insert failed:", auditErr);
    }

    // Payment-received notifications (owner + client), best-effort.
    await notifyInvoicePaid({
      admin,
      companyId,
      orderId: (invoice as any).order_id ?? null,
      invoiceId,
      invoiceNumber: (invoice as any).invoice_number ?? null,
      clientId: (invoice as any).client_id ?? null,
      amount,
      currency,
      fullyPaid: ((updated as any)?.status ?? "") === "paid",
    }).catch((e) => console.warn("[admin/invoices/mark-paid] notifyInvoicePaid failed:", e));

    return res.status(200).json({
      ok: true,
      amountPaid: (updated as any)?.amount_paid ?? amount,
      balanceDue: (updated as any)?.balance_due ?? 0,
      invoiceStatus: (updated as any)?.status ?? "paid",
      ...(handlesExtra ? { extraAmount: extra, extraHandling, extraWarning } : {}),
    });
  } catch (err: any) {
    console.error("[admin/invoices/mark-paid] crashed:", err);
    return res.status(500).json({ error: dbErrorMessage(err) || "Mark-paid failed" });
  }
}

export default withApiLogging(handler);
