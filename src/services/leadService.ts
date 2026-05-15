/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";
import { notificationService } from "./notificationService";
import { whatsappIntegrationService } from "./whatsappIntegrationService";
import type { Database } from "@/integrations/supabase/types";
import { sendEmailViaAPI } from "@/lib/emailClient";

type Lead = Database["public"]["Tables"]["leads"]["Row"];
type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];
type LeadUpdate = Database["public"]["Tables"]["leads"]["Update"];

export const leadService = {
  async getLeads(companyId: string) {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return data || [];
  },

  async getLeadById(id: string) {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (error) throw error;
    return data;
  },

  async getLeadsByStatus(companyId: string, status: string) {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("company_id", companyId)
      .eq("status", status)
      .is("deleted_at", null)
      .order("event_date", { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async createLead(lead: Omit<LeadInsert, "id" | "created_at" | "updated_at">) {
    const { data, error } = await supabase
      .from("leads")
      .insert([lead])
      .select()
      .single();

    if (error) throw error;

    // Quarantine guard. Imported lead rows must not fire any of the
    // "fresh enquiry" side effects below: no admin urgent notification,
    // no admin email, no admin WhatsApp, no client auto-reply. The
    // owner reviews them inside /admin/onboarding and explicitly
    // green-lights comms via enable_comms_for_import_job. See migration
    // 20260503160000_import_quarantine.
    const isQuarantined =
      !!(lead as any).imported_at ||
      !!(lead as any).import_job_id ||
      ((lead as any).comms_paused_until && new Date((lead as any).comms_paused_until) > new Date());
    if (isQuarantined) {
      return data;
    }

    // ✅ FIX BUG #19.1: Send admin notification for new lead (URGENT)
    if (data && lead.user_id) {
      try {
        // Get admin/company details
        const { data: adminProfile } = await supabase
          .from("profiles")
          .select("email, full_name, company_name, phone, phone_number")
          .eq("id", lead.user_id)
          .single();

        const companyName = adminProfile?.company_name || adminProfile?.full_name || "Your Catering Company";

        // 1. In-portal URGENT notification. Deep-links to the admin
        // leads page with the leadId surfaced so the parallel work to
        // open the lead detail inline can pick it up. related_entity
        // powers the "Open lead" CTA on the notifications page.
        await notificationService.createNotification({
          company_id: lead.company_id,
          user_id: lead.user_id,
          recipient_id: lead.user_id,
          notification_type: "lead_new",
          title: "🎉 New Lead Request!",
          message: `New inquiry from ${lead.client_name || lead.client_email} - ${lead.guest_count || "N/A"} guests${lead.event_date ? ` on ${new Date(lead.event_date).toLocaleDateString()}` : ""}`,
          priority: "urgent",
          link: `/admin/leads?leadId=${data.id}`,
          related_entity_type: "lead",
          related_entity_id: data.id,
        });

        // 1b. If the lead is region-scoped and the branch has its own
        // manager assigned, ping them too. The owner already got the
        // notification above; this just makes sure the local manager
        // sees it without having to filter by region every morning.
        // The branch can mute these in its own settings via
        // regions.notify_manager_on_new_lead -- respected here.
        if ((lead as any).region_id) {
          try {
            const { data: region } = await supabase
              .from("regions")
              .select("manager_user_id, name, notify_manager_on_new_lead")
              .eq("id", (lead as any).region_id)
              .maybeSingle();
            const managerId = (region as any)?.manager_user_id as string | null;
            const optedIn = (region as any)?.notify_manager_on_new_lead !== false;
            if (managerId && managerId !== lead.user_id && optedIn) {
              await notificationService.createNotification({
                company_id: lead.company_id,
                user_id: lead.user_id,
                recipient_id: managerId,
                notification_type: "lead_new",
                title: `🎉 New ${(region as any)?.name || "branch"} lead`,
                message: `New inquiry from ${lead.client_name || lead.client_email} for your branch.`,
                priority: "urgent",
                link: `/admin/leads?leadId=${data.id}`,
                related_entity_type: "lead",
                related_entity_id: data.id,
              });
            }
          } catch (e) {
            console.warn("[leadService] region manager notify failed (non-blocking):", e);
          }
        }

        // 2. Email notification to admin
        if (adminProfile?.email) {
          // Wave 11 #5: lead.event_date can be null (form doesn't
          // require it). new Date(null).toLocaleDateString() renders
          // "Invalid Date" in the operator's email -- looks broken.
          // Surface "TBD" instead, matching the WhatsApp body below.
          const eventDateLabel = lead.event_date
            ? new Date(lead.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
            : "TBD";
          const subject = `New Lead Captured: ${lead.client_name || lead.client_email}`;
          const body = `A new lead has been captured:
Name: ${lead.client_name || lead.client_email}
Email: ${lead.client_email}
Event Date: ${eventDateLabel}
Guests: ${lead.guest_count ?? "TBD"}`;

          await sendEmailViaAPI({
            companyId: lead.user_id,
            to: adminProfile.email,
            subject,
            body,
            variables: {
              clientName: lead.client_name || lead.client_email,
              companyName
            }
          });
          console.log("✅ Admin notification email sent for new lead");
        }

        // 3. WhatsApp notification to admin (if configured)
        const adminPhone = adminProfile?.phone || adminProfile?.phone_number;
        if (adminPhone) {
          try {
            await whatsappIntegrationService.sendWhatsAppMessage(
              {
                to: adminPhone,
                type: "text",
                text: {
                  body: `🎉 New Lead!\n\n` +
                        `Client: ${lead.client_name || lead.client_email}\n` +
                        `Event: ${lead.event_date ? new Date(lead.event_date).toLocaleDateString() : "TBD"}\n` +
                        `Guests: ${lead.guest_count || "TBD"}\n\n` +
                        `View and respond quickly to win this booking!`
                }
              },
              { companyId: lead.company_id },
            );
          } catch (whatsappError) {
            console.error("⚠️ WhatsApp admin notification failed (non-blocking):", whatsappError);
          }
        }

      } catch (notificationError) {
        console.error("⚠️ Failed to send admin notification for new lead (non-blocking):", notificationError);
      }
    }

    // ✅ FIX BUG #19.2: Send auto-reply confirmation to client
    if (data && lead.client_email) {
      try {
        // Get company name for client email
        const { data: adminProfile } = await supabase
          .from("profiles")
          .select("company_name, full_name")
          .eq("id", lead.user_id)
          .single();

        const companyName = adminProfile?.company_name || adminProfile?.full_name || "Your Catering Company";

        await sendEmailViaAPI({
            companyId: data.company_id,
            to: lead.client_email,
            subject: `Thank you for your inquiry, ${lead.client_name || 'friend'}!`,
            // Template type aligns with the seed in
            // 20260506130000_seed_email_templates.sql. Was
            // "quote-request-confirmation" which had no row in
            // email_templates [P0-14].
            template: 'quote_request_received',
            variables: {
              clientName: lead.client_name || 'there',
              companyName: companyName,
              quoteNumber: data.id,
            }
        });
        console.log("✅ Lead request confirmation email sent to client:", lead.client_email);
      } catch (emailError) {
        console.error("⚠️ Failed to send client confirmation email (non-blocking):", emailError);
      }
    }

    return data;
  },

  async updateLead(id: string, updates: LeadUpdate) {
    // Get original lead for comparison
    const { data: originalLead, error: originalLeadErr } = await supabase
      .from("leads")
      .select("*")
      .eq("id", id)
      .single();
    if (originalLeadErr) {
      console.error("[leadService] leads fetch failed:", originalLeadErr);
    }

    const { data, error } = await supabase
      .from("leads")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    // ✅ FIX BUG #19.4: Send notifications for status changes
    if (originalLead && data && originalLead.status !== updates.status && updates.status) {
      try {
        // Wave 11 #2: 'won' is the canonical terminal value in the
        // lead_status enum. The 'converted' string used to live in
        // legacy CHECK-constraint days; the enum doesn't include it,
        // so writing 'converted' silently failed against RLS or
        // bounced an enum violation. Map the user-friendly copy to
        // the real enum value.
        const statusMessages: Record<string, string> = {
          new: "New inquiry received",
          contacted: "Initial contact made",
          qualified: "Lead qualified",
          quoted: "Quote sent to client",
          negotiating: "Negotiating with client",
          won: "Lead converted to order!",
          lost: "Lead marked as lost",
          manual_add: "Lead added manually",
        };

        const statusMessage = statusMessages[updates.status] || `Status updated to ${updates.status}`;

        // In-portal notification. Deep-links to the lead so the
        // operator can pick up where the status change left off.
        await notificationService.createNotification({
          company_id: data.company_id,
          user_id: data.user_id,
          recipient_id: data.user_id,
          notification_type: "lead_status_updated",
          title: "Lead Status Updated",
          message: `${data.client_name || data.client_email}: ${statusMessage}`,
          priority: updates.status === "won" ? "high" : "medium",
          link: `/admin/leads?leadId=${id}`,
          related_entity_type: "lead",
          related_entity_id: id,
        });

        console.log(`✅ Status change notification sent: ${originalLead.status} → ${updates.status}`);
      } catch (notificationError) {
        console.error("⚠️ Failed to send status change notification (non-blocking):", notificationError);
      }
    }

    return data;
  },

  async deleteLead(id: string) {
    // Flow audit Leg B P0-11: hard DELETE on leads cascaded loudly --
    // quotes referencing the lead via lead_id either lost the linkage
    // (FK ON DELETE SET NULL) or refused to drop (when the constraint
    // was RESTRICT, leaving the operator staring at a generic "delete
    // failed" toast). Soft-delete via deleted_at instead: matches the
    // pattern used on companies / clients / orders / invoices, keeps
    // referential integrity intact, and the `is("deleted_at", null)`
    // filters every list query already applies hide the row from the
    // operator's UI.
    const { error } = await supabase
      .from("leads")
      .update({ deleted_at: new Date().toISOString() } as any)
      .eq("id", id);

    if (error) throw error;
    return true;
  },

  async convertLeadToQuote(leadId: string) {
    const lead = await this.getLeadById(leadId);

    // Create the draft quote up front. Previously this function only
    // flipped lead.status to 'quoted' and the operator was left to
    // build the quote manually from the lead detail accordion --
    // running-todo Phase 2E-1 flagged this as "Convert button calls
    // nothing useful". Now the conversion produces a real quotes row
    // pre-populated from the lead so the operator lands on a draft
    // they can edit [P1-17].
    const { quoteService } = await import("./quoteService");

    // Flow audit Wave 11 #1: lead's notes, special_requests, budget,
    // budget_range and requested_items used to be dropped on the
    // floor at Convert time. The operator opened the new quote, saw
    // a blank Notes field, and re-typed everything from the lead
    // detail accordion. Now flow them through:
    //   - special_requests -> quotes.special_instructions (client-
    //     facing line, surfaces on the quote PDF)
    //   - notes + budget + budget_range -> quotes.internal_notes
    //     (operator-only, never goes to the client)
    //   - requested_items (jsonb from rebook / portal lead flows) ->
    //     quotes.menu_items as zero-priced lines so the operator just
    //     prices each row instead of re-picking them
    const internalNoteParts: string[] = [];
    if ((lead as any).notes) {
      internalNoteParts.push(`Original lead notes:\n${(lead as any).notes}`);
    }
    if ((lead as any).budget_range) {
      internalNoteParts.push(`Stated budget range: ${(lead as any).budget_range}`);
    }
    if ((lead as any).budget) {
      internalNoteParts.push(`Stated budget: R${Number((lead as any).budget).toLocaleString("en-ZA")}`);
    }
    if ((lead as any).source) {
      internalNoteParts.push(`Lead source: ${(lead as any).source}`);
    }
    const requestedItems = Array.isArray((lead as any).requested_items)
      ? (lead as any).requested_items
      : [];
    const menuItemsFromLead = requestedItems
      .filter((r: any) => r && (r.item_name || r.name))
      .map((r: any) => ({
        menu_item_id: r.menu_item_id || null,
        item_name: r.item_name || r.name,
        name: r.item_name || r.name,
        category: r.category || null,
        dietary_tags: r.dietary_tags || null,
        quantity: Number(r.quantity ?? 1) || 1,
        unit_price: 0,
        line_total: 0,
      }));

    const draftPayload: any = {
      company_id: (lead as any).company_id,
      user_id: (lead as any).user_id,
      lead_id: leadId,
      client_name: (lead as any).client_name,
      client_email: (lead as any).client_email,
      client_phone: (lead as any).client_phone,
      event_date: (lead as any).event_date,
      event_time: (lead as any).event_time,
      guest_count: (lead as any).guest_count,
      venue_address: (lead as any).venue_address,
      venue_lat: (lead as any).venue_lat,
      venue_lng: (lead as any).venue_lng,
      region_id: (lead as any).region_id,
      status: "draft",
      // currency intentionally omitted -- quotes table has no currency
      // column; the tenant's currency lives on companies and is read
      // from there at display time.
      // Money fields start at zero -- the operator builds these out
      // in /admin/quotes/[id]. We're just kickstarting the row.
      subtotal: 0,
      tax_amount: 0,
      total: 0,
      total_amount: 0,
      menu_items: menuItemsFromLead.length > 0 ? menuItemsFromLead : null,
      special_instructions: (lead as any).special_requests || null,
      internal_notes: internalNoteParts.length > 0 ? internalNoteParts.join("\n\n") : null,
      notes: "Converted from lead.",
    };

    let createdQuoteId: string | null = null;
    try {
      const newQuote: any = await (quoteService as any).createQuote(draftPayload);
      createdQuoteId = newQuote?.id || null;
    } catch (e: any) {
      console.warn("[leadService.convertLeadToQuote] draft quote create failed:", e?.message);
      // Don't roll back lead status flip on quote-create failure --
      // operator can still build the quote manually. Surface via
      // returned shape so callers know.
    }

    // Flip the lead status only after we have (or fail to have) a
    // quote. quoteService.createQuote also advances lead.status to
    // 'quoted' atomically (P1-02), so this is partially redundant but
    // belt-and-braces for the failure case. We stop at 'quoted' here
    // (not 'won'); the lead only becomes 'won' once an order actually
    // lands -- lifecycleService.promoteLeadToClient handles that
    // terminal transition.
    await this.updateLead(leadId, { status: "quoted" });

    try {
      await notificationService.createNotification({
        company_id: lead.company_id,
        user_id: lead.user_id,
        recipient_id: lead.user_id,
        notification_type: "lead_converted",
        title: "Lead converted to quote",
        message: createdQuoteId
          ? `${lead.client_name || lead.client_email} has a draft quote ready to send.`
          : `${lead.client_name || lead.client_email} converted, but the draft quote failed to create. Open the lead to retry.`,
        priority: "medium",
        link: createdQuoteId
          ? `/admin/quotes/${createdQuoteId}`
          : `/admin/leads?leadId=${leadId}`,
        related_entity_type: createdQuoteId ? "quote" : "lead",
        related_entity_id: createdQuoteId || leadId,
      });
    } catch (notificationError) {
      console.error("[leadService.convertLeadToQuote] notification failed (non-blocking):", notificationError);
    }

    // Return the lead alongside the new quote id so the calling page
    // can navigate the operator straight to the draft.
    return { lead, quoteId: createdQuoteId };
  },

  async getLeadStats(companyId: string) {
    const { data, error } = await supabase
      .from("leads")
      .select("status")
      .eq("company_id", companyId);

    if (error) throw error;

    const stats = {
      total: data?.length || 0,
      new: data?.filter(l => l.status === "new").length || 0,
      contacted: data?.filter(l => l.status === "contacted").length || 0,
      qualified: data?.filter(l => l.status === "qualified").length || 0,
      quoted: data?.filter(l => l.status === "quoted").length || 0,
      negotiating: data?.filter(l => l.status === "negotiating").length || 0,
      // Wave 11 #2: 'won' is the canonical terminal value. Old data
      // may still carry 'converted'; count it here so legacy rows
      // don't silently fall out of the funnel total.
      won: data?.filter(l => l.status === "won" || l.status === "converted").length || 0,
      lost: data?.filter(l => l.status === "lost").length || 0,
    };

    return stats;
  },

  async searchLeads(companyId: string, searchTerm: string) {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("company_id", companyId)
      .or(`client_name.ilike.%${searchTerm}%,client_email.ilike.%${searchTerm}%,client_phone.ilike.%${searchTerm}%`)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  },
};
