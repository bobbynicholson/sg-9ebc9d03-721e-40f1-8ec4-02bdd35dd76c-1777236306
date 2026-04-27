/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type Complaint = Tables<"complaints">;

export const complaintService = {
  async getComplaints(companyId: string): Promise<Complaint[]> {
    const { data, error } = await supabase
      .from("complaints")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching complaints:", error);
      return [];
    }

    return data || [];
  },

  async getComplaint(complaintId: string): Promise<Complaint | null> {
    const { data, error } = await supabase
      .from("complaints")
      .select("*")
      .eq("id", complaintId)
      .single();

    if (error) {
      console.error("Error fetching complaint:", error);
      return null;
    }

    return data;
  },

  async createComplaint(complaint: Complaint): Promise<Complaint | null> {
    const { data, error } = await supabase
      .from("complaints")
      .insert([complaint])
      .select()
      .single();

    if (error) {
      console.error("Error creating complaint:", error);
      throw error;
    }

    return data;
  },

  async updateComplaint(complaintId: string, updates: Partial<Complaint>): Promise<Complaint | null> {
    const { data, error } = await supabase
      .from("complaints")
      .update(updates)
      .eq("id", complaintId)
      .select()
      .single();

    if (error) {
      console.error("Error updating complaint:", error);
      throw error;
    }

    return data;
  },

  async resolveComplaint(complaintId: string, resolution: string, resolvedBy: string): Promise<Complaint | null> {
    const { data, error } = await supabase
      .from("complaints")
      .update({
        status: "resolved",
        resolution,
        resolved_by: resolvedBy,
        resolved_at: new Date().toISOString()
      } as any)
      .eq("id", complaintId)
      .select()
      .single();

    if (error) {
      console.error("Error resolving complaint:", error);
      throw error;
    }

    return data;
  }
};
