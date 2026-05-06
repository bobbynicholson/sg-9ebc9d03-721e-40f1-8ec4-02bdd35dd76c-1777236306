/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";

export interface EmailSettings {
  id: string;
  company_id: string;
  enabled: boolean;
  provider: string | null;
  from_name: string | null;
  from_email: string | null;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_password: string | null;
  smtp_secure: boolean | null;
  is_verified?: boolean | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Attachment shape accepted by sendEmail. We normalise to Resend's
 * field names (`filename` + `content`) since Resend is the primary
 * provider; the SMTP path translates to nodemailer's matching shape
 * at send time. `content` accepts a Buffer or a base64 string -- the
 * latter is how we ferry binaries across the JSON API boundary.
 */
export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
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
  /**
   * Set to true for service-critical comms (cancellation, refund-paid,
   * postponement) that must reach the recipient regardless of import
   * quarantine state. blocked_contacts still applies (the operator
   * deliberately silenced them) but comms_paused_until is bypassed.
   */
  bypassQuarantine?: boolean;
  /**
   * Optional file attachments. Used initially for the Quote PDF on
   * quote-send; older clients expect the document inline so they can
   * save / forward without clicking through. Both Resend and
   * nodemailer accept the same shape -- filename + content. content
   * may be a Buffer (preferred) or a base64-encoded string.
   */
  attachments?: EmailAttachment[];
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
   * Fetch the active provider config for a company.
   *
   * Reads from email_provider_settings (the canonical table the
   * /admin/email-settings UI writes to). The legacy email_settings
   * table this method used to read from never had host/user/password
   * columns, so SMTP sends silently failed even when the operator had
   * "saved" their config -- two tables, never reconciled.
   *
   * A company can have multiple rows (one per provider, plus mailchimp
   * which is marketing-only). We exclude mailchimp and take the most
   * recently updated row, preferring is_verified=true so a freshly-
   * tested config wins over an older one that hasn't been re-verified.
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
      .from("email_provider_settings")
      .select("id, company_id, provider, from_email, from_name, smtp_host, smtp_port, smtp_user, smtp_pass_encrypted, smtp_secure, is_verified, created_at, updated_at")
      .eq("company_id", companyId)
      .neq("provider", "mailchimp")
      .order("is_verified", { ascending: false })
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching email config:", error);
      return null;
    }

    if (!data) {
      return null;
    }

    const port = (data as any).smtp_port ? parseInt(String((data as any).smtp_port), 10) : null;
    return {
      id: (data as any).id,
      company_id: (data as any).company_id,
      // Treat presence of a provider row as "enabled". The column
      // doesn't exist on email_provider_settings -- enabling/disabling
      // is implicit (no row = no provider).
      enabled: !!(data as any).provider && (data as any).provider !== "none",
      provider: (data as any).provider,
      from_name: (data as any).from_name,
      from_email: (data as any).from_email,
      smtp_host: (data as any).smtp_host,
      smtp_port: port && !isNaN(port) ? port : null,
      smtp_user: (data as any).smtp_user,
      // Column is NAMED "encrypted" but the UI stores raw text -- legacy
      // misnomer. Read as-is. If we ever wire pgcrypto, the decrypt
      // happens at the SQL layer and this stays a plain text string.
      smtp_password: (data as any).smtp_pass_encrypted || null,
      smtp_secure: (data as any).smtp_secure,
      is_verified: (data as any).is_verified,
      created_at: (data as any).created_at,
      updated_at: (data as any).updated_at,
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
    statusOverride?: "sent" | "failed" | "simulated" | "blocked" | "quarantined",
    failureReason?: string,
  ): Promise<EmailLog | null> {
    // Mirrors getEmailConfig: server-side callers pass a service-role
    // client so the insert isn't blocked by RLS for unauthenticated
    // flows (magic-link sign-in).
    //
    // statusOverride lets callers record failures and gated sends
    // (blocked / quarantined) on the same audit trail. The
    // /admin/email-automation-dashboard reads from this table to
    // surface failures for retry. Closes the audit-flagged "every
    // send is fire-and-forget" gap.
    const sb = client || supabase;
    const { data, error } = await sb
      .from("email_automation_log")
      .insert([
        {
          user_id: companyId,
          order_id: orderId || null,
          template_type: templateType,
          recipient_email: recipientEmail,
          recipient_name: recipientName,
          subject: subject,
          status: statusOverride || "sent",
          error_message: failureReason || null,
        }
      ])
      .select()
      .single();

    if (error) {
      console.error("Error logging email:", error);
      // Don't throw -- a logging failure must never crash the actual
      // send. The console.error gives ops a paper trail.
      return null;
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

    // Negative gates -- these run for every send path, including
    // webhooks and the after-sales worker, not just /api/send-email.
    // Centralising here means a recipient can never sneak a message
    // through by going around the API route.
    //   (1) blocked_contacts: deleted with "block" toggle on
    //   (2) comms_paused_until on leads/clients: still in import
    //       quarantine, owner hasn't reviewed the batch yet.
    const sb = payload._client || supabase;
    const recipientLower = String(payload.to || "").toLowerCase().trim();
    if (recipientLower) {
      try {
        const { data: blocks } = await sb
          .from("blocked_contacts")
          .select("email_lower")
          .eq("company_id", payload.companyId)
          .eq("email_lower", recipientLower)
          .limit(1);
        if (blocks && blocks.length > 0) {
          console.warn(`[emailService] refused -- ${recipientLower} is on the block list for ${payload.companyId}`);
          // Log the refusal so admin sees "blocked" in the failures
          // dashboard rather than wondering where the email went.
          await this.logEmailSent(
            payload.companyId,
            payload.template || "custom",
            payload.to,
            payload.variables?.clientName || "N/A",
            payload.subject,
            payload.orderId,
            payload.quoteId,
            (payload as any)._client,
            "blocked",
            "Recipient is on the company block list",
          );
          return false;
        }

        // Critical-comm carve-out: cancellation, refund-paid and
        // postponement emails must reach the client even if their
        // record is in import quarantine. blocked_contacts above still
        // applies (deliberate block stays a block).
        const { data: paused } = payload.bypassQuarantine
          ? { data: false }
          : await sb.rpc("is_comms_paused_for_email", {
              p_company_id: payload.companyId,
              p_email: recipientLower,
            });
        if (paused === true) {
          console.warn(`[emailService] refused -- ${recipientLower} is in import quarantine for ${payload.companyId}`);
          await this.logEmailSent(
            payload.companyId,
            payload.template || "custom",
            payload.to,
            payload.variables?.clientName || "N/A",
            payload.subject,
            payload.orderId,
            payload.quoteId,
            (payload as any)._client,
            "quarantined",
            "Recipient is in import quarantine",
          );
          return false;
        }
      } catch (guardErr) {
        // Don't let a guard failure silently allow sends. Log loudly
        // but proceed -- worst case we send through, vs the worse
        // case of failing closed and breaking every email when the
        // RPC is briefly unavailable.
        console.warn("[emailService] guard check failed, proceeding:", guardErr);
      }
    }

    let finalBody = payload.body || "";

    if (payload.template) {
      // Phase 4: schema uses (template_type, company_id) -- the older
      // (slug, user_id) pair never existed. Every client-facing path
      // now goes through resolveEmailTemplate so this branch is dead
      // weight, but fixing the columns means it'll work if anything
      // ever calls sendEmail with a template name directly.
      const { data: templateData, error: templateError } = await (supabase
        .from("email_templates") as any)
        .select("body, body_html, body_text")
        .eq("company_id", payload.companyId)
        .eq("template_type", payload.template)
        .maybeSingle();

      if (templateError || !templateData) {
        console.error(`Email template "${payload.template}" not found for company ${payload.companyId}`);
        return false;
      }
      finalBody = templateData.body_html || templateData.body || templateData.body_text || "";
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
          attachments: payload.attachments,
        });
      } else if (config.provider === 'smtp' && config.smtp_host) {
        emailSent = await this.sendViaSMTP(config, {
          from: `${config.from_name} <${config.from_email}>`,
          to: payload.to,
          subject: finalSubject,
          html: finalBody,
          attachments: payload.attachments,
        });
      } else {
        // No provider configured -- this is a real failure, not a
        // success. Returning true here previously marked the row
        // status='sent' in email_automation_log, so operator dashboards
        // showed deliveries that never happened. Clients only noticed
        // when they said "I never got the quote". Now we log the
        // attempt as failed with a clear reason and return false so
        // upstream callers can react. EmailProviderBanner surfaces the
        // missing-provider state on the admin dashboard so this isn't
        // discovered the hard way.
        console.warn("[emailService] refused -- no email provider configured");
        console.warn(`  Tenant: ${payload.companyId}`);
        console.warn(`  Would-be recipient: ${payload.to}`);
        console.warn(`  Subject: ${finalSubject}`);

        await this.logEmailSent(
          payload.companyId,
          payload.template || 'custom',
          payload.to,
          payload.variables?.clientName || "N/A",
          finalSubject,
          payload.orderId,
          payload.quoteId,
          (payload as any)._client,
          "failed",
          "No email provider configured",
        );

        return false;
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
          "sent",
        );
        return true;
      }

      // Provider returned !ok. Log the failure so admin sees it in
      // the dashboard.
      await this.logEmailSent(
        payload.companyId,
        payload.template || 'custom',
        payload.to,
        payload.variables?.clientName || "N/A",
        finalSubject,
        payload.orderId,
        payload.quoteId,
        (payload as any)._client,
        "failed",
        `Provider ${config.provider || "?"} returned not-ok`,
      );
      return false;
    } catch (error: any) {
      console.error("Error sending email:", error);
      // Crash path -- still log so ops can find it.
      try {
        await this.logEmailSent(
          payload.companyId,
          payload.template || 'custom',
          payload.to,
          payload.variables?.clientName || "N/A",
          finalSubject,
          payload.orderId,
          payload.quoteId,
          (payload as any)._client,
          "failed",
          String(error?.message || error || "Unknown crash"),
        );
      } catch { /* logging the failure itself failed -- nothing to do */ }
      return false;
    }
  },

  async sendViaResend(emailData: {
    from: string;
    to: string;
    subject: string;
    html: string;
    attachments?: EmailAttachment[];
  }): Promise<boolean> {
    try {
      // Resend wants attachments as { filename, content } where content
      // is base64 OR a Buffer. JSON-over-HTTP can't carry a raw Buffer,
      // so any Buffer we got handed gets converted to base64 here.
      const resendBody: any = {
        from: emailData.from,
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html,
      };
      if (Array.isArray(emailData.attachments) && emailData.attachments.length > 0) {
        resendBody.attachments = emailData.attachments.map((a) => ({
          filename: a.filename,
          content: Buffer.isBuffer(a.content)
            ? a.content.toString("base64")
            : String(a.content),
          ...(a.contentType ? { content_type: a.contentType } : {}),
        }));
      }

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(resendBody),
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
    attachments?: EmailAttachment[];
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

      // Prefer the explicit smtp_secure flag from email_provider_settings.
      // Fall back to "port 465 means SSL" so legacy configs still work.
      const useTLS =
        typeof config.smtp_secure === "boolean"
          ? config.smtp_secure
          : config.smtp_port === 465;

      const transporter = nodemailer.createTransport({
        host: config.smtp_host,
        port: config.smtp_port,
        secure: useTLS,
        auth: {
          user: config.smtp_user,
          pass: config.smtp_password,
        },
      });

      // nodemailer attachments share Resend's `filename` + `content`
      // shape -- content can be Buffer or base64 string. We pass
      // through unchanged. Don't include `attachments` on the payload
      // when empty so we don't surprise legacy SMTP servers with an
      // empty multipart boundary.
      const sendPayload: any = {
        from: emailData.from,
        to: emailData.to,
        subject: emailData.subject,
        html: emailData.html,
      };
      if (Array.isArray(emailData.attachments) && emailData.attachments.length > 0) {
        sendPayload.attachments = emailData.attachments.map((a) => ({
          filename: a.filename,
          content: a.content,
          ...(a.contentType ? { contentType: a.contentType } : {}),
          ...(typeof a.content === "string" ? { encoding: "base64" } : {}),
        }));
      }

      await transporter.sendMail(sendPayload);
      console.log('✅ Email sent successfully via SMTP');
      return true;
    } catch (error) {
      console.error('Error sending via SMTP:', error);
      return false;
    }
  },
};