/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/admin/platform/messaging-templates/save
 *
 * Super_admin only. Upserts a global-default override row in
 * email_templates / whatsapp_templates with company_id IS NULL.
 * Every tenant that hasn't saved their own override falls back to
 * this row via templateResolver.
 *
 * Body: { key, channel, subject?, body, isActive? }
 *
 * Auth: caller must have role='super_admin' (active_role honoured).
 * RLS on email_templates blocks anon writes for NULL company_id, so
 * we route through the service-role client.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { TEMPLATE_REGISTRY } from "@/lib/messageTemplates/registry";
import { withApiLogging } from "@/lib/withApiLogging";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";


async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) return res.status(401).json({ error: "Authentication required" });

    const { data: profile } = await ssr
      .from("profiles")
      .select("role, active_role")
      .eq("id", user.id)
      .maybeSingle();
    const role = (profile as any)?.active_role || (profile as any)?.role;
    if (role !== "super_admin") {
      return res.status(403).json({ error: "Super admin only" });
    }

    const { key, channel, subject, body, isActive } = req.body || {};
    if (!key || typeof key !== "string") {
      return res.status(400).json({ error: "templateKey is required" });
    }
    if (!body || typeof body !== "string") {
      return res.status(400).json({ error: "body is required" });
    }
    if (channel !== "email" && channel !== "whatsapp") {
      return res.status(400).json({ error: "channel must be email or whatsapp" });
    }
    // Email overrides need a non-empty subject: the resolver only applies
    // a row when BOTH subject and body are truthy, so an empty subject
    // saved "Customised" here would be silently skipped at send time and
    // the fallback would go out - the surface disagreeing with reality.
    if (channel === "email" && (!subject || typeof subject !== "string" || !subject.trim())) {
      return res.status(400).json({ error: "Subject is required for email templates" });
    }

    const def = TEMPLATE_REGISTRY.find((t) => t.key === key);
    if (!def) {
      return res.status(404).json({ error: `Template ${key} not in registry` });
    }
    if ((def.scope ?? "tenant") !== "platform") {
      return res.status(403).json({
        error: `${key} is a tenant-scoped template. Edit it from /admin/email-templates instead.`,
      });
    }
    if (def.channel !== channel) {
      return res.status(400).json({
        error: `${key} is a ${def.channel} template, not ${channel}.`,
      });
    }

    const admin = getServiceSupabase();
    const active = isActive !== false;

    if (channel === "email") {
      // company_id IS NULL has no UNIQUE constraint that maps to
      // onConflict, so do an explicit lookup -> update / insert.
      const { data: existing, error: lookupErr } = await (admin as any)
        .from("email_templates")
        .select("id")
        .is("company_id", null)
        .eq("template_type", key)
        .maybeSingle();
      if (lookupErr) throw lookupErr;

      if ((existing as any)?.id) {
        const { error: updErr } = await (admin as any)
          .from("email_templates")
          .update({
            subject: subject ?? "",
            body,
            is_active: active,
            updated_at: new Date().toISOString(),
          })
          .eq("id", (existing as any).id);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await (admin as any)
          .from("email_templates")
          .insert([{
            company_id: null,
            user_id: null,
            template_type: key,
            subject: subject ?? "",
            body,
            is_active: active,
          }]);
        if (insErr) throw insErr;
      }
    } else {
      const { data: existing, error: lookupErr } = await (admin as any)
        .from("whatsapp_templates")
        .select("id")
        .is("company_id", null)
        .eq("template_key", key)
        .maybeSingle();
      if (lookupErr) throw lookupErr;

      if ((existing as any)?.id) {
        const { error: updErr } = await (admin as any)
          .from("whatsapp_templates")
          .update({
            template_content: body,
            is_enabled: active,
            updated_at: new Date().toISOString(),
          })
          .eq("id", (existing as any).id);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await (admin as any)
          .from("whatsapp_templates")
          .insert([{
            company_id: null,
            template_key: key,
            template_content: body,
            is_enabled: active,
          }]);
        if (insErr) throw insErr;
      }
    }

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error("[platform-templates/save] crashed:", err);
    return res.status(500).json({ error: dbErrorMessage(err) || "Unexpected server error" });
  }
}

export default withApiLogging(handler);
