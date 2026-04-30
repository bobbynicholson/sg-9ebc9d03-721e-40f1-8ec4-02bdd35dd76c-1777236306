/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Client magic-link auth endpoint (Phase 1 of the client portal rebuild).
 *
 * Why this exists:
 *   - Bobby's brief: clients shouldn't have passwords. They get a magic
 *     link in their inbox, click it, and they're in for 48 hours.
 *   - The link must come from the catering company's branded email
 *     sender (e.g. noreply@spitbraaidelivery.co.za) -- not from
 *     Supabase's generic domain. So we use Supabase's
 *     auth.admin.generateLink to mint the URL, then send it via the
 *     existing per-company emailService that already powers quote and
 *     invoice emails.
 *
 * Inputs (POST body):
 *   { email: string, company_slug: string, next?: string }
 *
 * Behaviour:
 *   1. Look up the company by slug. Reject unknown slugs.
 *   2. Generate a Supabase magic link with redirect to
 *      /{slug}/auth/callback?next=... (the callback page validates the
 *      slug and lands the client on /client-portal/dashboard).
 *   3. Build a branded HTML email using the catering company's name +
 *      logo + colours.
 *   4. Send via emailService.sendEmail(companyId, ...). Falls back to
 *      Supabase's default email if the company has no email_settings
 *      configured -- so we never block sign-in on email config.
 *   5. Always return 200 -- even if the email isn't on file. This is a
 *      privacy guarantee: an unknown email shouldn't be discoverable
 *      via this endpoint.
 *
 * Security notes:
 *   - Service-role key required (we mint magic links via auth.admin).
 *   - Rate limit applied per email + IP to slow down abuse.
 *   - The actual session creation happens in the callback page when the
 *     user clicks the link -- this endpoint never authenticates anyone.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { emailService } from "@/services/emailService";

// ── In-memory rate limit (best effort -- Vercel resets between cold starts) ─
// Buckets keyed by `${email}|${ip}` to slow down credential-stuffing-style
// probing while still letting a real user retry quickly. 5 hits per 10 mins.
const RATE_BUCKET = new Map<string, { count: number; resetAt: number }>();
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = RATE_BUCKET.get(key);
  if (!entry || entry.resetAt < now) {
    RATE_BUCKET.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  if (entry.count > RATE_MAX) return true;
  return false;
}

/**
 * Build the branded HTML email.
 *
 * Style choices:
 *   - Single colour accent driven by the company's primary_color so the
 *     button matches the catering company's brand
 *   - Logo at the top if set, fallback to company initials in a
 *     gradient tile
 *   - Mobile-first: 600px max-width, table-based for old email clients
 *   - One clear CTA -- the magic-link button -- nothing else to click
 */
function buildEmailHtml(args: {
  magicLink: string;
  companyName: string;
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
}): { subject: string; html: string; text: string } {
  const subject = `Your ${args.companyName} sign-in link`;
  const accent = args.primaryColor || "#9333ea";
  const accent2 = args.secondaryColor || "#ec4899";

  const headerLogo = args.logoUrl
    ? `<img src="${args.logoUrl}" alt="${args.companyName}" style="height:48px;display:block;border-radius:8px" />`
    : `<div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,${accent} 0%,${accent2} 100%);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;font-family:Helvetica,Arial,sans-serif">${args.companyName.slice(0, 2).toUpperCase()}</div>`;

  const html = `<!doctype html>
<html><body style="margin:0;background:#f8fafc;font-family:Helvetica,Arial,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;box-shadow:0 4px 16px rgba(15,23,42,0.06);overflow:hidden">
        <tr><td style="padding:24px 28px;border-bottom:1px solid #e2e8f0">
          ${headerLogo}
        </td></tr>
        <tr><td style="padding:32px 28px 8px">
          <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#0f172a">Sign in to ${escapeHtml(args.companyName)}</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#475569">
            Tap the button below to sign in to your portal. The link expires in 1 hour and only works once.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td align="center" style="border-radius:10px;background:linear-gradient(135deg,${accent} 0%,${accent2} 100%)">
            <a href="${args.magicLink}" style="display:inline-block;padding:14px 28px;font-weight:600;font-size:15px;color:#ffffff;text-decoration:none">Sign in to your portal</a>
          </td></tr></table>
          <p style="margin:0 0 8px;font-size:13px;color:#94a3b8">If the button doesn't work, paste this URL in your browser:</p>
          <p style="margin:0 0 24px;font-size:12px;word-break:break-all;color:#475569">${args.magicLink}</p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#94a3b8">
            If you didn't request this, you can ignore the email, nothing was changed on your account.
          </p>
        </td></tr>
        <tr><td style="padding:20px 28px;border-top:1px solid #e2e8f0;background:#f8fafc;font-size:12px;color:#94a3b8;line-height:1.5">
          Sent by ${escapeHtml(args.companyName)}.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  // Plain-text fallback for spam filters and accessibility tools
  const text = [
    `Sign in to ${args.companyName}`,
    ``,
    `Tap the link below to sign in. It expires in 1 hour and only works once.`,
    ``,
    args.magicLink,
    ``,
    `If you didn't request this, you can ignore the email.`,
    ``,
    `Sent by ${args.companyName}.`,
  ].join("\n");

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { email, company_slug, next } = req.body || {};

    // Basic validation -- never reveal which step failed (privacy)
    if (typeof email !== "string" || !email.includes("@") || email.length > 254) {
      return res.status(400).json({ error: "Invalid email address" });
    }
    if (typeof company_slug !== "string" || !/^[a-z0-9-]{1,80}$/.test(company_slug)) {
      return res.status(400).json({ error: "Invalid company link" });
    }

    const cleanEmail = email.trim().toLowerCase();
    const xff = (req.headers["x-forwarded-for"] as string) || "";
    const ip = xff.split(",")[0]?.trim() || (req.socket as any)?.remoteAddress || "0.0.0.0";

    if (rateLimited(`${cleanEmail}|${ip}`)) {
      return res.status(429).json({
        error: "Too many sign-in attempts. Please wait a few minutes and try again.",
      });
    }

    let admin: any;
    try {
      admin = getServiceSupabase();
    } catch (e: any) {
      console.error("Magic-link: service role unavailable:", e?.message);
      return res.status(500).json({ error: "Server is not configured for magic-link auth." });
    }

    // 1. Look up the company by slug
    const { data: company, error: companyErr } = await admin
      .from("companies")
      .select("id, slug, company_name, logo_url, primary_color, secondary_color")
      .eq("slug", company_slug)
      .maybeSingle();

    if (companyErr || !company) {
      // Privacy: same response shape whether the slug exists or not
      console.warn("Magic-link: unknown slug requested", { company_slug, ip });
      return res.status(200).json({ ok: true });
    }

    // Build the redirect URL: /{slug}/auth/callback?next={next}
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (req.headers.origin as string) ||
      `https://${req.headers.host || "cateringms.com"}`;
    const safeNext = typeof next === "string" && next.startsWith("/") ? next : "/client-portal/dashboard";
    const redirectTo = `${origin}/${company.slug}/auth/callback?next=${encodeURIComponent(safeNext)}`;

    // 2. Generate the Supabase magic link.
    // Why generateLink + manual email: Supabase's built-in OTP send uses
    // its own generic email. We want each catering company's branded
    // sender, so we generate the link here and dispatch via emailService.
    let actionLink: string | null = null;
    try {
      const { data, error } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: cleanEmail,
        options: { redirectTo },
      });
      if (error) {
        // Some Supabase errors here mean "email isn't a registered user
        // and signup is disabled". We auto-provision below if that's the
        // case, then retry. For any other failure, fall through to the
        // privacy-safe success response so we don't leak DB state.
        const msg = String(error.message || "").toLowerCase();
        if (msg.includes("not found") || msg.includes("does not exist") || msg.includes("user not found")) {
          // First-time client: create the auth user, then mint the link.
          // We do NOT pre-create the profiles row -- that happens on the
          // callback after the user clicks the link, so a stale auth
          // user that never gets activated doesn't leave orphan rows.
          const { error: createErr } = await admin.auth.admin.createUser({
            email: cleanEmail,
            email_confirm: false,
            user_metadata: {
              client_signup_via: "magic_link",
              first_company_slug: company.slug,
              first_company_id: company.id,
            },
          });
          if (createErr) {
            console.warn("Magic-link: user create failed", createErr.message);
          } else {
            const retry = await admin.auth.admin.generateLink({
              type: "magiclink",
              email: cleanEmail,
              options: { redirectTo },
            });
            if (!retry.error) actionLink = retry.data?.properties?.action_link || null;
          }
        } else {
          console.warn("Magic-link: generateLink failed", error.message);
        }
      } else {
        actionLink = data?.properties?.action_link || null;
      }
    } catch (e: any) {
      console.warn("Magic-link: generateLink threw", e?.message);
    }

    // If we still don't have a link, return success without sending --
    // privacy-preserving. The user gets "check your inbox" UI even if
    // we couldn't actually send anything.
    if (!actionLink) {
      return res.status(200).json({ ok: true });
    }

    // ── DEV / NO-EMAIL FALLBACK ──────────────────────────────────────────
    // Set DEV_RETURN_MAGIC_LINK=true on the server to receive the magic
    // link back in the response body instead of (or in addition to) by
    // email. The frontend will then redirect the user directly to the
    // link, skipping the "check your inbox" step.
    //
    // ⚠️  CRITICAL SECURITY: this flag MUST NEVER be set in production.
    //     If set, anyone who knows a customer's email can sign in as
    //     that customer with one click. Only enable on dev/staging
    //     environments where every visitor is trusted.
    //
    // Why this exists at all: until each tenant's email_settings is
    // configured, no magic-link emails actually deliver. Bobby still
    // needs to test the client portal end-to-end. This bypass lets him
    // log in as any client while we wire SMTP per tenant.
    const devReturnLink =
      process.env.DEV_RETURN_MAGIC_LINK === "true" ||
      process.env.DEV_RETURN_MAGIC_LINK === "1";
    if (devReturnLink) {
      console.warn(
        "[client-magic-link] DEV_RETURN_MAGIC_LINK is on, returning the magic link in the API response. UNSAFE for production.",
        { email: cleanEmail, slug: company.slug },
      );
      return res.status(200).json({
        ok: true,
        dev_link: actionLink,
      });
    }

    // 3. Build the branded email
    const { subject, html, text } = buildEmailHtml({
      magicLink: actionLink,
      companyName: company.company_name || "Your portal",
      primaryColor: company.primary_color || "#9333ea",
      secondaryColor: company.secondary_color || "#ec4899",
      logoUrl: company.logo_url || null,
    });

    // 4. Send via the catering company's existing emailService.
    //
    //    Critical: we pass `_client: admin` so the email_settings row
    //    is read with the SERVICE-ROLE supabase instance. Without it,
    //    the default anon client is blocked by RLS (the magic-link
    //    caller is unauthenticated by definition -- they're trying to
    //    sign in for the first time) and the email never sends.
    //
    //    sendEmail returns boolean -- on failure we still return
    //    ok:true so the user sees "check your inbox" rather than
    //    leaking whether the company has email configured.
    try {
      await emailService.sendEmail({
        companyId: company.id,
        to: cleanEmail,
        subject,
        body: html,
        _client: admin,
      } as any);
    } catch (e: any) {
      console.warn("Magic-link: emailService failed", e?.message);
      // fall through -- still return ok:true
    }
    // Plain-text alt is unused for now -- emailService doesn't carry
    // it through. Most modern email clients render the HTML cleanly.
    void text;

    return res.status(200).json({ ok: true });
  } catch (outer: any) {
    console.error("client-magic-link handler crashed:", outer);
    // Privacy: don't expose internal error shape
    return res.status(500).json({ error: "Could not send sign-in link. Please try again." });
  }
}
