import { supabase } from "@/integrations/supabase/client";
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
    
    // Map db fields to frontend fields to resolve type errors
    return data.map(lead => ({
      ...lead,
      email: lead.client_email,
      phone: lead.client_phone,
    })) as (Lead & { email: string | null; phone: string | null; })[];
  },

  async getLeadById(id: string) {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data as Lead;
  },

  async getLeadsByStatus(userId: string, status: string) {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("user_id", userId)
      .eq("status", status)
      .order("event_date", { ascending: true });

    if (error) throw error;
    return data as Lead[];
  },

  async createLead(lead: Omit<LeadInsert, "id" | "created_at" | "updated_at"> & { email: string; phone: string | null }) {
    
    const leadData: LeadInsert = {
      ...lead,
      client_name: lead.client_name,
      client_email: lead.email,
      client_phone: lead.phone,
      event_date: lead.event_date,
      event_type: lead.event_type,
      guest_count: lead.guest_count,
      budget: lead.budget,
      special_requests: lead.special_requests,
      status: lead.status,
      user_id: lead.user_id
    };

    const { data, error } = await supabase
      .from("leads")
      .insert([leadData])
      .select()
      .single();

    if (error) throw error;
    return data as Lead;
  },

  async updateLead(id: string, updates: LeadUpdate) {
    const { data, error } = await supabase
      .from("leads")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data as Lead;
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

    // Return lead data for quote creation
    return lead;
  },

  async getLeadStats(userId: string) {
    const { data, error } = await supabase
      .from("leads")
      .select("status")
      .eq("user_id", userId);

    if (error) throw error;

    const stats = {
      total: data.length,
      new: data.filter(l => l.status === "new").length,
      contacted: data.filter(l => l.status === "contacted").length,
      quoted: data.filter(l => l.status === "quoted").length,
      converted: data.filter(l => l.status === "converted").length,
      lost: data.filter(l => l.status === "lost").length,
    };

    return stats;
  },

  async searchLeads(userId: string, searchTerm: string) {
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("user_id", userId)
      .or(`client_name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data as Lead[];
  },
};
