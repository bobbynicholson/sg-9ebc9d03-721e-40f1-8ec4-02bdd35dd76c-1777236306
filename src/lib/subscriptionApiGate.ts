/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unpaid companies cannot change data through the API either.
 *
 * The middleware only guards page navigation (it skips /api/*), and the
 * database gate (migration 20261029110000_unpaid_company_write_gate) only
 * covers writes made with the signed-in user's session. API routes that
 * write with the service role bypass both, so withApiLogging calls this for
 * every write request (POST/PUT/PATCH/DELETE).
 *
 * Same rule as the middleware (hasSubscriptionAccess): an expired trial,
 * 'suspended' or 'cancelled' company is blocked. Exempt: super admins,
 * clients, requests without a signed-in user (webhooks, API keys, tokens,
 * cron), and the routes an owner needs to sign in and pay.
 *
 * Fails open: if the session or company cannot be read, the request goes
 * through, exactly like the middleware gate.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { hasSubscriptionAccess } from "@/lib/subscriptionAccess";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Routes that must keep working for a lapsed company (sign in, pay, platform). */
const EXEMPT_PREFIXES = [
  "/api/auth/",
  "/api/subscription/",
  "/api/webhooks/",
  "/api/public/",
  "/api/client-tokens/",
  "/api/cron/",
  "/api/platform/",
  "/api/admin/platform",
  "/api/integrations/",
  "/api/payments/",
  "/api/log",
];

export const SUBSCRIPTION_REQUIRED_MESSAGE =
  "Your company's plan has ended, so changes can't be saved. Ask the account owner to choose a plan under Subscription to restore access.";

export function isSubscriptionGatedRequest(method: string | undefined, url: string | undefined): boolean {
  if (!WRITE_METHODS.has(String(method || "").toUpperCase())) return false;
  const path = String(url || "").split("?")[0];
  if (!path.startsWith("/api/")) return false;
  return !EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/** Decide for a known role + company status. Pure, for tests and the gate. */
export function subscriptionAllowsWrite(args: {
  role: string | null | undefined;
  status: string | null | undefined;
  trialEndsAt: string | null | undefined;
  now?: number;
}): boolean {
  const role = String(args.role || "");
  if (role === "super_admin" || role === "client") return true;
  // Unknown status never blocks (fail open, like the middleware).
  if (!args.status) return true;
  return hasSubscriptionAccess(args.status, args.trialEndsAt, args.now);
}

// Short per-instance memory so a burst of saves doesn't repeat the lookups.
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; role: string | null; status: string | null; trialEndsAt: string | null } | null>();

/**
 * Returns true when the request was blocked (a 402 response is already
 * sent). Only call for requests where isSubscriptionGatedRequest is true.
 */
export async function blockIfCompanyUnpaid(req: NextApiRequest, res: NextApiResponse): Promise<boolean> {
  try {
    const { createPagesServerClient } = await import("@/lib/supabase/server");
    const ssr: any = createPagesServerClient({ req, res });
    // The session from the cookie, without a network round trip. Only used
    // to decide whether to BLOCK: the route handler still verifies the user
    // (getUser), so a forged cookie that dodges this check is rejected there.
    const { data } = await ssr.auth.getSession();
    const userId: string | undefined = data?.session?.user?.id;
    if (!userId) return false;

    let entry = cache.get(userId);
    if (entry === undefined || (entry && Date.now() - entry.at > CACHE_MS)) {
      const { getServiceSupabase } = await import("@/lib/supabase/service");
      const svc: any = getServiceSupabase();
      const { data: profile } = await svc
        .from("profiles")
        .select("role, active_role, company_id")
        .eq("id", userId)
        .maybeSingle();
      if (!profile?.company_id) return false;
      const { data: company } = await svc
        .from("companies")
        .select("subscription_status, trial_ends_at")
        .eq("id", profile.company_id)
        .maybeSingle();
      if (!company) return false;
      entry = {
        at: Date.now(),
        role: profile.role === "super_admin" ? "super_admin" : (profile.active_role || profile.role),
        status: company.subscription_status ?? null,
        trialEndsAt: company.trial_ends_at ?? null,
      };
      cache.set(userId, entry);
    }
    if (!entry || subscriptionAllowsWrite(entry)) return false;
    res.status(402).json({ error: SUBSCRIPTION_REQUIRED_MESSAGE, code: "SUBSCRIPTION_REQUIRED" });
    return true;
  } catch (error) {
    console.warn("[subscriptionApiGate] check failed (allowing request):", error instanceof Error ? error.message : error);
    return false;
  }
}
