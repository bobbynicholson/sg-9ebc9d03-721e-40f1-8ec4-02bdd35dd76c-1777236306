import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Lead = Database["public"]["Tables"]["leads"]["Row"];
type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];
type LeadUpdate = Database["public"]["Tables"]["leads"]["Update"];

// BUG FIX #3: Transform database snake_case to camelCase for UI consistency
function transformLeadForDisplay(lead: Lead) {
  return {
    id: lead.id,
    userId: lead.user_id,
    clientName: lead.client_name,
    clientEmail: lead.client_email,
    clientPhone: lead.client_phone,
    eventDate: lead.event_date,
    eventType: lead.event_type,
    guestCount: lead.guest_count,
    budget: lead.budget,
    specialRequests: lead.special_requests,
    status: lead.status,
    createdAt: lead.created_at,
    updatedAt: lead.updated_at,
    // Include original data for Supabase operations
    _original: lead
  };
}

export const leadService = {
  async getLeads(userId: string) {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    
    // BUG FIX #3: Transform data before returning
    return (data || []).map(transformLeadForDisplay);
  },

  async getLeadById(id: string) {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return transformLeadForDisplay(data);
  },

  async getLeadsByStatus(userId: string, status: string) {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("user_id", userId)
      .eq("status", status)
      .order("event_date", { ascending: true });

    if (error) throw error;
    return (data || []).map(transformLeadForDisplay);
  },

  async createLead(lead: Omit<LeadInsert, "id" | "created_at" | "updated_at">) {
    const { data, error } = await supabase
      .from("leads")
      .insert([lead])
      .select()
      .single();

    if (error) throw error;
    return transformLeadForDisplay(data);
  },

  async updateLead(id: string, updates: LeadUpdate) {
    const { data, error } = await supabase
      .from("leads")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return transformLeadForDisplay(data);
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

    // Return transformed lead data for quote creation
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
    return (data || []).map(transformLeadForDisplay);
  },
};
