import type { NextApiRequest, NextApiResponse } from "next";
import { supabase } from "@/integrations/supabase/client";
import { orderService } from "@/services/orderService";
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
    const { gateway, ...paymentData } = req.body;

    // Verify webhook signature based on gateway
    if (gateway === "payfast") {
      const isValid = verifyPayFastSignature(req.body);
      if (!isValid) {
        console.error("Invalid PayFast signature");
        return res.status(400).json({ error: "Invalid signature" });
      }
    }

    // Extract payment details
    const {
      payment_status,
      item_name,
      m_payment_id, // Our order ID
      pf_payment_id, // PayFast transaction ID
      amount_gross,
    } = paymentData;

    if (payment_status !== "COMPLETE") {
      console.log("Payment not complete:", payment_status);
      return res.status(200).json({ message: "Payment pending" });
    }

    // Get the order
    const order = await orderService.getOrder(m_payment_id);
    if (!order) {
      console.error("Order not found:", m_payment_id);
      return res.status(404).json({ error: "Order not found" });
    }

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
      await orderService.recordDepositPayment(
        order.id,
        pf_payment_id,
        gateway
      );

      // Create payment record
      await supabase.from("payments").insert([{
        user_id: order.user_id,
        order_id: order.id,
        payment_type: "deposit",
        amount: expectedAmount,
        currency: order.currency,
        status: "completed",
        gateway: gateway,
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
      await orderService.recordBalancePayment(
        order.id,
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
        gateway: gateway,
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
    console.error("Payment webhook error:", error);
    return res.status(500).json({ 
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error"
    });
  }
}

/**
 * Verify PayFast webhook signature
 */
function verifyPayFastSignature(data: any): boolean {
  const passphrase = process.env.PAYFAST_PASSPHRASE || "";
  
  // Create parameter string
  const pfParamString = Object.keys(data)
    .filter(key => key !== "signature")
    .sort()
    .map(key => `${key}=${encodeURIComponent(data[key]).replace(/%20/g, "+")}`)
    .join("&");

  // Generate signature
  const signature = crypto
    .createHash("md5")
    .update(pfParamString + passphrase)
    .digest("hex");

  return signature === data.signature;
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

    // Log the email
    await supabase.from("email_automation_log").insert([{
      user_id: order.user_id,
      order_id: order.id,
      template_type: emailType,
      recipient_email: order.client_email,
      recipient_name: order.client_name,
      subject: subject,
      status: "sent",
    }]);

    // TODO: Actual email sending via Resend/SMTP
    console.log("Email queued:", emailType, order.client_email);

  } catch (error) {
    console.error("Error triggering email:", error);
  }
}
