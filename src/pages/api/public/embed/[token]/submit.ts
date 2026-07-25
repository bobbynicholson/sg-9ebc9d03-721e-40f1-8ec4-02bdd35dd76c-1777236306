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
import { withApiLogging } from "@/lib/withApiLogging";
import { getEventCapacityForDate } from "@/lib/eventCapacity";
import { normalizeEmbedSubmitRequest } from "@/lib/embed/normalizeSubmitRequest";
import {
  buildRequestedCatalogueItems,
  EMBED_EQUIPMENT_FIELD_ID,
  EMBED_MENU_FIELD_ID,
  EMBED_REQUEST_TYPE_FIELD_ID,
  fieldsForRequestType,
  selectedIds,
  splitRequestedItems,
  type RequestedCatalogueItem,
} from "@/lib/embed/catalogueSelection";
import { geocodeAddressServer } from "@/lib/geo/geocodeServer";


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

async function createPrivateDraftQuote(
  supabase: any,
  company: any,
  regionId: string,
  leadId: string,
  lead: Record<string, any>,
  requestedItems: RequestedCatalogueItem[],
): Promise<string | null> {
  if (requestedItems.length === 0) return null;

  const { menuItems, equipmentItems } = splitRequestedItems(requestedItems);
  const lineTotal = requestedItems.reduce(
    (sum, item) => sum + (Number(item.line_total) || 0),
    0,
  );

  const { data: region } = await supabase
    .from("regions")
    .select("vat_rate, vat_registered, deposit_percent")
    .eq("id", regionId)
    .maybeSingle();
  const rawCompanyVat = Number(company.vat_rate);
  const companyVatRate = Number.isFinite(rawCompanyVat)
    ? (rawCompanyVat > 1 ? rawCompanyVat / 100 : rawCompanyVat)
    : 0.15;
  const vatRegistered =
    typeof region?.vat_registered === "boolean"
      ? region.vat_registered
      : company.vat_registered === true;
  const vatRate = vatRegistered
    ? Number(region?.vat_rate ?? companyVatRate) || 0
    : 0;
  const pricingIncludesVat = company.pricing_includes_vat === true;

  let subtotal: number;
  let tax: number;
  let total: number;
  if (pricingIncludesVat) {
    total = Number(lineTotal.toFixed(2));
    subtotal = vatRate > 0
      ? Number((total / (1 + vatRate)).toFixed(2))
      : total;
    tax = Number((total - subtotal).toFixed(2));
  } else {
    subtotal = Number(lineTotal.toFixed(2));
    tax = Number((subtotal * vatRate).toFixed(2));
    total = Number((subtotal + tax).toFixed(2));
  }

  const { data: quoteNumber, error: numberError } = await supabase.rpc(
    "consume_next_document_number",
    { p_company_id: company.id, p_document_type: "quote" },
  );
  if (numberError || !quoteNumber) {
    console.warn("[embed/submit] draft quote numbering failed", {
      code: numberError?.code,
      message: numberError?.message,
    });
    return null;
  }

  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 30);
  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .insert([{
      company_id: company.id,
      user_id: company.owner_id || null,
      prepared_by: company.owner_id || null,
      region_id: regionId,
      lead_id: leadId,
      quote_number: quoteNumber,
      quote_name: lead.event_type || "Website quote request",
      client_name: lead.client_name || lead.contact_name || "Website enquiry",
      contact_name: lead.contact_name || null,
      client_email: lead.client_email || lead.email,
      client_phone: lead.client_phone || lead.phone || null,
      event_type: lead.event_type || null,
      event_date: lead.event_date || null,
      guest_count: lead.guest_count ?? null,
      venue_address: lead.venue_address || null,
      venue_lat: lead.venue_lat ?? null,
      venue_lng: lead.venue_lng ?? null,
      menu_items: menuItems,
      equipment_items: equipmentItems,
      subtotal,
      tax_amount: tax,
      tax,
      total_amount: total,
      total,
      discount_amount: 0,
      delivery_fee: 0,
      deposit_percentage:
        Number(region?.deposit_percent ?? company.deposit_percent) || 30,
      status: "draft",
      valid_until: validUntil.toISOString().slice(0, 10),
      source: "embed",
      notes:
        "Private draft created from website selections. Review portions, equipment quantities, delivery and availability before sending.",
    }])
    .select("id")
    .single();
  if (quoteError || !quote) {
    console.warn("[embed/submit] private draft quote create failed", {
      code: quoteError?.code,
      message: quoteError?.message,
    });
    return null;
  }
  return quote.id as string;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
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
  // Accept the canonical camelCase request shape plus the snake_case /
  // short aliases shipped by older loader versions. This keeps existing
  // snippets working while a new static loader rolls through CDN caches.
  const {
    formSlug,
    turnstileToken,
    honeypot,
    referrer,
  } = normalizeEmbedSubmitRequest(body);
  const payload =
    body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
      ? (body.payload as Record<string, any>)
      : null;

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

  // 1) Honeypot - silent success. Bots treat this as a win and stop hammering.
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

  // 2) Turnstile - soft-fail when secret unset (dev convenience).
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
  const { data: company, error: companyErr } = await (supabase as any)
    .from("companies")
    .select(
      "id, company_name, owner_id, is_active, deleted_at, embed_token, auto_reply_to_embed_submissions, pricing_includes_vat, vat_rate, vat_registered, deposit_percent"
    )
    .eq("embed_token", token)
    .maybeSingle();
  if (companyErr) {
    console.error("[public/embed/[token]/submit] companies fetch failed:", companyErr);
  }

  if (!company || company.is_active === false || company.deleted_at) {
    return res.status(404).json({ ok: false, message: "Not found" });
  }

  // Slug strict mode: when the snippet specified a slug we MUST match it
  // exactly. The previous behaviour silently fell back to the first form.
  let formQuery = (supabase as any)
    .from("embed_form_configs")
    .select(
      "id, slug, name, template_id, fields, success_message, redirect_url, is_active, region_id, auto_reply_enabled, notify_admin_email"
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
  const requestType = String(payload[EMBED_REQUEST_TYPE_FIELD_ID] || "");
  if (requestType && requestType !== "enquiry" && requestType !== "quote") {
    return res.status(400).json({
      ok: false,
      message: "Choose either a quick enquiry or a quote request.",
    });
  }

  // 5) Validate payload against the field config
  // Pricing forms historically store tier as required. Quick enquiry hides
  // that quote-only control, so it must also be excluded server-side or the
  // visitor sees an impossible "Menu tier is required" error.
  const validationFields = fieldsForRequestType(fields, requestType);
  const validation = validateSubmission(validationFields, payload);
  if (!validation.ok) {
    return res.status(400).json({ ok: false, errors: validation.errors });
  }

  // 6) Map and insert the lead
  const mapped = mapPayloadToLead(fields, payload);

  // Flow audit Leg B P0-10: previously a form that omitted an email
  // field would still insert a lead with email='no-reply@embed.local'.
  // That poisoned the lead-source funnel, broke conversion-to-order
  // (convertQuoteToOrder needs a real email), and made it impossible
  // for the operator to reply. Reject the submission now - if a form
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

  // leads.region_id is NOT NULL since migration 20260521110000. The
  // form may be branch-scoped via embed_form_configs.region_id; if
  // not, fall back to the company's oldest active region so the
  // insert satisfies the constraint. The form designer comment that
  // said "Null is fine for single-branch tenants" was written
  // pre-NOT-NULL and is no longer accurate.
  let resolvedFormRegionId: string | null = (form.region_id as string | null) ?? null;
  if (!resolvedFormRegionId) {
    const { data: defaultRegion } = await (supabase as any)
      .from("regions")
      .select("id")
      .eq("company_id", company.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    resolvedFormRegionId = (defaultRegion as { id?: string } | null)?.id ?? null;
  }
  if (!resolvedFormRegionId) {
    // Hard-fail with a clear message rather than a NOT NULL error.
    // A tenant with zero regions is a legacy / mis-onboarded account
    // and the operator needs to fix it in Settings -> Regions before
    // public lead capture can land.
    console.error("[embed/submit] no region available for company", company.id);
    return res.status(503).json({
      ok: false,
      message: "Form is not currently accepting submissions. Please contact us directly.",
    });
  }

  // Public forms cannot safely expose addresses from other clients. Resolve
  // the visitor's own typed venue instead and persist its map point so
  // dispatch/delivery calculations do not inherit a text-only address.
  const venuePoint = mapped.venue_address
    ? await geocodeAddressServer(mapped.venue_address, { country: "za" })
    : null;

  // Resolve visitor choices from the tenant catalogue. Only the ids cross the
  // public boundary; names, prices, package mode and totals come from fresh
  // database rows. This prevents a forged payload from creating a discounted
  // or cross-tenant quote.
  let requestedCatalogueItems: RequestedCatalogueItem[] = [];
  const wantsDraftQuote = requestType === "quote" || requestType === "";
  if (
    wantsDraftQuote
    && ["detailed-multi-step", "pricing-calculator"].includes(String(form.template_id))
  ) {
    const menuIds = selectedIds(payload[EMBED_MENU_FIELD_ID]);
    const equipmentIds = selectedIds(payload[EMBED_EQUIPMENT_FIELD_ID]);
    const [{ data: selectedMenu }, { data: selectedEquipment }] = await Promise.all([
      menuIds.length > 0
        ? (supabase as any)
            .from("menu_items")
            .select(
              "id, item_name, base_price, base_servings, category, description, dietary_tags, sold_as_package",
            )
            .eq("company_id", company.id)
            .is("deleted_at", null)
            .or("is_available.is.null,is_available.eq.true")
            .in("id", menuIds)
        : Promise.resolve({ data: [] }),
      equipmentIds.length > 0
        ? (supabase as any)
            .from("equipment")
            .select(
              "id, name, rental_price, category, description, available_quantity",
            )
            .eq("company_id", company.id)
            .is("deleted_at", null)
            .or("is_available.is.null,is_available.eq.true")
            .in("id", equipmentIds)
        : Promise.resolve({ data: [] }),
    ]);
    if (
      (selectedMenu || []).length !== menuIds.length
      || (selectedEquipment || []).length !== equipmentIds.length
    ) {
      return res.status(400).json({
        ok: false,
        message:
          "One or more selected items are no longer available. Refresh the form and choose again.",
      });
    }
    requestedCatalogueItems = buildRequestedCatalogueItems(
      (selectedMenu || []) as any,
      (selectedEquipment || []) as any,
      mapped.guest_count || 1,
    );
  }

  const leadInsert: Record<string, any> = {
    company_id: company.id,
    user_id: company.owner_id || null,
    region_id: resolvedFormRegionId,
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
    venue_lat: venuePoint?.lat ?? null,
    venue_lng: venuePoint?.lng ?? null,
    notes: mapped.notes || null,
    budget: mapped.budget ?? null,
    // Parity with the admin lead page (Company / organisation +
    // Special requests / dietary land in the same columns).
    company_name: mapped.company_name || null,
    special_requests: mapped.special_requests || null,
    requested_items:
      requestedCatalogueItems.length > 0 ? requestedCatalogueItems : null,
    source: "embed",
    status: "new",
  };

  const { data: leadRow, error: leadErr } = await (supabase as any)
    .from("leads")
    .insert([leadInsert])
    .select("id")
    .single();

  if (leadErr || !leadRow) {
    // Log only the safe parts of the error - avoid PII leaking into
    // Vercel logs from the original payload.
    console.error("[embed/submit] lead insert failed", {
      code: (leadErr as any)?.code,
      message: (leadErr as any)?.message,
    });
    return res
      .status(500)
      .json({ ok: false, message: "Could not save your enquiry, please try again" });
  }

  // 7) Insert the submission row - raw payload + meta for audit/replay
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
    // Lead was already saved - log and continue. The customer is more
    // important than the audit row.
    console.warn("[embed/submit] submission audit insert failed", subErr);
  }

  // submissions_count + last_submission_at are bumped by the
  // trg_embed_form_submissions_after_insert trigger on embed_form_submissions
  // (see migration 20260428120000_embed_forms.sql).

  // A meaningful catalogue selection becomes a private, editable draft. No
  // customer email or public quote link is produced here: staff must still
  // verify portions, stock, delivery and availability and explicitly use
  // Save & Send. Contact-only submissions remain leads and do not create R0
  // quote shells.
  let draftQuoteId: string | null = null;
  if (requestedCatalogueItems.length > 0) {
    try {
      draftQuoteId = await createPrivateDraftQuote(
        supabase,
        company,
        resolvedFormRegionId,
        leadRow.id,
        leadInsert,
        requestedCatalogueItems,
      );
    } catch (draftError) {
      console.warn("[embed/submit] private draft quote failed", draftError);
    }
  }

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
  // MUST be awaited, not fire-and-forget. On Vercel the serverless
  // function is frozen the moment the response is returned, so a
  // `void notifyAdminOfEmbedLead(...)` promise left pending after
  // res.json() never completes - the admin in-portal notification,
  // email and WhatsApp were all silently dropped (verified: a real
  // submission produced a lead row but zero notifications). Every
  // channel inside the helper is its own try/catch, so awaiting the
  // whole fan-out can't throw and won't fail the submission; it just
  // guarantees the work runs before we respond.
  try {
    await notifyAdminOfEmbedLead(supabase, {
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
  } catch (err) {
    // Lead is already saved - never fail the submission over a
    // notification problem. Log and move on.
    console.warn("[embed/submit] admin notify fan-out failed", err);
  }

  // 9) Optional auto-reply to client. Per-form `auto_reply_enabled`
  //    overrides the company-wide `auto_reply_to_embed_submissions`
  //    when set; null falls back to the company flag. Visitor's name
  //    is HTML-escaped before interpolation - emailService sends as
  //    html: by default, and the auditors flagged this as a stored-
  //    XSS amplifier abusing the tenant's own SPF/DKIM domain.
  const autoReplyResolved =
    typeof form.auto_reply_enabled === "boolean"
      ? form.auto_reply_enabled
      : company.auto_reply_to_embed_submissions === true;
  if (autoReplyResolved && (mapped.client_email || mapped.email)) {
    // Awaited for the same serverless-freeze reason as the admin
    // fan-out above: a fire-and-forget auto-reply after res.json()
    // never sends on Vercel. Wrapped so a send failure can't break
    // the submission.
    await (async () => {
      try {
        const { emailService } = await import("@/services/emailService");
        const { resolveEmailTemplate } = await import("@/services/email/templateResolver");
        const sanitiseHeader = (v: string) =>
          String(v || "").replace(/[\r\n\t]+/g, " ").slice(0, 200).trim();
        const safeName = escapeHtml(contactName);
        const safeCompany = escapeHtml(company.company_name);
        const firstName = safeName.split(" ")[0] || safeName;
        const eventDate = leadInsert.event_date
          ? new Date(leadInsert.event_date).toLocaleDateString("en-ZA", {
              day: "numeric", month: "long", year: "numeric",
            })
          : "";
        // Variable bag covers both the canonical EMBED_LEAD_VARS names
        // (client_name, event_type, company_name) AND the common
        // aliases operators use when writing templates (first_name,
        // event_name, tenant_name) so a customised template works
        // regardless of which name the operator typed.
        const vars: Record<string, string> = {
          client_name:  safeName,
          first_name:   firstName,
          company_name: safeCompany,
          tenant_name:  safeCompany,
          event_type:   String(leadInsert.event_type || ""),
          event_name:   String(leadInsert.event_type || leadInsert.event_name || ""),
          event_date:   eventDate,
          guest_count:  leadInsert.guest_count ? String(leadInsert.guest_count) : "",
          venue:        String(leadInsert.venue_address || ""),
          notes:        String(leadInsert.notes || ""),
          form_name:    String(form.name || "embed form"),
        };
        const resolved = await resolveEmailTemplate({
          companyId: company.id,
          templateType: "embed_lead_thank_you_client",
          variables: vars,
          fallback: {
            subject: `Thank you for your enquiry, ${sanitiseHeader(contactName) || "there"}`,
            bodyHtml:
              `Hi ${safeName},\n\n` +
              `Thanks for your enquiry with ${safeCompany}. We've received your details and will be in touch shortly.\n\n` +
              `Thanks,\n${safeCompany}`,
          },
          client: supabase,
        });
        await (emailService as any).sendEmail({
          companyId: company.id,
          to: mapped.client_email || mapped.email,
          // Let the visitor thank-you go out via the platform shared
          // sender when the tenant hasn't configured their own domain.
          allowPlatformFallback: true,
          subject: resolved.subject,
          body: resolved.bodyHtml,
          variables: vars,
          _client: supabase,
        });
      } catch (err) {
        console.warn("[embed/submit] auto-reply failed", err);
      }
    })();
  }

  let capacitySuccessMessage: string | null = null;
  if (leadInsert.event_date) {
    try {
      const capacity = await getEventCapacityForDate(supabase, {
        companyId: company.id,
        eventDate: leadInsert.event_date,
        includeOpenQuotes: false,
        candidateEventCount: 1,
        candidateGuestCount: leadInsert.guest_count,
      });
      if (capacity.blocksPublicAcceptance) {
        capacitySuccessMessage =
          "Thanks, we've received your enquiry. The requested date or event size is currently above capacity, so the team will confirm alternatives before sending a quote.";
      }
    } catch (capacityErr) {
      console.warn("[embed/submit] capacity message check failed", capacityErr);
    }
  }

  return res.status(200).json({
    ok: true,
    leadId: leadRow.id,
    // Safe opaque reference for first-party integrations that want to show
    // staff the created draft. The public form never receives a send/accept
    // URL and cannot publish it.
    draftQuoteId,
    redirectUrl: form.redirect_url || null,
    message:
      capacitySuccessMessage || form.success_message || "Thanks, we'll be in touch shortly.",
  });
}

export default withApiLogging(handler);
