import { supabase } from "@/integrations/supabase/client";
import { emailAutomationService } from "./emailAutomationService";

export interface EmailSettings {
  id: string;
  user_id: string;
  enabled: boolean;
  provider: string | null;
  from_name: string | null;
  from_email: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_password: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SendEmailPayload {
  companyId: string;
  to: string;
  subject: string;
  template?: string;
  body?: string;
  variables?: Record<string, any>;
}

export const emailService = {
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

    if (!data) {
      return null;
    }

    const port = data.smtp_port ? parseInt(String(data.smtp_port), 10) : null;
    return {
      ...data,
      smtp_port: port && !isNaN(port) ? port : null,
    };
  },

  replaceVariables(template: string, variables: Record<string, any> = {}): string {
    let result = template;
    if (variables) {
      for (const [key, value] of Object.entries(variables)) {
        if (value !== undefined && value !== null) {
          result = result.replace(new RegExp(`{${key}}`, "g"), String(value));
        }
      }
    }
    result = result.replace(/{[^}]+}/g, "");
    return result;
  },

  async sendEmail(payload: SendEmailPayload): Promise<boolean> {
    const config = await this.getEmailConfig(payload.companyId);

    if (!config || !config.enabled) {
      console.warn(`Email automation is disabled or not configured for company ${payload.companyId}`);
      return false;
    }

    let finalBody = payload.body || "";

    if (payload.template) {
      const { data: templateData, error: templateError } = await supabase
        .from("email_templates")
        .select("body")
        .eq("user_id", payload.companyId)
        .eq("slug", payload.template)
        .single<{ body: string }>();

      if (templateError || !templateData) {
        console.error(`Email template "${payload.template}" not found for company ${payload.companyId}`);
        return false;
      }
      finalBody = templateData.body;
    }

    const finalSubject = this.replaceVariables(payload.subject, payload.variables || {});
    finalBody = this.replaceVariables(finalBody, payload.variables || {});

    console.log("----- SIMULATING EMAIL SEND -----");
    console.log(`From: "${config.from_name}" <${config.from_email}>`);
    console.log(`To: ${payload.to}`);
    console.log(`Subject: ${finalSubject}`);
    console.log(`Body: ${finalBody.substring(0, 100)}...`);
    console.log(`Provider: ${config.provider}`);
    console.log("---------------------------------");
    
    await emailAutomationService.logEmailSent(
      payload.companyId,
      payload.template || 'custom',
      payload.to,
      payload.variables?.clientName || "N/A",
      payload.subject
    );

    return true;
  },
};