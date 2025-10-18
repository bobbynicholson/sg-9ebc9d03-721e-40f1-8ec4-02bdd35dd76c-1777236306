import { supabase } from "@/integrations/supabase/client";
import { emailService } from "./emailService";

export interface EmailLog {
  id: string;
  user_id: string;
  order_id?: string | null;
  quote_id?: string | null;
  template_type: string;
  recipient_email: string;
  recipient_name: string;
  subject: string;
  status: string;
  created_at?: string;
}

export const emailAutomationService = {
  async sendCompanyWelcomeEmail(
    recipientEmail: string,
    companyName: string,
    companyId: string,
    companySlug: string,
    adminName: string
  ): Promise<boolean> {
    const loginUrl = `${typeof window !== "undefined" ? window.location.origin : "https://cateringms.com"}/${companySlug}/auth/login`;
    
    return emailService.sendEmail({
      companyId: companyId,
      to: recipientEmail,
      subject: `Welcome to CateringMS, ${companyName}! 🎉`,
      template: 'company-welcome',
      variables: {
        adminName: adminName,
        companyName: companyName,
        companySlug: companySlug,
        loginUrl: loginUrl,
      },
    });
  },

  async logEmailSent(
    companyId: string,
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
          user_id: companyId,
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
};