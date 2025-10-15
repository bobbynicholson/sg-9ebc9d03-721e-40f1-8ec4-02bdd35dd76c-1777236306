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
    
    // The component will handle mapping for display
    return data as Lead[];
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

  async createLead(lead: Omit<LeadInsert, "id" | "created_at" | "updated_at">) {
    const { data, error } = await supabase
      .from("leads")
      .insert([lead])
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
