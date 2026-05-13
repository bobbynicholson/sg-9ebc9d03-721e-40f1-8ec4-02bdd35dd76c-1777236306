/* eslint-disable @typescript-eslint/no-explicit-any */
import type { NextApiRequest, NextApiResponse } from "next";
import { getServiceSupabase } from "@/lib/supabase/service";
import {
  applyCorsHeaders,
  checkAndIncrementRateLimit,
  escapeHtml,
  getClientIp,
  hashIp,
  isUuid,
  mapPayloadToLead,
  validateSubmission,
  verifyTurnstile,
} from "@/lib/embedFormApi";
import { notifyAdminOfEmbedLead } from "@/lib/embed/notifyAdminOfEmbedLead";

/**
 * POST /api/public/embed/[token]/submit
 *
 * Public, unauthenticated. Hardened with: honeypot, Turnstile, IP-hash
 * rate limit, server-side validation, schema-mapped lead insert. Always
 * returns 200 for spam classes (honeypot, soft-fail challenge) so bots
 * can't probe for signal.
 */

const MAX_BODY_BYTES = 64 * 1024; // 64 KB
const MAX_PAYLOAD_KEYS = 200;

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "64kb",
    },
  },
};

function safeJson(value: any): any {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  applyCorsHeaders(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const token = String(req.query.token || "");
  if (!isUuid(token)) {
    return res.status(404).json({ ok: false, message: "Not found" });
  }

  // Body shape
  const body = (req.body || {}) as Record<string, any>;
  const formSlug =
    typeof body.formSlug === "string" ? body.formSlug.slice(0, 200) : null;
  const payload =
    body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
      ? (body.payload as Record<string, any>)
      : null;
  const turnstileToken =
    typeof body.turnstileToken === "string" ? body.turnstileToken : "";
  const honeypot = typeof body.honeypot === "string" ? body.honeypot : "";
  const referrer =
    typeof body.referrer === "string" ? body.referrer.slice(0, 1000) : null;

  // Rough size guard in case the body parser limit is overridden upstream.
  try {
    const approxBytes = JSON.stringify(body || {}).length;
    if (approxBytes > MAX_BODY_BYTES) {
      return res.status(413).json({ ok: false, message: "Payload too large" });
    }
  } catch {
    return res.status(400).json({ ok: false, message: "Invalid JSON body" });
  }

  if (!payload) {
    return res
      .status(400)
      .json({ ok: false, message: "Missing or invalid payload" });
  }
  if (Object.keys(payload).length > MAX_PAYLOAD_KEYS) {
    return res.status(400).json({ ok: false, message: "Too many fields" });
  }

  // 1) Honeypot -- silent success. Bots treat this as a win and stop hammering.
  if (honeypot && honeypot.trim().length > 0) {
    return res.status(200).json({ ok: true });
  }

  const supabase = getServiceSupabase();
  const ip = getClientIp(req as any);
  const ipHash = hashIp(ip);
  const userAgent =
    typeof req.headers["user-agent"] === "string"
      ? (req.headers["user-agent"] as string).slice(0, 500)
      : null;

  // 2) Turnstile -- soft-fail when secret unset (dev convenience).
  let turnstileScore: number | null = null;
  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  if (turnstileSecret) {
    const result = await verifyTurnstile(turnstileToken, turnstileSecret, ip);
    if (!result.ok) {
      return res.status(200).json({
        ok: false,
        message: "Challenge failed, please refresh and try again",
      });
    }
    if (typeof result.score === "number") {
      turnstileScore = result.score;
    }
  } else {
    console.warn(
      "[embed/submit] TURNSTILE_SECRET_KEY not set, skipping challenge verification"
    );
  }

  // 3) Rate-limit by token + ip-hash bucket
  const rl = await checkAndIncrementRateLimit(token, ipHash, supabase, {
    limit: 30,
    bucket: "hour",
  });
  if (!rl.allowed) {
    return res.status(429).json({
      ok: false,
      message: "Too many submissions, try again later",
    });
  }

  // 4) Resolve form (token -> company, slug -> form config)
  const { data: company } = await (supabase as any)
    .from("companies")
    .select(
      "id, company_name, owner_id, is_active, deleted_at, embed_token, auto_reply_to_embed_submissions"
    )
    .eq("embed_token", token)
    .maybeSingle();

  if (!company || company.is_active === false || company.deleted_at) {
    return res.status(404).json({ ok: false, message: "Not found" });
  }

  // Slug strict mode: when the snippet specified a slug we MUST match it
  // exactly. The previous behaviour silently fell back to the first form.
  let formQuery = (supabase as any)
    .from("embed_form_configs")
    .select(
      "id, slug, name, fields, success_message, redirect_url, is_active, region_id, auto_reply_enabled, notify_admin_email"
    )
    .eq("company_id", company.id)
    .eq("is_active", true)
    .is("deleted_at", null);
  if (formSlug) formQuery = formQuery.eq("slug", formSlug);
  formQuery = formQuery.order("created_at", { ascending: true }).limit(1);

  const { data: forms } = await formQuery;
  const form = forms && forms[0];
  if (!form) {
    return res.status(404).json({ ok: false, message: "Not found" });
  }

  const fields = (form.fields || []) as any[];

  // 5) Validate payload against the field config
  const validation = validateSubmission(fields, payload);
  if (!validation.ok) {
    return res.status(400).json({ ok: false, errors: validation.errors });
  }

  // 6) Map and insert the lead
  const mapped = mapPayloadToLead(fields, payload);

  // Flow audit Leg B P0-10: previously a form that omitted an email
  // field would still insert a lead with email='no-reply@embed.local'.
  // That poisoned the lead-source funnel, broke conversion-to-order
  // (convertQuoteToOrder needs a real email), and made it impossible
  // for the operator to reply. Reject the submission now -- if a form
  // designer doesn't include an email field, the form isn't usable
  // for lead capture and the operator should know.
  const submittedEmail =
    (mapped.email || mapped.client_email || "").toString().trim();
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submittedEmail);
  if (!emailLooksValid) {
    return res.status(400).json({
      ok: false,
      message: "An email address is required so the team can reply.",
      errors: { email: "Please enter a valid email address" },
    });
  }
  const contactName =
    mapped.contact_name || mapped.client_name || "Embedded form enquiry";
  const contactEmail = submittedEmail;

  const leadInsert: Record<string, any> = {
    company_id: company.id,
    user_id: company.owner_id || null,
    // region_id propagation: the form may be branch-scoped on
    // embed_form_configs.region_id. Carry it onto the lead so the
    // multi-branch routing + region-manager notification chain fires
    // correctly. Null is fine for single-branch tenants.
    region_id: form.region_id || null,
    contact_name: contactName,
    email: contactEmail,
    client_name: mapped.client_name || mapped.contact_name || null,
    client_email: mapped.client_email || mapped.email || null,
    client_phone: mapped.client_phone || null,
    phone: mapped.phone || null,
    event_date: mapped.event_date || null,
    event_type: mapped.event_type || null,
    guest_count: mapped.guest_count ?? null,
    venue_address: mapped.venue_address || null,
    notes: mapped.notes || null,
    budget: mapped.budget ?? null,
    source: "embed",
    status: "new",
  };

  const { data: leadRow, error: leadErr } = await (supabase as any)
    .from("leads")
    .insert([leadInsert])
    .select("id")
    .single();

  if (leadErr || !leadRow) {
    // Log only the safe parts of the error -- avoid PII leaking into
    // Vercel logs from the original payload.
    console.error("[embed/submit] lead insert failed", {
      code: (leadErr as any)?.code,
      message: (leadErr as any)?.message,
    });
    return res
      .status(500)
      .json({ ok: false, message: "Could not save your enquiry, please try again" });
  }

  // 7) Insert the submission row -- raw payload + meta for audit/replay
  const submissionInsert: Record<string, any> = {
    company_id: company.id,
    embed_form_id: form.id,
    lead_id: leadRow.id,
    payload: safeJson(payload),
    ip_hash: ipHash,
    user_agent: userAgent,
    referrer,
    turnstile_score: turnstileScore,
  };

  const { error: subErr } = await (supabase as any)
    .from("embed_form_submissions")
    .insert([submissionInsert]);

  if (subErr) {
    // Lead was already saved -- log and continue. The customer is more
    // important than the audit row.
    console.warn("[embed/submit] submission audit insert failed", subErr);
  }

  // submissions_count + last_submission_at are bumped by the
  // trg_embed_form_submissions_after_insert trigger on embed_form_submissions
  // (see migration 20260428120000_embed_forms.sql).

  // 8) Admin notification chain (in-portal + email + WhatsApp + region
  //    manager). Replaces the old single-row notifications insert that
  //    silently dropped the email and WhatsApp legs of the fan-out.
  //    Per-form `notify_admin_email` lets the tenant turn the email
  //    leg off for noisy forms (newsletter signups etc.).
  const appOrigin =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.NEXT_PUBLIC_VERCEL_URL
      ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
      : "");
  void notifyAdminOfEmbedLead(supabase, {
    companyId: company.id,
    ownerUserId: company.owner_id || null,
    regionId: form.region_id || null,
    leadId: leadRow.id,
    leadInsert,
    formName: form.name || null,
    formId: form.id,
    formNotifyAdminEmail: form.notify_admin_email !== false, // default true
    appOrigin,
  });

  // 9) Optional auto-reply to client. Per-form `auto_reply_enabled`
  //    overrides the company-wide `auto_reply_to_embed_submissions`
  //    when set; null falls back to the company flag. Visitor's name
  //    is HTML-escaped before interpolation -- emailService sends as
  //    html: by default, and the auditors flagged this as a stored-
  //    XSS amplifier abusing the tenant's own SPF/DKIM domain.
  const autoReplyResolved =
    typeof form.auto_reply_enabled === "boolean"
      ? form.auto_reply_enabled
      : company.auto_reply_to_embed_submissions === true;
  if (autoReplyResolved && (mapped.client_email || mapped.email)) {
    void (async () => {
      try {
        const { emailService } = await import("@/services/emailService");
        const safeName = escapeHtml(contactName);
        const safeCompany = escapeHtml(company.company_name);
        await (emailService as any).sendEmail({
          companyId: company.id,
          to: mapped.client_email || mapped.email,
          subject: `Thank you for your enquiry, ${contactName}`,
          body:
            `Hi ${safeName},\n\n` +
            `Thanks for your enquiry with ${safeCompany}. We've received your details and will be in touch shortly.\n\n` +
            `-- ${safeCompany}`,
          variables: {
            clientName: safeName,
            companyName: safeCompany,
          },
          _client: supabase,
        });
      } catch (err) {
        console.warn("[embed/submit] auto-reply failed", err);
      }
    })();
  }

  return res.status(200).json({
    ok: true,
    leadId: leadRow.id,
    redirectUrl: form.redirect_url || null,
    message:
      form.success_message || "Thanks, we'll be in touch shortly.",
  });
}
