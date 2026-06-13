/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/auth/provision-company
 *
 * Creates the company + links the owner's profile + seeds the default
 * region, server-side with the service role.
 *
 * Why server-side: the companies INSERT policy is
 *   FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() ...)
 * so the insert only works when the browser holds an AUTHENTICATED
 * session. But when email confirmation is enabled, supabase.auth.signUp()
 * returns NO session - the browser is still the anon role at signup
 * time, so the old client-side companyService.createCompany() insert hit
 * "new row violates row-level security policy for table companies" and
 * no new tenant could register. Doing it here with the service role
 * bypasses RLS and works whether or not email confirmation is on.
 *
 * Security (mirrors /api/emails/owner-welcome's trust model): the caller
 * passes the freshly-created userId + email. We confirm that userId maps
 * to a real auth user whose email matches the body before provisioning,
 * and we hard-bind owner_id to that userId. A forged POST can therefore
 * do nothing worse than attach a company to an account whose UUID *and*
 * email the caller already knows - it can't seize an arbitrary user or
 * escalate anyone's role. Idempotent: if the user already owns a
 * company we return it instead of creating a duplicate.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import { withApiLogging } from "@/lib/withApiLogging";

interface Body {
  userId?: string;
  email?: string;
  companyName?: string;
  slug?: string;
  currency?: string;
  phone?: string;
  ownerName?: string;
  timezone?: string;
}

// Mirror of companyService helpers (kept local so the route has no
// browser-client dependency).
function countryFromCurrency(currency: string | null | undefined): string {
  switch ((currency || "").toUpperCase()) {
    case "USD": return "US";
    case "GBP": return "GB";
    case "EUR": return "EU";
    case "AUD": return "AU";
    case "CAD": return "CA";
    case "ZAR":
    default: return "ZA";
  }
}

function buildDefaultRegionCode(slug: string | null | undefined): string {
  const base = (slug || "main").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "MAIN";
  // Math.random is fine here (collision-avoidance only, not security).
  const tail = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${base}-${tail}`.slice(0, 12);
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = (req.body || {}) as Body;
  const { userId, email, companyName, ownerName } = body;
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) {
    return res.status(400).json({ error: "Invalid user" });
  }
  if (!email || !companyName) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  let admin: ReturnType<typeof getServiceSupabase>;
  try {
    admin = getServiceSupabase();
  } catch (e) {
    console.error("[auth/provision-company] service supabase unavailable:", e);
    return res.status(500).json({ error: "Server not configured" });
  }

  // 1. Verify the userId maps to a real auth user whose email matches.
  const { data: authUserRes, error: authUserErr } = await (admin as any).auth.admin.getUserById(userId);
  if (authUserErr || !authUserRes?.user) {
    console.warn("[auth/provision-company] auth user lookup failed:", authUserErr);
    return res.status(403).json({ error: "User not found" });
  }
  const authEmail = (authUserRes.user.email || "").trim().toLowerCase();
  if (authEmail !== email.trim().toLowerCase()) {
    return res.status(403).json({ error: "User / email mismatch" });
  }

  // 2. Idempotency: if this owner already has a company, return it
  // (handles retries after a partial failure / double submit).
  const { data: existingCompany } = await admin
    .from("companies")
    .select("*")
    .eq("owner_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (existingCompany) {
    return res.status(200).json({ ok: true, company: existingCompany, reused: true });
  }

  // 3. Build the slug. Permanent once set (trg_companies_slug_immutable
  // blocks later changes), so derive it the same way the old client
  // path did.
  const slug = (body.slug || companyName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) {
    return res.status(400).json({ error: "Could not derive a company URL from the name" });
  }

  const currency = body.currency || "ZAR";
  const timezone = body.timezone || "Africa/Johannesburg";

  // 4. Insert the company (owner_id hard-bound to the verified userId).
  const { data: company, error: companyErr } = await admin
    .from("companies")
    .insert({
      company_name: companyName,
      slug,
      owner_id: userId,
      email,
      phone: body.phone || null,
      currency,
      timezone,
      subscription_status: "trial",
      trial_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      is_active: true,
    } as any)
    .select()
    .single();

  if (companyErr || !company) {
    const code = (companyErr as any)?.code;
    const msg = (companyErr?.message || "").toLowerCase();
    if (code === "23505" || msg.includes("duplicate key") || msg.includes("already exists")) {
      return res.status(409).json({
        error: `The company URL "${slug}" is already taken. Choose a different URL and try again.`,
      });
    }
    console.error("[auth/provision-company] company insert failed:", companyErr);
    return res.status(500).json({ error: companyErr?.message || "Failed to create company" });
  }

  // 5. Link the owner's profile to the company. The signup page waits
  // for the trigger-created profile before calling us, so this updates
  // an existing row; log (don't fail) if it somehow hasn't landed yet -
  // the owner can still be relinked on first login.
  const { data: linkedProfile, error: linkErr } = await admin
    .from("profiles")
    .update({
      company_id: company.id,
      role: "company_admin",
      active_role: "company_admin",
      full_name: ownerName || null,
      phone: body.phone || null,
    } as any)
    .eq("id", userId)
    .select("id")
    .maybeSingle();
  if (linkErr || !linkedProfile) {
    console.warn("[auth/provision-company] profile link incomplete:", linkErr);
  }

  // 6. Seed the default "Main kitchen" region (non-blocking).
  try {
    await admin.from("regions").insert({
      company_id: company.id,
      code: buildDefaultRegionCode(slug),
      name: "Main kitchen",
      country: countryFromCurrency(currency),
      currency,
      timezone,
      is_active: true,
    } as any);
  } catch (seedErr) {
    console.warn("[auth/provision-company] default region seed failed (non-blocking):", seedErr);
  }

  return res.status(201).json({
    ok: true,
    company,
    profileLinked: !!linkedProfile,
  });
}

export default withApiLogging(handler);
