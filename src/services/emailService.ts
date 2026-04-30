/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";

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
  orderId?: string;
  quoteId?: string;
}

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

export const emailService = {
  /**
   * Fetch the email_settings row for a company.
   *
   * Optional `client` argument lets server-side callers pass a
   * service-role supabase instance. Without it, this method uses the
   * browser/anon client which is gated by RLS to authenticated users
   * of the same company. The magic-link sign-in flow runs BEFORE the
   * user is authenticated, so it must pass a service-role client.
   */
  async getEmailConfig(companyId: string, client?: any): Promise<EmailSettings | null> {
    const sb = client || supabase;
    const { data, error } = await sb
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

  async logEmailSent(
    companyId: string,
    templateType: string,
    recipientEmail: string,
    recipientName: string,
    subject: string,
    orderId?: string,
    quoteId?: string,
    client?: any,
  ): Promise<EmailLog | null> {
    // Mirrors getEmailConfig: server-side callers pass a service-role
    // client so the insert isn't blocked by RLS for unauthenticated
    // flows (magic-link sign-in).
    const sb = client || supabase;
    const { data, error } = await sb
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

  async sendEmail(payload: SendEmailPayload & { _client?: any }): Promise<boolean> {
    // Server-side callers (e.g. unauthenticated magic-link sign-in)
    // pass a service-role client via _client so the email_settings
    // lookup isn't blocked by RLS.
    const config = await this.getEmailConfig(payload.companyId, payload._client);

    if (!config || !config.enabled) {
      console.warn(`Email automation is disabled or not configured for company ${payload.companyId}`);
      return false;
    }

    let finalBody = payload.body || "";

    if (payload.template) {
      const { data: templateData, error: templateError } = await (supabase
        .from("email_templates") as any)
        .select("body")
        .eq("user_id", payload.companyId)
        .eq("slug", payload.template)
        .single();

      if (templateError || !templateData) {
        console.error(`Email template "${payload.template}" not found for company ${payload.companyId}`);
        return false;
      }
      finalBody = templateData.body;
    }

    const finalSubject = this.replaceVariables(payload.subject, payload.variables || {});
    finalBody = this.replaceVariables(finalBody, payload.variables || {});

    try {
      let emailSent = false;

      if (config.provider === 'resend' && process.env.RESEND_API_KEY) {
        emailSent = await this.sendViaResend({
          from: `${config.from_name} <${config.from_email}>`,
          to: payload.to,
          subject: finalSubject,
          html: finalBody,
        });
      } else if (config.provider === 'smtp' && config.smtp_host) {
        emailSent = await this.sendViaSMTP(config, {
          from: `${config.from_name} <${config.from_email}>`,
          to: payload.to,
          subject: finalSubject,
          html: finalBody,
        });
      } else {
        console.log("----- EMAIL SIMULATION (No Provider Configured) -----");
        console.log(`From: "${config.from_name}" <${config.from_email}>`);
        console.log(`To: ${payload.to}`);
        console.log(`Subject: ${finalSubject}`);
        console.log(`Body Preview: ${finalBody.substring(0, 100)}...`);
        console.log(`Provider: ${config.provider || 'none'}`);
        console.log("----------------------------------------------------");
        
        await this.logEmailSent(
          payload.companyId,
          payload.template || 'custom',
          payload.to,
          payload.variables?.clientName || "N/A",
          finalSubject,
          payload.orderId,
          payload.quoteId,
          (payload as any)._client,
        );
        
        return true;
      }

      if (emailSent) {
        await this.logEmailSent(
          payload.companyId,
          payload.template || 'custom',
          payload.to,
          payload.variables?.clientName || "N/A",
          finalSubject,
          payload.orderId,
          payload.quoteId,
          (payload as any)._client,
        );
        return true;
      }

      return false;
    } catch (error) {
      console.error("Error sending email:", error);
      return false;
    }
  },

  async sendViaResend(emailData: {
    from: string;
    to: string;
    subject: string;
    html: string;
  }): Promise<boolean> {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailData),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Resend API error:', error);
        return false;
      }

      console.log('✅ Email sent successfully via Resend');
      return true;
    } catch (error) {
      console.error('Error sending via Resend:', error);
      return false;
    }
  },

  async sendViaSMTP(config: EmailSettings, emailData: {
    from: string;
    to: string;
    subject: string;
    html: string;
  }): Promise<boolean> {
    try {
      if (typeof window !== 'undefined') {
        console.warn("SMTP emails cannot be sent directly from the browser. Simulating success for client-side execution.");
        return true;
      }

      if (!config.smtp_host || !config.smtp_port || !config.smtp_user || !config.smtp_password) {
        console.error('SMTP configuration incomplete');
        return false;
      }

      // Hide require from Webpack to prevent client-side build errors
      // using eval prevents Webpack's static analyzer from seeing the require
      const getRequire = () => eval("require");
      const nodemailer = getRequire()('nodemailer');

      const transporter = nodemailer.createTransport({
        host: config.smtp_host,
        port: config.smtp_port,
        secure: config.smtp_port === 465,
        auth: {
          user: config.smtp_user,
          pass: config.smtp_password,
        },
      });

      await transporter.sendMail(emailData);
      console.log('✅ Email sent successfully via SMTP');
      return true;
    } catch (error) {
      console.error('Error sending via SMTP:', error);
      return false;
    }
  },
};