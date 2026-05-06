/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/payments/create-session
 *
 * Tenant-side payment dispatcher entry point. The PaymentModal calls
 * this when the client picks the "Pay online" option on an invoice.
 *
 * We resolve the order behind the invoice, work out whether this is a
 * deposit or balance payment, then call the provider-agnostic
 * `createPaymentSession` -- which routes to PayFast / Yoco / Stripe
 * based on whichever gateway the catering company set as active in
 * /admin/payment-gateways.
 *
 * Falls back to legacy env-var PayFast when no tenant gateway has
 * been configured -- preserves current behaviour for existing
 * deployments.
 *
 * Returns:
 *   { ok: true, provider, paymentUrl, isHtmlForm, sessionId }
 *   { ok: false, error }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { createPaymentSession } from "@/lib/paymentService";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Sign in first" });

    const { invoice_id } = req.body || {};
    if (typeof invoice_id !== "string" || !/^[0-9a-f-]{36}$/i.test(invoice_id)) {
      return res.status(400).json({ error: "Invalid invoice" });
    }

    const admin = getServiceSupabase();

    // Resolve invoice + tenant + buyer.
    const { data: invoice, error: invErr } = await admin
      .from("invoices")
      .select("id, company_id, client_id, order_id, invoice_number, balance_due, total_amount, deleted_at, status")
      .eq("id", invoice_id)
      .maybeSingle();
    if (invErr || !invoice || invoice.deleted_at) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    if (invoice.status === "paid") {
      return res.status(409).json({ error: "Invoice is already paid" });
    }

    // Verify the caller is the linked client under this tenant.
    const { data: ownership } = await admin
      .from("clients")
      .select("id, email, client_name")
      .eq("id", invoice.client_id)
      .eq("user_id", user.id)
      .eq("company_id", invoice.company_id)
      .maybeSingle();
    if (!ownership) {
      return res.status(403).json({ error: "Not your invoice" });
    }

    // Pull order details (deposit_paid flag, event date) so we can
    // route deposit vs balance correctly.
    let orderRow: any = null;
    if (invoice.order_id) {
      const { data: order } = await admin
        .from("orders")
        .select("id, deposit_paid, deposit_amount, balance_amount, total_amount, currency, order_number, client_email, client_name")
        .eq("id", invoice.order_id)
        .maybeSingle();
      orderRow = order;
    }

    const isDeposit = orderRow ? !orderRow.deposit_paid : false;
    const amount =
      orderRow && isDeposit
        ? Number(orderRow.deposit_amount) || Number(invoice.balance_due) || 0
        : Number(invoice.balance_due) || Number(invoice.total_amount) || 0;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Nothing to pay" });
    }

    const baseUrl =
      (req.headers["origin"] as string) ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://cateringms.com";

    const orderIdForSession = orderRow?.id || invoice.order_id || invoice.id;
    const description = orderRow?.order_number
      ? `Order ${orderRow.order_number} -- ${isDeposit ? "Deposit" : "Balance"} payment`
      : `Invoice ${invoice.invoice_number}`;

    const result = await createPaymentSession({
      companyId: invoice.company_id,
      orderId: orderIdForSession,
      type: orderRow ? (isDeposit ? "deposit" : "balance") : "invoice",
      amount,
      currency: orderRow?.currency || "ZAR",
      description,
      successUrl: `${baseUrl}/client-portal?paid=1&invoice=${invoice.invoice_number}`,
      cancelUrl: `${baseUrl}/client-portal?cancelled=1&invoice=${invoice.invoice_number}`,
      notifyUrl: notifyUrlFor(baseUrl, invoice.company_id),
      customer: {
        email: ownership.email || orderRow?.client_email || "",
        firstName: (ownership.client_name || orderRow?.client_name || "").split(" ")[0] || "Customer",
        lastName: (ownership.client_name || orderRow?.client_name || "").split(" ").slice(1).join(" "),
      },
      extraMetadata: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
      },
    });

    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }

    return res.status(200).json({
      ok: true,
      provider: result.provider,
      paymentUrl: result.paymentUrl,
      isHtmlForm: !!result.isHtmlForm,
      sessionId: result.sessionId,
    });
  } catch (e: any) {
    console.error("/api/payments/create-session crashed:", e);
    return res.status(500).json({ error: e?.message || "Could not start payment" });
  }
}

/**
 * Webhook URL the gateway should call back. We do NOT pull this from
 * the tenant's saved notify_url (that's for vanity / display) -- the
 * canonical endpoints live under /api/webhooks/{provider}-confirmation
 * and the dispatch logic in there reads metadata.companyId off the
 * event to find the right tenant.
 */
function notifyUrlFor(baseUrl: string, _companyId: string): string {
  // PayFast doesn't currently dispatch on metadata.companyId -- it
  // routes to the legacy /api/webhooks/payment-confirmation handler
  // which Agent boundaries say we cannot touch. Keep that endpoint as
  // the IPN target for PayFast (dispatcher already passes it through
  // params). Other providers go through their own webhook routes via
  // dashboard configuration on the provider side.
  return `${baseUrl}/api/webhooks/payment-confirmation`;
}
