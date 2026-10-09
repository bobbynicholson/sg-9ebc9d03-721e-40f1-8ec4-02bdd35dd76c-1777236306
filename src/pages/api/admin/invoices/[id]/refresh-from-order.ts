/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { refundableExcessAmount } from "@/lib/invoiceRefunds";
import { recordDocumentRefundQueued } from "@/services/documentAmountChanges";
import { recordDocumentAmountChange } from "@/services/documentAmountChanges";
import { syncInvoiceValuesFromOrder } from "@/services/order/orderSyncService";

const ALLOWED_ROLES = new Set([
  "super_admin",
  "company_admin",
  "admin",
  "owner",
  "sales_admin",
  "region_admin",
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

    const { data: profile, error: profileError } = await ssr
      .from("profiles")
      .select("role, active_role, company_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) return res.status(500).json({ error: dbErrorMessage(profileError) });

    const role = String((profile as any)?.active_role || (profile as any)?.role || "");
    if (!ALLOWED_ROLES.has(role)) return res.status(403).json({ error: "Admin only" });
    const companyId = (profile as any)?.company_id as string | null;
    if (!companyId) return res.status(400).json({ error: "No company on profile" });
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 1000) : "";
    if (!reason) return res.status(400).json({ error: "Enter a reason for refreshing this invoice" });

    const { data: invoice, error: invoiceError } = await ssr
      .from("invoices")
      .select("id, company_id, client_id, order_id, invoice_number, currency, total_amount, amount_paid, balance_due, status")
      .eq("id", invoiceId)
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .maybeSingle();
    if (invoiceError) return res.status(500).json({ error: dbErrorMessage(invoiceError) });
    if (!invoice) return res.status(404).json({ error: "Invoice not found in your company" });
    if (!(invoice as any).order_id) {
      return res.status(409).json({ error: "This invoice is not linked to an order" });
    }

    const admin = getServiceSupabase();
    const sync = await syncInvoiceValuesFromOrder((invoice as any).order_id, admin);
    if (sync.error) return res.status(500).json({ error: sync.error });
    if (!sync.invoice_id) return res.status(404).json({ error: "Linked invoice was not found" });

    const [{ data: refreshedInvoice, error: refreshedInvoiceError }, { data: order, error: orderError }] = await Promise.all([
      admin.from("invoices")
        .select("id, invoice_number, subtotal, tax_amount, total_amount, amount_paid, balance_due, status, invoice_data, updated_at")
        .eq("id", invoiceId)
        .maybeSingle(),
      admin.from("orders")
        .select("id, quote_id, order_number, client_name, client_email, client_phone, event_name, event_date, event_time, venue_address, guest_count, currency")
        .eq("id", (invoice as any).order_id)
        .maybeSingle(),
    ]);
    if (refreshedInvoiceError) return res.status(500).json({ error: dbErrorMessage(refreshedInvoiceError) });
    if (orderError) return res.status(500).json({ error: dbErrorMessage(orderError) });

    const previousTotal = Number((invoice as any).total_amount || 0);
    const newTotal = Number((refreshedInvoice as any)?.total_amount || 0);
    const changeAmount = Number((newTotal - previousTotal).toFixed(2));
    const changeDirection = changeAmount > 0.005 ? "increase" : changeAmount < -0.005 ? "decrease" : "no_change";
    const amountPaid = Number((refreshedInvoice as any)?.amount_paid || 0);
    let refundPaymentId: string | null = null;
    let refundOutstandingAmount = 0;
    let refundWarning: string | null = null;

    if (amountPaid > newTotal + 0.005) {
      const { data: openRefunds, error: openRefundsError } = await admin.from("payments")
        .select("id, amount")
        .eq("company_id", companyId)
        .eq("order_id", (invoice as any).order_id)
        .eq("payment_type", "refund")
        .in("payment_status", ["pending", "processing", "failed"]);
      if (openRefundsError) {
        refundWarning = "The invoice was refreshed, but the existing refund queue could not be checked. Review Refunds & Credits before sending a payout.";
      } else {
        refundPaymentId = (openRefunds || [])[0]?.id || null;
        const openRefundAmount = (openRefunds || []).reduce(
          (sum: number, row: any) => sum + Number(row.amount || 0),
          0,
        );
        const overpaidAmount = Number((amountPaid - newTotal).toFixed(2));
        const refundAmount = refundableExcessAmount(amountPaid, newTotal, openRefundAmount);
        refundOutstandingAmount = Number(Math.min(overpaidAmount, openRefundAmount + refundAmount).toFixed(2));

        if (openRefundAmount > overpaidAmount + 0.005) {
          refundWarning = "Existing open refunds exceed the current overpayment. Review Refunds & Credits before sending any payout.";
        } else if (refundAmount > 0.005) {
          const refundReason = changeDirection === "decrease"
            ? `Invoice ${String((invoice as any).invoice_number || invoiceId)} reduced from ${previousTotal.toFixed(2)} to ${newTotal.toFixed(2)}. ${reason}`
            : `Excess payment after linked order change on invoice ${String((invoice as any).invoice_number || invoiceId)}. Current total ${newTotal.toFixed(2)}. ${reason}`;
          const refundTransactionId = `invoice-adjustment-refund:${invoiceId}:${newTotal.toFixed(2)}`;
          const { data: refundRow, error: refundInsertError } = await admin.from("payments").insert({
            company_id: companyId,
            client_id: (invoice as any).client_id ?? null,
            order_id: (invoice as any).order_id,
            invoice_id: invoiceId,
            payment_type: "refund",
            amount: refundAmount,
            currency: order?.currency || (invoice as any).currency || "ZAR",
            payment_status: "pending",
            reason: refundReason,
            created_by_user_id: user.id,
            gateway: "manual",
            gateway_provider: "manual",
            transaction_id: refundTransactionId,
            gateway_transaction_id: refundTransactionId,
          } as any).select("id").single();
          if (refundInsertError) {
            if (refundInsertError.code === "23505") {
              const { data: existingRefund } = await admin.from("payments")
                .select("id, amount")
                .eq("company_id", companyId)
                .eq("invoice_id", invoiceId)
                .eq("gateway_provider", "manual")
                .eq("transaction_id", refundTransactionId)
                .maybeSingle();
              if (existingRefund) {
                refundPaymentId = (existingRefund as any).id;
                refundOutstandingAmount = Number((openRefundAmount + Number((existingRefund as any).amount || 0)).toFixed(2));
              } else {
                refundWarning = "The invoice was refreshed, but its refund could not be confirmed. Check Refunds & Credits before sending any payout.";
              }
            } else {
              refundWarning = "The invoice was refreshed, but the excess refund could not be queued. Open Refunds & Credits and record it before sending the payout.";
            }
          } else {
            refundPaymentId = (refundRow as any)?.id || null;
            refundOutstandingAmount = Number((openRefundAmount + refundAmount).toFixed(2));
          }
        }
      }
    }
    if (refundPaymentId && refundOutstandingAmount > 0.005) {
      const refundAudit = await recordDocumentRefundQueued(admin, {
        companyId,
        reason,
        quoteId: order?.quote_id || null,
        orderId: (invoice as any).order_id,
        invoiceId,
        refundPaymentId,
        amount: refundOutstandingAmount,
        currentTotal: newTotal,
        amountPaid,
        balanceDue: Number((refreshedInvoice as any)?.balance_due || 0),
      });
      if (refundAudit.error) console.warn("[admin/invoices/refresh-from-order] refund badge audit failed:", refundAudit.error);
    }
    const amountChangeAudit = await recordDocumentAmountChange(admin, {
      companyId,
      previousTotal,
      newTotal,
      reason,
      quoteId: order?.quote_id || null,
      orderId: (invoice as any).order_id,
      invoiceId,
      refundPaymentId,
      amountPaid,
      balanceDue: Number((refreshedInvoice as any)?.balance_due || 0),
    });
    if (amountChangeAudit.error) {
      console.warn("[admin/invoices/refresh-from-order] linked amount audit failed:", amountChangeAudit.error);
    }
    const { error: auditError } = await admin.from("audit_logs").insert({
      company_id: companyId,
      user_id: user.id,
      action: "invoice_refreshed_from_order",
      entity_type: "invoices",
      entity_id: invoiceId,
      details: {
        order_id: (invoice as any).order_id,
        reason,
        change_direction: changeDirection,
        previous_total: previousTotal,
        new_total: newTotal,
        change_amount: changeAmount,
        previous_amount_paid: Number((invoice as any).amount_paid || 0),
        new_amount_paid: Number((refreshedInvoice as any)?.amount_paid || 0),
        previous_balance_due: Number((invoice as any).balance_due || 0),
        new_balance_due: Number((refreshedInvoice as any)?.balance_due || 0),
        previous_status: (invoice as any).status,
        new_status: (refreshedInvoice as any)?.status,
        refund_payment_id: refundPaymentId,
        refund_outstanding_amount: refundOutstandingAmount,
        refund_warning: refundWarning,
      },
    });
    if (auditError) {
      console.error("[admin/invoices/refresh-from-order] audit insert failed:", auditError);
      return res.status(200).json({
        ok: true,
        invoice: refreshedInvoice,
        order,
        changeDirection,
        changeAmount,
        refundPaymentId,
        refundOutstandingAmount,
        refundWarning,
        auditWarning: "Invoice refreshed, but the reason could not be recorded. Contact support before further changes.",
      });
    }

    return res.status(200).json({
      ok: true,
      invoice: refreshedInvoice,
      order,
      changeDirection,
      changeAmount,
      refundPaymentId,
      refundOutstandingAmount,
      refundWarning,
    });
  } catch (error: any) {
    console.error("[admin/invoices/refresh-from-order] failed:", error);
    return res.status(500).json({ error: dbErrorMessage(error) });
  }
}

export default withApiLogging(handler);