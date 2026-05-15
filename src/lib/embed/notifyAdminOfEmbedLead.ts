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
 * equivalent -- same fan-out, but driven through an injected
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
  appOrigin: string; // e.g. https://cateringms.com -- for absolute links in the email
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

  // ── 2. Admin email ───────────────────────────────────────────────
  // Per-form gate (notify_admin_email column) lets a tenant turn off
  // the email for noisy forms (newsletter signups etc.) while keeping
  // the in-portal bell.
  if (formNotifyAdminEmail) {
    const adminTo =
      (company as any)?.notification_email || (ownerProfile as any)?.email || null;
    if (adminTo) {
      try {
        // emailService is server-importable (no DOM). Pass the service
        // client through `_client` so its email_settings lookup
        // bypasses RLS.
        const { emailService } = await import("@/services/emailService");

        // Plain-text body: every interpolated value is user-supplied,
        // so we keep it text-only. emailService sends html: by default
        // (per the auditor finding) -- we still escape just in case
        // the configured provider auto-formats <br> from newlines.
        const safeName = escapeHtml(clientName);
        const safeCompany = escapeHtml(companyName);
        const safeForm = escapeHtml(formName || "embed form");
        const safeNotes = escapeHtml(leadInsert.notes || "");

        const subjectRaw = `New enquiry from ${clientName} -- ${companyName}`;
        const bodyRaw =
          `${clientName} just sent an enquiry through your website (${safeForm}).\n\n` +
          `Name: ${clientName}\n` +
          (clientEmail ? `Email: ${clientEmail}\n` : "") +
          (clientPhone ? `Phone: ${clientPhone}\n` : "") +
          (eventDate !== "TBD" ? `Event date: ${eventDate}\n` : "") +
          (guestCount ? `Guests: ${guestCount}\n` : "") +
          (leadInsert.event_type ? `Event type: ${leadInsert.event_type}\n` : "") +
          (leadInsert.venue_address ? `Venue: ${leadInsert.venue_address}\n` : "") +
          (leadInsert.budget ? `Budget: R${leadInsert.budget}\n` : "") +
          (leadInsert.notes ? `\nNotes:\n${leadInsert.notes}\n` : "") +
          `\nReply within the hour to win this booking. Open the lead:\n${leadLink}`;

        // Subject + body are plain-text safe (no HTML interpolation
        // primitives). escapeHtml uses are kept for any future HTML
        // template that loads this payload via variables.
        await (emailService as any).sendEmail({
          companyId,
          to: adminTo,
          subject: subjectRaw,
          body: bodyRaw,
          variables: {
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
          `(notification_email + owner profile email both null) -- skipped`,
      );
    }
  }

  // ── 3. WhatsApp to the owner (best-effort) ───────────────────────
  const adminPhone =
    (ownerProfile as any)?.phone || (ownerProfile as any)?.phone_number;
  if (adminPhone) {
    try {
      const { whatsappIntegrationService } = await import(
        "@/services/whatsappIntegrationService"
      );
      await (whatsappIntegrationService as any).sendWhatsAppMessage(
        {
          to: adminPhone,
          type: "text",
          text: {
            body:
              `🎉 New lead from your website!\n\n` +
              `Client: ${clientName}\n` +
              (clientPhone ? `Phone: ${clientPhone}\n` : "") +
              (eventDate !== "TBD" ? `Event: ${eventDate}\n` : "") +
              (guestCount ? `Guests: ${guestCount}\n` : "") +
              `\nView and respond quickly to win this booking.`,
          },
        },
        { companyId },
      );
    } catch (err) {
      console.warn("[embed/lead-notify] WhatsApp owner ping failed", err);
    }
  }
}
