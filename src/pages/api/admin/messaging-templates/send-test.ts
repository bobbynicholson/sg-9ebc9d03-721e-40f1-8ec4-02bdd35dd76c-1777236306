/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /api/admin/messaging-templates/send-test
 *
 * Operator clicks "Send test" on a template row. Renders the template
 * using the variable examples from the registry and ships it to the
 * caller's own email (or WhatsApp number) so they can eyeball the
 * actual rendered output rather than just the in-page preview.
 *
 * POST body: { templateKey: string }
 *
 * Auth: caller must be authenticated and have a company_id. The send
 * is scoped to the caller's tenant (no cross-tenant tests).
 *
 * Channels:
 *   - email:    resolved through resolveEmailTemplate. Falls through to
 *               the registry default if there is no override row.
 *   - whatsapp: resolves through whatsapp_templates lookup + inline
 *               substitution against the registry default.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { emailService } from "@/services/emailService";
import { resolveEmailTemplate } from "@/services/email/templateResolver";
import { TEMPLATE_REGISTRY } from "@/lib/messageTemplates/registry";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { templateKey } = req.body || {};
    if (!templateKey || typeof templateKey !== "string") {
      return res.status(400).json({ error: "templateKey is required" });
    }

    const ssr = createPagesServerClient({ req, res });
    const { data: { user } } = await ssr.auth.getUser();
    if (!user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const { data: profile } = await ssr
      .from("profiles")
      .select("id, email, full_name, phone, phone_number, company_id, role, active_role")
      .eq("id", user.id)
      .maybeSingle();

    const profileRow = profile as any;
    const companyId = profileRow?.company_id as string | null;
    if (!companyId) {
      return res.status(400).json({ error: "Your account is not attached to a company" });
    }

    const def = TEMPLATE_REGISTRY.find((t) => t.key === templateKey);
    if (!def) {
      return res.status(404).json({ error: `Template ${templateKey} not registered` });
    }

    // Build a sample variable bag from the registry examples so the
    // rendered test reads naturally rather than littered with empty
    // tokens.
    const variables: Record<string, string> = {};
    for (const v of def.variables) variables[v.name] = v.example;

    const admin = getServiceSupabase();

    if (def.channel === "email") {
      const recipient = profileRow?.email || user.email;
      if (!recipient) {
        return res.status(400).json({ error: "No email on file for your account" });
      }

      const fallbackSubject = def.defaultSubject || `[Test] ${def.label}`;
      const resolved = await resolveEmailTemplate({
        companyId,
        templateType: templateKey,
        variables,
        fallback: { subject: fallbackSubject, bodyHtml: def.defaultBody },
        client: admin,
      });

      // Prefix the subject so the test stands out from real sends.
      const testSubject = `[TEST] ${resolved.subject}`;
      const testBody = `<p style="background:#fef3c7;border:1px solid #fcd34d;padding:8px 12px;border-radius:6px;font-size:13px;color:#78350f;margin:0 0 16px"><strong>Test send</strong> from /admin/messaging-templates. Variables filled with example data.</p>${escapeAndLinebreak(resolved.bodyHtml)}`;

      const ok = await (emailService as any).sendEmail({
        companyId,
        to: recipient,
        subject: testSubject,
        body: testBody,
        _client: admin,
      });

      if (!ok) {
        return res.status(500).json({
          error: "Send failed - check that email is configured in /admin/email-settings",
        });
      }
      return res.status(200).json({ success: true, channel: "email", to: recipient });
    }

    // WhatsApp: look up override row, substitute variables, then
    // send via whatsappIntegrationService to the caller's phone.
    const phone = profileRow?.phone || profileRow?.phone_number;
    if (!phone) {
      return res.status(400).json({
        error: "No WhatsApp number on file for your account - add one in your profile to send WhatsApp tests",
      });
    }

    let body = def.defaultBody;
    try {
      const { data: waRow } = await (admin as any)
        .from("whatsapp_templates")
        .select("template_content, is_enabled")
        .eq("company_id", companyId)
        .eq("template_key", templateKey)
        .eq("is_enabled", true)
        .maybeSingle();
      if (waRow && (waRow as any).template_content) {
        body = (waRow as any).template_content;
      }
    } catch (e) {
      console.warn("[send-test] whatsapp_templates lookup failed:", e);
    }
    for (const [k, v] of Object.entries(variables)) {
      body = body.split(`{{${k}}}`).join(v ?? "");
    }
    const testBody = `[TEST] ${body}`;

    const { whatsappIntegrationService } = await import("@/services/whatsappIntegrationService");
    await (whatsappIntegrationService as any).sendWhatsAppMessage(
      { to: phone, type: "text", text: { body: testBody } },
      { companyId },
    );
    return res.status(200).json({ success: true, channel: "whatsapp", to: phone });
  } catch (err: any) {
    console.error("[send-test] crashed:", err);
    return res.status(500).json({ error: err?.message || "Unknown error" });
  }
}

// Plain-text bodies become HTML for the test email so newlines render.
// Real sends store HTML in the registry defaults already for the email
// templates; this is purely a cosmetic shim for the test prefix banner.
function escapeAndLinebreak(input: string): string {
  if (input.trim().startsWith("<")) return input;
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .split("\n")
    .map((line) => `<p style="margin:0 0 8px">${line || "&nbsp;"}</p>`)
    .join("");
}
