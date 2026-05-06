/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Centralised email template resolution.
 *
 * Every client-facing email funnels through this resolver so the source
 * of truth is one path: tenant override -> global default -> hardcoded
 * fallback. Today the codebase has at least four divergent paths
 * (cancellationEmails, invoiceGenerationService, orderWorkflow inline
 * strings, accept.ts inline strings) -- migrate them all to
 * resolveEmailTemplate so an operator editing the Lifecycle Emails
 * panel actually controls what the client receives.
 *
 * Lookup order:
 *   1. email_templates row matched on (company_id, template_type) and
 *      is_active = true. This is the tenant's customised version.
 *   2. email_templates row matched on (company_id IS NULL, template_type)
 *      and is_active = true. This is the system-shipped default.
 *   3. The caller's hardcoded fallback (subject + bodyHtml).
 *
 * Variable substitution is Mustache-style {{name}} -- callers pass the
 * full variable bag and the resolver replaces every occurrence. Unknown
 * placeholders are left intact (so an operator can spot a typo against
 * the live preview rather than a silently empty field).
 *
 * NEVER throws. On query error we log and use the caller's fallback so
 * the email still goes out.
 */
import { supabase } from "@/integrations/supabase/client";

export interface ResolvedTemplate {
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  /** Useful for ops debugging: did this resolve from DB or fallback? */
  source: "db" | "fallback";
}

export interface TemplateResolveInput {
  companyId: string;
  templateType: string;
  variables: Record<string, string | number | null | undefined>;
  fallback: { subject: string; bodyHtml: string; bodyText?: string };
  /**
   * Optional Supabase client. Server-side callers should pass a
   * service-role client so the global-default row (company_id IS NULL)
   * is reachable even when there is no authenticated user, since
   * email_templates RLS scopes by company_id.
   */
  client?: any;
}

/** Mustache-style {{var}} substitution. Leaves unknown keys intact. */
function substitute(
  template: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    const value = v === null || v === undefined ? "" : String(v);
    out = out.split(`{{${k}}}`).join(value);
  }
  return out;
}

interface TemplateRow {
  subject: string | null;
  body: string | null;
}

async function fetchRow(
  client: any,
  companyId: string | null,
  templateType: string,
): Promise<TemplateRow | null> {
  try {
    let query = client
      .from("email_templates")
      .select("subject, body")
      .eq("template_type", templateType)
      .eq("is_active", true);
    query = companyId === null
      ? query.is("company_id", null)
      : query.eq("company_id", companyId);
    const { data, error } = await query.maybeSingle();
    if (error) {
      console.warn(
        `[templateResolver] lookup error for ${templateType} (company_id=${companyId}):`,
        error.message,
      );
      return null;
    }
    return (data as TemplateRow) || null;
  } catch (e) {
    console.warn(`[templateResolver] lookup crashed for ${templateType}:`, e);
    return null;
  }
}

export async function resolveEmailTemplate(
  input: TemplateResolveInput,
): Promise<ResolvedTemplate> {
  const sb = input.client || supabase;
  const vars = input.variables || {};

  // 1. Tenant override.
  const tenantRow = await fetchRow(sb, input.companyId, input.templateType);
  if (tenantRow && tenantRow.subject && tenantRow.body) {
    return {
      subject: substitute(tenantRow.subject, vars),
      bodyHtml: substitute(tenantRow.body, vars),
      source: "db",
    };
  }

  // 2. Global default.
  const globalRow = await fetchRow(sb, null, input.templateType);
  if (globalRow && globalRow.subject && globalRow.body) {
    return {
      subject: substitute(globalRow.subject, vars),
      bodyHtml: substitute(globalRow.body, vars),
      source: "db",
    };
  }

  // 3. Caller's fallback.
  return {
    subject: substitute(input.fallback.subject, vars),
    bodyHtml: substitute(input.fallback.bodyHtml, vars),
    bodyText: input.fallback.bodyText
      ? substitute(input.fallback.bodyText, vars)
      : undefined,
    source: "fallback",
  };
}
