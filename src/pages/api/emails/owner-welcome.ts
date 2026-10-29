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
 * Auth: the account's verified session or its one-time signup capability,
 * checked against the company's owner. The recipient always comes from
 * the profile. Knowing a user/company ID pair does not authorise a send.
 */
import type { NextApiRequest, NextApiResponse } from "next";
import * as React from "react";
import { getServiceSupabase } from "@/lib/supabase/service";
import { createPagesServerClient } from "@/lib/supabase/server";
import { companyProvisionProofMatches } from "@/lib/companyProvisionProof";
import { sendBrandedEmail } from "@/server/emails/sendBrandedEmail";
import { resolveEmailTemplate } from "@/services/email/templateResolver";
import { emailService } from "@/services/emailService";
import OwnerWelcomeEmail from "@/emails/OwnerWelcomeEmail";
import { withApiLogging } from "@/lib/withApiLogging";


interface Body {
  userId?: string;
  companyId?: string;
  ownerName?: string;
  companyName?: string;
  email?: string;
  slug?: string;
  provisionToken?: string;
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

  const ssr = createPagesServerClient({ req, res });
  let caller = (await ssr.auth.getUser()).data.user;
  const bearer = String(req.headers.authorization || "").match(/^Bearer (.+)$/i)?.[1];
  if (!caller && bearer) caller = (await sb.auth.getUser(bearer)).data.user;
  if (caller && caller.id !== userId) return res.status(403).json({ error: "Account access denied" });
  const { data: account } = await sb.auth.admin.getUserById(userId);
  const signupProof = account?.user && companyProvisionProofMatches(account.user, body.provisionToken, Date.now(), "owner_welcome_token_hash");
  if (caller?.id !== userId && !signupProof) return res.status(401).json({ error: "Sign in to send your welcome email" });
  const { data: company } = await sb.from("companies").select("id, owner_id")
    .eq("id", companyId).maybeSingle();
  if (!company || company.owner_id !== userId) return res.status(403).json({ error: "Company access denied" });
  async function consumeWelcomeProof() {
    if (account?.user) await sb.auth.admin.updateUserById(userId!, {
      user_metadata: { ...account.user.user_metadata, owner_welcome_token_hash: null },
    });
  }

  const { data: profile, error: profileErr } = await sb
    .from("profiles")
    .select("id,company_id,email")
    .eq("id", userId)
    .maybeSingle();
  if (profileErr) {
    console.error("[emails/owner-welcome] profiles fetch failed:", profileErr);
  }
  if (!profile || profile.company_id !== companyId) {
    return res.status(403).json({ error: "Profile / company mismatch" });
  }

  // Send ONLY to the verified profile's own email, never to the
  // address in the request body. The userId/companyId check above
  // proves the pair is internally consistent but says nothing about
  // who `body.email` belongs to - trusting it would turn this into an
  // open relay that mails a branded welcome (attacker-controlled
  // company name / onboarding link) to any address. Bind the recipient
  // to the account we just authenticated instead.
  const recipient = (profile as { email?: string | null }).email;
  if (!recipient) {
    return res.status(422).json({ error: "Profile has no email on file" });
  }
  if (email && email.trim().toLowerCase() !== recipient.trim().toLowerCase()) {
    console.warn(
      "[emails/owner-welcome] body email differs from profile email; using profile email",
    );
  }

  const origin = req.headers.origin || `https://${req.headers.host}`;
  const onboardingUrl = `${origin}/${slug || ""}/admin/onboarding`.replace("//admin", "/admin");
  const firstName = ownerName.split(" ")[0] || ownerName;

  // Honour the platform "Owner welcome" template when a super_admin has
  // customised it in /admin/platform/messaging-templates. Before this,
  // edits saved fine but the real signup email was always the hardcoded
  // React component - edit-and-ignore. The component stays the default
  // (source === "fallback") because its layout is richer than plain text.
  try {
    const resolved = await resolveEmailTemplate({
      companyId,
      templateType: "owner_welcome",
      variables: {
        first_name: firstName,
        owner_name: ownerName,
        company_name: companyName,
        portal_link: onboardingUrl,
        link_expiry: "",
        from_name: process.env.PLATFORM_BRAND_NAME || "CateringMS",
      },
      fallback: { subject: "", bodyHtml: "" },
      client: sb,
    });
    if (resolved.source === "db" && resolved.subject && resolved.bodyHtml) {
      const ok = await emailService.sendEmail({
        companyId,
        to: recipient,
        subject: resolved.subject,
        body: resolved.bodyHtml,
        allowPlatformFallback: true,
        legalAudience: "platform",
        _client: sb,
      } as any);
      if (ok) await consumeWelcomeProof();
      return res.status(ok ? 200 : 502).json({ ok, via: "template" });
    }
  } catch (e) {
    console.warn("[emails/owner-welcome] template resolve failed, using component:", e);
  }

  const result = await sendBrandedEmail({
    component: React.createElement(OwnerWelcomeEmail, {
      ownerFirstName: firstName,
      companyName,
      onboardingUrl,
      brand: { name: companyName },
    }),
    to: recipient,
    subject: `Welcome to ${process.env.PLATFORM_BRAND_NAME || "CateringMS"}, ${firstName}`,
    companyId,
    templateType: "owner_welcome",
    recipientName: ownerName,
    legalAudience: "platform",
  });

  if (result.ok) await consumeWelcomeProof();
  return res.status(result.ok ? 200 : 502).json(result);
}

export default withApiLogging(handler);
