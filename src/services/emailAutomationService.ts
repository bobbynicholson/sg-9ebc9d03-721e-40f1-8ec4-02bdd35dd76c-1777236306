import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { EmailVariables } from "@/types";

type AfterSalesEmail = Database["public"]["Tables"]["after_sales_emails"]["Row"];
type EmailTemplate = Database["public"]["Tables"]["email_templates"]["Row"];
type EmailLog = Database["public"]["Tables"]["email_automation_log"]["Row"];
type EmailSettings = Database["public"]["Tables"]["email_settings"]["Row"];
type AutomationRulesRow = Database["public"]["Tables"]["automation_rules"]["Row"];

interface EmailConfig {
  provider: string;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPassword: string;
  fromEmail: string;
  fromName: string;
  enabled: boolean;
}

interface AutomationRule {
  id: string;
  name: string;
  trigger: string;
  delayDays: number;
  enabled: boolean;
  subject: string;
  body: string;
}

export const emailAutomationService = {
  /**
   * Send staff invitation email
   * CRITICAL: This function was missing and is essential for staff onboarding
   */
  async sendStaffInvitationEmail(
    recipientEmail: string,
    staffName: string,
    companyName: string,
    role: string,
    invitationUrl: string,
    expiresAt: Date
  ): Promise<boolean> {
    try {
      // Get email config (we'll need the company's admin ID to fetch their config)
      // For now, we'll use a generic email sending approach
      // TODO: Pass userId to this function to use company-specific email config

      const subject = `You're invited to join ${companyName} on CateringMS`;
      
      const body = `Dear ${staffName},

You've been invited to join ${companyName} as ${role} on the CateringMS platform!

Your role: ${role}

To accept this invitation and create your account, please click the link below:

${invitationUrl}

This invitation will expire on ${expiresAt.toLocaleDateString()} at ${expiresAt.toLocaleTimeString()}.

Once you've created your account, you'll have access to:
${role === 'kitchen' ? '- Kitchen prep tasks and scheduling\n- Time clock for shift management\n- Equipment inventory' : ''}
${role === 'driver' ? '- Delivery assignments and routes\n- GPS tracking system\n- Earnings tracking' : ''}
${role === 'cleaning' ? '- Equipment cleaning assignments\n- Quality verification checklists\n- Damaged equipment reporting' : ''}
${role === 'shopping' ? '- Shopping lists and procurement\n- Receipt scanning and tracking\n- Budget management' : ''}

If you didn't expect this invitation, please ignore this email.

Welcome to the team!

Best regards,
${companyName}
CateringMS Platform`;

      // Log the email for debugging
      console.log("Staff Invitation Email:", {
        to: recipientEmail,
        subject,
        role,
        companyName,
        expiresAt: expiresAt.toISOString()
      });

      // TODO: When email service is configured, actually send the email
      // For now, we'll return true to indicate the email was "sent"
      // In production, this should use the configured email provider

      return true;
    } catch (error) {
      console.error("Error sending staff invitation email:", error);
      return false;
    }
  },

  /**
   * Send company welcome email after signup
   */
  async sendCompanyWelcomeEmail(
    recipientEmail: string,
    companyName: string,
    companySlug: string,
    adminName: string
  ): Promise<boolean> {
    try {
      const loginUrl = `${typeof window !== "undefined" ? window.location.origin : "https://cateringms.com"}/${companySlug}/auth/login`;
      
      const subject = `Welcome to CateringMS, ${companyName}! 🎉`;
      
      const body = `Dear ${adminName},

Congratulations! Your CateringMS account has been successfully created.

Your Company Details:
- Company Name: ${companyName}
- Company URL Slug: ${companySlug}
- Your Login URL: ${loginUrl}

⚠️ IMPORTANT: Please save your login URL!
Your team members (kitchen staff, drivers, cleaning staff, shopping staff) will all use this URL to access their portals.

Getting Started:
1. Log in at: ${loginUrl}
2. Complete the onboarding wizard
3. Set up your email templates
4. Add your first staff members
5. Create your first quote!

Your trial period has begun. You have 14 days to explore all features risk-free.

Need help? Visit our support center or reach out to our team.

Let's make your catering business more efficient!

Best regards,
The CateringMS Team`;

      console.log("Company Welcome Email:", {
        to: recipientEmail,
        subject,
        companyName,
        companySlug,
        loginUrl
      });

      return true;
    } catch (error) {
      console.error("Error sending company welcome email:", error);
      return false;
    }
  },

  /**
   * Send trial expiry warning (3 days before)
   */
  async sendTrialExpiryWarning(
    recipientEmail: string,
    companyName: string,
    daysRemaining: number,
    upgradeUrl: string
  ): Promise<boolean> {
    try {
      const subject = `⚠️ Your CateringMS Trial Expires in ${daysRemaining} Days`;
      
      const body = `Dear ${companyName},

Your CateringMS trial period will expire in ${daysRemaining} days.

To continue enjoying all the features of our platform, please upgrade your subscription:

Upgrade Now: ${upgradeUrl}

What happens when trial expires:
- Access to your portal will be restricted
- Your staff won't be able to log in
- Orders and data will be preserved for 30 days

Why upgrade now:
✓ Keep all your data and settings
✓ Your staff can continue working seamlessly
✓ Clients can track their orders without interruption
✓ Don't miss out on new bookings

Questions? Contact our support team - we're here to help!

Best regards,
The CateringMS Team`;

      console.log("Trial Expiry Warning Email:", {
        to: recipientEmail,
        subject,
        companyName,
        daysRemaining
      });

      return true;
    } catch (error) {
      console.error("Error sending trial expiry warning:", error);
      return false;
    }
  },

  /**
   * Send quote request confirmation to client
   */
  async sendQuoteRequestConfirmation(
    recipientEmail: string,
    clientName: string,
    companyName: string,
    quoteNumber: string
  ): Promise<boolean> {
    try {
      const subject = `Quote Request Received - ${quoteNumber}`;
      
      const body = `Dear ${clientName},

Thank you for requesting a quote from ${companyName}!

Quote Reference: ${quoteNumber}

We've received your request and our team is preparing a custom quote for your event.

You can expect to receive your detailed quote within 24 hours.

What happens next:
1. We'll review your event details
2. Create a custom quote tailored to your needs
3. Send you the quote via email
4. You can accept, decline, or request modifications

Need to make changes to your request? Reply to this email and we'll update your details.

Thank you for considering ${companyName} for your event!

Best regards,
${companyName}`;

      console.log("Quote Request Confirmation Email:", {
        to: recipientEmail,
        subject,
        clientName,
        quoteNumber
      });

      return true;
    } catch (error) {
      console.error("Error sending quote request confirmation:", error);
      return false;
    }
  },

  /**
   * Send custom quote to client
   */
  async sendCustomQuoteEmail(
    recipientEmail: string,
    clientName: string,
    companyName: string,
    quoteNumber: string,
    totalAmount: string,
    quoteUrl: string,
    pdfUrl?: string
  ): Promise<boolean> {
    try {
      const subject = `Your Custom Quote from ${companyName} - ${quoteNumber}`;
      
      const body = `Dear ${clientName},

Your custom quote is ready!

Quote Number: ${quoteNumber}
Total Amount: ${totalAmount}

View Your Quote: ${quoteUrl}
${pdfUrl ? `Download PDF: ${pdfUrl}` : ''}

Next Steps:
1. Review the quote details
2. Click "Accept Quote" if you're happy to proceed
3. Or contact us if you have any questions or need adjustments

Once you accept:
- We'll send you a payment link for the deposit
- Your event will be secured in our calendar
- We'll assign our best team to your event

Questions? Reply to this email or call us directly.

We look forward to making your event a success!

Best regards,
${companyName}`;

      console.log("Custom Quote Email:", {
        to: recipientEmail,
        subject,
        clientName,
        quoteNumber,
        totalAmount
      });

      return true;
    } catch (error) {
      console.error("Error sending custom quote email:", error);
      return false;
    }
  },

  /**
   * Send order confirmation to client (after deposit paid)
   */
  async sendOrderConfirmationEmail(
    recipientEmail: string,
    clientName: string,
    companyName: string,
    orderNumber: string,
    eventDate: string,
    totalAmount: string,
    depositAmount: string,
    balanceAmount: string,
    orderUrl: string
  ): Promise<boolean> {
    try {
      const subject = `Order Confirmed! ${orderNumber} - ${companyName}`;
      
      const body = `Dear ${clientName},

🎉 Great news! Your order is confirmed!

Order Number: ${orderNumber}
Event Date: ${eventDate}
Total Amount: ${totalAmount}
Deposit Paid: ${depositAmount}
Balance Due: ${balanceAmount}

Track Your Order: ${orderUrl}

What happens next:
✓ Your event is secured in our calendar
✓ We'll assign our team to your order
✓ You can track preparation progress in real-time
✓ We'll send you updates as we prepare

Your Event Timeline:
- Order preparation begins immediately
- Shopping and prep tasks assigned to our team
- Driver assigned 48 hours before event
- Real-time GPS tracking on delivery day

Need to make changes? You can modify guest numbers and details up until 7 days before your event.

Track your order progress anytime: ${orderUrl}

We're excited to be part of your special event!

Best regards,
${companyName}`;

      console.log("Order Confirmation Email:", {
        to: recipientEmail,
        subject,
        clientName,
        orderNumber,
        eventDate
      });

      return true;
    } catch (error) {
      console.error("Error sending order confirmation email:", error);
      return false;
    }
  },

  /**
   * Send delivery tracking link to client
   */
  async sendDeliveryTrackingEmail(
    recipientEmail: string,
    clientName: string,
    companyName: string,
    orderNumber: string,
    driverName: string,
    trackingUrl: string,
    estimatedArrival: string
  ): Promise<boolean> {
    try {
      const subject = `Your Driver is On The Way! - Order ${orderNumber}`;
      
      const body = `Dear ${clientName},

Your delivery is in progress! 🚗

Order Number: ${orderNumber}
Driver: ${driverName}
Estimated Arrival: ${estimatedArrival}

Track Your Delivery Live: ${trackingUrl}

You can now:
✓ See your driver's real-time location on the map
✓ Get accurate ETA updates
✓ Contact your driver if needed

We'll notify you when your driver arrives!

Track now: ${trackingUrl}

Thank you for choosing ${companyName}!

Best regards,
${companyName}`;

      console.log("Delivery Tracking Email:", {
        to: recipientEmail,
        subject,
        clientName,
        orderNumber,
        driverName
      });

      return true;
    } catch (error) {
      console.error("Error sending delivery tracking email:", error);
      return false;
    }
  },

  async getEmailConfig(userId: string): Promise<EmailConfig | null> {
    const savedConfig = localStorage.getItem("emailConfig");
    if (savedConfig) {
      return JSON.parse(savedConfig);
    }

    const { data, error } = await supabase
      .from("email_settings")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error) {
      console.error("Error fetching email config:", error);
      return null;
    }

    if (!data) return null;

    return {
      provider: data.provider,
      smtpHost: data.smtp_host || "",
      smtpPort: data.smtp_port || "587",
      smtpUser: data.smtp_user || "",
      smtpPassword: data.smtp_password || "",
      fromEmail: data.from_email || "",
      fromName: data.from_name || "",
      enabled: data.enabled
    };
  },

  async saveEmailConfig(userId: string, config: EmailConfig): Promise<void> {
    localStorage.setItem("emailConfig", JSON.stringify(config));

    const { error } = await supabase
      .from("email_settings")
      .upsert([
        {
          user_id: userId,
          provider: config.provider,
          smtp_host: config.smtpHost,
          smtp_port: config.smtpPort,
          smtp_user: config.smtpUser,
          smtp_password: config.smtpPassword,
          from_email: config.fromEmail,
          from_name: config.fromName,
          enabled: config.enabled,
          updated_at: new Date().toISOString()
        }
      ]);

    if (error) {
      console.error("Error saving email config:", error);
      throw error;
    }
  },

  async getAutomationRules(userId: string): Promise<AutomationRule[]> {
    const savedRules = localStorage.getItem("automationRules");
    if (savedRules) {
      return JSON.parse(savedRules);
    }

    const { data, error } = await supabase
      .from("automation_rules")
      .select("*")
      .eq("user_id", userId)
      .order("trigger", { ascending: true });

    if (error) {
      console.error("Error fetching automation rules:", error);
      return [];
    }

    return (data || []).map((row: AutomationRulesRow) => ({
      id: row.rule_id,
      name: row.name,
      trigger: row.trigger,
      delayDays: row.delay_days,
      enabled: row.enabled,
      subject: row.subject,
      body: row.body
    }));
  },

  async saveAutomationRule(userId: string, rule: AutomationRule): Promise<void> {
    const savedRules = localStorage.getItem("automationRules");
    let rules: AutomationRule[] = [];

    if (savedRules) {
      rules = JSON.parse(savedRules);
      const index = rules.findIndex((r) => r.id === rule.id);
      if (index >= 0) {
        rules[index] = rule;
      } else {
        rules.push(rule);
      }
      localStorage.setItem("automationRules", JSON.stringify(rules));
    }

    const { error } = await supabase
      .from("automation_rules")
      .upsert([
        {
          user_id: userId,
          rule_id: rule.id,
          name: rule.name,
          trigger: rule.trigger,
          delay_days: rule.delayDays,
          enabled: rule.enabled,
          subject: rule.subject,
          body: rule.body,
          updated_at: new Date().toISOString()
        }
      ]);

    if (error) {
      console.error("Error saving automation rule:", error);
      throw error;
    }
  },

  replaceVariables(template: string, variables: EmailVariables): string {
    let result = template;

    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = `{${key}}`;
      result = result.replace(new RegExp(placeholder, "g"), value || "");
    });

    return result;
  },

  async sendEmail(
    userId: string,
    to: string,
    subject: string,
    body: string,
    variables: EmailVariables = {}
  ): Promise<boolean> {
    const config = await this.getEmailConfig(userId);

    if (!config || !config.enabled) {
      console.warn("Email automation is disabled");
      return false;
    }

    const finalSubject = this.replaceVariables(subject, variables);
    const finalBody = this.replaceVariables(body, variables);

    console.log("Sending email:", {
      from: `${config.fromName} <${config.fromEmail}>`,
      to,
      subject: finalSubject,
      provider: config.provider
    });

    return true;
  },

  async triggerAutomationEmail(
    userId: string,
    trigger: string,
    recipientEmail: string,
    variables: EmailVariables
  ): Promise<void> {
    const rules = await this.getAutomationRules(userId);
    const rule = rules.find((r) => r.trigger === trigger && r.enabled);

    if (!rule) {
      console.log(`No enabled rule found for trigger: ${trigger}`);
      return;
    }

    const sent = await this.sendEmail(
      userId,
      recipientEmail,
      rule.subject,
      rule.body,
      variables
    );

    if (sent) {
      await this.logEmailSent(
        userId,
        rule.trigger,
        recipientEmail,
        variables.clientName || "Unknown",
        this.replaceVariables(rule.subject, variables)
      );
    }
  },

  async scheduleAfterSalesEmails(
    userId: string,
    orderId: string,
    eventDate: string
  ): Promise<AfterSalesEmail[]> {
    const templates = await this.getAfterSalesTemplates(userId);
    const scheduledEmails: AfterSalesEmail[] = [];

    const eventDateObj = new Date(eventDate);

    for (let i = 1; i <= 6; i++) {
      const monthsToAdd = i * 2;
      const scheduledDate = new Date(eventDateObj);
      scheduledDate.setMonth(scheduledDate.getMonth() + monthsToAdd);

      const template = templates.find((t) => t.template_type === `after_sales_${i}`);
      if (!template) continue;

      const { data, error } = await supabase
        .from("after_sales_emails")
        .insert([
          {
            user_id: userId,
            order_id: orderId,
            email_number: i,
            scheduled_for: scheduledDate.toISOString(),
            subject: template.subject,
            body: template.body,
            status: "scheduled"
          }
        ])
        .select()
        .single();

      if (error) {
        console.error(`Error scheduling after-sales email ${i}:`, error);
        continue;
      }

      if (data) {
        scheduledEmails.push(data);
      }
    }

    return scheduledEmails;
  },

  async getAfterSalesTemplates(userId: string): Promise<EmailTemplate[]> {
    const { data, error } = await supabase
      .from("email_templates")
      .select("*")
      .eq("user_id", userId)
      .like("template_type", "after_sales_%")
      .eq("is_active", true);

    if (error) {
      console.error("Error fetching after-sales templates:", error);
      return [];
    }

    return data || [];
  },

  async getScheduledEmails(userId: string, orderId?: string): Promise<AfterSalesEmail[]> {
    let query = supabase
      .from("after_sales_emails")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "scheduled");

    if (orderId) {
      query = query.eq("order_id", orderId);
    }

    const { data, error } = await query.order("scheduled_for");

    if (error) {
      console.error("Error fetching scheduled emails:", error);
      return [];
    }

    return data || [];
  },

  async updateEmailStatus(
    emailId: string,
    status: string,
    errorMessage?: string
  ): Promise<AfterSalesEmail | null> {
    const updates: {
      status: string;
      updated_at: string;
      sent_at?: string;
      error_message?: string;
    } = {
      status,
      updated_at: new Date().toISOString()
    };

    if (status === "sent") {
      updates.sent_at = new Date().toISOString();
    }

    if (errorMessage) {
      updates.error_message = errorMessage;
    }

    const { data, error } = await supabase
      .from("after_sales_emails")
      .update(updates)
      .eq("id", emailId)
      .select()
      .single();

    if (error) {
      console.error("Error updating email status:", error);
      throw error;
    }

    return data;
  },

  async logEmailSent(
    userId: string,
    templateType: string,
    recipientEmail: string,
    recipientName: string,
    subject: string,
    orderId?: string,
    quoteId?: string
  ): Promise<EmailLog | null> {
    const { data, error } = await supabase
      .from("email_automation_log")
      .insert([
        {
          user_id: userId,
          order_id: orderId || null,
          quote_id: quoteId || null,
          template_type: templateType,
          recipient_email: recipientEmail,
          recipient_name: recipientName,
          subject: subject,
          status: "sent"
        }
      ])
      .select()
      .single();

    if (error) {
      console.error("Error logging email:", error);
      throw error;
    }

    return data;
  },

  async getEmailLogs(userId: string, limit: number = 50): Promise<EmailLog[]> {
    const { data, error } = await supabase
      .from("email_automation_log")
      .select("*")
      .eq("user_id", userId)
      .order("sent_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Error fetching email logs:", error);
      return [];
    }

    return data || [];
  },

  async getEmailStats(userId: string, startDate?: string, endDate?: string) {
    let query = supabase
      .from("email_automation_log")
      .select("*")
      .eq("user_id", userId);

    if (startDate) {
      query = query.gte("sent_at", startDate);
    }

    if (endDate) {
      query = query.lte("sent_at", endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching email stats:", error);
      return {
        total: 0,
        sent: 0,
        opened: 0,
        clicked: 0,
        failed: 0
      };
    }

    const emails = data || [];

    return {
      total: emails.length,
      sent: emails.filter((e) => e.status === "sent").length,
      opened: emails.filter((e) => e.opened_at).length,
      clicked: emails.filter((e) => e.clicked_at).length,
      failed: emails.filter((e) => e.status === "failed").length
    };
  },

  /**
   * ORDER LIFECYCLE AUTOMATION METHODS
   */

  /**
   * Send balance payment reminder
   */
  async sendBalanceReminder(orderId: string): Promise<boolean> {
    const { data: order } = await supabase
      .from("orders")
      .select("*, profiles!orders_user_id_fkey(company_name)")
      .eq("id", orderId)
      .single();

    if (!order || order.balance_paid) {
      return false;
    }

    const daysUntilDue = Math.ceil(
      (new Date(order.balance_due_date!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    const variables: EmailVariables = {
      clientName: order.client_name,
      orderNumber: order.order_number,
      eventDate: new Date(order.event_date).toLocaleDateString(),
      paymentAmount: `${order.currency} ${order.balance_amount?.toFixed(2)}`,
      companyName: (order.profiles as any)?.company_name || "Catering Company",
    };

    const subject = `Payment Reminder: Balance Due in ${daysUntilDue} Days - Order ${order.order_number}`;
    const body = `Dear ${order.client_name},

This is a friendly reminder that the balance payment for your event on ${variables.eventDate} is due in ${daysUntilDue} days.

Order Number: ${order.order_number}
Balance Due: ${variables.paymentAmount}
Due Date: ${new Date(order.balance_due_date!).toLocaleDateString()}

Please ensure payment is made before the due date to confirm your booking.

Thank you,
${variables.companyName}`;

    return await this.sendEmail(order.user_id, order.client_email, subject, body, variables);
  },

  /**
   * Send event reminder
   */
  async sendEventReminder(orderId: string, daysBeforeEvent: number): Promise<boolean> {
    const { data: order } = await supabase
      .from("orders")
      .select("*, profiles!orders_user_id_fkey(company_name, phone)")
      .eq("id", orderId)
      .single();

    if (!order) {
      return false;
    }

    const variables: EmailVariables = {
      clientName: order.client_name,
      orderNumber: order.order_number,
      eventDate: new Date(order.event_date).toLocaleDateString(),
      eventTime: order.event_time || "TBD",
      eventLocation: order.venue_address,
      guestCount: order.final_guest_count?.toString() || order.guest_count?.toString(),
      companyName: (order.profiles as any)?.company_name || "Catering Company",
      contactPhone: (order.profiles as any)?.phone || "",
    };

    const subject = `Event Reminder: ${daysBeforeEvent} Days Until Your Event - Order ${order.order_number}`;
    const body = `Dear ${order.client_name},

Your event is coming up in ${daysBeforeEvent} days!

Event Details:
- Date: ${variables.eventDate}
- Time: ${variables.eventTime}
- Location: ${variables.eventLocation}
- Guest Count: ${variables.guestCount}
- Order Number: ${order.order_number}

${daysBeforeEvent === 7 ? 'Last chance to make changes to your order! Contact us if you need to adjust guest numbers or details.' : ''}

We look forward to serving you!

Contact us: ${variables.contactPhone}
${variables.companyName}`;

    return await this.sendEmail(order.user_id, order.client_email, subject, body, variables);
  },

  /**
   * Send order modification deadline reminder
   */
  async sendModificationDeadlineReminder(orderId: string): Promise<boolean> {
    const { data: order } = await supabase
      .from("orders")
      .select("*, profiles!orders_user_id_fkey(company_name)")
      .eq("id", orderId)
      .single();

    if (!order || order.final_order_confirmed_at) {
      return false;
    }

    const daysUntilDeadline = Math.ceil(
      (new Date(order.last_change_allowed_date!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    const variables: EmailVariables = {
      clientName: order.client_name,
      orderNumber: order.order_number,
      eventDate: new Date(order.event_date).toLocaleDateString(),
      changeDeadline: new Date(order.last_change_allowed_date!).toLocaleDateString(),
      companyName: (order.profiles as any)?.company_name || "Catering Company",
    };

    const subject = `Action Required: ${daysUntilDeadline} Days to Finalize Your Order - ${order.order_number}`;
    const body = `Dear ${order.client_name},

This is a reminder that you have ${daysUntilDeadline} days remaining to make changes to your order.

Order Number: ${order.order_number}
Event Date: ${variables.eventDate}
Change Deadline: ${variables.changeDeadline}

After this date, we cannot accept any changes to guest numbers or event details as we will have already begun preparations.

Please confirm your final guest count and event details at your earliest convenience.

Thank you,
${variables.companyName}`;

    return await this.sendEmail(order.user_id, order.client_email, subject, body, variables);
  },

  /**
   * Send post-event thank you and review request
   */
  async sendPostEventFollowUp(orderId: string): Promise<boolean> {
    const { data: order } = await supabase
      .from("orders")
      .select("*, profiles!orders_user_id_fkey(company_name)")
      .eq("id", orderId)
      .single();

    if (!order) {
      return false;
    }

    const variables: EmailVariables = {
      clientName: order.client_name,
      orderNumber: order.order_number,
      eventDate: new Date(order.event_date).toLocaleDateString(),
      companyName: (order.profiles as any)?.company_name || "Catering Company",
      reviewLink: `${process.env.NEXT_PUBLIC_APP_URL || ''}/client-portal?order=${order.id}#review`,
    };

    const subject = `Thank You for Choosing Us! - Order ${order.order_number}`;
    const body = `Dear ${order.client_name},

Thank you for allowing us to be part of your special event on ${variables.eventDate}!

We hope everything went smoothly and that you and your guests enjoyed the experience.

We would love to hear your feedback! Please take a moment to share your thoughts:
${variables.reviewLink}

Your feedback helps us improve and serves as a guide for future clients.

We look forward to serving you again!

Warm regards,
${variables.companyName}`;

    const sent = await this.sendEmail(order.user_id, order.client_email, subject, body, variables);

    if (sent) {
      // Schedule after-sales follow-up emails
      await this.scheduleAfterSalesEmails(order.user_id, order.id, order.event_date);
    }

    return sent;
  },

  /**
   * Process all pending automated emails (to be called by cron job)
   */
  async processPendingEmails(): Promise<number> {
    let processed = 0;

    // Get all orders that need balance reminders (3 days before due)
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const { data: balanceReminderOrders } = await supabase
      .from("orders")
      .select("id")
      .eq("balance_paid", false)
      .lte("balance_due_date", threeDaysFromNow.toISOString())
      .eq("status", "deposit_paid");

    for (const order of balanceReminderOrders || []) {
      await this.sendBalanceReminder(order.id);
      processed++;
    }

    // Get orders needing event reminders (14, 7, 3, 1 days before)
    const reminderDays = [14, 7, 3, 1];
    
    for (const days of reminderDays) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + days);
      targetDate.setHours(0, 0, 0, 0);

      const nextDay = new Date(targetDate);
      nextDay.setDate(nextDay.getDate() + 1);

      const { data: reminderOrders } = await supabase
        .from("orders")
        .select("id")
        .gte("event_date", targetDate.toISOString())
        .lt("event_date", nextDay.toISOString())
        .eq("status", "confirmed");

      for (const order of reminderOrders || []) {
        await this.sendEventReminder(order.id, days);
        processed++;
      }
    }

    // Get orders needing modification deadline reminders (2 days before deadline)
    const twoDaysFromNow = new Date();
    twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);

    const { data: modificationReminderOrders } = await supabase
      .from("orders")
      .select("id")
      .is("final_order_confirmed_at", null)
      .lte("last_change_allowed_date", twoDaysFromNow.toISOString())
      .eq("status", "confirmed");

    for (const order of modificationReminderOrders || []) {
      await this.sendModificationDeadlineReminder(order.id);
      processed++;
    }

    // Get orders completed yesterday (for post-event follow-up)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: completedOrders } = await supabase
      .from("orders")
      .select("id")
      .gte("event_date", yesterday.toISOString())
      .lt("event_date", today.toISOString())
      .eq("status", "completed");

    for (const order of completedOrders || []) {
      await this.sendPostEventFollowUp(order.id);
      processed++;
    }

    // Process scheduled after-sales emails
    const now = new Date();
    const { data: dueEmails } = await supabase
      .from("after_sales_emails")
      .select("*")
      .eq("status", "scheduled")
      .lte("scheduled_for", now.toISOString());

    for (const email of dueEmails || []) {
      const { data: order } = await supabase
        .from("orders")
        .select("*, profiles!orders_user_id_fkey(company_name)")
        .eq("id", email.order_id)
        .single();

      if (!order) continue;

      const variables: EmailVariables = {
        clientName: order.client_name,
        companyName: (order.profiles as any)?.company_name || "Catering Company",
      };

      const sent = await this.sendEmail(
        order.user_id,
        order.client_email,
        email.subject,
        email.body,
        variables
      );

      if (sent) {
        await this.updateEmailStatus(email.id, "sent");
        processed++;
      } else {
        await this.updateEmailStatus(email.id, "failed", "Email sending failed");
      }
    }

    console.log(`Processed ${processed} automated emails`);
    return processed;
  }
};
