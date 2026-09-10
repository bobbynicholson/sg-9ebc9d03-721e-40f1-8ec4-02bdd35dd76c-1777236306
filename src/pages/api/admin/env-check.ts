/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GET /api/admin/env-check  (super-admin only)
 *
 * Reports which platform env vars are PRESENT so an operator can confirm
 * payments + email + crons are configured, without ever exposing a
 * secret value. For each key we return presence (boolean) and a couple
 * of safe, non-reversible hints (length, 3-char prefix, test/live mode)
 * - never the bytes. Mirrors the diagnostic philosophy already used in
 * /api/test-email.
 *
 * Use this to answer "are the (test) keys actually set on this
 * deployment?" - hit it while signed in as super_admin.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@/lib/supabase/server";
import { withApiLogging } from "@/lib/withApiLogging";

function present(name: string) {
  const v = process.env[name];
  return {
    present: !!(v && String(v).trim()),
    length: v ? v.length : 0,
  };
}

function withPrefix(name: string) {
  const v = process.env[name] || "";
  return { ...present(name), prefix: v ? v.slice(0, 3) : null };
}

function stripeMode(name: string) {
  const v = process.env[name] || "";
  const mode = v.startsWith("sk_test_")
    ? "test"
    : v.startsWith("sk_live_")
      ? "live"
      : v
        ? "unknown"
        : "missing";
  return { present: !!v, mode };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Super-admin only.
  const ssr = createPagesServerClient({ req, res });
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return res.status(401).json({ error: "Sign in first" });
  const { data: profile } = await ssr
    .from("profiles")
    .select("role, active_role")
    .eq("id", user.id)
    .single();
  const role = (profile as any)?.active_role || (profile as any)?.role;
  if (role !== "super_admin") return res.status(403).json({ error: "Forbidden" });

  const report = {
    node_env: process.env.NODE_ENV || null,
    supabase: {
      NEXT_PUBLIC_SUPABASE_URL: present("NEXT_PUBLIC_SUPABASE_URL"),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: present("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      // any of the three names satisfies the service-role client
      service_role_any:
        present("SUPABASE_SERVICE_ROLE_KEY").present ||
        present("SUPABASE_SERVICE_KEY").present ||
        present("SUPABASE_SECRET_KEY").present,
    },
    email: {
      RESEND_API_KEY: { ...withPrefix("RESEND_API_KEY"), starts_with_re_: (process.env.RESEND_API_KEY || "").startsWith("re_") },
      PLATFORM_FROM_EMAIL: present("PLATFORM_FROM_EMAIL"), // optional - defaults to noreply@send.cateringms.com
      PLATFORM_BRAND_NAME: present("PLATFORM_BRAND_NAME"),
      RESEND_WEBHOOK_SECRET: present("RESEND_WEBHOOK_SECRET"),
      EMAIL_UNSUBSCRIBE_SECRET: present("EMAIL_UNSUBSCRIBE_SECRET"),
    },
    payments_tenant_legacy_fallback: {
      // Only used when a tenant has NOT configured their own gateway in
      // payment_gateway_credentials (sandbox vs live lives on that DB row's
      // is_test flag, not here).
      NEXT_PUBLIC_PAYFAST_MERCHANT_ID: present("NEXT_PUBLIC_PAYFAST_MERCHANT_ID"),
      NEXT_PUBLIC_PAYFAST_MERCHANT_KEY: present("NEXT_PUBLIC_PAYFAST_MERCHANT_KEY"),
      NEXT_PUBLIC_PAYFAST_PASSPHRASE: present("NEXT_PUBLIC_PAYFAST_PASSPHRASE"),
      NEXT_PUBLIC_PAYFAST_TEST_MODE: process.env.NEXT_PUBLIC_PAYFAST_TEST_MODE ?? null,
      PAYFAST_PASSPHRASE: present("PAYFAST_PASSPHRASE"),
      PAYFAST_ALLOWED_IPS: present("PAYFAST_ALLOWED_IPS"),
    },
    payments_platform_subscription: {
      // Used to charge tenants for the SaaS itself.
      PAYFAST_PLATFORM_MERCHANT_ID: present("PAYFAST_PLATFORM_MERCHANT_ID"),
      PAYFAST_PLATFORM_MERCHANT_KEY: present("PAYFAST_PLATFORM_MERCHANT_KEY"),
      PAYFAST_PLATFORM_PASSPHRASE: present("PAYFAST_PLATFORM_PASSPHRASE"),
      STRIPE_PLATFORM_SECRET_KEY: stripeMode("STRIPE_PLATFORM_SECRET_KEY"),
      STRIPE_SUBSCRIPTION_WEBHOOK_SECRET: present("STRIPE_SUBSCRIPTION_WEBHOOK_SECRET"),
    },
    cron_and_urls: {
      CRON_SECRET: present("CRON_SECRET"),
      NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? null,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? null,
    },
  };

  return res.status(200).json({ ok: true, report });
}

export default withApiLogging(handler);
