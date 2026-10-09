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

interface LeadEmailSummary {
  clientName?: string;
  companyName?: string;
  eventType?: string;
  eventDate?: string;
  guestCount?: string | number;
}

function requestedItemsSection(value: unknown): string {
  if (!Array.isArray(value)) return "";
  const items = value.filter((item) =>
    item && typeof item === "object" &&
    String((item as any).item_name || (item as any).name || "").trim(),
  ) as Array<Record<string, any>>;
  if (items.length === 0) return "";

  const renderGroup = (label: string, group: Array<Record<string, any>>) => {
    if (group.length === 0) return "";
    const rows = group.map((item) => {
      const name = String(item.item_name || item.name).trim();
      const category = typeof item.category === "string" ? item.category.trim() : "";
      const quantity = Number(item.quantity);
      const quantityLabel = Number.isFinite(quantity) && quantity > 0
        ? `Qty ${new Intl.NumberFormat("en-ZA", { maximumFractionDigits: 0 }).format(quantity)}`
        : "-";
      return `<tr><td valign="top" style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:14px;line-height:1.45;"><strong>${escapeHtml(name)}</strong>${category ? `<br><span style="color:#64748b;font-size:12px;">${escapeHtml(category)}</span>` : ""}</td><td align="right" valign="top" style="white-space:nowrap;padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#334155;font-size:13px;">${escapeHtml(quantityLabel)}</td></tr>`;
    }).join("");
    return `<h3 style="margin:16px 0 4px;color:#334155;font-size:13px;line-height:1.3;">${label}</h3>` +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;background:#fff;">${rows}</table>`;
  };
  const menu = items.filter((item) => item.item_type === "menu");
  const equipment = items.filter((item) => item.item_type === "equipment");
  const other = items.filter((item) => item.item_type !== "menu" && item.item_type !== "equipment");

  return `<h2 style="margin:24px 0 6px;color:#991b1b;font-size:16px;line-height:1.3;">Customer selections <span style="color:#64748b;font-size:12px;font-weight:400;">(${items.length})</span></h2>` +
    `<p style="margin:0 0 10px;color:#64748b;font-size:12px;line-height:1.5;">Chosen on the form; confirm availability and pricing when preparing the quote.</p>` +
    renderGroup("Menu", menu) + renderGroup("Equipment", equipment) + renderGroup("Other", other);
}

function emailShell(
  content: string,
  leadLink: string,
  hasLeadLink: boolean,
  summary: LeadEmailSummary,
): string {
  const safeLeadLink = escapeHtml(leadLink);
  const eventLine = [
    summary.eventType,
    summary.eventDate,
    summary.guestCount ? `${summary.guestCount} guests` : "",
  ].filter(Boolean).map((value) => escapeHtml(String(value))).join(" <span style=\"color:#94a3b8;\">&bull;</span> ");
  const brand = summary.companyName ? escapeHtml(summary.companyName) : "Website lead";
  const heading = summary.clientName ? escapeHtml(summary.clientName) : "New enquiry received";
  const button = hasLeadLink ? "" : `<p style="margin:26px 0 0;"><a href="${safeLeadLink}" style="display:inline-block;padding:12px 18px;background:#991b1b;color:#fff;text-decoration:none;font-weight:700;border-radius:5px;">Open lead in CateringMS</a></p>`;

  return `<div style="margin:0 auto;max-width:680px;padding:20px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:separate;border-spacing:0;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">` +
    `<tr><td style="height:5px;padding:0;background:#b91c1c;font-size:0;line-height:0;">&nbsp;</td></tr>` +
    `<tr><td style="padding:22px 24px;background:#1e293b;color:#fff;"><p style="margin:0 0 8px;color:#fca5a5;font-size:11px;font-weight:700;text-transform:uppercase;">${brand} &nbsp; / &nbsp; New website enquiry</p><h1 style="margin:0;color:#fff;font-size:24px;line-height:1.25;">${heading}</h1>${eventLine ? `<p style="margin:8px 0 0;color:#cbd5e1;font-size:13px;line-height:1.5;">${eventLine}</p>` : ""}</td></tr>` +
    `<tr><td style="padding:22px 24px;color:#334155;font-size:14px;line-height:1.55;">${content}${button}</td></tr>` +
    `</table></div>`;
}

export function ensureLeadLinkInEmailBody(
  body: unknown,
  leadLink: string,
  requestedItems?: unknown,
  summary: LeadEmailSummary = {},
): string {
  const content = typeof body === "string" ? body : "";
  const safeLeadLink = escapeHtml(leadLink);
  const selectionsHtml = requestedItemsSection(requestedItems);
  const hasBlockMarkup = /<(p|div|table|h[1-6]|ul|ol|li|br|section)\b/i.test(content);
  if (hasBlockMarkup) {
    const hasLeadLink = content.includes(`href="${safeLeadLink}"`) || content.includes(`href='${safeLeadLink}'`);
    return emailShell(`${content}${selectionsHtml}`, leadLink, hasLeadLink, summary);
  }

  const plain = content
    .replace(/<a\b[^>]*>(.*?)<\/a>/gi, "$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => Boolean(line) && !/^open (?:the )?lead\s*:/i.test(line) && line.toLowerCase() !== "new lead from your website form.");
  const intro: string[] = [];
  const groups = new Map<string, Array<{ label: string; value: string }>>();
  for (const line of plain) {
    const match = line.match(/^([^:]{1,60}):\s*(.*)$/);
    if (!match) {
      intro.push(line);
      continue;
    }
    const label = match[1].trim();
    const value = match[2].trim();
    if (!value) continue;
    const normalisedLabel = label.toLowerCase();
    const notesPrefix = "other details from the form:";
    if (normalisedLabel === "notes" && value.toLowerCase().startsWith(notesPrefix)) {
      const remainder = value.slice(notesPrefix.length).trim();
      if (!remainder) continue;
      const rows = groups.get("Additional details") || [];
      rows.push({ label: "Notes", value: remainder });
      groups.set("Additional details", rows);
      continue;
    }
    const group = /name|email|phone|mobile|whatsapp/.test(normalisedLabel)
      ? "Contact"
      : /event|date|time|guest|venue|attendee/.test(normalisedLabel)
        ? "Event details"
        : /menu|dish|equipment|children|kids|table|service|chef|dietary|meal/.test(normalisedLabel)
          ? "Catering request"
          : normalisedLabel === "budget"
            ? "Budget"
            : "Additional details";
    const rows = groups.get(group) || [];
    rows.push({ label, value });
    groups.set(group, rows);
  }

  const introHtml = intro.length
    ? `<p style="margin:0 0 18px;color:#475569;line-height:1.55;">${intro.map(escapeHtml).join("<br>")}</p>`
    : "";
  const groupsHtml = [...groups.entries()].map(([heading, rows]) =>
    `<h2 style="margin:20px 0 8px;color:#991b1b;font-size:15px;line-height:1.3;">${escapeHtml(heading)}</h2>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">` +
    rows.map(({ label, value }) =>
      `<tr><th align="left" valign="top" style="width:120px;padding:8px 12px 8px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;font-weight:600;">${escapeHtml(label)}</th>` +
      `<td valign="top" style="padding:8px 0;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:14px;line-height:1.5;overflow-wrap:anywhere;">${escapeHtml(value)}</td></tr>`,
    ).join("") +
    `</table>`,
  ).join("");
  return emailShell(`${introHtml}${groupsHtml}${selectionsHtml}`, leadLink, false, summary);
}

export function uniqueAdminEmails(candidates: unknown[]): string[] {
  const recipients = new Map<string, string>();
  for (const candidate of candidates) {
    const email = typeof candidate === "string" ? candidate.trim() : "";
    if (email && !recipients.has(email.toLowerCase())) {
      recipients.set(email.toLowerCase(), email);
    }
  }
  return [...recipients.values()];
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
      // TIGHTEN I.86: also fetch currency so the admin notification
      // email shows the right symbol on the budget line. Previously
      // hardcoded "R" prefix which read wrong for USD / GBP / EUR
      // tenants who ran embed forms.
      .from("companies")
      .select("id, company_name, notification_email, currency")
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
  const adminEmailCandidates: unknown[] = [
    (company as any)?.notification_email,
    (ownerProfile as any)?.email,
  ];

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

  // ── 1. In-portal notification to every admin-tier user ───────────
  // Previously only the company OWNER got the bell ping, so an
  // admin/sales_admin working the leads pipeline stayed blind to new
  // enquiries unless the owner forwarded them (driver-feedback session
  // 2026-07-04). Fan out to the whole admin tier, deduped, owner
  // included even if their profile row is missing a role.
  try {
    const { data: adminProfiles } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("company_id", companyId)
      .in("role", ["company_admin", "admin", "sales_admin", "region_admin"]);
    const recipientIds = new Set(
      ((adminProfiles || []) as Array<{ id: string }>).map((p) => p.id),
    );
    adminEmailCandidates.push(...(adminProfiles || []).map((profile: any) => profile.email));
    if (ownerUserId) recipientIds.add(ownerUserId);
    const message = `${clientName} just enquired ${summary}` +
      (guestCount ? ` (${guestCount} guests` : "") +
      (eventDate !== "TBD" ? `, event ${eventDate}` : "") +
      (guestCount ? ")" : "");
    const rows = [...recipientIds].map((rid) => ({
      company_id: companyId,
      user_id: rid,
      recipient_id: rid,
      // Semantically a fresh lead, not a sent quote. The leads UI
      // listens for new-lead types specifically.
      notification_type: "lead_received",
      title: "🎉 New lead from your website",
      message,
      priority: "urgent",
      link: `/admin/leads?leadId=${encodeURIComponent(leadId)}`,
    }));
    if (rows.length > 0) {
      await supabase.from("notifications").insert(rows);
    }
  } catch (err) {
    console.warn("[embed/lead-notify] in-portal admin notification failed", err);
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
    // TIGHTEN I.86: tenant currency via Intl. Falls back to "R" prefix
    // when company.currency isn't set (legacy tenants).
    budget: leadInsert.budget
      ? (() => {
          const code = (company?.currency as string) || "ZAR";
          try {
            return new Intl.NumberFormat("en-ZA", {
              style: "currency",
              currency: code,
              maximumFractionDigits: 0,
            }).format(Number(leadInsert.budget) || 0);
          } catch {
            return `${code} ${leadInsert.budget}`;
          }
        })()
      : "",
    notes: String(leadInsert.notes || ""),
    form_name: String(formName || "embed form"),
    company_name: String(companyName),
  };

  // ── 2. Admin email ───────────────────────────────────────────────
  // Per-form gate (notify_admin_email column) lets a tenant turn off
  // the email for noisy forms (newsletter signups etc.) while keeping
  // the in-portal bell.
  if (formNotifyAdminEmail) {
    if (uniqueAdminEmails(adminEmailCandidates).length === 0) {
      try {
        const { data: adminProfiles } = await supabase
          .from("profiles")
          .select("email")
          .eq("company_id", companyId)
          .in("role", ["company_admin", "admin", "sales_admin", "region_admin"]);
        adminEmailCandidates.push(...(adminProfiles || []).map((profile: any) => profile.email));
      } catch (err) {
        console.warn("[embed/lead-notify] admin email fallback lookup failed", err);
      }
    }
    const adminRecipients = uniqueAdminEmails(adminEmailCandidates);
    if (adminRecipients.length > 0) {
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
          `Open the lead: <a href="${escapeHtml(leadLink)}">View lead</a>`;

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

        for (const to of adminRecipients) {
          try {
            await (emailService as any).sendEmail({
              companyId,
              to,
              allowPlatformFallback: true,
              subject: resolved.subject,
              body: ensureLeadLinkInEmailBody(resolved.bodyHtml, leadLink, leadInsert.requested_items, {
                clientName: String(clientName),
                companyName: String(companyName),
                eventType: String(leadInsert.event_type || ""),
                eventDate: eventDate !== "TBD" ? eventDate : "",
                guestCount: guestCount ? String(guestCount) : "",
              }),
              variables: {
                ...embedLeadVars,
                clientName: safeName,
                companyName: safeCompany,
                formName: safeForm,
                leadLink,
                notes: safeNotes,
              },
              _client: supabase,
            });
          } catch (err) {
            console.warn(`[embed/lead-notify] admin email failed for ${to}`, err);
          }
        }
      } catch (err) {
        console.warn("[embed/lead-notify] admin email failed", err);
      }
    } else {
      console.warn(
        `[embed/lead-notify] no admin email available for company ${companyId} ` +
          `(no notification or admin profile email) - skipped`,
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
