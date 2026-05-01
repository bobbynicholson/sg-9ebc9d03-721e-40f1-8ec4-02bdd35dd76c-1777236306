/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Message template service -- the resolver layer between the registry
 * (defaults that ship with the product) and the per-company override
 * tables (`email_templates`, `whatsapp_templates`).
 *
 * Read flow:
 *   1. listForCompany(companyId) returns a merged view of every template
 *      in the registry, with a flag showing whether the company has
 *      customised it.
 *   2. resolveTemplate({ companyId, key, ctx }) returns the rendered
 *      subject + body for a single send -- override on top of default,
 *      with {{variable}} substitution applied.
 *
 * Write flow:
 *   - saveOverride({ companyId, key, subject, body }) upserts a row in
 *     the channel-appropriate table.
 *   - removeOverride({ companyId, key }) drops the row so the renderer
 *     falls back to the registry default.
 *
 * Caching: a per-company cache persists for the lifetime of the page
 * load. listForCompany populates it; resolveTemplate reads from it
 * synchronously after the first call. saveOverride / removeOverride
 * invalidate the cache for that company.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  TEMPLATE_REGISTRY,
  type TemplateDefinition,
  type MessageChannel,
  renderTemplate,
} from "@/lib/messageTemplates/registry";

interface OverrideRow {
  key: string;
  channel: MessageChannel;
  subject: string | null;
  body: string;
  isActive: boolean;
}

/** What the editor page renders for each row. */
export interface MergedTemplate extends TemplateDefinition {
  /** True when the company has saved a custom version. */
  isCustomised: boolean;
  /** The custom subject (email only) when isCustomised. */
  customSubject: string | null;
  /** The custom body when isCustomised. */
  customBody: string | null;
  /** Whether the customisation is active (defaults to true on save). */
  customIsActive: boolean;
}

// In-memory cache keyed by companyId. Cleared on save/remove.
const overrideCache = new Map<string, Map<string, OverrideRow>>();

/**
 * Pull every email + whatsapp override for a company in two queries
 * and stash them in the cache. Subsequent resolveTemplate calls are
 * sync.
 */
export async function loadCompanyOverrides(companyId: string): Promise<Map<string, OverrideRow>> {
  const cached = overrideCache.get(companyId);
  if (cached) return cached;

  const lookup = new Map<string, OverrideRow>();

  // Email overrides: keyed off email_templates.template_type which
  // matches our registry key for email templates. is_active flag is
  // honoured -- inactive overrides skip the override and use default.
  try {
    const { data: emailRows } = await (supabase as any)
      .from("email_templates")
      .select("template_type, subject, body, is_active")
      .eq("company_id", companyId);
    for (const row of emailRows || []) {
      if (!row.template_type) continue;
      lookup.set(row.template_type, {
        key: row.template_type,
        channel: "email",
        subject: row.subject ?? null,
        body: row.body ?? "",
        isActive: row.is_active !== false,
      });
    }
  } catch (err) {
    console.warn("loadCompanyOverrides: email_templates fetch failed", err);
  }

  // WhatsApp overrides: keyed off whatsapp_templates.template_key.
  try {
    const { data: waRows } = await (supabase as any)
      .from("whatsapp_templates")
      .select("template_key, template_content, is_enabled")
      .eq("company_id", companyId);
    for (const row of waRows || []) {
      if (!row.template_key) continue;
      lookup.set(row.template_key, {
        key: row.template_key,
        channel: "whatsapp",
        subject: null,
        body: row.template_content ?? "",
        isActive: row.is_enabled !== false,
      });
    }
  } catch (err) {
    console.warn("loadCompanyOverrides: whatsapp_templates fetch failed", err);
  }

  overrideCache.set(companyId, lookup);
  return lookup;
}

/** Drop the cache for a company -- called after save / remove. */
export function invalidateCompanyCache(companyId: string): void {
  overrideCache.delete(companyId);
}

/**
 * Build the merged list for the editor: every registry template, with
 * the company's customisation status layered in.
 */
export async function listForCompany(companyId: string): Promise<MergedTemplate[]> {
  const overrides = await loadCompanyOverrides(companyId);
  return TEMPLATE_REGISTRY.map((def) => {
    const ovr = overrides.get(def.key);
    return {
      ...def,
      isCustomised: !!ovr,
      customSubject: ovr?.subject ?? null,
      customBody: ovr?.body ?? null,
      customIsActive: ovr?.isActive ?? true,
    };
  });
}

/**
 * Resolve a template for sending. Returns subject + body with the
 * registry default OR the company override applied, then the {{vars}}
 * substituted. Caller is responsible for having loaded overrides --
 * call loadCompanyOverrides() first on app boot.
 */
export interface ResolveArgs {
  companyId: string | null;
  key: string;
  ctx?: Record<string, string | number | null | undefined>;
}

export interface ResolvedTemplate {
  subject: string;
  body: string;
  /** Whether a company override was used for this render. */
  fromOverride: boolean;
}

export async function resolveTemplate(args: ResolveArgs): Promise<ResolvedTemplate | null> {
  const def = TEMPLATE_REGISTRY.find((t) => t.key === args.key);
  if (!def) return null;

  let subject = def.defaultSubject ?? "";
  let body = def.defaultBody;
  let fromOverride = false;

  if (args.companyId) {
    const overrides = await loadCompanyOverrides(args.companyId);
    const ovr = overrides.get(args.key);
    if (ovr && ovr.isActive) {
      if (ovr.subject != null && ovr.subject !== "") subject = ovr.subject;
      if (ovr.body && ovr.body.trim() !== "") body = ovr.body;
      fromOverride = true;
    }
  }

  const ctx = (args.ctx || {}) as Record<string, string | number | null | undefined>;
  return {
    subject: renderTemplate(subject, ctx),
    body: renderTemplate(body, ctx),
    fromOverride,
  };
}

/**
 * Synchronous lookup variant for the legacy renderers
 * (composeEmail.templateFor*, whatsappTemplates.render*) which
 * cannot easily go async without changing every call site.
 *
 * Reads ONLY from the in-memory cache. If the cache hasn't been
 * primed for this companyId, returns null and the caller should
 * fall back to its hardcoded default. Call prewarmCompanyTemplates
 * (or the useTemplateOverrides hook) on mount to populate the cache.
 */
export function resolveTemplateSync(args: ResolveArgs): ResolvedTemplate | null {
  const def = TEMPLATE_REGISTRY.find((t) => t.key === args.key);
  if (!def) return null;

  let subject = def.defaultSubject ?? "";
  let body = def.defaultBody;
  let fromOverride = false;

  if (args.companyId) {
    const cached = overrideCache.get(args.companyId);
    if (cached) {
      const ovr = cached.get(args.key);
      if (ovr && ovr.isActive) {
        if (ovr.subject != null && ovr.subject !== "") subject = ovr.subject;
        if (ovr.body && ovr.body.trim() !== "") body = ovr.body;
        fromOverride = true;
      }
    }
  }

  const ctx = (args.ctx || {}) as Record<string, string | number | null | undefined>;
  return {
    subject: renderTemplate(subject, ctx),
    body: renderTemplate(body, ctx),
    fromOverride,
  };
}

/**
 * Fire-and-forget prewarm. Loads the company's overrides into the
 * in-memory cache so subsequent resolveTemplateSync calls return
 * customised wording. Returns a promise the caller can optionally
 * await to know when the cache is hot, but most call sites just
 * call it on mount and trust the next render to pick up the data.
 */
export function prewarmCompanyTemplates(companyId: string | null | undefined): Promise<void> {
  if (!companyId) return Promise.resolve();
  if (overrideCache.has(companyId)) return Promise.resolve();
  return loadCompanyOverrides(companyId).then(() => undefined);
}

/**
 * Save (or upsert) a per-company override for a single template. The
 * cache for the company is invalidated so the next resolveTemplate
 * call re-fetches.
 */
export interface SaveArgs {
  companyId: string;
  key: string;
  channel: MessageChannel;
  /** Email-only. Pass null for WhatsApp. */
  subject?: string | null;
  body: string;
  isActive?: boolean;
}

export async function saveOverride(args: SaveArgs): Promise<void> {
  if (!args.companyId) throw new Error("companyId required");
  if (args.channel === "email") {
    const { error } = await (supabase as any)
      .from("email_templates")
      .upsert({
        company_id: args.companyId,
        template_type: args.key,
        subject: args.subject ?? "",
        body: args.body,
        is_active: args.isActive !== false,
      }, { onConflict: "company_id,template_type" });
    if (error) throw error;
  } else {
    const { error } = await (supabase as any)
      .from("whatsapp_templates")
      .upsert({
        company_id: args.companyId,
        template_key: args.key,
        template_content: args.body,
        is_enabled: args.isActive !== false,
      }, { onConflict: "company_id,template_key" });
    if (error) throw error;
  }
  invalidateCompanyCache(args.companyId);
}

/** Remove the override so the renderer falls back to the default. */
export async function removeOverride(args: { companyId: string; key: string; channel: MessageChannel }): Promise<void> {
  if (args.channel === "email") {
    const { error } = await (supabase as any)
      .from("email_templates")
      .delete()
      .eq("company_id", args.companyId)
      .eq("template_type", args.key);
    if (error) throw error;
  } else {
    const { error } = await (supabase as any)
      .from("whatsapp_templates")
      .delete()
      .eq("company_id", args.companyId)
      .eq("template_key", args.key);
    if (error) throw error;
  }
  invalidateCompanyCache(args.companyId);
}
