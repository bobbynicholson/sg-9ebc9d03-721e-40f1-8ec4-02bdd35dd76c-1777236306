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
 * we return 200 immediately so PayFast stops retrying. The dedup also
 * covers replay attacks: a re-sent valid signed IPN with the same
 * pf_payment_id is a no-op.
 *
 * Hardening (P0-11):
 *  - bodyParser disabled; signature validates over the raw form-body
 *    string before any reshape, so URL-encoding edge cases (spaces,
 *    accented characters, ampersands in values) don't break sig check.
 *  - IP allowlist via PAYFAST_ALLOWED_IPS env var (comma-separated).
 *    Empty / unset disables the check (dev convenience). Production
 *    should set: 197.97.145.144/29, 41.74.179.192/27, 102.216.36.16,
 *    102.216.36.17 -- whatever PayFast publishes as their IPN egress
 *    range. CIDR not parsed here; the env var should list the exact
 *    IPs after subnet expansion.
 */
export const config = {
  api: {
    bodyParser: false,
  },
};

async function readRawBody(req: NextApiRequest): Promise<string> {
  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer | string) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

// Parse application/x-www-form-urlencoded preserving original order
// (PayFast signs in the order the fields appear in the body, NOT
// alphabetical). Returns both the ordered key/value list and a map.
function parsePayFastBody(raw: string): { ordered: Array<[string, string]>; map: Record<string, string> } {
  const ordered: Array<[string, string]> = [];
  const map: Record<string, string> = {};
  if (!raw) return { ordered, map };
  for (const pair of raw.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const k = eq === -1 ? pair : pair.slice(0, eq);
    const v = eq === -1 ? "" : pair.slice(eq + 1);
    const key = decodeURIComponent(k.replace(/\+/g, " "));
    const val = decodeURIComponent(v.replace(/\+/g, " "));
    ordered.push([key, val]);
    map[key] = val;
  }
  return { ordered, map };
}

// Reconstruct the canonical PayFast signed string from the ordered
// fields. PayFast docs: "Take all the form fields excluding signature,
// in the order they appear in the form, urlencode them and concatenate
// with &, then append &passphrase=<passphrase> if set."
function buildPayFastSignedString(
  ordered: Array<[string, string]>,
  passphrase: string,
): string {
  const parts: string[] = [];
  for (const [k, v] of ordered) {
    if (k === "signature") continue;
    if (v === "") continue;
    parts.push(`${k}=${encodeURIComponent(v).replace(/%20/g, "+")}`);
  }
  let s = parts.join("&");
  if (passphrase) {
    s += `&passphrase=${encodeURIComponent(passphrase).replace(/%20/g, "+")}`;
  }
  return s;
}

function clientIpFromRequest(req: NextApiRequest): string | null {
  const forwarded = (req.headers["x-forwarded-for"] || "") as string;
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const real = (req.headers["x-real-ip"] || "") as string;
  if (real) return real.trim();
  return req.socket?.remoteAddress || null;
}

function isAllowedPayFastIp(ip: string | null): boolean {
  const raw = (process.env.PAYFAST_ALLOWED_IPS || "").trim();
  if (!raw) return true; // not configured -> allow (dev / fresh-install)
  if (!ip) return false;
  const list = raw.split(",").map(s => s.trim()).filter(Boolean);
  return list.includes(ip);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // 1. IP allowlist (env-gated, see header docstring).
    const callerIp = clientIpFromRequest(req);
    if (!isAllowedPayFastIp(callerIp)) {
      console.warn("[payfast-webhook] rejected non-allowlisted IP:", callerIp);
      return res.status(403).json({ error: "Forbidden" });
    }

    // 2. Read raw body and validate signature against it directly,
    //    preserving the original field order. The previous Object.keys
    //    + .sort() approach was wrong for PayFast (they sign in form
    //    order, not alphabetical) and the JSON-parsed shape lost
    //    multi-value forms.
    const rawBody = await readRawBody(req);
    const { ordered, map: paymentData } = parsePayFastBody(rawBody);

    const passphrase = process.env.PAYFAST_PASSPHRASE || "";
    const signedString = buildPayFastSignedString(ordered, passphrase);
    const expectedSignature = crypto
      .createHash("md5")
      .update(signedString)
      .digest("hex");
    const providedSignature = (paymentData.signature || "").toLowerCase();

    if (expectedSignature.toLowerCase() !== providedSignature) {
      console.warn("[payfast-webhook] signature mismatch");
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

      // Read the invoice's client + companies info for the
      // notification + email follow-ups (the RPC returns just IDs).
      const { data: invoice } = await supabase
        .from("invoices")
        .select("*, companies(*)")
        .eq("id", invoiceId)
        .single();

      if (invoice) {
        const invoiceData = invoice as any;
        const companyData = invoiceData.companies;

        // Atomic invoice + payments + order update via SECURITY DEFINER
        // RPC. Three sequential writes used to leave the system in
        // inconsistent state on a network blip between any two of
        // them. The RPC does all three in one transaction with belt-
        // and-braces idempotency on gateway_transaction_id [P2F-1].
        const { data: rpcResult, error: rpcErr } = await (supabase as any).rpc(
          "record_invoice_payment",
          {
            p_invoice_id: invoiceId,
            p_amount: parseFloat(amount_gross),
            p_payment_method: "payfast",
            p_transaction_id: pf_payment_id,
            p_company_id: companyId,
            p_client_id: invoiceData.client_id,
            p_currency: "ZAR",
            p_gateway_provider: "payfast",
          }
        );

        if (rpcErr) {
          console.error("Error in record_invoice_payment RPC:", rpcErr);
          return res.status(500).json({ error: "Failed to record invoice payment" });
        }

        if ((rpcResult as any)?.idempotent === true) {
          return res.status(200).json({
            message: "Already processed",
            invoiceId,
            payment_id: (rpcResult as any).payment_id,
          });
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

        // Auto-complete the linked order when:
        //   (a) the invoice has an order_id (it's tied to a real order)
        //   (b) the invoice is now fully paid (balance_due <= 0)
        //   (c) the order is already in 'delivered' status -- meaning
        //       the food / service was rendered and only the balance
        //       was outstanding
        //
        // Without this hook the order sat in 'delivered' forever even
        // after the client paid in full, so ensureScheduledAfterSales
        // (gated on 'completed' transition) never fired, the
        // after-sales nurture sequence never started, and the order
        // never showed as 'fully closed' on operator dashboards.
        if (invoiceData.order_id) {
          try {
            const { data: freshInvoice } = await supabase
              .from("invoices")
              .select("balance_due, status")
              .eq("id", invoiceId)
              .maybeSingle();
            const fullyPaid = (freshInvoice as any)?.status === "paid"
              || Number((freshInvoice as any)?.balance_due || 0) <= 0;
            if (fullyPaid) {
              const { data: linkedOrder } = await supabase
                .from("orders")
                .select("status")
                .eq("id", invoiceData.order_id)
                .maybeSingle();
              const orderStatus = String((linkedOrder as any)?.status || "").toLowerCase();
              if (orderStatus === "delivered") {
                // Route through the state-machine helper so order_status_history
                // gets the row + the post-completion hooks (after-sales
                // scheduling) fire correctly. Non-blocking on failure.
                const { updateOrderStatus } = await import("@/services/order/orderWorkflow");
                const r = await updateOrderStatus(invoiceData.order_id, "completed" as any);
                if (!(r as any)?.success) {
                  console.warn(
                    "[invoice-paid] auto-complete failed:",
                    (r as any)?.error,
                  );
                }
              }
            }
          } catch (autoCompleteErr) {
            console.warn("[invoice-paid] auto-complete crashed (non-blocking):", autoCompleteErr);
          }
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

    // Verify amount matches.
    //
    // Tolerance was 1 cent (0.01) which was too tight for inc-VAT
    // tenants -- the stored deposit_amount and PayFast's amount_gross
    // can drift by up to a few cents per R1k of order value because
    // inc/ex rounding cascades through deposit-percent calculations.
    // Catering orders sit in the R2k-R200k range so a 1-cent gate
    // silently rejected real payments for the spit-braai / similar
    // inc-VAT tenants.
    //
    // New tolerance: R1 absolute OR 0.5% of the expected amount,
    // whichever is larger. Still tight enough to catch a real fraud
    // attempt (mismatched amount by hundreds) but lets honest rounding
    // through. Log the delta whenever it's non-zero so we can spot
    // anything systematic in production.
    const exp = Number(expectedAmount);
    const got = Number(amount_gross);
    const delta = Math.abs(got - exp);
    const tolerance = Math.max(1.0, exp * 0.005);
    if (delta > tolerance) {
      console.error("Amount mismatch:", { got, expected: exp, delta, tolerance });
      return res.status(400).json({ error: "Amount mismatch" });
    }
    if (delta > 0.01) {
      console.warn("Amount within tolerance but not exact:", { got, expected: exp, delta });
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

    // Phase 8 #6: also email the company contact address. The
    // in-app bell only fires when an admin happens to be in the
    // tab; for the operator on the road this email is the actual
    // 'money landed' signal and prompts them to confirm with the
    // kitchen / driver. Best-effort -- never undoes the webhook.
    try {
      const { data: companyRow } = await supabase
        .from("companies")
        .select("email, company_name")
        .eq("id", order.company_id || order.user_id)
        .maybeSingle();
      const ownerEmail = (companyRow as any)?.email as string | null | undefined;
      const companyName = (companyRow as any)?.company_name as string | null | undefined;
      if (ownerEmail) {
        const amountFmt = `R${Number(amount_gross).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;
        const subject = isDepositPayment
          ? `Deposit landed -- ${order.order_number} (${order.client_name || "client"})`
          : `Final payment landed -- ${order.order_number} (${order.client_name || "client"})`;
        const eventLine = order.event_date
          ? new Date(order.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
          : "TBC";
        const html = `<div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #0f172a; max-width: 560px;">
            <h2 style="margin: 0 0 12px;">${isDepositPayment ? "Deposit received" : "Final payment received"}</h2>
            <p style="margin: 0 0 8px;"><strong>${order.client_name || "Client"}</strong> just paid <strong>${amountFmt}</strong> on order <strong>${order.order_number}</strong>.</p>
            <p style="margin: 0 0 8px;">Event: ${eventLine}<br/>Venue: ${order.venue_address || "TBC"}</p>
            <p style="margin: 0 0 8px;">Booking is now ${isDepositPayment ? "confirmed" : "fully paid"}.</p>
            <p style="margin: 16px 0 0; font-size: 12px; color: #64748b;">${companyName || "Your team"} -- automated notification from CateringMS.</p>
          </div>`;
        await emailService.sendEmail({
          companyId: order.company_id || order.user_id,
          to: ownerEmail,
          subject,
          body: html,
          orderId: order.id,
        });
      }
    } catch (ownerEmailErr) {
      console.warn("[payment-webhook] owner notification email failed (non-blocking):", ownerEmailErr);
    }

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

// validatePayFastSignature was removed in favour of the inline raw-body
// + ordered-fields validator at the top of handler [P0-11]. Old version
// signed over alphabetical-sorted JSON-parsed fields, which doesn't
// match PayFast's documented "fields in form order" contract and
// produced false negatives on any IPN with non-ASCII characters.
