/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/payments/create-session
 *
 * Tenant-side payment dispatcher entry point. The PaymentModal calls
 * this when the client picks the "Pay online" option on an invoice.
 *
 * We resolve the order behind the invoice, work out whether this is a
 * deposit or balance payment, then call the provider-agnostic
 * `createPaymentSession` - which routes to PayFast / Yoco / Stripe
 * based on whichever gateway the catering company set as active in
 * /admin/payment-gateways.
 *
 * Tenant checkouts always use the company's saved gateway credentials.
 *
 * Returns:
 *   { ok: true, provider, paymentUrl, isHtmlForm, sessionId }
 *   { ok: false, error }
 *
 * Wave 29.1 add: optional store-credit redemption before the gateway
 * call. Body field `apply_credit: true` (or `apply_credit_amount: number`)
 * triggers an atomic redeem via the redeem_client_credit RPC --
 * credit is netted off the invoice balance and the gateway is
 * charged for the remainder. When credit covers the full amount,
 * the invoice is marked paid in-place and a settled response is
 * returned without a gateway hop.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { createPaymentSession, resolveActivePaymentGateway } from "@/lib/paymentService";
import { publicAppOrigin } from "@/lib/publicAppOrigin";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { withApiLogging } from "@/lib/withApiLogging";
import { attachPaymentAttemptSession, createPaymentAttempt, transitionPaymentAttempt } from "@/services/paymentAttemptService";
import { notifyPaymentAttemptFailed } from "@/services/payments/notifyPaymentAttemptFailed";
import { randomUUID } from "crypto";


async function handler(req: NextApiRequest, res: NextApiResponse) {
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
      .select("id, company_id, client_id, order_id, invoice_number, balance_due, total_amount, amount_paid, currency, deleted_at, status, public_token")
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
    let viaPublicToken = false;
    if (public_token && (invoice as any).public_token && public_token === (invoice as any).public_token) {
      viaPublicToken = true;
      // Token-bearer path: capability granted by holding the token.
      // Resolve the linked client for personalisation only.
      const { data: clientRow, error: clientRowErr } = await admin
        .from("clients")
        .select("id, email, client_name")
        .eq("id", invoice.client_id)
        .eq("company_id", invoice.company_id)
        .maybeSingle();
      if (clientRowErr) {
        console.error("[payments/create-session] clients fetch failed:", clientRowErr);
      }
      ownership = clientRow ? {
        id: (clientRow as any).id,
        email: (clientRow as any).email,
        client_name: (clientRow as any).client_name,
      } : { id: invoice.client_id, email: null, client_name: null };
    } else if (user) {
      const { data: row, error: rowErr } = await admin
        .from("clients")
        .select("id, email, client_name")
        .eq("id", invoice.client_id)
        .eq("user_id", user.id)
        .eq("company_id", invoice.company_id)
        .maybeSingle();
      if (rowErr) {
        console.error("[payments/create-session] clients fetch failed:", rowErr);
      }
      if (row) ownership = {
        id: (row as any).id,
        email: (row as any).email,
        client_name: (row as any).client_name,
      };
    }
    if (!ownership) {
      return res.status(403).json({ error: "Not your invoice" });
    }

    // The store-credit RPC writes a completed payments row first and this
    // route then refreshes the invoice aggregates. If a prior request was
    // interrupted between those writes, rebuild the payable balance from
    // the ledger before creating another checkout. This avoids charging the
    // customer for credit already redeemed on a previous attempt.
    const { data: invoicePayments, error: invoicePaymentsError } = await admin
      .from("payments")
      .select("amount, payment_status")
      .eq("invoice_id", invoice.id);
    if (invoicePaymentsError) {
      console.error("[payments/create-session] invoice payment ledger lookup failed:", invoicePaymentsError);
      return res.status(503).json({ error: "Could not refresh the invoice balance. Please try again." });
    }
    const ledgerPaid = ((invoicePayments || []) as any[]).reduce((sum, payment) => {
      return ["completed", "paid", "succeeded"].includes(String(payment.payment_status || "").toLowerCase())
        ? sum + (Number(payment.amount) || 0)
        : sum;
    }, 0);
    const reconciledAmountPaid = Math.round(Math.max(Number(invoice.amount_paid) || 0, ledgerPaid) * 100) / 100;
    const reconciledBalanceDue = Math.max(0, Math.round(((Number(invoice.total_amount) || 0) - reconciledAmountPaid) * 100) / 100);
    const reconciledStatus = reconciledBalanceDue < 0.01
      ? "paid"
      : reconciledAmountPaid > 0
        ? "partially_paid"
        : invoice.status;
    if (
      Math.abs(Number(invoice.amount_paid || 0) - reconciledAmountPaid) > 0.01 ||
      Math.abs(Number(invoice.balance_due ?? reconciledBalanceDue) - reconciledBalanceDue) > 0.01 ||
      invoice.status !== reconciledStatus
    ) {
      const { data: reconciledInvoice, error: reconcileError } = await admin
        .from("invoices")
        .update({
          amount_paid: reconciledAmountPaid,
          balance_due: reconciledBalanceDue,
          status: reconciledStatus,
          ...(reconciledStatus === "paid" ? { paid_at: new Date().toISOString() } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoice.id)
        .select("id")
        .maybeSingle();
      if (reconcileError || !reconciledInvoice) {
        console.error("[payments/create-session] invoice balance repair failed:", reconcileError);
        return res.status(503).json({ error: "Could not refresh the invoice balance. Please try again." });
      }
      invoice.amount_paid = reconciledAmountPaid;
      invoice.balance_due = reconciledBalanceDue;
      invoice.status = reconciledStatus;
    }

    // Pull order details (deposit_paid flag, event date) so we can
    // route deposit vs balance correctly.
    let orderRow: any = null;
    if (invoice.order_id) {
      const { data: order, error: orderErr } = await admin
        .from("orders")
        .select("id, deposit_paid, deposit_amount, balance_amount, total_amount, currency, order_number, client_email, client_name")
        .eq("id", invoice.order_id)
        .maybeSingle();
      if (orderErr) {
        console.error("[payments/create-session] orders fetch failed:", orderErr);
        return res.status(503).json({ error: "Could not verify the order behind this invoice. Please try again." });
      }
      if (!order) {
        return res.status(409).json({ error: "The order behind this invoice is no longer available." });
      }
      orderRow = order;
    }

    const isDeposit = orderRow ? !orderRow.deposit_paid : false;
    const invoiceBalanceDue = Math.max(0, Number(invoice.balance_due ?? (Number(invoice.total_amount || 0) - Number(invoice.amount_paid || 0))) || 0);
    const suggestedGross = orderRow && isDeposit
      ? Number(orderRow.deposit_amount) || invoiceBalanceDue
      : invoiceBalanceDue;
    const defaultGross = Math.min(Math.max(0, suggestedGross), invoiceBalanceDue);
    // The payer can choose how much to pay now (a deposit that may not
    // be exactly the configured %). Honour `pay_amount` when supplied,
    // but ALWAYS cap to the outstanding balance so a client can never
    // overpay the invoice. Falls back to the deposit/balance default.
    const maxPayable = invoiceBalanceDue;
    const requestedPay = Number(body.pay_amount);
    const grossAmount =
      Number.isFinite(requestedPay) && requestedPay > 0
        ? Math.min(Math.round(requestedPay * 100) / 100, maxPayable)
        : defaultGross;
    if (!grossAmount || grossAmount <= 0) {
      return res.status(400).json({ error: "Nothing to pay" });
    }

    // Wave 29.1: optional credit redemption. Caller passes
    // `apply_credit: true` (use full available, capped at invoice
    // balance) or `apply_credit_amount: <number>` (use up to N).
    // We call the SECURITY DEFINER RPC - it serialises concurrent
    // redeems for the same wallet behind a per-(company, client)
    // advisory lock so a mash-click can't double-spend.
    const wantsApplyCredit = body.apply_credit === true || body.apply_credit_amount;
    let creditApplied = 0;
    let creditPaymentId: string | null = null;
    if (wantsApplyCredit && invoice.client_id) {
      const requested = body.apply_credit_amount
        ? Math.max(0, Number(body.apply_credit_amount))
        : grossAmount; // RPC caps at min(available, balance, requested)
      try {
        const { data: redeemResult, error: redeemErr } = await (admin as any).rpc(
          "redeem_client_credit",
          {
            p_company_id: invoice.company_id,
            p_client_id: invoice.client_id,
            p_invoice_id: invoice.id,
            p_order_id: invoice.order_id,
            p_requested_amount: requested,
            p_created_by_user_id: user?.id || null,
          },
        );
        if (redeemErr) {
          console.warn("[create-session] redeem RPC failed:", redeemErr);
        } else if (redeemResult && (redeemResult as any).redeemed_amount > 0) {
          creditApplied = Number((redeemResult as any).redeemed_amount) || 0;
          creditPaymentId = (redeemResult as any).payment_id || null;
        }
      } catch (e) {
        console.warn("[create-session] redeem crashed (non-blocking):", e);
      }
    }

    const amount = Math.max(0, Math.round((grossAmount - creditApplied) * 100) / 100);

    // Update the invoice with the credit payment so the invoice
    // balance reflects what credit just paid down. We do this even
    // when credit doesn't cover everything - the gateway flow
    // will record its own payment row + the invoice gets stamped
    // again on webhook confirmation. Status flips to 'paid' only
    // when balance hits 0 (otherwise stays at draft/sent/etc.).
    if (creditApplied > 0) {
      const newBalance = Math.max(
        0,
        Math.round((Number(invoice.balance_due || 0) - creditApplied) * 100) / 100,
      );
      const newAmountPaid =
        Math.round(
          ((Number(invoice.total_amount || 0) - newBalance)) * 100,
        ) / 100;
      const updates: any = {
        balance_due: newBalance,
        amount_paid: newAmountPaid,
        updated_at: new Date().toISOString(),
      };
      if (newBalance < 0.01) updates.status = "paid";
      else if (newAmountPaid > 0) updates.status = "partially_paid";
      const { error: invoiceUpdateError } = await admin.from("invoices").update(updates).eq("id", invoice.id);
      if (invoiceUpdateError) {
        console.error("[create-session] invoice balance update failed:", invoiceUpdateError);
        return res.status(503).json({ error: "Store credit was applied, but the invoice balance could not be refreshed. Please retry before paying." });
      }
      try {
        await (admin as any).from("audit_logs").insert({
          company_id: invoice.company_id,
          user_id: user?.id || null,
          action: "credit_redeemed",
          entity_type: "invoices",
          entity_id: invoice.id,
          details: {
            order_id: invoice.order_id,
            credit_applied: creditApplied,
            invoice_number: invoice.invoice_number,
            new_balance: newBalance,
            credit_payment_id: creditPaymentId,
            requested_via: user ? "auth_portal" : "magic_link",
          },
        });
      } catch (e) {
        console.warn("[create-session] credit_redeemed audit failed:", e);
      }
    }

    // Credit covered the whole bill - short-circuit. No gateway
    // call needed; the invoice is paid.
    if (amount <= 0) {
      return res.status(200).json({
        ok: true,
        provider: "store_credit",
        settled: true,
        creditApplied,
        creditPaymentId,
        message: "Invoice settled with store credit - no card payment needed.",
      });
    }

    const baseUrl = publicAppOrigin({
      environment: process.env.NODE_ENV,
      configuredUrl: process.env.NEXT_PUBLIC_APP_URL,
      vercelProductionUrl: process.env.VERCEL_PROJECT_PRODUCTION_URL,
      vercelUrl: process.env.VERCEL_URL,
      requestOrigin: req.headers.origin as string | undefined,
      requestHost: req.headers.host,
      forwardedProtocol: req.headers["x-forwarded-proto"] as string | undefined,
    });

    const orderIdForSession = orderRow?.id || invoice.id;
    const baseDescription = orderRow?.order_number
      ? `Order ${orderRow.order_number} - ${isDeposit ? "Deposit" : "Balance"} payment`
      : `Invoice ${invoice.invoice_number}`;
    // Wave 29.1: when partial credit was applied, prepend a short
    // note so the gateway transcript and the client's bank
    // statement reflect the netting.
    const description = creditApplied > 0
      ? `${baseDescription} (after R${creditApplied.toFixed(2)} credit)`
      : baseDescription;
    const paymentAttemptId = randomUUID();
    const activeGateway = await resolveActivePaymentGateway(invoice.company_id);
    if (!activeGateway) {
      return res.status(400).json({
        error: "This company has no active payment gateway. Configure its own provider in onboarding or Admin → Payment Gateways.",
        code: "payment_not_configured",
      });
    }
    const checkoutCurrency = String(orderRow?.currency || invoice.currency || "ZAR").toUpperCase();
    if (["payfast", "yoco"].includes(activeGateway.gateway.provider) && checkoutCurrency !== "ZAR") {
      return res.status(400).json({
        error: `${activeGateway.gateway.provider === "payfast" ? "PayFast" : "Yoco"} can only collect ZAR for this invoice. Choose Stripe or update the invoice currency.`,
        code: "payment_currency_not_supported",
      });
    }

    // Create the correlation row before calling the provider. This closes
    // the small but real race where a hosted checkout completes and its
    // webhook arrives before the provider session response is persisted.
    if (activeGateway.gateway.provider) {
      try {
        await createPaymentAttempt({
          id: paymentAttemptId,
          companyId: invoice.company_id,
          clientId: invoice.client_id,
          // order_id is a foreign key; standalone invoice IDs belong in
          // invoice_id and must not be written into orders.
          orderId: orderRow?.id || invoice.order_id || null,
          invoiceId: invoice.id,
          provider: activeGateway.gateway.provider as "payfast" | "yoco" | "stripe",
          providerSessionId: paymentAttemptId,
          paymentType: orderRow ? (isDeposit ? "deposit" : "balance") : "invoice",
          amount,
          currency: checkoutCurrency,
          metadata: {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoice_number,
            paymentAttemptId,
            gatewayId: activeGateway.gateway.id,
            merchantId: activeGateway.credentials.merchantId || "",
            gatewayIsTest: String(activeGateway.gateway.is_test),
          },
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
      } catch (attemptError) {
        console.error("[payments/create-session] pre-checkout attempt insert failed:", attemptError);
        return res.status(503).json({
          error: "Could not prepare payment tracking. Please try again.",
          code: "payment_tracking_unavailable",
        });
      }
    }

    const result = await createPaymentSession({
      companyId: invoice.company_id,
      orderId: orderIdForSession,
      type: orderRow ? (isDeposit ? "deposit" : "balance") : "invoice",
      amount,
      currency: checkoutCurrency,
      description,
      // FIX (2026-06-12): token-bearer payers (the email pay link) are
      // NOT logged in - bouncing them to /client-portal after payment
      // landed them on a login wall. Send them back to the public
      // invoice pages instead; only authenticated portal sessions
      // return to the portal.
      successUrl: viaPublicToken
        ? `${baseUrl}/pay/i/${(invoice as any).public_token}/success?payment_attempt_id=${encodeURIComponent(paymentAttemptId)}`
        : `${baseUrl}/client-portal/billing?payment_attempt_id=${encodeURIComponent(paymentAttemptId)}&invoice=${encodeURIComponent(invoice.invoice_number)}&invoice_id=${encodeURIComponent(invoice.id)}`,
      cancelUrl: viaPublicToken
        ? `${baseUrl}/pay/i/${(invoice as any).public_token}?cancelled=1&payment_attempt_id=${encodeURIComponent(paymentAttemptId)}`
        : `${baseUrl}/client-portal/billing?cancelled=1&payment_attempt_id=${encodeURIComponent(paymentAttemptId)}&invoice=${encodeURIComponent(invoice.invoice_number)}&invoice_id=${encodeURIComponent(invoice.id)}`,
      notifyUrl: notifyUrlFor(baseUrl, invoice.company_id),
      customer: {
        email: ownership.email || orderRow?.client_email || "",
        firstName: (ownership.client_name || orderRow?.client_name || "").split(" ")[0] || "Customer",
        lastName: (ownership.client_name || orderRow?.client_name || "").split(" ").slice(1).join(" "),
      },
      extraMetadata: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        paymentAttemptId,
      },
    }, activeGateway);

    if (!result.ok) {
      if (activeGateway.gateway.provider) {
        try {
          const transitioned = await transitionPaymentAttempt({
            provider: activeGateway.gateway.provider,
            attemptId: paymentAttemptId,
            status: "failed",
            providerStatus: "checkout_creation_failed",
            failureReason: result.error || "Provider checkout could not be created",
          });
          if (transitioned.changed && transitioned.attempt) {
            await notifyPaymentAttemptFailed({
              admin,
              attempt: transitioned.attempt,
              reason: result.error || "Provider checkout could not be created.",
            });
          }
        } catch (attemptError) {
          console.warn("[payments/create-session] failed-attempt transition failed:", attemptError);
        }
      }
      return res.status(400).json({
        error: result.error,
      });
    }

    try {
      await attachPaymentAttemptSession(paymentAttemptId, result.provider === "payfast" ? paymentAttemptId : result.sessionId!);
    } catch (attemptError) {
      console.error("[payments/create-session] provider session attach failed:", attemptError);
      try {
        await transitionPaymentAttempt({
          provider: activeGateway.gateway.provider as "payfast" | "yoco" | "stripe",
          attemptId: paymentAttemptId,
          status: "failed",
          providerStatus: "session_tracking_failed",
          failureReason: "The checkout session could not be linked to its payment attempt.",
        });
      } catch (transitionError) {
        console.error("[payments/create-session] untracked session attempt could not be closed:", transitionError);
      }
      return res.status(503).json({
        error: "Could not safely prepare this checkout. Please try again.",
        code: "payment_tracking_unavailable",
      });
    }

    return res.status(200).json({
      ok: true,
      provider: result.provider,
      paymentUrl: result.paymentUrl,
      isHtmlForm: !!result.isHtmlForm,
      sessionId: result.sessionId,
      // Wave 29.1: echo any credit that was applied so the client
      // UI can render "We applied R485 of your store credit; you're
      // being redirected to pay R515 for the remainder."
      creditApplied,
      creditPaymentId,
    });
  } catch (e: any) {
    console.error("/api/payments/create-session crashed:", e);
    return res.status(500).json({ error: dbErrorMessage(e) || "Could not start payment" });
  }
}

/**
 * Webhook URL the gateway should call back. We do not use the tenant's
 * saved notify_url as an execution target. PayFast sends tenant-scoped
 * custom fields to the shared ITN endpoint, which verifies the saved
 * checkout attempt before writing.
 */
function notifyUrlFor(baseUrl: string, _companyId: string): string {
  // PayFast sends its IPN to this shared route. The handler verifies the
  // tenant ID, merchant ID, invoice/order and saved attempt from the signed
  // callback before applying any payment.
  return `${baseUrl}/api/webhooks/payment-confirmation`;
}

export default withApiLogging(handler);
