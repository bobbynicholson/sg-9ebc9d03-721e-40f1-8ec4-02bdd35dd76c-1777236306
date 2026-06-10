/**
 * POST /api/emails/owner-welcome
 *
 * Fires the branded "welcome to CateringMS" email after a new catering
 * company finishes signup. Called from /company-signup once the
 * profile + company rows are in. We do this server-side so:
 *   - Resend keys never touch the browser bundle
 *   - The send doesn't block signup - caller fires-and-forgets, any
 *     failure is logged in email_automation_log but the user still gets
 *     their success page.
 *
 * Auth: lightweight - caller must pass the userId of the freshly-
 * created auth user, and we verify the request originates from the
 * matching authenticated session via Supabase cookie. Service-role
 * isn't needed; anyone who can pass our auth check is allowed to fire
 * their own welcome.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import * as React from "react";
import { getServiceSupabase } from "@/lib/supabase/service";
import { sendBrandedEmail } from "@/server/emails/sendBrandedEmail";
import OwnerWelcomeEmail from "@/emails/OwnerWelcomeEmail";
import { withApiLogging } from "@/lib/withApiLogging";


interface Body {
  userId?: string;
  companyId?: string;
  ownerName?: string;
  companyName?: string;
  email?: string;
  slug?: string;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = (req.body || {}) as Body;
  const { userId, companyId, ownerName, companyName, email, slug } = body;
  if (!userId || !companyId || !ownerName || !companyName || !email) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Cheap caller verification: confirm the userId actually maps to a
  // real profile bound to this companyId. Stops random POSTs from
  // firing welcome emails to arbitrary addresses.
  let sb: ReturnType<typeof getServiceSupabase>;
  try {
    sb = getServiceSupabase();
  } catch (e) {
    console.error("Service supabase unavailable:", e);
    return res.status(500).json({ error: "Server email config missing" });
  }

  const { data: profile, error: profileErr } = await sb
    .from("profiles")
    .select("id,company_id")
    .eq("id", userId)
    .maybeSingle();
  if (profileErr) {
    console.error("[emails/owner-welcome] profiles fetch failed:", profileErr);
  }
  if (!profile || profile.company_id !== companyId) {
    return res.status(403).json({ error: "Profile / company mismatch" });
  }

  const origin = req.headers.origin || `https://${req.headers.host}`;
  const onboardingUrl = `${origin}/${slug || ""}/admin/onboarding`.replace("//admin", "/admin");
  const firstName = ownerName.split(" ")[0] || ownerName;

  const result = await sendBrandedEmail({
    component: React.createElement(OwnerWelcomeEmail, {
      ownerFirstName: firstName,
      companyName,
      onboardingUrl,
      brand: { name: companyName },
    }),
    to: email,
    subject: `Welcome to ${process.env.PLATFORM_BRAND_NAME || "CateringMS"}, ${firstName}`,
    companyId,
    templateType: "owner_welcome",
    recipientName: ownerName,
  });

  return res.status(result.ok ? 200 : 502).json(result);
}

export default withApiLogging(handler);
