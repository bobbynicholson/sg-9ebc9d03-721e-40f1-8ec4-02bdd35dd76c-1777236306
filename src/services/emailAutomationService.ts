import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

// Directly use the generated Supabase types to prevent deep instantiation errors
type EmailLog = Database["public"]["Tables"]["email_automation_log"]["Row"];
type EmailSettings = Database["public"]["Tables"]["email_settings"]["Row"];

interface SendEmailPayload {
  companyId: string;
  to: string;
  subject: string;
  template?: string; // slug of the email template
  body?: string; // if no template is used
  variables?: Record<string, any>; // Simplified to prevent deep type instantiation
}

export const emailAutomationService = {
  
  async getEmailConfig(companyId: string): Promise<EmailSettings | null> {
    const { data, error } = await supabase
      .from("email_settings")
      .select("*")
      .eq("user_id", companyId)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching email config:", error);
      return null;
    }
    
    // Safely parse smtp_port to a number if it's a string
    if (data && typeof data.smtp_port === 'string') {
        const port = parseInt(data.smtp_port, 10);
        (data as any).smtp_port = isNaN(port) ? null : port;
    }

    return data as EmailSettings | null;
  },

  replaceVariables(template: string, variables: Record<string, any> = {}): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      if (value !== undefined && value !== null) {
        result = result.replace(new RegExp(`{${key}}`, "g"), String(value));
      }
    }
    result = result.replace(/{[^}]+}/g, "");
    return result;
  },

  async sendEmail(payload: SendEmailPayload): Promise<boolean> {
    const config = await this.getEmailConfig(payload.companyId);

    if (!config || !config.enabled) {
      console.warn(`Email automation is disabled or not configured for company ${payload.companyId}`);
      // For signups, we might want a fallback system email, but for now, we'll just log.
      return false;
    }

    let finalBody = payload.body || "";

    if (payload.template) {
        const { data: templateData, error: templateError } = await supabase
            .from("email_templates")
            .select("body")
            .eq("user_id", payload.companyId) // Corrected from company_id
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
    // Here we simulate the send and log it.
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
      payload.subject
    );

    return true;
  },

  async sendCompanyWelcomeEmail(
    recipientEmail: string,
    companyName: string,
    companyId: string,
    companySlug: string,
    adminName: string
  ): Promise<boolean> {
    const loginUrl = `${typeof window !== "undefined" ? window.location.origin : "https://cateringms.com"}/${companySlug}/auth/login`;
    
    // This welcome email should probably be sent from a system-level email, not the company's own config yet.
    // For now, we'll try to use the company's own config but a fallback would be needed.
    return this.sendEmail({
      companyId: companyId,
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
