/**
 * POST /api/client-tokens/request
 *
 * Repeat-customer "email me my orders" trigger. The client portal
 * /c/account flow is the canonical landing for clients between
 * orders, but the existing entry path required the operator to
 * mint and email a magic-link manually. This endpoint lets the
 * client request a fresh link themselves.
 *
 * Body: { company_slug: string, email: string }
 *
 * Public (no auth). Rate-limited per (company, email_lower) at the
 * DB-backed limiter (P2F-2). Always returns 200 for privacy --
 * never confirms whether an email is on file.
 *
 * [P1-22]
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { consumeApiKeyRateLimitDb } from "@/lib/apiKeyRateLimit";
import crypto from "node:crypto";

const MAGIC_LINK_TTL_DAYS = 14;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { company_slug, email } = (req.body || {}) as {
      company_slug?: string;
      email?: string;
    };

    if (!company_slug || !email) {
      return res.status(400).json({ error: "company_slug and email are required" });
    }

    const cleanEmail = email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: "Invalid email" });
    }

    const sb: any = getServiceSupabase();

    // Rate-limit per (company-slug + email) so a malicious caller
    // can't DOS a tenant's mail provider with magic-link spam to
    // arbitrary addresses. 3 requests/min/email is generous for the
    // legitimate "I lost my link" use case.
    const limitKey = crypto
      .createHash("sha256")
      .update(`magic-link:${company_slug}:${cleanEmail}`)
      .digest("hex");
    const rl = await consumeApiKeyRateLimitDb(sb, limitKey, { maxPerMinute: 3 });
    if (!rl.allowed) {
      // Always return 200 for privacy. The 429 path here would
      // confirm to a probe that the same email + slug pair has been
      // requested recently, leaking timing information.
      return res.status(200).json({ ok: true });
    }

    // Resolve the tenant.
    const { data: company } = await sb
      .from("companies")
      .select("id, slug, company_name, email")
      .eq("slug", company_slug)
      .maybeSingle();
    if (!company) {
      return res.status(200).json({ ok: true });
    }

    // Look up the client. Privacy: don't tell the requester whether
    // we found one. Just silently no-op if not.
    const { data: client } = await sb
      .from("clients")
      .select("id, client_name, email, user_id")
      .eq("company_id", company.id)
      .ilike("email", cleanEmail)
      .maybeSingle();
    if (!client) {
      return res.status(200).json({ ok: true });
    }

    // Mint a fresh client-account token. Reuses the same
    // mint_client_account_token RPC the existing magic-link flow
    // uses. The RPC handles per-company TTL and revocation per
    // companies.email_settings.revoke_old_links_on_new.
    const { data: tokenRow, error: tokenErr } = await sb.rpc(
      "mint_client_account_token",
      {
        p_company_id: company.id,
        p_email: cleanEmail,
        p_ttl_days: MAGIC_LINK_TTL_DAYS,
      }
    );
    if (tokenErr || !tokenRow) {
      console.warn("[client-tokens/request] mint failed:", tokenErr?.message);
      return res.status(200).json({ ok: true });
    }

    // Send the email through the tenant's existing emailService
    // pipeline. The existing client-magic-link route already builds
    // the branded HTML; reuse the same path by importing emailService
    // and the message template.
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
      `https://${process.env.VERCEL_URL || "cateringms.com"}`;
    const accountUrl = `${baseUrl}/c/account?t=${tokenRow}`;

    try {
      const { emailService } = await import("@/services/emailService");
      await (emailService as any).sendEmail({
        companyId: company.id,
        to: cleanEmail,
        subject: `Your ${company.company_name} account link`,
        body: `<p>Hi ${client.client_name || "there"},</p>
<p>Here's a fresh link to your ${company.company_name} client portal -- valid for ${MAGIC_LINK_TTL_DAYS} days.</p>
<p><a href="${accountUrl}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;text-decoration:none;border-radius:6px">Open my account</a></p>
<p style="color:#666;font-size:12px">If you didn't request this, ignore the email -- the link will expire on its own.</p>`,
      });
    } catch (e: any) {
      console.warn("[client-tokens/request] email send failed:", e?.message);
    }

    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("[client-tokens/request] crashed:", err);
    // Privacy: still return 200 on internal errors. Real failures
    // surface via outgoing_email_log + audit_logs server-side.
    return res.status(200).json({ ok: true });
  }
}
