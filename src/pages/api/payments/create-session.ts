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
    // Wave 17 audit: the email-delivered pay link points at
    // /pay/i/{public_token}, where the client is unauthenticated.
    // The previous "Sign in first" gate broke that flow: the client
    // clicked Pay, hit a 401, never paid. Accept either:
    //   - signed-in client (logged into /client-portal), OR
    //   - unauth visitor with a matching public_token in the body.
    // Token-bearer access is invoice-scoped (the token IS the
    // capability) so we don't need a separate auth check beyond
    // matching the token to the invoice row.
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();

    const body = (req.body || {}) as any;
    const invoice_id = body.invoice_id as string | undefined;
    const public_token = typeof body.public_token === "string" ? body.public_token.trim() : "";
    if (typeof invoice_id !== "string" || !/^[0-9a-f-]{36}$/i.test(invoice_id)) {
      return res.status(400).json({ error: "Invalid invoice" });
    }
    if (!user && !public_token) {
      return res.status(401).json({ error: "Sign in or use the pay link from your email" });
    }

    const admin = getServiceSupabase();

    // Resolve invoice + tenant + buyer. Pull public_token so we can
    // verify it matches when used as the auth gate.
    const { data: invoice, error: invErr } = await admin
      .from("invoices")
      .select("id, company_id, client_id, order_id, invoice_number, balance_due, total_amount, deleted_at, status, public_token")
      .eq("id", invoice_id)
      .maybeSingle();
    if (invErr || !invoice || invoice.deleted_at) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    if (invoice.status === "paid") {
      return res.status(409).json({ error: "Invoice is already paid" });
    }

    // Authorise. Either the public token matches the invoice OR the
    // signed-in client owns the invoice via clients.user_id linkage.
    let ownership: { id: string; email: string | null; client_name: string | null } | null = null;
    if (public_token && (invoice as any).public_token && public_token === (invoice as any).public_token) {
      // Token-bearer path: capability granted by holding the token.
      // Resolve the linked client for personalisation only.
      const { data: clientRow } = await admin
        .from("clients")
        .select("id, email, client_name")
        .eq("id", invoice.client_id)
        .eq("company_id", invoice.company_id)
        .maybeSingle();
      ownership = clientRow ? {
        id: (clientRow as any).id,
        email: (clientRow as any).email,
        client_name: (clientRow as any).client_name,
      } : { id: invoice.client_id, email: null, client_name: null };
    } else if (user) {
      const { data: row } = await admin
        .from("clients")
        .select("id, email, client_name")
        .eq("id", invoice.client_id)
        .eq("user_id", user.id)
        .eq("company_id", invoice.company_id)
        .maybeSingle();
      if (row) ownership = {
        id: (row as any).id,
        email: (row as any).email,
        client_name: (row as any).client_name,
      };
    }
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
