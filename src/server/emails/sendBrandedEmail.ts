/**
 * Central server-side function for sending branded React-Email templates.
 *
 * Resolves which provider to use in this order:
 *   1. The tenant's email_settings row -- if a company has configured
 *      Resend or SMTP for itself, we honour that so client-facing emails
 *      come from their domain.
 *   2. The platform's RESEND_API_KEY env var -- used for platform-level
 *      sends (signup welcome, super-admin alerts) and as the fallback
 *      when a tenant hasn't set up their own provider yet so onboarding
 *      doesn't block on email config.
 *   3. Console-only simulation -- so local dev doesn't need any creds.
 *
 * This is server-only -- it uses @react-email/render (Node-only) and the
 * Supabase service-role client. Don't import from the browser.
 */
import { renderAsync } from "@react-email/render";
import * as React from "react";
import { getServiceSupabase } from "@/lib/supabase/service";

type ServiceRoleClient = ReturnType<typeof getServiceSupabase>;

function tryServiceClient(): ServiceRoleClient | null {
  try {
    return getServiceSupabase();
  } catch {
    return null;
  }
}

export interface SendBrandedEmailArgs {
  /** React Email component to render. */
  component: React.ReactElement;
  /** Recipient email address (one at a time -- we don't batch here). */
  to: string;
  subject: string;
  /**
   * Tenant scope for the send. Used to look up tenant email_settings,
   * for logging, and to resolve the from-address. Omit for platform-
   * level sends (signup welcome -- the company exists but the email
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
}

interface SendResult {
  ok: boolean;
  provider: "resend-tenant" | "resend-platform" | "smtp-tenant" | "simulation";
  error?: string;
}

const PLATFORM_FROM_NAME = "CateringMS";
const PLATFORM_FROM_EMAIL = process.env.PLATFORM_FROM_EMAIL || "noreply@cateringms.co.za";

export async function sendBrandedEmail(args: SendBrandedEmailArgs): Promise<SendResult> {
  const html = await renderAsync(args.component);
  const text = await renderAsync(args.component, { plainText: true });

  // Resolve tenant provider config if we have a companyId.
  let tenantProvider: string | null = null;
  let tenantFromName: string | null = null;
  let tenantFromEmail: string | null = null;
  let tenantSmtp: { host: string; port: number; user: string; password: string } | null = null;

  const sb = tryServiceClient();
  if (args.companyId && sb) {
    try {
      const { data } = await sb
        .from("email_settings")
        .select("enabled,provider,from_name,from_email,smtp_host,smtp_port,smtp_user,smtp_password")
        .eq("user_id", args.companyId)
        .maybeSingle();
      if (data?.enabled) {
        tenantProvider = data.provider;
        tenantFromName = data.from_name;
        tenantFromEmail = data.from_email;
        if (data.provider === "smtp" && data.smtp_host) {
          tenantSmtp = {
            host: data.smtp_host,
            port: parseInt(String(data.smtp_port), 10) || 587,
            user: data.smtp_user || "",
            password: data.smtp_password || "",
          };
        }
      }
    } catch (e) {
      console.warn("[sendBrandedEmail] couldn't load tenant email_settings:", e);
    }
  }

  const fromName = args.fromName || tenantFromName || PLATFORM_FROM_NAME;
  const fromEmail = args.fromEmail || tenantFromEmail || PLATFORM_FROM_EMAIL;
  const fromHeader = `${fromName} <${fromEmail}>`;

  // Try tenant's own Resend (so emails come from their verified domain)
  if (tenantProvider === "resend" && process.env.RESEND_API_KEY) {
    const ok = await postToResend({ from: fromHeader, to: args.to, subject: args.subject, html, text });
    await logSent(sb, args, ok);
    return { ok, provider: "resend-tenant" };
  }

  // Tenant SMTP path
  if (tenantProvider === "smtp" && tenantSmtp) {
    const ok = await sendSmtp({ ...tenantSmtp, from: fromHeader, to: args.to, subject: args.subject, html, text });
    await logSent(sb, args, ok);
    return { ok, provider: "smtp-tenant" };
  }

  // Platform fallback: Resend with our own key
  if (process.env.RESEND_API_KEY) {
    const ok = await postToResend({
      from: `${PLATFORM_FROM_NAME} <${PLATFORM_FROM_EMAIL}>`,
      to: args.to,
      subject: args.subject,
      html,
      text,
    });
    await logSent(sb, args, ok);
    return { ok, provider: "resend-platform" };
  }

  // Last resort: simulation log so local dev doesn't break.
  console.log("----- BRANDED EMAIL SIMULATION (no provider configured) -----");
  console.log(`To: ${args.to}`);
  console.log(`Subject: ${args.subject}`);
  console.log(`Plain-text preview: ${text.slice(0, 240)}...`);
  console.log("--------------------------------------------------------------");
  await logSent(sb, args, true);
  return { ok: true, provider: "simulation" };
}

interface ResendPayload {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function postToResend(p: ResendPayload): Promise<boolean> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(p),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      console.error("[sendBrandedEmail] Resend rejected:", res.status, err);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[sendBrandedEmail] Resend fetch failed:", err);
    return false;
  }
}

interface SmtpPayload extends ResendPayload {
  host: string;
  port: number;
  user: string;
  password: string;
}

async function sendSmtp(p: SmtpPayload): Promise<boolean> {
  try {
    // Lazy import nodemailer so the module isn't pulled in for Resend-only paths.
    const { createTransport } = await import("nodemailer");
    const transporter = createTransport({
      host: p.host,
      port: p.port,
      secure: p.port === 465,
      auth: p.user ? { user: p.user, pass: p.password } : undefined,
    });
    await transporter.sendMail({
      from: p.from,
      to: p.to,
      subject: p.subject,
      html: p.html,
      text: p.text,
    });
    return true;
  } catch (err) {
    console.error("[sendBrandedEmail] SMTP send failed:", err);
    return false;
  }
}

async function logSent(
  sb: ServiceRoleClient | null,
  args: SendBrandedEmailArgs,
  ok: boolean,
): Promise<void> {
  if (!sb || !args.companyId) return;
  try {
    await sb.from("email_automation_log").insert([
      {
        user_id: args.companyId,
        template_type: args.templateType,
        recipient_email: args.to,
        recipient_name: args.recipientName || "",
        subject: args.subject,
        status: ok ? "sent" : "failed",
      },
    ]);
  } catch (e) {
    console.warn("[sendBrandedEmail] couldn't write log:", e);
  }
}
