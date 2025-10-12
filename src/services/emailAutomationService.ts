import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AfterSalesEmail = Database["public"]["Tables"]["after_sales_emails"]["Row"];
type EmailTemplate = Database["public"]["Tables"]["email_templates"]["Row"];
type EmailLog = Database["public"]["Tables"]["email_automation_log"]["Row"];

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

    return data as EmailConfig;
  },

  async saveEmailConfig(userId: string, config: EmailConfig): Promise<void> {
    localStorage.setItem("emailConfig", JSON.stringify(config));

    const { error } = await supabase
      .from("email_settings")
      .upsert([
        {
          user_id: userId,
          ...config,
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

    return data as AutomationRule[];
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
    const updates: Partial<AfterSalesEmail> = {
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
          order_id: orderId,
          quote_id: quoteId,
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
  }
};
