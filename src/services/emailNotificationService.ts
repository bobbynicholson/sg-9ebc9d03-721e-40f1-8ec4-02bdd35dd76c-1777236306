<![CDATA[
import { supabase } from "@/integrations/supabase/client";
import { sendEmailViaAPI } from "@/lib/emailClient";

/**
 * Email Notification Service
 * Processes pending email notifications from the database queue
 */

export interface EmailNotificationPreferences {
  user_id: string;
  order_confirmed: boolean;
  order_status_changed: boolean;
  order_ready_for_pickup: boolean;
  order_delivered: boolean;
  order_cancelled: boolean;
  driver_assigned: boolean;
  task_assigned: boolean;
  payment_received: boolean;
  payment_due: boolean;
  invoice_sent: boolean;
  low_stock_alert: boolean;
  out_of_stock_alert: boolean;
  daily_summary: boolean;
  weekly_report: boolean;
}

export const emailNotificationService = {
  /**
   * Get user's email notification preferences
   */
  async getPreferences(userId: string): Promise<EmailNotificationPreferences | null> {
    const { data, error } = await supabase
      .from("email_notification_preferences")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching email preferences:", error);
      return null;
    }

    return data;
  },

  /**
   * Update user's email notification preferences
   */
  async updatePreferences(
    userId: string,
    preferences: Partial<EmailNotificationPreferences>
  ): Promise<boolean> {
    const { error } = await supabase
      .from("email_notification_preferences")
      .upsert({
        user_id: userId,
        ...preferences,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error("Error updating email preferences:", error);
      return false;
    }

    return true;
  },

  /**
   * Process pending email notifications
   * This should be called periodically (e.g., every minute via cron)
   */
  async processPendingEmails(companyId: string): Promise<number> {
    try {
      // Get pending emails
      const { data: pendingEmails, error } = await supabase
        .from("email_automation_log")
        .select("*")
        .eq("user_id", companyId)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(50);

      if (error) {
        console.error("Error fetching pending emails:", error);
        return 0;
      }

      if (!pendingEmails || pendingEmails.length === 0) {
        return 0;
      }

      let sentCount = 0;

      // Process each email
      for (const email of pendingEmails) {
        try {
          // Get the appropriate template and build the email
          const emailBody = await this.buildEmailBody(email);
          
          // Send via API
          const success = await sendEmailViaAPI({
            companyId: companyId,
            to: email.recipient_email,
            subject: email.subject,
            body: emailBody,
            orderId: email.order_id,
            quoteId: email.quote_id,
          });

          // Update status
          if (success) {
            await supabase
              .from("email_automation_log")
              .update({ 
                status: "sent",
                updated_at: new Date().toISOString()
              })
              .eq("id", email.id);
            
            sentCount++;
          } else {
            await supabase
              .from("email_automation_log")
              .update({ 
                status: "failed",
                updated_at: new Date().toISOString()
              })
              .eq("id", email.id);
          }
        } catch (err) {
          console.error("Error sending email:", err);
          await supabase
            .from("email_automation_log")
            .update({ 
              status: "failed",
              updated_at: new Date().toISOString()
            })
            .eq("id", email.id);
        }
      }

      return sentCount;
    } catch (error) {
      console.error("Error processing pending emails:", error);
      return 0;
    }
  },

  /**
   * Build email body based on template type
   */
  async buildEmailBody(emailLog: any): Promise<string> {
    const templateType = emailLog.template_type;

    // Fetch order details if available
    let orderDetails = null;
    if (emailLog.order_id) {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("id", emailLog.order_id)
        .single();
      orderDetails = data;
    }

    // Build email based on template type
    switch (templateType) {
      case "order_status_confirmed":
        return this.buildOrderConfirmedEmail(orderDetails, emailLog);
      
      case "order_status_preparing":
        return this.buildOrderPreparingEmail(orderDetails, emailLog);
      
      case "order_status_ready":
        return this.buildOrderReadyEmail(orderDetails, emailLog);
      
      case "order_status_delivered":
        return this.buildOrderDeliveredEmail(orderDetails, emailLog);
      
      case "order_status_cancelled":
        return this.buildOrderCancelledEmail(orderDetails, emailLog);
      
      case "driver_assigned":
        return this.buildDriverAssignedEmail(orderDetails, emailLog);
      
      default:
        return this.buildGenericEmail(emailLog);
    }
  },

  /**
   * Email Templates
   */
  buildOrderConfirmedEmail(order: any, emailLog: any): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .button { display: inline-block; background: #9333ea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
    .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ Order Confirmed!</h1>
    </div>
    <div class="content">
      <p>Hi ${emailLog.recipient_name},</p>
      <p>Great news! Your order has been confirmed and we're getting everything ready for your event.</p>
      
      <div class="details">
        <h3>Order Details</h3>
        <div class="detail-row">
          <strong>Order Number:</strong>
          <span>${order?.order_number || 'N/A'}</span>
        </div>
        <div class="detail-row">
          <strong>Event Date:</strong>
          <span>${order?.event_date ? new Date(order.event_date).toLocaleDateString() : 'TBD'}</span>
        </div>
        <div class="detail-row">
          <strong>Number of People:</strong>
          <span>${order?.number_of_people || 'N/A'}</span>
        </div>
        <div class="detail-row">
          <strong>Venue:</strong>
          <span>${order?.venue_name || 'N/A'}</span>
        </div>
        <div class="detail-row">
          <strong>Total Amount:</strong>
          <span>R ${order?.total_amount?.toFixed(2) || '0.00'}</span>
        </div>
      </div>

      <p>We'll keep you updated as we prepare your order. You'll receive notifications when:</p>
      <ul>
        <li>Your order is being prepared</li>
        <li>Your order is ready for pickup/delivery</li>
        <li>Your order is out for delivery</li>
        <li>Your order has been delivered</li>
      </ul>

      <p>If you have any questions, feel free to reach out to us anytime.</p>

      <p>Best regards,<br>Your Catering Team</p>
    </div>
    <div class="footer">
      <p>This is an automated notification. Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>
    `;
  },

  buildOrderPreparingEmail(order: any, emailLog: any): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>👨‍🍳 Order Being Prepared</h1>
    </div>
    <div class="content">
      <p>Hi ${emailLog.recipient_name},</p>
      <p>Your order <strong>${order?.order_number}</strong> is now being prepared by our kitchen team.</p>
      <p>We're working hard to ensure everything is perfect for your event on ${order?.event_date ? new Date(order.event_date).toLocaleDateString() : 'your scheduled date'}.</p>
      <p>You'll receive another notification when your order is ready for pickup or delivery.</p>
      <p>Best regards,<br>Your Catering Team</p>
    </div>
    <div class="footer">
      <p>This is an automated notification.</p>
    </div>
  </div>
</body>
</html>
    `;
  },

  buildOrderReadyEmail(order: any, emailLog: any): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔥 Order Ready for Pickup!</h1>
    </div>
    <div class="content">
      <p>Hi ${emailLog.recipient_name},</p>
      <p>Great news! Your order <strong>${order?.order_number}</strong> is ready for pickup/delivery.</p>
      ${order?.delivery_type === 'pickup' ? 
        '<p>You can collect your order at your convenience.</p>' : 
        '<p>Our driver will be delivering your order shortly.</p>'
      }
      <p>Event Date: ${order?.event_date ? new Date(order.event_date).toLocaleDateString() : 'TBD'}</p>
      <p>Best regards,<br>Your Catering Team</p>
    </div>
    <div class="footer">
      <p>This is an automated notification.</p>
    </div>
  </div>
</body>
</html>
    `;
  },

  buildOrderDeliveredEmail(order: any, emailLog: any): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ Order Delivered!</h1>
    </div>
    <div class="content">
      <p>Hi ${emailLog.recipient_name},</p>
      <p>Your order <strong>${order?.order_number}</strong> has been successfully delivered!</p>
      <p>We hope you enjoy your event. If you have any feedback or concerns, please don't hesitate to reach out.</p>
      <p>Thank you for choosing us for your catering needs!</p>
      <p>Best regards,<br>Your Catering Team</p>
    </div>
    <div class="footer">
      <p>This is an automated notification.</p>
    </div>
  </div>
</body>
</html>
    `;
  },

  buildOrderCancelledEmail(order: any, emailLog: any): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>❌ Order Cancelled</h1>
    </div>
    <div class="content">
      <p>Hi ${emailLog.recipient_name},</p>
      <p>Your order <strong>${order?.order_number}</strong> has been cancelled.</p>
      <p>If this was a mistake or you have any questions, please contact us immediately.</p>
      <p>We hope to serve you again in the future.</p>
      <p>Best regards,<br>Your Catering Team</p>
    </div>
    <div class="footer">
      <p>This is an automated notification.</p>
    </div>
  </div>
</body>
</html>
    `;
  },

  buildDriverAssignedEmail(order: any, emailLog: any): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🚗 New Delivery Assignment</h1>
    </div>
    <div class="content">
      <p>Hi ${emailLog.recipient_name},</p>
      <p>You have been assigned a new delivery:</p>
      
      <div class="details">
        <h3>Delivery Details</h3>
        <div class="detail-row">
          <strong>Order Number:</strong>
          <span>${order?.order_number || 'N/A'}</span>
        </div>
        <div class="detail-row">
          <strong>Client:</strong>
          <span>${order?.client_name || 'N/A'}</span>
        </div>
        <div class="detail-row">
          <strong>Event Date:</strong>
          <span>${order?.event_date ? new Date(order.event_date).toLocaleDateString() : 'TBD'}</span>
        </div>
        <div class="detail-row">
          <strong>Delivery Address:</strong>
          <span>${order?.venue_address || 'N/A'}</span>
        </div>
      </div>

      <p>Please log in to your driver dashboard to view full details and update the delivery status.</p>

      <p>Best regards,<br>Your Catering Team</p>
    </div>
    <div class="footer">
      <p>This is an automated notification.</p>
    </div>
  </div>
</body>
</html>
    `;
  },

  buildGenericEmail(emailLog: any): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #9333ea 0%, #ec4899 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📧 Notification</h1>
    </div>
    <div class="content">
      <p>Hi ${emailLog.recipient_name},</p>
      <p>${emailLog.subject}</p>
      <p>Best regards,<br>Your Catering Team</p>
    </div>
    <div class="footer">
      <p>This is an automated notification.</p>
    </div>
  </div>
</body>
</html>
    `;
  },
};
</![CDATA[>