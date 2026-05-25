/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Server-side notify chain for a freshly created embed-form lead.
 *
 * The /api/public/embed/[token]/submit handler used to insert a lead
 * via raw service-role SQL and then drop a single in-portal
 * notification. This skipped:
 *   - the admin URGENT in-portal toast worded for a new enquiry
 *   - the admin email (subject + body) so the operator doesn't have
 *     to be in the app to know a lead came in
 *   - the WhatsApp ping when an admin phone is configured
 *   - the region-manager notification when the form has a region_id
 *
 * leadService.createLead already does this, but it lives in the
 * browser bundle and uses the anon Supabase client, so we can't call
 * it from a public unauth API handler. This helper is the server-side
 * equivalent - same fan-out, but driven through an injected
 * service-role client so RLS never short-circuits us.
 *
 * Best-effort: every channel is wrapped in its own try/catch so a
 * single failure (Resend down, WhatsApp not configured, region row
 * missing) doesn't break the others.
 */

import { escapeHtml } from "@/lib/embedFormApi";

export interface NotifyEmbedLeadInput {
  companyId: string;
  ownerUserId: string | null;
  regionId: string | null;
  leadId: string;
  leadInsert: Record<string, any>; // the resolved lead row (post-insert)
  formName: string | null;
  formId: string | null;
  formNotifyAdminEmail: boolean; // per-form override
  appOrigin: string; // e.g. https://cateringms.com - for absolute links in the email
}

export async function notifyAdminOfEmbedLead(
  supabase: any,
  input: NotifyEmbedLeadInput,
): Promise<void> {
  const {
    companyId, ownerUserId, regionId, leadId, leadInsert,
    formName, formId, formNotifyAdminEmail, appOrigin,
  } = input;

  // Resolve the company + owner profile in parallel. notification_email
  // on companies is the optional admin override (e.g. bookings@...).
  const [{ data: company }, { data: ownerProfile }] = await Promise.all([
    supabase
      .from("companies")
      .select("id, company_name, notification_email")
      .eq("id", companyId)
      .maybeSingle(),
    ownerUserId
      ? supabase
          .from("profiles")
          .select("id, full_name, email, phone, phone_number, company_name")
          .eq("id", ownerUserId)
          .maybeSingle()
      : Promise.resolve({ data: null as any }),
  ]);

  const companyName =
    (company as any)?.company_name ||
    (ownerProfile as any)?.company_name ||
    (ownerProfile as any)?.full_name ||
    "Your catering company";

  const clientName =
    leadInsert.client_name ||
    leadInsert.contact_name ||
    leadInsert.client_email ||
    "the client";
  const clientEmail = leadInsert.client_email || leadInsert.email || null;
  const clientPhone = leadInsert.client_phone || leadInsert.phone || null;
  const guestCount = leadInsert.guest_count;
  const eventDate = leadInsert.event_date
    ? new Date(leadInsert.event_date).toLocaleDateString("en-ZA", {
        day: "numeric", month: "long", year: "numeric",
      })
    : "TBD";

  const leadLink = `${appOrigin}/admin/leads?leadId=${encodeURIComponent(leadId)}`;
  const summary = formName ? `from "${formName}"` : "from your embedded form";

  // ── 1. In-portal notification to the owner ───────────────────────
  try {
    await supabase.from("notifications").insert([{
      company_id: companyId,
      user_id: ownerUserId,
      recipient_id: ownerUserId,
      // Semantically a fresh lead, not a sent quote. The leads UI
      // listens for new-lead types specifically.
      notification_type: "lead_received",
      title: "🎉 New lead from your website",
      message: `${clientName} just enquired ${summary}` +
        (guestCount ? ` (${guestCount} guests` : "") +
        (eventDate !== "TBD" ? `, event ${eventDate}` : "") +
        (guestCount ? ")" : ""),
      priority: "urgent",
      link: `/admin/leads?leadId=${encodeURIComponent(leadId)}`,
    }]);
  } catch (err) {
    console.warn("[embed/lead-notify] in-portal owner notification failed", err);
  }

  // ── 1b. Region-manager fan-out (when the form is region-scoped) ──
  if (regionId) {
    try {
      const { data: region, error: regionErr } = await supabase
        .from("regions")
        .select("manager_user_id, name, notify_manager_on_new_lead")
        .eq("id", regionId)
        .maybeSingle();
      if (regionErr) console.error("[embed/notifyAdminOfEmbedLead] regions lookup failed:", regionErr);
      const managerId = (region as any)?.manager_user_id as string | null;
      const optedIn = (region as any)?.notify_manager_on_new_lead !== false;
      if (managerId && managerId !== ownerUserId && optedIn) {
        await supabase.from("notifications").insert([{
          company_id: companyId,
          user_id: ownerUserId,
          recipient_id: managerId,
          notification_type: "lead_received",
          title: `🎉 New ${(region as any)?.name || "branch"} lead`,
          message: `${clientName} enquired ${summary} for your branch.`,
          priority: "urgent",
          link: `/admin/leads?leadId=${encodeURIComponent(leadId)}`,
        }]);
      }
    } catch (err) {
      console.warn("[embed/lead-notify] region manager notification failed", err);
    }
  }

  // Shared variable bag for both the email + the WhatsApp ping. Keys
  // match registry.ts EMBED_LEAD_VARS so what an operator edits in
  // /admin/messaging-templates is what the lead-alert produces.
  const embedLeadVars: Record<string, string> = {
    client_name: String(clientName),
    client_email: clientEmail ? String(clientEmail) : "",
    client_phone: clientPhone ? String(clientPhone) : "",
    event_type: String(leadInsert.event_type || ""),
    event_date: eventDate !== "TBD" ? eventDate : "",
    guest_count: guestCount ? String(guestCount) : "",
    venue: String(leadInsert.venue_address || ""),
    budget: leadInsert.budget ? `R${leadInsert.budget}` : "",
    notes: String(leadInsert.notes || ""),
    form_name: String(formName || "embed form"),
    company_name: String(companyName),
  };

  // ── 2. Admin email ───────────────────────────────────────────────
  // Per-form gate (notify_admin_email column) lets a tenant turn off
  // the email for noisy forms (newsletter signups etc.) while keeping
  // the in-portal bell.
  if (formNotifyAdminEmail) {
    const adminTo =
      (company as any)?.notification_email || (ownerProfile as any)?.email || null;
    if (adminTo) {
      try {
        const { emailService } = await import("@/services/emailService");
        const { resolveEmailTemplate } = await import("@/services/email/templateResolver");

        // Inline fallback mirrors the registry default for
        // embed_lead_admin_email so first send is identical until the
        // operator customises.
        const inlineSubject = `New enquiry from {{client_name}} - {{form_name}}`;
        const inlineBody =
          `New lead from your website form.\n\n` +
          `Name: {{client_name}}\n` +
          `Email: {{client_email}}\n` +
          `Phone: {{client_phone}}\n` +
          `Event: {{event_type}}\n` +
          `Date: {{event_date}}\n` +
          `Guests: {{guest_count}}\n` +
          `Venue: {{venue}}\n` +
          `Budget: {{budget}}\n\n` +
          `Notes: {{notes}}\n\n` +
          `Reply quickly while the enquiry is hot.\n\n` +
          `Open the lead: ${leadLink}`;

        const resolved = await resolveEmailTemplate({
          companyId,
          templateType: "embed_lead_admin_email",
          variables: embedLeadVars,
          fallback: { subject: inlineSubject, bodyHtml: inlineBody },
          client: supabase,
        });

        // escapeHtml retained for downstream callers that read the
        // variable bag for HTML rendering (unused by the resolver but
        // shipped through emailService.variables for consistency).
        const safeName = escapeHtml(clientName);
        const safeCompany = escapeHtml(companyName);
        const safeForm = escapeHtml(formName || "embed form");
        const safeNotes = escapeHtml(leadInsert.notes || "");

        await (emailService as any).sendEmail({
          companyId,
          to: adminTo,
          subject: resolved.subject,
          body: resolved.bodyHtml,
          variables: {
            ...embedLeadVars,
            // Legacy keys retained for any downstream readers.
            clientName: safeName,
            companyName: safeCompany,
            formName: safeForm,
            leadLink,
            notes: safeNotes,
          },
          _client: supabase,
        });
      } catch (err) {
        console.warn("[embed/lead-notify] admin email failed", err);
      }
    } else {
      console.warn(
        `[embed/lead-notify] no admin email available for company ${companyId} ` +
          `(notification_email + owner profile email both null) - skipped`,
      );
    }
  }

  // ── 3. WhatsApp to the owner (best-effort) ───────────────────────
  // Resolved through whatsapp_templates so the body in
  // /admin/messaging-templates -> embed_lead_admin_whatsapp wins
  // over the inline fallback.
  const adminPhone =
    (ownerProfile as any)?.phone || (ownerProfile as any)?.phone_number;
  if (adminPhone) {
    try {
      const { whatsappIntegrationService } = await import(
        "@/services/whatsappIntegrationService"
      );

      // Pull the WhatsApp override row directly (the resolver in
      // services/email/templateResolver.ts is email-only). Keep the
      // failure soft - send the inline fallback if the lookup throws.
      let resolvedBody =
        `New lead from {{form_name}}.\n\n` +
        `{{client_name}} - {{event_type}} on {{event_date}}, {{guest_count}} guests.\n` +
        `Phone: {{client_phone}}\n` +
        `Email: {{client_email}}\n\n` +
        `Open the leads page to reply.`;
      try {
        const { data: waRow } = await supabase
          .from("whatsapp_templates")
          .select("template_content, is_enabled")
          .eq("company_id", companyId)
          .eq("template_key", "embed_lead_admin_whatsapp")
          .eq("is_enabled", true)
          .maybeSingle();
        if (waRow && (waRow as any).template_content) {
          resolvedBody = (waRow as any).template_content;
        }
      } catch (e) {
        console.warn("[embed/lead-notify] whatsapp template lookup failed:", e);
      }
      // Mustache substitute with the same variable bag.
      for (const [k, v] of Object.entries(embedLeadVars)) {
        resolvedBody = resolvedBody.split(`{{${k}}}`).join(v ?? "");
      }

      await (whatsappIntegrationService as any).sendWhatsAppMessage(
        {
          to: adminPhone,
          type: "text",
          text: { body: resolvedBody },
        },
        { companyId },
      );
    } catch (err) {
      console.warn("[embed/lead-notify] WhatsApp owner ping failed", err);
    }
  }
}
