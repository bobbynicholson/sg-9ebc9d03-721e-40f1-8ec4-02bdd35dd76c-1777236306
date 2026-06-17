/* eslint-disable @typescript-eslint/no-explicit-any */

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type SupportTicket = Database["public"]["Tables"]["support_tickets"]["Row"];
type SupportTicketMessage = Database["public"]["Tables"]["support_ticket_messages"]["Row"];

export const supportTicketService = {
  async createTicket(ticketData: {
    userId: string;
    subject: string;
    category: string;
    priority: string;
    description: string;
    companyName?: string;
    contactEmail?: string;
    contactPhone?: string;
  }) {
    // support_tickets has no company_name/contact_email/contact_phone columns,
    // so fold any supplied contact details into the description rather than
    // 400ing the whole insert.
    const contactBits = [
      ticketData.companyName ? `Company: ${ticketData.companyName}` : null,
      ticketData.contactEmail ? `Email: ${ticketData.contactEmail}` : null,
      ticketData.contactPhone ? `Phone: ${ticketData.contactPhone}` : null,
    ].filter(Boolean);
    const description = contactBits.length
      ? `${ticketData.description}\n\n---\n${contactBits.join("\n")}`
      : ticketData.description;
    const { data, error } = await supabase
      .from("support_tickets")
      .insert({
          user_id: ticketData.userId,
          subject: ticketData.subject,
          category: ticketData.category,
          priority: ticketData.priority,
          description,
          status: "open",
        } as any)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getUserTickets(userId: string) {
    const { data, error } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data as SupportTicket[];
  },

  async getTicketById(ticketId: string) {
    const { data, error } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("id", ticketId)
      .single();

    if (error) throw error;
    return data as SupportTicket;
  },

  async getTicketMessages(ticketId: string) {
    const { data, error } = await supabase
      .from("support_ticket_messages")
      .select(`
        *,
        profiles (
          full_name,
          email
        )
      `)
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return data;
  },

  async addMessage(ticketId: string, userId: string, message: string) {
    const { data, error } = await supabase
      .from("support_ticket_messages")
      .insert([
        {
          ticket_id: ticketId,
          user_id: userId,
          message: message,
          is_from_staff: false,
          is_internal: false,
        },
      ])
      .select()
      .single();

    if (error) throw error;

    await supabase
      .from("support_tickets")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", ticketId);

    return data;
  },

  async updateTicketStatus(ticketId: string, status: string) {
    const { data, error } = await supabase
      .from("support_tickets")
      .update({ 
        status: status,
        updated_at: new Date().toISOString(),
        ...(status === "resolved" || status === "closed" ? { resolved_at: new Date().toISOString() } : {})
      })
      .eq("id", ticketId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  getStatusColor(status: string) {
    switch (status) {
      case "open":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "in_progress":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "waiting_customer":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "resolved":
        return "bg-green-100 text-green-800 border-green-200";
      case "closed":
        return "bg-gray-100 text-gray-800 border-gray-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  },

  getPriorityColor(priority: string) {
    switch (priority) {
      case "urgent":
        return "bg-red-100 text-red-800 border-red-200";
      case "high":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "medium":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "low":
        return "bg-green-100 text-green-800 border-green-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  },

  getCategoryIcon(category: string) {
    const icons: Record<string, string> = {
      billing: "💳",
      technical: "🔧",
      feature_request: "💡",
      bug_report: "🐛",
      general: "💬",
      onboarding: "🚀",
      training: "📚",
    };
    return icons[category] || "💬";
  },

  formatStatus(status: string) {
    return status
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  },
};
