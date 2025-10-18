import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { EmailVariables } from "@/types";

type AfterSalesEmail = Database["public"]["Tables"]["after_sales_emails"]["Row"];
type EmailTemplate = Database["public"]["Tables"]["email_templates"]["Row"];
type EmailLog = Database["public"]["Tables"]["email_automation_log"]["Row"];
type EmailSettings = Database["public"]["Tables"]["email_settings"]["Row"];
type AutomationRulesRow = Database["public"]["Tables"]["automation_rules"]["Row"];

interface SendEmailPayload {
  companyId: string;
  to: string;
  subject: string;
  template?: string; // slug of the email template
  body?: string; // if no template is used
  variables?: EmailVariables;
}

export const emailAutomationService = {
  
  async getEmailConfig(companyId: string): Promise<EmailSettings | null> {
    const { data, error } = await supabase
      .from("email_settings")
      .select("*")
      .eq("company_id", companyId)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching email config:", error);
      return null;
    }

    return data;
  },

  replaceVariables(template: string, variables: EmailVariables = {}): string {
    let result = template;
    Object.entries(variables).forEach(([key, value]) => {
      const placeholder = `{${key}}`;
      result = result.replace(new RegExp(placeholder, "g"), value || "");
    });
    return result;
  },

  async sendEmail(payload: SendEmailPayload): Promise<boolean> {
    const config = await this.getEmailConfig(payload.companyId);

    if (!config || !config.enabled) {
      console.warn(`Email automation is disabled for company ${payload.companyId}`);
      return false;
    }

    let finalBody = payload.body || "";

    if (payload.template) {
        const { data: templateData, error: templateError } = await supabase
            .from("email_templates")
            .select("body")
            .eq("company_id", payload.companyId)
            .eq("slug", payload.template)
            .single();
        
        if (templateError || !templateData) {
            console.error(`Email template "${payload.template}" not found for company ${payload.companyId}`);
            return false;
        }
        finalBody = templateData.body;
    }
    
    const finalSubject = this.replaceVariables(payload.subject, payload.variables);
    finalBody = this.replaceVariables(finalBody, payload.variables);

    // In a real scenario, you'd use a service like Nodemailer with the SMTP settings
    console.log("----- SIMULATING EMAIL SEND -----");
    console.log(`From: "${config.from_name}" <${config.from_email}>`);
    console.log(`To: ${payload.to}`);
    console.log(`Subject: ${finalSubject}`);
    console.log(`Body: ${finalBody.substring(0, 100)}...`);
    console.log(`Provider: ${config.provider}`);
    console.log("---------------------------------");
    
    // Log the email being sent
    await this.logEmailSent(
      payload.companyId,
      payload.template || 'custom',
      payload.to,
      payload.variables?.clientName || "N/A",
      finalSubject
    );

    return true;
  },

  /**
   * Send company welcome email after signup
   */
  async sendCompanyWelcomeEmail(
    recipientEmail: string,
    companyName: string,
    companyId: string,
    companySlug: string,
    adminName: string
  ): Promise<boolean> {
    const loginUrl = `${typeof window !== "undefined" ? window.location.origin : "https://cateringms.com"}/${companySlug}/auth/login`;
    
    return this.sendEmail({
      companyId: companyId, // The new company uses its own (future) settings, but for now we might use a system email.
      to: recipientEmail,
      subject: `Welcome to CateringMS, ${companyName}! 🎉`,
      template: 'company-welcome', // Assuming a template with this slug exists
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
          user_id: companyId, // FIX: Use user_id as it is the company owner
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
  
  // Other methods from the original file can be added here as needed...
};
