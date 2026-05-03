import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/integrations/supabase/client";
import { orderService } from "@/services/orderService";
import { emailService } from "@/services/emailService";
import crypto from "crypto";

/**
 * Payment Webhook Handler
 * Receives payment confirmations from PayFast and other gateways
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

    // ✅ NEW: Handle invoice payments
    if (custom_str4 === "invoice" || custom_str2 === "invoice") {
      const invoiceId = custom_str1;
      const companyId = custom_str3;

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

        // Create payment record
        await supabase.from("payments").insert([{
          company_id: companyId,
          client_id: invoiceData.client_id,
          invoice_id: invoiceId,
          amount: parseFloat(amount_gross),
          currency: "ZAR",
          payment_method: "payfast",
          payment_reference: pf_payment_id,
          gateway_provider: "payfast",
          gateway_transaction_id: pf_payment_id,
          status: "completed",
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
            await emailService.sendEmail({
              companyId,
              to: recipientEmail,
              subject: `Payment received -- invoice ${invoiceData.invoice_number}`,
              template: "invoice-payment-received",
              variables: {
                clientName: recipientName || "there",
                invoiceNumber: invoiceData.invoice_number,
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

    // ✅ EXISTING: Handle order payments (deposit/balance)
    const orderId = custom_str1;
    const paymentType = custom_str2; // "deposit" or "balance"

    // Get order details
    const orderResult = await orderService.getOrderById(orderId);
    
    if (!orderResult.success || !orderResult.data) {
      console.error("Order not found:", orderId);
      return res.status(404).json({ error: "Order not found" });
    }

    const order = orderResult.data;

    // Determine if this is deposit or balance payment
    const isDepositPayment = !order.deposit_paid;
    const expectedAmount = isDepositPayment 
      ? order.deposit_amount 
      : order.balance_amount;

    // Verify amount matches
    if (Math.abs(Number(amount_gross) - Number(expectedAmount)) > 0.01) {
      console.error("Amount mismatch:", amount_gross, expectedAmount);
      return res.status(400).json({ error: "Amount mismatch" });
    }

    // Record the payment
    if (isDepositPayment) {
      await orderService.recordPayment(
        order.id,
        parseFloat(amount_gross),
        "payfast",
        pf_payment_id
      );

      // Create payment record
      await supabase.from("payments").insert([{
        user_id: order.user_id,
        order_id: order.id,
        payment_type: "deposit",
        amount: expectedAmount,
        currency: order.currency,
        status: "completed",
        gateway: "payfast",
        transaction_id: pf_payment_id,
        processed_at: new Date().toISOString(),
      }]);

      // Trigger deposit confirmation email
      await triggerEmail(order, "deposit_confirmation");

      // Send notification
      await supabase.from("notifications").insert([{
        user_id: order.user_id,
        recipient_id: order.user_id,
        notification_type: "payment_received",
        title: "Deposit Payment Received",
        message: `Deposit payment received for order ${order.order_number}`,
        priority: "high",
      }]);

    } else {
      await orderService.recordPayment(
        order.id,
        parseFloat(amount_gross),
        "payfast",
        pf_payment_id
      );

      // Create payment record
      await supabase.from("payments").insert([{
        user_id: order.user_id,
        order_id: order.id,
        payment_type: "balance",
        amount: expectedAmount,
        currency: order.currency,
        status: "completed",
        gateway: "payfast",
        transaction_id: pf_payment_id,
        processed_at: new Date().toISOString(),
      }]);

      // Trigger balance confirmation email
      await triggerEmail(order, "balance_confirmation");

      // Send notification
      await supabase.from("notifications").insert([{
        user_id: order.user_id,
        recipient_id: order.user_id,
        notification_type: "payment_received",
        title: "Balance Payment Received",
        message: `Full payment received for order ${order.order_number}. Your booking is confirmed!`,
        priority: "high",
      }]);
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

/**
 * Trigger email notification
 */
async function triggerEmail(order: any, emailType: string) {
  try {
    // Get email template
    const { data: template } = await supabase
      .from("email_templates")
      .select("*")
      .eq("user_id", order.user_id)
      .eq("template_type", emailType)
      .eq("is_active", true)
      .single();

    if (!template) {
      console.log("No email template found for:", emailType);
      return;
    }

    // Replace variables in template
    const subject = template.subject
      .replace("{order_number}", order.order_number)
      .replace("{client_name}", order.client_name);

    const body = template.body
      .replace("{client_name}", order.client_name)
      .replace("{order_number}", order.order_number)
      .replace("{event_date}", new Date(order.event_date).toLocaleDateString())
      .replace("{venue}", order.venue_address || "TBD");

    // Actually send through emailService -- this honours the company's
    // Resend / SMTP config and runs the block-list + quarantine guards.
    // Log first so we have a row even if the send fails (the failure
    // dashboard reads this table).
    await supabase.from("email_automation_log").insert([{
      user_id: order.user_id,
      order_id: order.id,
      template_type: emailType,
      recipient_email: order.client_email,
      recipient_name: order.client_name,
      subject: subject,
      status: "queued",
    }]);

    if (order.client_email) {
      const sent = await emailService.sendEmail({
        companyId: order.user_id,
        to: order.client_email,
        subject,
        body,
        variables: {
          clientName: order.client_name,
          orderNumber: order.order_number,
          eventDate: order.event_date
            ? new Date(order.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
            : "TBD",
          venue: order.venue_address || "TBD",
        },
      });
      // Update the log row to reflect the real outcome.
      await supabase.from("email_automation_log")
        .update({ status: sent ? "sent" : "failed" })
        .eq("user_id", order.user_id)
        .eq("order_id", order.id)
        .eq("template_type", emailType)
        .eq("status", "queued");
    }
  } catch (error) {
    console.error("Error triggering email:", error);
  }
}
