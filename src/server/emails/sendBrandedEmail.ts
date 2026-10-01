/** Branded templates use the same custom/shared sender routing as all tenant mail. */
import { render } from "@react-email/render";
import * as React from "react";
import { getServiceSupabase } from "@/lib/supabase/service";
import { emailService } from "@/services/emailService";
import { appendPlatformLegalFooter } from "@/services/email/legalEmailFooter";

export interface SendBrandedEmailArgs {
  /** React Email component to render. */
  component: React.ReactElement;
  /** Recipient email address (one at a time - we don't batch here). */
  to: string;
  subject: string;
  /**
   * Tenant scope for the send. Used to look up tenant email_settings,
   * for logging, and to resolve the from-address. Omit for platform-
   * level sends (signup welcome - the company exists but the email
   * provider almost certainly isn't configured yet).
   */
  companyId?: string;
  /** Override the from-name. Defaults to the tenant's email_settings.from_name. */
  fromName?: string;
  /** Override the from-address. Defaults to the tenant's email_settings.from_email. */
  fromEmail?: string;
  /** What kind of email this is, for the email_automation_log row. */
  templateType: string;
  recipientName?: string;
  /**
   * Who the mandatory legal footer speaks for. Defaults to "tenant" when a
   * companyId is present (caterer -> staff/client mail carries that
   * caterer's confidentiality notice + terms link) and "platform"
   * otherwise. Platform-level sends with a companyId (owner welcome) must
   * set this explicitly so the caterer isn't linked to their own T&Cs.
   */
  legalAudience?: "tenant" | "platform";
}

interface SendResult {
  ok: boolean;
  provider: "tenant-routing" | "resend-platform";
  error?: string;
}

export async function sendBrandedEmail(args: SendBrandedEmailArgs): Promise<SendResult> {
  const html = await render(args.component);
  if (args.companyId) {
    const result = await emailService.sendEmailDetailed({
      companyId: args.companyId, to: args.to, subject: args.subject, body: html,
      template: args.templateType, variables: { clientName: args.recipientName || "" },
      bypassQuarantine: true, allowPlatformFallback: true, skipBrandedShell: true,
      legalAudience: args.legalAudience, _client: getServiceSupabase(),
    });
    return { ok: result.success, provider: "tenant-routing", error: result.error };
  }
  // Platform messages have no tenant domain to resolve and always use shared mail.
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, provider: "resend-platform", error: "Email provider is not configured" };
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${args.fromName || process.env.PLATFORM_BRAND_NAME || "CateringMS"} <${process.env.PLATFORM_FROM_EMAIL || "noreply@send.cateringms.com"}>`,
        to: args.to, subject: args.subject, html: appendPlatformLegalFooter(html),
        text: await render(args.component, { plainText: true }),
      }),
    });
    return { ok: response.ok, provider: "resend-platform", ...(response.ok ? {} : { error: `Email provider rejected the send (${response.status})` }) };
  } catch {
    return { ok: false, provider: "resend-platform", error: "Could not reach email provider" };
  }
}
