
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type AfterSalesEmail = Database["public"]["Tables"]["after_sales_emails"]["Row"];
type EmailTemplate = Database["public"]["Tables"]["email_templates"]["Row"];
type EmailLog = Database["public"]["Tables"]["email_automation_log"]["Row"];

export const emailAutomationService = {
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
