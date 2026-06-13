/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import { buildUnsubscribeUrl } from "@/lib/emailUnsubscribe";
import { normalizeEmailVariables } from "@/lib/emailVariables";

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
  // Per-tenant Resend domain verification fields. When the tenant has
  // verified their own domain, sends come from `you@yourdomain.com`.
  // Otherwise we fall back to the shared CateringMS sender.
  resend_domain_id?: string | null;
  resend_sending_domain?: string | null;
  resend_domain_status?: string | null;
  resend_domain_verified_at?: string | null;
  resend_dns_records?: any;
  /**
   * LCF-N override (task #236): when true the resolver routes mail
   * through the platform-shared noreply@send.cateringms.com even if
   * the tenant Resend domain is verified. DNS work is preserved so
   * flipping back is a single toggle. Use during onboarding to test
   * the platform-default path while keeping the tenant's DNS in place,
   * or as a soft rollback if a verified domain develops a deliverability
   * issue.
   */
  force_platform_sender?: boolean | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Shared CateringMS transactional sender. Used as the Tier-1 fallback
 * for tenants who haven't verified their own domain yet (or while
 * their DNS is propagating). Skylight verifies send.cateringms.com
 * once at the platform level inside Resend.
 */
export const SHARED_FROM_EMAIL = "noreply@send.cateringms.com";

/**
 * Attachment shape accepted by sendEmail. We normalise to Resend's
 * field names (`filename` + `content`) since Resend is the primary
 * provider; the SMTP path translates to nodemailer's matching shape
 * at send time. `content` accepts a Buffer or a base64 string - the
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
   * For system-critical onboarding mail (staff invite, magic-link
   * sign-in) only. When the tenant has NOT configured an email provider
   * yet - true for every brand-new company - fall back to the platform
   * shared Resend sender (noreply@send.cateringms.com) instead of
   * failing with no_provider, so the very first invite / sign-in link
   * can still go out. Does NOT change behaviour for normal tenant mail
   * (quotes, invoices, automations), which still requires the tenant to
   * opt into a sender. No-op if RESEND_API_KEY isn't set platform-side.
   */
  allowPlatformFallback?: boolean;
  /**
   * Optional file attachments. Used initially for the Quote PDF on
   * quote-send; older clients expect the document inline so they can
   * save / forward without clicking through. Both Resend and
   * nodemailer accept the same shape - filename + content. content
   * may be a Buffer (preferred) or a base64-encoded string.
   */
  attachments?: EmailAttachment[];
  /**
   * Suppress the auto-appended unsubscribe footer for this single
   * send. Reserved for sender-verification / domain-test pings where
   * the recipient is the operator themselves and a footer would be
   * noise. Do NOT use for normal client comms - opt-out compliance
   * needs every commercial send to carry the link.
   */
  skipUnsubscribeFooter?: boolean;
  /**
   * Skip the branded email shell wrapper (TIGHTEN I.124). Reserved for
   * callers that build their own fully-shelled HTML document (e.g. the
   * companyWelcome path in /api/send-email which has a self-contained
   * layout) or for the sender-verification pings that don't want any
   * decoration. Normal client sends should leave this off so they pick
   * up the brand colours / logo / contact footer automatically.
   */
  skipBrandedShell?: boolean;
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

/**
 * Structured failure shape returned by sendEmailDetailed. Adds a
 * machine-readable error_code (so the UI can map to the right "Fix this"
 * link) plus a human-friendly message and an optional fix_link.
 *
 * sendEmail (legacy) keeps returning a plain boolean so existing
 * fire-and-forget callers stay untouched. sendEmailDetailed is the new
 * verb for callers that want the diagnosis.
 */
export type EmailErrorCode =
  | "no_provider"
  | "domain_unverified"
  | "from_email_domain_mismatch"
  | "resend_auth"
  | "resend_other"
  | "smtp_connection"
  | "smtp_auth"
  | "smtp_other"
  | "blocked_recipient"
  | "quarantined_recipient"
  | "missing_fields"
  | "unknown";

/**
 * Resolve the public base URL for unsubscribe links. Prefers
 * NEXT_PUBLIC_APP_URL (set in Vercel for prod / preview) then
 * NEXT_PUBLIC_SITE_URL, falling back to https://app.cateringms.com.
 * The fallback exists so dev sends still mint plausible links
 * without crashing the email path.
 */
function resolveBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://app.cateringms.com"
  );
}

/**
 * Append the standard unsubscribe footer to the outgoing HTML body.
 * If the body looks like HTML (contains </body>) we slot the footer
 * inside that tag so the closing markup stays valid. Otherwise we
 * concatenate plus a hr separator.
 *
 * Footer copy is deliberately short - clients trust the catering
 * brand, not CateringMS - so we don't mention the platform.
 */
function appendUnsubscribeFooter(
  body: string,
  companyId: string,
  recipientEmail: string,
): string {
  const url = buildUnsubscribeUrl(resolveBaseUrl(), recipientEmail, companyId);
  const footer = `
  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;font-family:-apple-system,BlinkMacSystemFont,sans-serif;line-height:1.5;">
    You're receiving this because you've been in touch with us about an event.
    <a href="${url}" style="color:#64748b;text-decoration:underline;">Unsubscribe</a>
    to stop receiving these emails.
  </div>`;
  if (/<\/body>/i.test(body)) {
    return body.replace(/<\/body>/i, `${footer}</body>`);
  }
  return `${body}${footer}`;
}

export interface EmailSendDetailed {
  success: boolean;
  error?: string;
  error_code?: EmailErrorCode;
  fix_link?: string;
  /** Extra context for the toast / inline error block, e.g. the
   *  unverified domain name. */
  context?: Record<string, string | null | undefined>;
}

export const emailService = {
  /**
   * Fetch the active provider config for a company.
   *
   * Reads from email_provider_settings (the canonical table the
   * /admin/email-settings UI writes to). The legacy email_settings
   * table this method used to read from never had host/user/password
   * columns, so SMTP sends silently failed even when the operator had
   * "saved" their config - two tables, never reconciled.
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
      .select("id, company_id, provider, from_email, from_name, smtp_host, smtp_port, smtp_user, smtp_pass_encrypted, smtp_secure, is_verified, resend_domain_id, resend_sending_domain, resend_domain_status, resend_domain_verified_at, resend_dns_records, force_platform_sender, created_at, updated_at")
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
      // doesn't exist on email_provider_settings - enabling/disabling
      // is implicit (no row = no provider).
      enabled: !!(data as any).provider && (data as any).provider !== "none",
      provider: (data as any).provider,
      from_name: (data as any).from_name,
      from_email: (data as any).from_email,
      smtp_host: (data as any).smtp_host,
      smtp_port: port && !isNaN(port) ? port : null,
      smtp_user: (data as any).smtp_user,
      // Column is NAMED "encrypted" but the UI stores raw text - legacy
      // misnomer. Read as-is. If we ever wire pgcrypto, the decrypt
      // happens at the SQL layer and this stays a plain text string.
      smtp_password: (data as any).smtp_pass_encrypted || null,
      smtp_secure: (data as any).smtp_secure,
      is_verified: (data as any).is_verified,
      resend_domain_id: (data as any).resend_domain_id || null,
      resend_sending_domain: (data as any).resend_sending_domain || null,
      resend_domain_status: (data as any).resend_domain_status || null,
      resend_domain_verified_at: (data as any).resend_domain_verified_at || null,
      resend_dns_records: (data as any).resend_dns_records || null,
      // TIGHTEN I.38: column was selected but never mapped onto the
      // returned EmailSettings, so resolveFromAddress's
      // `config.force_platform_sender` check was always undefined and
      // the LCF-N operator override silently no-opped. Latent until a
      // tenant verifies their own domain - the unverified fallback
      // path masked it.
      force_platform_sender: !!(data as any).force_platform_sender,
      created_at: (data as any).created_at,
      updated_at: (data as any).updated_at,
    };
  },

  /**
   * Decide what `From` and `Reply-To` to use for a given tenant.
   *
   * Tier 0 - tenant verified their own domain in Resend AND their
   * from_email lives at that domain: send as `${from_name} <${from_email}>`.
   *
   * Tier 1 - everything else (no domain, pending, failed, or
   * mismatched apex): send from the shared `noreply@send.cateringms.com`
   * sender with reply_to set to the tenant's from_email so client
   * replies still land in the operator's inbox. Skylight verifies the
   * shared subdomain in Resend at the platform level.
   *
   * SMTP and OAuth providers ignore this - they always send as the
   * tenant's own address (the SMTP server gates it).
   */
  resolveFromAddress(config: EmailSettings): { from: string; replyTo?: string } {
    const name = (config.from_name || "").trim() || "CateringMS";
    const email = (config.from_email || "").trim().toLowerCase();

    if (config.provider !== "resend") {
      // SMTP / OAuth path: pass through whatever the tenant configured.
      return { from: `${name} <${config.from_email || SHARED_FROM_EMAIL}>` };
    }

    // LCF-N: explicit operator override wins over verified-domain. Skip
    // straight to the fallback (platform sender + reply-to). Useful for
    // testing the onboarding path on a tenant whose DNS is already in
    // place, or for a soft rollback to the shared sender without
    // touching DNS.
    const forcePlatform = !!config.force_platform_sender;

    const verified = !!config.resend_domain_verified_at;
    const sendingDomain = (config.resend_sending_domain || "").toLowerCase();
    const matchesDomain =
      sendingDomain && email && email.endsWith(`@${sendingDomain}`);

    if (!forcePlatform && verified && matchesDomain) {
      return { from: `${name} <${email}>` };
    }

    // Fallback: shared sender, replies routed back to the operator's
    // own inbox. If the operator hasn't even set a from_email yet, omit
    // reply_to so Resend doesn't choke on an empty header.
    const fallback: { from: string; replyTo?: string } = {
      from: `${name} <${SHARED_FROM_EMAIL}>`,
    };
    if (email) fallback.replyTo = email;
    return fallback;
  },

  /**
   * Variable substitution for email templates. Aligned with the rest
   * of the platform (templateResolver, message-template registry,
   * seeded email_templates rows) on Mustache-style {{key}} double
   * curlies. The previous single-curly {key} pattern silently failed
   * for any template authored against the documented contract, and
   * the RegExp-based replace was unsafe for variable names containing
   * regex metacharacters [P1-25].
   *
   * Uses split/join rather than RegExp so no key escaping is needed.
   * Unknown placeholders are left intact (matches templateResolver
   * behaviour) so an operator can spot a typo against the live
   * preview rather than a silently empty field.
   */
  replaceVariables(template: string, variables: Record<string, any> = {}): string {
    let result = template;
    if (variables) {
      for (const [key, value] of Object.entries(variables)) {
        if (value !== undefined && value !== null) {
          // Double-curly canonical.
          result = result.split(`{{${key}}}`).join(String(value));
          // Backwards compat: also handle single-curly placeholders so
          // legacy hardcoded fallbacks ({clientName}, {orderNumber})
          // keep rendering until they're migrated.
          result = result.split(`{${key}}`).join(String(value));
        }
      }
    }
    // Leak guard: blank any double-curly placeholder the caller didn't
    // supply so a recipient never sees a raw {{first_name}} on the
    // raw-body send path (templateResolver already does this for DB
    // templates). Only {{...}} is stripped - single braces are left
    // alone so inline CSS ({ color: ... }) in HTML bodies is untouched.
    result = result.replace(/{{\s*[\w.]+\s*}}/g, "");
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
      // Don't throw - a logging failure must never crash the actual
      // send. The console.error gives ops a paper trail.
      return null;
    }

    return data;
  },

  async sendEmail(payload: SendEmailPayload & { _client?: any }): Promise<boolean> {
    const result = await this.sendEmailDetailed(payload);
    return !!result.success;
  },

  /**
   * Same shape as sendEmail but returns a structured diagnosis instead
   * of a plain boolean. Used by /api/send-email so the response carries
   * a machine-readable error_code + a fix_link the UI can render as a
   * "Fix this" button. Existing callers stay on sendEmail (legacy
   * boolean) so this is purely additive.
   */
  async sendEmailDetailed(payload: SendEmailPayload & { _client?: any }): Promise<EmailSendDetailed> {
    // Browser callers can't send directly: RESEND_API_KEY only exists
    // server-side and nodemailer can't run in a browser, so every
    // client-side send (e.g. the quotes-list convert cascade's
    // confirmation email) silently failed with no_provider. Delegate
    // to /api/send-email, which re-enters this function server-side
    // under the service-role client after an auth + same-company
    // check (the session cookie rides along automatically).
    if (typeof window !== "undefined") {
      try {
        const rawAttachments = (payload as any).attachments;
        const wireAttachments = Array.isArray(rawAttachments)
          ? rawAttachments
              .map((a: any) => ({
                filename: a?.filename,
                content:
                  typeof a?.content === "string"
                    ? a.content
                    : a?.content
                      ? Buffer.from(a.content).toString("base64")
                      : null,
                ...(a?.contentType ? { contentType: a.contentType } : {}),
              }))
              .filter((a: any) => a.filename && a.content)
          : undefined;
        const res = await fetch("/api/send-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: payload.companyId,
            to: payload.to,
            subject: payload.subject,
            template: payload.template,
            body: payload.body,
            variables: payload.variables,
            orderId: payload.orderId,
            quoteId: payload.quoteId,
            bypassQuarantine: (payload as any).bypassQuarantine,
            ...(wireAttachments && wireAttachments.length > 0 ? { attachments: wireAttachments } : {}),
          }),
        });
        const json: any = await res.json().catch(() => ({}));
        if (res.ok && json?.success) return { success: true };
        return {
          success: false,
          error: json?.error || `Email API responded ${res.status}`,
          error_code: (json?.error_code as EmailErrorCode) || "unknown",
          ...(json?.fix_link ? { fix_link: json.fix_link } : {}),
          ...(json?.context ? { context: json.context } : {}),
        };
      } catch (e: any) {
        return { success: false, error: e?.message || "Email API unreachable", error_code: "unknown" };
      }
    }

    // Server-side callers (e.g. unauthenticated magic-link sign-in)
    // pass a service-role client via _client so the email_settings
    // lookup isn't blocked by RLS.
    let config = await this.getEmailConfig(payload.companyId, payload._client);

    if (!config || !config.enabled) {
      // Platform fallback for system-critical onboarding mail: a
      // brand-new company has no provider row yet, which would otherwise
      // block its first staff invite / magic-link. When the caller opts
      // in (allowPlatformFallback) and the platform Resend key exists,
      // synthesise a shared-sender config so the mail still goes out
      // from noreply@send.cateringms.com (replies route to the company
      // email when known). Normal tenant mail does NOT set the flag, so
      // its no_provider behaviour is unchanged.
      const canFallback =
        !!(payload as any).allowPlatformFallback && !!process.env.RESEND_API_KEY;
      if (canFallback) {
        let companyName = "CateringMS";
        let companyEmail: string | null = null;
        try {
          const sb2 = payload._client || supabase;
          const { data: c } = await sb2
            .from("companies")
            .select("company_name, email")
            .eq("id", payload.companyId)
            .maybeSingle();
          if ((c as any)?.company_name) companyName = (c as any).company_name;
          if ((c as any)?.email) companyEmail = (c as any).email;
        } catch { /* keep defaults */ }
        config = {
          id: "platform-fallback",
          company_id: payload.companyId,
          enabled: true,
          provider: "resend",
          from_email: companyEmail, // used only as reply-to via resolveFromAddress
          from_name: companyName,
          is_verified: false,
        } as any;
        console.warn(`[emailService] using platform shared sender for ${payload.companyId} (no tenant provider yet)`);
      } else {
        console.warn(`Email automation is disabled or not configured for company ${payload.companyId}`);
        // Log the failure so the operator sees it in the dashboard.
        try {
          await this.logEmailSent(
            payload.companyId,
            payload.template || "custom",
            payload.to,
            payload.variables?.clientName || "N/A",
            payload.subject,
            payload.orderId,
            payload.quoteId,
            (payload as any)._client,
            "failed",
            "No email provider configured",
          );
        } catch { /* logging failure must not crash the send path */ }
        return {
          success: false,
          error: "You haven't set up an email sender yet.",
          error_code: "no_provider",
          fix_link: "/admin/email-settings",
        };
      }
    }

    // Negative gates - these run for every send path, including
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
        const { data: blocks, error: blocksErr } = await sb
          .from("blocked_contacts")
          .select("email_lower")
          .eq("company_id", payload.companyId)
          .eq("email_lower", recipientLower)
          .limit(1);
        if (blocksErr) console.error("[emailService] blocked_contacts lookup failed:", blocksErr);
        if (blocks && blocks.length > 0) {
          console.warn(`[emailService] refused - ${recipientLower} is on the block list for ${payload.companyId}`);
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
          return {
            success: false,
            error: `${payload.to} is on your blocked-contacts list. Unblock them in Contacts.`,
            error_code: "blocked_recipient",
            fix_link: "/admin/contacts",
            context: { recipient: payload.to },
          };
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
          console.warn(`[emailService] refused - ${recipientLower} is in import quarantine for ${payload.companyId}`);
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
          return {
            success: false,
            error: `Comms to ${payload.to} are paused (bulk-import quarantine). Review the import to unblock.`,
            error_code: "quarantined_recipient",
            fix_link: "/admin/contacts",
            context: { recipient: payload.to },
          };
        }
      } catch (guardErr) {
        // Don't let a guard failure silently allow sends. Log loudly
        // but proceed - worst case we send through, vs the worse
        // case of failing closed and breaking every email when the
        // RPC is briefly unavailable.
        console.warn("[emailService] guard check failed, proceeding:", guardErr);
      }
    }

    let finalBody = payload.body || "";

    // Normalise the variable bag once so placeholders resolve regardless
    // of camelCase/snake_case and common aliases (see emailVariables).
    // Used for both the template resolve and the raw-body/subject pass.
    const normVars = normalizeEmailVariables(payload.variables || {});

    if (payload.template) {
      // ODOC H.14: route through resolveEmailTemplate so the
      // tenant-override -> global-default -> caller-fallback ladder
      // fires properly. Pre-H.14 this branch did a single-shot
      // .from("email_templates").eq("company_id", X).eq("template_type", Y)
      // query and bailed when no tenant override existed - so the
      // postCreationCascade "order_confirmed" send returned
      // success: false on every tenant that hadn't customised the
      // template, even though a perfectly good global default existed
      // in the same table with company_id IS NULL. Bobby hit this
      // when admin-editing an accepted quote re-fired the cascade.
      const { resolveEmailTemplate } = await import("@/services/email/templateResolver");
      const resolved = await resolveEmailTemplate({
        companyId: payload.companyId,
        templateType: payload.template,
        variables: normVars,
        fallback: {
          subject: payload.subject || "",
          bodyHtml: payload.body || "",
        },
        client: sb,
      });
      // We let resolveEmailTemplate carry the substitution itself
      // (its substitute() is the same shape as this.replaceVariables),
      // so override finalSubject + finalBody and skip the duplicate
      // pass below.
      payload.subject = resolved.subject;
      finalBody = resolved.bodyHtml;
      // Track resolution source for the receipt - the cascade reads
      // this back to know whether the send actually used a real
      // template or fell back to the caller-supplied placeholder.
      (payload as any)._templateSource = resolved.source;
    }

    const finalSubject = this.replaceVariables(payload.subject, normVars);
    finalBody = this.replaceVariables(finalBody, normVars);

    // TIGHTEN I.124 (2026-06-03): auto-wrap plain or fragment HTML
    // bodies in a branded email shell. Reads company logo + brand
    // colours + contact info from the companies row and emits a
    // table-layout HTML email that renders cleanly in Gmail, Apple
    // Mail, Outlook, and the major mobile clients. Skipped when:
    //   - caller opts out via skipBrandedShell (raw HTML sends like
    //     companyWelcome that build their own document already)
    //   - the body already starts with <!doctype or <html (fully
    //     shelled by a template / caller)
    //   - no companyId is available (shouldn't happen in practice
    //     but defensive)
    const alreadyFullDoc = /^\s*(<!doctype|<html\b)/i.test(finalBody);
    if (!alreadyFullDoc && !(payload as any).skipBrandedShell && payload.companyId) {
      try {
        const { renderBrandedEmailHtml } = await import("@/services/email/brandedEmailShell");
        finalBody = await renderBrandedEmailHtml({
          companyId: payload.companyId,
          body: finalBody,
          preheader: finalSubject,
          cta: (() => {
            // Templates use snake_case ({{quote_url}}), the dialog
            // posts variables in camelCase (quoteUrl). Accept both.
            const v: any = payload.variables || {};
            const quoteUrl = v.quote_url || v.quoteUrl;
            const orderUrl = v.order_url || v.orderUrl;
            const invoiceLink = v.invoice_link || v.invoiceLink || v.invoiceUrl;
            if (quoteUrl)   return { label: "View quote", url: String(quoteUrl) };
            if (orderUrl)   return { label: "View your order", url: String(orderUrl) };
            if (invoiceLink) return { label: "View invoice", url: String(invoiceLink) };
            return undefined;
          })(),
          client: payload._client,
        });
      } catch (shellErr) {
        // Brand fetch / render must never block the send. Log loudly
        // and proceed with the unshelled body.
        console.warn("[emailService] branded shell failed, sending plain:", shellErr);
      }
    }

    // Unsubscribe-footer adoption (docs/notifications.md follow-up 6.6).
    // Every commercial send carries the one-click opt-out link in the
    // footer. The link is HMAC-signed via emailUnsubscribe so it
    // resolves on /u/[token] -> /api/public/unsubscribe without a
    // tokens table. Skipped when:
    //   - the caller explicitly opts out (skipUnsubscribeFooter)
    //   - the body already includes "/u/" (template wrote its own)
    //   - we can't build the link (no companyId / no recipient)
    if (!payload.skipUnsubscribeFooter && payload.companyId && recipientLower && !finalBody.includes("/u/")) {
      try {
        finalBody = appendUnsubscribeFooter(finalBody, payload.companyId, recipientLower);
      } catch (footerErr) {
        // Never block the send on a footer build failure. Log loudly
        // so the platform team notices the regression.
        console.warn("[emailService] unsubscribe footer build failed, sending without:", footerErr);
      }
    }

    try {
      // Pre-flight gates for Resend that don't require burning an API
      // call. We only run these when the tenant's own from_email is
      // set - empty from_email is fine because the resolver falls back
      // to the shared CateringMS sender.
      //
      // When the tenant's domain is registered but not yet verified, we
      // do NOT block. resolveFromAddress already falls back to the
      // shared sender (noreply@send.cateringms.com) with reply-to set
      // to the operator's address, so the email still delivers and
      // replies still land in their inbox. Blocking would break
      // system-critical sends like client magic-links during the
      // verify-DNS window. The mismatch check below stays a hard error
      // because that's a real config bug the operator should see.
      if (config.provider === "resend" && (config.from_email || "").trim()) {
        const fromEmail = (config.from_email || "").trim().toLowerCase();
        const sendingDomain = (config.resend_sending_domain || "").trim().toLowerCase();
        const verified = !!config.resend_domain_verified_at;
        if (verified && sendingDomain && fromEmail && !fromEmail.endsWith(`@${sendingDomain}`)) {
          await this.logEmailSent(
            payload.companyId,
            payload.template || "custom",
            payload.to,
            payload.variables?.clientName || "N/A",
            finalSubject,
            payload.orderId,
            payload.quoteId,
            (payload as any)._client,
            "failed",
            `from_email ${fromEmail} doesn't match verified domain ${sendingDomain}`,
          );
          return {
            success: false,
            error: `Your From email needs to end in @${sendingDomain}.`,
            error_code: "from_email_domain_mismatch",
            fix_link: "/admin/email-settings#resend",
            context: { domain: sendingDomain, from_email: fromEmail },
          };
        }
      }

      let providerResult: { ok: true } | { ok: false; status?: number; body?: any; message: string; code?: string } | null = null;

      if (config.provider === 'resend' && process.env.RESEND_API_KEY) {
        const { from, replyTo } = this.resolveFromAddress(config);
        // TIGHTEN I.43 (2026-06-01): inject List-Unsubscribe +
        // List-Unsubscribe-Post headers so Gmail / Yahoo's 2024
        // bulk-sender rules treat us as compliant. Missing these
        // headers is the single biggest reason a fresh shared sender
        // (send.cateringms.com) lands in spam. Resend signs the
        // outbound DKIM over the headers we provide, so the
        // unsubscribe link is part of the authenticated message body
        // and survives forwarding checks.
        const headers: Record<string, string> = {};
        if (recipientLower) {
          const unsubUrl = buildUnsubscribeUrl(resolveBaseUrl(), recipientLower, payload.companyId);
          headers["List-Unsubscribe"] = `<${unsubUrl}>`;
          // One-Click required by Gmail/Yahoo for senders over
          // 5000/day, harmless below and a clear deliverability win.
          headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
        }
        providerResult = await this.sendViaResend({
          from,
          to: payload.to,
          subject: finalSubject,
          html: finalBody,
          attachments: payload.attachments,
          replyTo,
          headers: Object.keys(headers).length > 0 ? headers : undefined,
          // TIGHTEN I.45: tag every send with company_id so Resend
          // webhook events can be attributed in email_delivery_events.
          // Template type goes too so the bounce dashboard can show
          // "quote_sent bounced for client X" without joining back to
          // email_automation_log.
          tags: [
            { name: "company_id", value: payload.companyId },
            { name: "template", value: payload.template || "custom" },
          ],
        });
      } else if (config.provider === 'smtp' && config.smtp_host) {
        const { from } = this.resolveFromAddress(config);
        providerResult = await this.sendViaSMTP(config, {
          from,
          to: payload.to,
          subject: finalSubject,
          html: finalBody,
          attachments: payload.attachments,
        });
      } else if (config.provider === 'resend' && !process.env.RESEND_API_KEY) {
        // Resend selected but the platform-level API key is missing.
        // This is a Skylight ops issue, not a tenant fix - no fix_link.
        await this.logEmailSent(
          payload.companyId,
          payload.template || "custom",
          payload.to,
          payload.variables?.clientName || "N/A",
          finalSubject,
          payload.orderId,
          payload.quoteId,
          (payload as any)._client,
          "failed",
          "RESEND_API_KEY missing on the server",
        );
        return {
          success: false,
          error: "The Resend API key is missing or invalid. Ask your platform admin.",
          error_code: "resend_auth",
        };
      } else {
        // No provider configured - this is a real failure, not a
        // success. Returning true here previously marked the row
        // status='sent' in email_automation_log, so operator dashboards
        // showed deliveries that never happened. Clients only noticed
        // when they said "I never got the quote". Now we log the
        // attempt as failed with a clear reason and return false so
        // upstream callers can react. EmailProviderBanner surfaces the
        // missing-provider state on the admin dashboard so this isn't
        // discovered the hard way.
        console.warn("[emailService] refused - no email provider configured");
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

        return {
          success: false,
          error: "You haven't set up an email sender yet.",
          error_code: "no_provider",
          fix_link: "/admin/email-settings",
        };
      }

      if (providerResult && (providerResult as any).ok) {
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
        return { success: true };
      }

      // Provider returned !ok. Log + map to a friendly diagnosis.
      const failure = providerResult as any;
      const reason = failure?.message || `Provider ${config.provider || "?"} returned not-ok`;
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
        reason,
      );

      // Map Resend error shapes -> structured codes.
      if (config.provider === "resend") {
        const status: number | undefined = failure?.status;
        const body = failure?.body;
        const bodyName = String(body?.name || "").toLowerCase();
        const bodyMessage = String(body?.message || "").toLowerCase();
        if (status === 401 || status === 403 || bodyName.includes("api_key")) {
          // TIGHTEN I.40: include Resend's status + body so the
          // operator-facing toast can distinguish "key rejected"
          // (Resend says no) from "key missing on server" (Vercel
          // env var problem). Both surfaced as resend_auth before -
          // diagnosing required digging through function logs.
          return {
            success: false,
            error: "The Resend API key is missing or invalid. Ask your platform admin.",
            error_code: "resend_auth",
            context: {
              resend_status: status != null ? String(status) : null,
              resend_body_name: body?.name ?? null,
              resend_body_message: body?.message ?? null,
            },
          };
        }
        if (
          status === 422 ||
          bodyName.includes("domain") ||
          bodyMessage.includes("not verified") ||
          bodyMessage.includes("domain")
        ) {
          const sendingDomain = (config.resend_sending_domain || "").trim().toLowerCase();
          return {
            success: false,
            error: sendingDomain
              ? `Your sending domain ${sendingDomain} isn't verified yet. Add the DNS records and click Verify.`
              : "Your sending domain isn't verified yet in Resend. Add the DNS records and click Verify.",
            error_code: "domain_unverified",
            fix_link: "/admin/email-settings#resend",
            context: { domain: sendingDomain || null },
          };
        }
        return {
          success: false,
          error: `Email delivery failed. ${reason}`,
          error_code: "resend_other",
        };
      }

      if (config.provider === "smtp") {
        const code = String(failure?.code || "").toUpperCase();
        const lowered = String(failure?.message || "").toLowerCase();
        if (code === "EAUTH" || lowered.includes("auth")) {
          return {
            success: false,
            error: `Couldn't authenticate with your SMTP server (${config.smtp_host}:${config.smtp_port}). Check the username and password.`,
            error_code: "smtp_auth",
            fix_link: "/admin/email-settings",
            context: { host: config.smtp_host || null, port: String(config.smtp_port || "") },
          };
        }
        if (
          code === "ECONNECTION" ||
          code === "ETIMEDOUT" ||
          code === "ENOTFOUND" ||
          lowered.includes("connect") ||
          lowered.includes("timeout") ||
          lowered.includes("refused")
        ) {
          return {
            success: false,
            error: `Couldn't reach your SMTP server (${config.smtp_host}:${config.smtp_port}). Check the host, port and credentials.`,
            error_code: "smtp_connection",
            fix_link: "/admin/email-settings",
            context: { host: config.smtp_host || null, port: String(config.smtp_port || "") },
          };
        }
        return {
          success: false,
          error: `SMTP send failed. ${reason}`,
          error_code: "smtp_other",
          fix_link: "/admin/email-settings",
        };
      }

      return {
        success: false,
        error: `Email delivery failed. ${reason}`,
        error_code: "unknown",
      };
    } catch (error: any) {
      console.error("Error sending email:", error);
      // Crash path - still log so ops can find it.
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
      } catch { /* logging the failure itself failed - nothing to do */ }
      return {
        success: false,
        error: `Email delivery failed. ${String(error?.message || error || "Unknown crash")}`,
        error_code: "unknown",
      };
    }
  },

  /**
   * Result wrapper for the provider-level send. We surface the HTTP
   * status and the raw error body so sendEmailDetailed can map the
   * Resend error shape to a friendly diagnosis (auth vs domain
   * unverified vs other).
   */
  async sendViaResend(emailData: {
    from: string;
    to: string;
    subject: string;
    html: string;
    attachments?: EmailAttachment[];
    replyTo?: string;
    headers?: Record<string, string>;
    /** TIGHTEN I.45: passed as Resend tags so the webhook handler
     *  can attribute delivery events (bounced / complained / etc.)
     *  back to the company that sent the email. */
    tags?: Array<{ name: string; value: string }>;
  }): Promise<{ ok: true; id?: string } | { ok: false; status: number; body: any; message: string }> {
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
      if (emailData.replyTo) {
        // Resend accepts either reply_to or replyTo; reply_to is the
        // documented snake_case form.
        resendBody.reply_to = emailData.replyTo;
      }
      // TIGHTEN I.43: custom headers (List-Unsubscribe / List-Unsubscribe-Post)
      // for Gmail/Yahoo bulk-sender compliance. Resend's API takes
      // them as a plain object on the `headers` key.
      if (emailData.headers && Object.keys(emailData.headers).length > 0) {
        resendBody.headers = emailData.headers;
      }
      // TIGHTEN I.45: tag the send with company_id so Resend webhook
      // events (delivered / bounced / complained / etc.) can be
      // attributed back to the tenant in email_delivery_events.
      if (Array.isArray(emailData.tags) && emailData.tags.length > 0) {
        resendBody.tags = emailData.tags;
      }
      if (Array.isArray(emailData.attachments) && emailData.attachments.length > 0) {
        resendBody.attachments = emailData.attachments.map((a) => ({
          filename: a.filename,
          content: Buffer.isBuffer(a.content)
            ? a.content.toString("base64")
            : String(a.content),
          ...(a.contentType ? { content_type: a.contentType } : {}),
        }));
      }

      if (!process.env.RESEND_API_KEY) {
        return {
          ok: false,
          status: 0,
          body: { name: "missing_api_key" },
          message: "RESEND_API_KEY is not set",
        };
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
        let errorBody: any = null;
        try { errorBody = await response.json(); } catch { errorBody = null; }
        console.error('Resend API error:', response.status, errorBody);
        const message = (errorBody && (errorBody.message || errorBody.error)) || `HTTP ${response.status}`;
        return { ok: false, status: response.status, body: errorBody, message };
      }

      // TIGHTEN I.45: capture Resend's returned id so the webhook
      // handler can correlate downstream events back to this send.
      let resendId: string | undefined;
      try {
        const okBody = await response.json();
        resendId = okBody?.id || undefined;
      } catch { /* harmless if Resend ever omits the body */ }
      console.log('Email sent successfully via Resend', resendId ? `(id=${resendId})` : "");
      return { ok: true, id: resendId };
    } catch (error: any) {
      console.error('Error sending via Resend:', error);
      return {
        ok: false,
        status: 0,
        body: null,
        message: error?.message || "Resend network error",
      };
    }
  },

  async sendViaSMTP(config: EmailSettings, emailData: {
    from: string;
    to: string;
    subject: string;
    html: string;
    attachments?: EmailAttachment[];
  }): Promise<{ ok: true } | { ok: false; code?: string; message: string }> {
    try {
      if (typeof window !== 'undefined') {
        console.warn("SMTP emails cannot be sent directly from the browser. Simulating success for client-side execution.");
        return { ok: true };
      }

      if (!config.smtp_host || !config.smtp_port || !config.smtp_user || !config.smtp_password) {
        console.error('SMTP configuration incomplete');
        return {
          ok: false,
          code: "incomplete",
          message: "SMTP configuration is incomplete (missing host, port, user, or password).",
        };
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
      // shape - content can be Buffer or base64 string. We pass
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
      console.log('Email sent successfully via SMTP');
      return { ok: true };
    } catch (error: any) {
      console.error('Error sending via SMTP:', error);
      return {
        ok: false,
        code: String(error?.code || error?.responseCode || ""),
        message: error?.message || "SMTP send failed",
      };
    }
  },
};