/**
 * POST /api/client-tokens/request
 *
 * Repeat-customer "email me my orders" trigger. The client portal
 * /c/account flow is the canonical landing for clients between
 * orders, but the existing entry path required the operator to
 * mint and email a magic-link manually. This endpoint lets the
 * client request a fresh link themselves.
 *
 * Body: { email: string, company_slug?: string }
 *
 * Public (no auth). Rate-limited per email at the DB-backed limiter.
 * Always returns 200 for privacy - never confirms whether an email
 * is on file.
 *
 * TIGHTEN I.122 (2026-06-03): company_slug is now OPTIONAL. The
 * /c/order recovery card used to require the client to type the
 * catering company URL ("the bit before /c/order"), which is
 * absurd UX - the client has no way to know that. When slug is
 * absent we look up every tenant that has this email on its
 * clients table and mint + email a fresh link for each match.
 * Most clients only deal with one caterer; rare multi-caterer
 * clients get one email per tenant so they pick the right one.
 *
 * [P1-22]
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { consumeApiKeyRateLimitDb } from "@/lib/apiKeyRateLimit";
import crypto from "node:crypto";
import { withApiLogging } from "@/lib/withApiLogging";


const MAGIC_LINK_TTL_DAYS = 14;

async function sendOneLink(opts: {
  sb: any;
  company: { id: string; slug: string | null; company_name: string | null };
  client: { client_name: string | null };
  cleanEmail: string;
  baseUrl: string;
}) {
  const { sb, company, client, cleanEmail, baseUrl } = opts;
  const { data: tokenRow, error: tokenErr } = await sb.rpc(
    "mint_client_account_token",
    {
      p_company_id: company.id,
      p_email: cleanEmail,
      p_ttl_days: MAGIC_LINK_TTL_DAYS,
    },
  );
  if (tokenErr || !tokenRow) {
    console.warn("[client-tokens/request] mint failed:", tokenErr?.message);
    return;
  }
  const slugSeg = company.slug ? `/${String(company.slug).trim().replace(/^\/+|\/+$/g, "")}` : "";
  const accountUrl = `${baseUrl}${slugSeg}/c/account?t=${tokenRow}`;
  try {
    const { emailService } = await import("@/services/emailService");
    await (emailService as any).sendEmail({
      companyId: company.id,
      to: cleanEmail,
      subject: `Your ${company.company_name || "catering"} account link`,
      body: `<p>Hi ${client.client_name || "there"},</p>
<p>Here's a fresh link to your ${company.company_name || ""} client portal - valid for ${MAGIC_LINK_TTL_DAYS} days.</p>
<p><a href="${accountUrl}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;text-decoration:none;border-radius:6px">Open my account</a></p>
<p style="color:#666;font-size:12px">If you didn't request this, ignore the email - the link will expire on its own.</p>`,
      bypassQuarantine: true,
      _client: sb,
    });
  } catch (e: any) {
    console.warn("[client-tokens/request] email send failed:", e?.message);
  }
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { company_slug, email } = (req.body || {}) as {
      company_slug?: string;
      email?: string;
    };

    if (!email) {
      return res.status(400).json({ error: "email is required" });
    }
    const cleanEmail = email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: "Invalid email" });
    }
    const cleanSlug = company_slug ? company_slug.toLowerCase().trim() : null;

    const sb: any = getServiceSupabase();

    // Rate-limit per email (regardless of slug) so a malicious caller
    // can't DOS a tenant's mail provider with magic-link spam to
    // arbitrary addresses. 3 requests/min/email is generous for the
    // legitimate "I lost my link" use case.
    const limitKey = crypto
      .createHash("sha256")
      .update(`magic-link:${cleanEmail}`)
      .digest("hex");
    const rl = await consumeApiKeyRateLimitDb(sb, limitKey, { maxPerMinute: 3 });
    if (!rl.allowed) {
      // Always return 200 for privacy.
      return res.status(200).json({ ok: true });
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
      `https://${process.env.VERCEL_URL || "cateringms.com"}`;

    // Find every tenant that has this email on its clients table.
    // When the caller supplied a slug, restrict to that tenant.
    let companyQuery = sb.from("companies").select("id, slug, company_name");
    if (cleanSlug) companyQuery = companyQuery.eq("slug", cleanSlug);
    const { data: companies } = await companyQuery;
    if (!companies || companies.length === 0) {
      return res.status(200).json({ ok: true });
    }

    let sent = 0;
    for (const company of companies) {
      const { data: client } = await sb
        .from("clients")
        .select("id, client_name, email")
        .eq("company_id", company.id)
        .ilike("email", cleanEmail)
        .maybeSingle();
      if (!client) continue;
      await sendOneLink({ sb, company, client, cleanEmail, baseUrl });
      sent += 1;
    }
    // We always return 200 regardless of sent count - the client
    // doesn't get to learn whether their email matched any tenant.
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    console.error("[client-tokens/request] crashed:", err);
    return res.status(200).json({ ok: true });
  }
}

export default withApiLogging(handler);
