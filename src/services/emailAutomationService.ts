
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

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

interface EmailVariables {
  clientName?: string;
  eventDate?: string;
  quoteNumber?: string;
  currency?: string;
  totalAmount?: string;
  discountedAmount?: string;
  companyName?: string;
  eventType?: string;
  guestCount?: string;
  eventLocation?: string;
  eventTime?: string;
  acceptLink?: string;
  menuDetails?: string;
  changeDeadline?: string;
  contactPhone?: string;
  specialInstructions?: string;
  paymentAmount?: string;
  invoiceNumber?: string;
  paymentDate?: string;
  paymentMethod?: string;
  reviewLink?: string;
}

export const emailAutomationService = {
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
