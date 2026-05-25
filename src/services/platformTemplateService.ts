/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * platformTemplateService - the platform-side equivalent of
 * messageTemplateService, scoped to scope='platform' templates only
 * (subscription receipts, owner welcome, trial reminders, etc.).
 *
 * Reads:
 *   - Walks TEMPLATE_REGISTRY for scope='platform' entries
 *   - Merges in any global-default override rows from email_templates
 *     where company_id IS NULL. That's the tier the templateResolver
 *     already reads from when a tenant doesn't have its own override.
 *
 * Writes:
 *   - saveOverride / removeOverride route through /api/admin/platform/
 *     messaging-templates/{save,remove} so the company_id=NULL row is
 *     written with service-role credentials. RLS on email_templates
 *     blocks anon writes for NULL company_id (correctly - we don't
 *     want a tenant editing the global default).
 *
 * Why a separate service:
 *   - Tenant editor saves overrides scoped to one company_id. Platform
 *     edits target the global-default row that every tenant falls
 *     back to. Different write target, different auth gate.
 *   - Hiding scope='platform' from the tenant list (which the
 *     existing service does) leaves no place to surface them; this
 *     fills that gap for super_admin.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  TEMPLATE_REGISTRY,
  type TemplateDefinition,
  type MessageChannel,
} from "@/lib/messageTemplates/registry";

export interface PlatformMergedTemplate extends TemplateDefinition {
  /** True when a global-default override exists in email_templates. */
  isCustomised: boolean;
  /** Customised subject (email only) or null if uncustomised. */
  customSubject: string | null;
  /** Customised body or null if uncustomised. */
  customBody: string | null;
  /** is_active flag from the override row (defaults to true). */
  customIsActive: boolean;
}

/**
 * List every scope='platform' template with the current global-default
 * override (if any) layered on. Reads through the anon client; the
 * email_templates global rows are publicly readable so platform staff
 * can preview without escalating.
 */
export async function listPlatformTemplates(): Promise<PlatformMergedTemplate[]> {
  const platformDefs = TEMPLATE_REGISTRY.filter((d) => (d.scope ?? "tenant") === "platform");
  const keys = platformDefs.map((d) => d.key);
  if (keys.length === 0) return [];

  const overrideByKey = new Map<string, { subject: string | null; body: string; isActive: boolean }>();

  // Email overrides: global default tier = company_id IS NULL.
  try {
    const { data, error } = await (supabase as any)
      .from("email_templates")
      .select("template_type, subject, body, is_active")
      .is("company_id", null)
      .in("template_type", keys);
    if (error) console.error("[platformTemplateService] email_templates lookup failed:", error);
    for (const r of (data || []) as any[]) {
      if (!r.template_type) continue;
      overrideByKey.set(r.template_type, {
        subject: r.subject ?? null,
        body: r.body ?? "",
        isActive: r.is_active !== false,
      });
    }
  } catch (err) {
    console.warn("[platformTemplateService] email_templates read failed", err);
  }

  // No platform templates are WhatsApp today, but mirror the read so
  // future platform-scoped WhatsApp templates (e.g. tenant-billing
  // ping) light up automatically.
  try {
    const { data, error } = await (supabase as any)
      .from("whatsapp_templates")
      .select("template_key, template_content, is_enabled")
      .is("company_id", null)
      .in("template_key", keys);
    if (error) console.error("[platformTemplateService] whatsapp_templates lookup failed:", error);
    for (const r of (data || []) as any[]) {
      if (!r.template_key) continue;
      overrideByKey.set(r.template_key, {
        subject: null,
        body: r.template_content ?? "",
        isActive: r.is_enabled !== false,
      });
    }
  } catch (err) {
    console.warn("[platformTemplateService] whatsapp_templates read failed", err);
  }

  return platformDefs.map((def) => {
    const ovr = overrideByKey.get(def.key);
    return {
      ...def,
      isCustomised: !!ovr,
      customSubject: ovr?.subject ?? null,
      customBody: ovr?.body ?? null,
      customIsActive: ovr?.isActive ?? true,
    };
  });
}

export interface SavePlatformOverrideArgs {
  key: string;
  channel: MessageChannel;
  subject: string | null;
  body: string;
  isActive?: boolean;
}

export async function savePlatformOverride(args: SavePlatformOverrideArgs): Promise<void> {
  const resp = await fetch("/api/admin/platform/messaging-templates/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!resp.ok) {
    const json = await resp.json().catch(() => ({}));
    throw new Error(json?.error || `Save failed (HTTP ${resp.status})`);
  }
}

export async function removePlatformOverride(args: { key: string; channel: MessageChannel }): Promise<void> {
  const resp = await fetch("/api/admin/platform/messaging-templates/remove", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!resp.ok) {
    const json = await resp.json().catch(() => ({}));
    throw new Error(json?.error || `Reset failed (HTTP ${resp.status})`);
  }
}
