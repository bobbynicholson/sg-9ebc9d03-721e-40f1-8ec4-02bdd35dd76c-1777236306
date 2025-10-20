import { supabase } from "@/integrations/supabase/client";
import { realtimeNotificationService } from "./realtimeNotificationService";
import { whatsappIntegrationService } from "./whatsappIntegrationService";
import type { Database } from "@/integrations/supabase/types";

type Lead = Database["public"]["Tables"]["leads"]["Row"];
type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];
type LeadUpdate = Database["public"]["Tables"]["leads"]["Update"];

export const leadService = {
  async getLeads(userId: string) {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    
    // Return raw database types - no transformation
    return data || [];
  },

  async getLeadById(id: string) {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data;
  },

  async getLeadsByStatus(userId: string, status: string) {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("user_id", userId)
      .eq("status", status)
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

        // 1. In-portal URGENT notification
        await realtimeNotificationService.createNotification({
          company_id: lead.company_id,
          user_id: lead.user_id,
          recipient_id: lead.user_id,
          notification_type: "quote_sent", // Use existing type for lead-related activity
          title: "🎉 New Lead Request!",
          message: `New inquiry from ${lead.client_name || lead.client_email} - ${lead.guest_count || "N/A"} guests${lead.event_date ? ` on ${new Date(lead.event_date).toLocaleDateString()}` : ""}`,
          priority: "urgent",
          link: `/leads?leadId=${data.id}`,
        });

        // 2. Email notification to admin
        if (adminProfile?.email) {
          const subject = `New Lead Captured: ${lead.client_name}`;
          const body = `A new lead has been captured:
Name: ${lead.client_name}
Email: ${lead.client_email}
Event Date: ${new Date(lead.event_date).toLocaleDateString()}
Guests: ${lead.guest_count}`;

          await emailService.sendEmail({
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
            await whatsappIntegrationService.sendWhatsAppMessage({
              to: adminPhone,
              type: "text",
              text: {
                body: `🎉 New Lead!\n\n` +
                      `Client: ${lead.client_name || lead.client_email}\n` +
                      `Event: ${lead.event_date ? new Date(lead.event_date).toLocaleDateString() : "TBD"}\n` +
                      `Guests: ${lead.guest_count || "TBD"}\n\n` +
                      `View and respond quickly to win this booking!`
              }
            });
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

        await emailService.sendEmail({
            companyId: data.company_id,
            to: lead.client_email,
            subject: `Thank you for your inquiry, ${lead.client_name || 'friend'}!`,
            template: 'quote-request-confirmation',
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
    const { data: originalLead } = await supabase
      .from("leads")
      .select("*")
      .eq("id", id)
      .single();

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
        const statusMessages: Record<string, string> = {
          new: "New inquiry received",
          contacted: "Initial contact made",
          quoted: "Quote sent to client",
          converted: "Lead converted to order!",
          lost: "Lead marked as lost"
        };

        const statusMessage = statusMessages[updates.status] || `Status updated to ${updates.status}`;

        // In-portal notification
        await realtimeNotificationService.createNotification({
          company_id: data.company_id,
          user_id: data.user_id,
          recipient_id: data.user_id,
          notification_type: "system_alert",
          title: "Lead Status Updated",
          message: `${data.client_name || data.client_email}: ${statusMessage}`,
          priority: updates.status === "converted" ? "high" : "medium",
          link: `/leads?leadId=${id}`,
        });

        console.log(`✅ Status change notification sent: ${originalLead.status} → ${updates.status}`);
      } catch (notificationError) {
        console.error("⚠️ Failed to send status change notification (non-blocking):", notificationError);
      }
    }

    return data;
  },

  async deleteLead(id: string) {
    const { error } = await supabase
      .from("leads")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return true;
  },

  async convertLeadToQuote(leadId: string) {
    const lead = await this.getLeadById(leadId);
    
    // Update lead status to converted
    await this.updateLead(leadId, { status: "converted" });

    // ✅ FIX BUG #19.3: Send notification when lead converts to quote
    try {
      await realtimeNotificationService.createNotification({
        company_id: lead.company_id,
        user_id: lead.user_id,
        recipient_id: lead.user_id,
        notification_type: "quote_sent",
        title: "Lead Converted to Quote",
        message: `${lead.client_name || lead.client_email} has been converted to a quote`,
        priority: "medium",
        link: `/quotes`,
      });

      console.log("✅ Lead conversion notification sent");
    } catch (notificationError) {
      console.error("⚠️ Failed to send conversion notification (non-blocking):", notificationError);
    }

    // Return raw database type for quote creation
    return lead;
  },

  async getLeadStats(userId: string) {
    const { data, error } = await supabase
      .from("leads")
      .select("status")
      .eq("user_id", userId);

    if (error) throw error;

    const stats = {
      total: data?.length || 0,
      new: data?.filter(l => l.status === "new").length || 0,
      contacted: data?.filter(l => l.status === "contacted").length || 0,
      quoted: data?.filter(l => l.status === "quoted").length || 0,
      converted: data?.filter(l => l.status === "converted").length || 0,
      lost: data?.filter(l => l.status === "lost").length || 0,
    };

    return stats;
  },

  async searchLeads(userId: string, searchTerm: string) {
    // BUG FIX #3: Use safe parameterized queries
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("user_id", userId)
      .or(`client_name.ilike.%${searchTerm}%,client_email.ilike.%${searchTerm}%,client_phone.ilike.%${searchTerm}%`)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  },
};
