import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/integrations/supabase/client";
import { orderService } from "@/services/orderService";
import { emailService } from "@/services/emailService";
import { paymentProcessingService } from "@/services/paymentProcessingService";
import crypto from "crypto";

/**
 * Payment Webhook Handler
 * Receives payment confirmations from PayFast and other gateways.
 *
 * Idempotency: PayFast retries IPN aggressively (network blips, slow
 * response, 5xx). Every retry would otherwise double-insert payments
 * rows, double `amount_paid`, and flip status to paid prematurely.
 * We dedupe on `pf_payment_id` (PayFast's canonical id) by checking
 * the payments table BEFORE any DB write -- if the row already exists
 * we return 200 immediately so PayFast stops retrying.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const paymentData = req.body;

    // Validate PayFast signature
    const { signature, ...dataToValidate } = paymentData;
    const isValid = validatePayFastSignature(dataToValidate, signature);

    if (!isValid) {
      return res.status(400).json({ error: "Invalid signature" });
    }

    // Check payment status
    if (paymentData.payment_status !== "COMPLETE") {
      return res.status(200).json({ message: "Payment not complete" });
    }

    const {
      custom_str1, // Can be orderId or invoiceId
      custom_str2, // Payment type: "deposit", "balance", or "invoice"
      custom_str3, // Company ID
      custom_str4, // Identifier: "invoice" or not present
      amount_gross,
      pf_payment_id,
      merchant_id
    } = paymentData;

    // Handle invoice payments (post-event final invoice flow).
    // Idempotency for this branch is handled inline below.
    if (custom_str4 === "invoice" || custom_str2 === "invoice") {
      const invoiceId = custom_str1;
      const companyId = custom_str3;

      // Idempotency guard -- if we have already recorded this PayFast
      // transaction against ANY payment row, skip the rest of the
      // pipeline so retries are no-ops.
      const alreadyRecorded = await isDuplicatePayFastPayment(pf_payment_id);
      if (alreadyRecorded) {
        return res.status(200).json({ message: "Already processed", invoiceId });
      }

      // Update invoice status
      const { error: invoiceError } = await supabase
        .from("invoices")
        .update({
          status: "paid",
          amount_paid: amount_gross,
          balance_due: 0,
          updated_at: new Date().toISOString()
        })
        .eq("id", invoiceId);

      if (invoiceError) {
        console.error("Error updating invoice:", invoiceError);
        return res.status(500).json({ error: "Failed to update invoice" });
      }

      // Get invoice details for notification
      const { data: invoice } = await supabase
        .from("invoices")
        .select("*, companies(*)")
        .eq("id", invoiceId)
        .single();

      if (invoice) {
        const invoiceData = invoice as any;
        const companyData = invoiceData.companies;

        // Phase 2A migrated reads to payment_status; Phase 4B drops the legacy text column.
        await supabase.from("payments").insert([{
          company_id: companyId,
          client_id: invoiceData.client_id,
          invoice_id: invoiceId,
          amount: parseFloat(amount_gross),
          currency: "ZAR",
          payment_method: "payfast",
          payment_reference: pf_payment_id,
          gateway_provider: "payfast",
          gateway: "payfast",
          gateway_transaction_id: pf_payment_id,
          transaction_id: pf_payment_id,
          payment_status: "completed",
          completed_at: new Date().toISOString()
        }]);

        // Mark the underlying order as completed once the final invoice is paid.
        // Closes out the post-event journey so the order drops out of the
        // open list and the financial dashboard counts it under collected.
        if (invoiceData.order_id) {
          await supabase
            .from("orders")
            .update({
              status: "completed",
              payment_status: "paid",
              updated_at: new Date().toISOString(),
            })
            .eq("id", invoiceData.order_id);
        }

        // Send notification
        await supabase.from("notifications").insert([{
          company_id: companyId,
          user_id: companyData.owner_id || companyId,
          title: `Invoice Payment Received - ${invoiceData.invoice_number}`,
          message: `Payment of R${amount_gross} received for invoice ${invoiceData.invoice_number}`,
          type: "payment_received",
          channels: ["in_app", "email"]
        }]);

        // Invoice payment confirmation -- "thank you, payment received".
        // Emit through emailService so it picks up the company's
        // configured Resend / SMTP provider and the negative gates
        // (block list + import quarantine) run server-side.
        try {
          // Pull a recipient email off the linked client, or fall
          // back to the order's client_email if the invoice has no
          // client_id link.
          let recipientEmail: string | null = null;
          let recipientName: string | null = null;
          if (invoiceData.client_id) {
            const { data: clientRow } = await supabase
              .from("clients")
              .select("email, client_name")
              .eq("id", invoiceData.client_id)
              .maybeSingle();
            if (clientRow) {
              recipientEmail = (clientRow as any).email;
              recipientName = (clientRow as any).client_name;
            }
          }
          if (!recipientEmail && invoiceData.order_id) {
            const { data: orderRow } = await supabase
              .from("orders")
              .select("client_email, client_name")
              .eq("id", invoiceData.order_id)
              .maybeSingle();
            if (orderRow) {
              recipientEmail = (orderRow as any).client_email;
              recipientName = (orderRow as any).client_name;
            }
          }

          if (recipientEmail) {
            // Template type aligns with the seed in
            // supabase/migrations/20260506130000_seed_email_templates.sql.
            // Previously we passed "invoice-payment-received" which has
            // no row in email_templates and quietly fell through [P0-07].
            await emailService.sendEmail({
              companyId,
              to: recipientEmail,
              subject: `Payment received -- invoice ${invoiceData.invoice_number}`,
              template: "balance_payment_received",
              variables: {
                clientName: recipientName || "there",
                invoiceNumber: invoiceData.invoice_number,
                orderNumber: invoiceData.invoice_number,
                amount: `R${Number(amount_gross).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`,
                companyName: companyData?.company_name || "Your caterer",
              },
            });
          }
        } catch (emailErr) {
          // Non-blocking -- the invoice is already marked paid;
          // a failed confirmation email is logged but doesn't undo
          // the webhook. Surfaces in the email-failures dashboard
          // (item #9) once that lands.
          console.warn("Invoice payment confirmation email failed:", emailErr);
        }
        console.log(`Invoice ${invoiceData.invoice_number} marked as paid - R${amount_gross}`);
      }

      return res.status(200).json({
        message: "Invoice payment processed successfully",
        invoiceId,
        amount: amount_gross
      });
    }

    // Handle order payments (deposit / balance)
    const orderId = custom_str1;
    const paymentType = (custom_str2 || "").toLowerCase(); // "deposit" or "balance"

    // Idempotency guard FIRST -- before any DB write. If PayFast
    // retries (which it does aggressively when the response is slow),
    // we want the second / third / nth call to be a 200 no-op.
    const alreadyRecorded = await isDuplicatePayFastPayment(pf_payment_id);
    if (alreadyRecorded) {
      return res.status(200).json({
        success: true,
        message: "Already processed",
        orderId,
      });
    }

    // Get order details
    const orderResult = await orderService.getOrderById(orderId);

    if (!orderResult.success || !orderResult.data) {
      console.error("Order not found:", orderId);
      return res.status(404).json({ error: "Order not found" });
    }

    const order: any = orderResult.data;

    // Determine if this is deposit or balance payment. Prefer the
    // explicit custom_str2 the checkout sends; fall back to the order
    // state for old links.
    const isDepositPayment = paymentType
      ? paymentType === "deposit"
      : !order.deposit_paid;
    const expectedAmount = isDepositPayment
      ? order.deposit_amount
      : order.balance_amount;

    // Verify amount matches
    if (Math.abs(Number(amount_gross) - Number(expectedAmount)) > 0.01) {
      console.error("Amount mismatch:", amount_gross, expectedAmount);
      return res.status(400).json({ error: "Amount mismatch" });
    }

    // Single insert via the canonical recordPayment helper. This also
    // calls updateOrderPaymentStatus() so orders.payment_status is
    // recomputed from the sum of completed payments.
    const recordResult = await orderService.recordPayment(
      order.id,
      parseFloat(amount_gross),
      "payfast",
      pf_payment_id,
      {
        userId: order.user_id,
        companyId: order.company_id || order.user_id,
        clientId: order.client_id || undefined,
        currency: order.currency,
        paymentType: isDepositPayment ? "deposit" : "balance",
        gatewayProvider: "payfast",
      }
    );

    if (!recordResult.success) {
      console.error("Failed to record payment:", recordResult.error);
      return res.status(500).json({ error: "Failed to record payment" });
    }

    // Cascade: orders flags + reminders. The helpers in
    // paymentProcessingService own the right cascade. Phase 2 collapsed
    // the parallel payment_schedules table -- everything now writes
    // straight to orders.
    if (isDepositPayment) {
      await paymentProcessingService.processDepositPayment(
        order.id,
        pf_payment_id,
        "payfast",
        order.user_id
      );

      // If the order was still pending, mark it confirmed now that the
      // deposit is in. processDepositPayment sets status='confirmed'
      // unconditionally; we additionally stamp confirmed_at when null.
      if (!order.confirmed_at) {
        await supabase
          .from("orders")
          .update({ confirmed_at: new Date().toISOString() })
          .eq("id", order.id);
      }

      await sendClientPaymentConfirmation(order, "deposit", amount_gross);
    } else {
      await paymentProcessingService.processBalancePayment(
        order.id,
        pf_payment_id,
        "payfast",
        order.user_id
      );

      // If the invoice is now fully paid, close the order out.
      const { data: refreshed } = await supabase
        .from("orders")
        .select("payment_status, status")
        .eq("id", order.id)
        .maybeSingle();
      if (refreshed && (refreshed as any).payment_status === "paid"
          && (refreshed as any).status !== "completed") {
        await supabase
          .from("orders")
          .update({ status: "completed" })
          .eq("id", order.id);
      }

      await sendClientPaymentConfirmation(order, "balance", amount_gross);
    }

    // Owner / admin in-app notification (kept legacy shape for the
    // notifications inbox the owner already uses).
    await supabase.from("notifications").insert([{
      user_id: order.user_id,
      recipient_id: order.user_id,
      notification_type: "payment_received",
      title: isDepositPayment ? "Deposit Payment Received" : "Balance Payment Received",
      message: isDepositPayment
        ? `Deposit payment received for order ${order.order_number}`
        : `Full payment received for order ${order.order_number}. Booking is confirmed.`,
      priority: "high",
    }]);

    return res.status(200).json({
      success: true,
      message: "Payment processed successfully"
    });

  } catch (error) {
    console.error("Webhook error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Look up an existing payments row by PayFast's canonical id. We check
 * both `gateway_transaction_id` (the field recordPayment writes) and
 * the legacy `transaction_id` mirror so retries are deduped regardless
 * of which column variant a previous run used.
 */
async function isDuplicatePayFastPayment(pfPaymentId: string | undefined | null): Promise<boolean> {
  if (!pfPaymentId) return false;
  const { data, error } = await supabase
    .from("payments")
    .select("id")
    .or(`gateway_transaction_id.eq.${pfPaymentId},transaction_id.eq.${pfPaymentId}`)
    .limit(1);
  if (error) {
    // Fail open -- if the dedup query itself errors we'd rather process
    // and risk a later cleanup than silently drop a real payment. The
    // amount-mismatch + downstream FK constraints provide a second line
    // of defence.
    console.warn("Idempotency check failed, proceeding:", error.message);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

/**
 * Resolve the auth.users.id of the client behind an order. orders.client_id
 * is a FK to clients.id (NOT auth.users.id), so we go through the clients
 * table -- prefer the explicit user_id link, fall back to the email match
 * on profiles. Pattern mirrored from amendment-review.ts.
 */
async function resolveClientUserId(orderClientId: string | null | undefined): Promise<string | null> {
  if (!orderClientId) return null;
  const { data: clientRow } = await supabase
    .from("clients")
    .select("user_id, email")
    .eq("id", orderClientId)
    .maybeSingle();
  if (!clientRow) return null;
  if ((clientRow as any).user_id) return (clientRow as any).user_id as string;
  const email = ((clientRow as any).email || "").toLowerCase().trim();
  if (!email) return null;
  const { data: profileMatch } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  return (profileMatch as any)?.id || null;
}

/**
 * Send the client (not just the owner) a confirmation -- in-app
 * notification AND email. Non-blocking on individual failures so a
 * dead inbox doesn't undo a successful webhook.
 */
async function sendClientPaymentConfirmation(
  order: any,
  kind: "deposit" | "balance",
  amountGross: string | number
): Promise<void> {
  const clientUserId = await resolveClientUserId(order.client_id);
  const amountFmt = `R${Number(amountGross).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;
  const isDeposit = kind === "deposit";
  const title = isDeposit
    ? `Deposit received for order ${order.order_number}`
    : `Final payment received for order ${order.order_number}`;
  const message = isDeposit
    ? `We received your deposit of ${amountFmt}. Your booking is now confirmed.`
    : `We received your final payment of ${amountFmt}. Your booking is fully paid.`;

  // In-app notification to the client (only if we resolved an auth uid).
  if (clientUserId) {
    try {
      await supabase.from("notifications").insert([{
        company_id: order.company_id || order.user_id,
        user_id: clientUserId,
        recipient_id: clientUserId,
        notification_type: "payment_received",
        title,
        message,
        priority: "high",
        link: `/client-portal?orderId=${order.id}`,
      }]);
    } catch (e) {
      console.warn("Client in-app notification failed:", e);
    }
  }

  // Email to the client. Use whichever address we have on file.
  let recipientEmail: string | null = order.client_email || null;
  let recipientName: string | null = order.client_name || null;
  if (!recipientEmail && order.client_id) {
    const { data: clientRow } = await supabase
      .from("clients")
      .select("email, client_name")
      .eq("id", order.client_id)
      .maybeSingle();
    if (clientRow) {
      recipientEmail = (clientRow as any).email || null;
      recipientName = recipientName || (clientRow as any).client_name || null;
    }
  }

  if (!recipientEmail) return;

  try {
    await emailService.sendEmail({
      companyId: order.company_id || order.user_id,
      to: recipientEmail,
      subject: isDeposit
        ? `Deposit received -- order ${order.order_number}`
        : `Final payment received -- order ${order.order_number}`,
      // Template type aligns with the seed in
      // supabase/migrations/20260506130000_seed_email_templates.sql
      // (deposit_payment_received / balance_payment_received). The
      // previous "deposit_confirmation" / "balance_confirmation" names
      // had no row in email_templates [P0-07].
      template: isDeposit ? "deposit_payment_received" : "balance_payment_received",
      variables: {
        clientName: recipientName || "there",
        orderNumber: order.order_number,
        amount: amountFmt,
        eventDate: order.event_date
          ? new Date(order.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
          : "TBD",
        venue: order.venue_address || "TBD",
      },
      orderId: order.id,
    });
  } catch (e) {
    console.warn("Client payment confirmation email failed:", e);
  }
}

/**
 * Verify PayFast webhook signature
 */
function validatePayFastSignature(data: any, signature: string): boolean {
  const passphrase = process.env.PAYFAST_PASSPHRASE || "";

  // Create parameter string
  const pfParamString = Object.keys(data)
    .filter(key => key !== "signature")
    .sort()
    .map(key => `${key}=${encodeURIComponent(data[key]).replace(/%20/g, "+")}`)
    .join("&");

  // Generate signature
  const generatedSignature = crypto
    .createHash("md5")
    .update(pfParamString + passphrase)
    .digest("hex");

  return generatedSignature === signature;
}
