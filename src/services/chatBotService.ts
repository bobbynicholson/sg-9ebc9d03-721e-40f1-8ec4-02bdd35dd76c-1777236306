/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";

export interface ChatMessage {
  id: string;
  company_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface ChatSession {
  id: string;
  company_id: string;
  user_id: string;
  user_role: string;
  started_at: string;
  ended_at?: string;
}

class ChatBotService {
  /**
   * Create a new chat session
   */
  async createSession(companyId: string, userId: string, userRole: string): Promise<ChatSession | null> {
    const { data, error } = await (supabase as any)
      .from("chat_sessions")
      .insert({
        company_id: companyId,
        user_id: userId,
        user_role: userRole,
        started_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating chat session:", error);
      return null;
    }

    return data as ChatSession;
  }

  /**
   * Save a chat message
   */
  async saveMessage(
    sessionId: string,
    companyId: string,
    userId: string,
    role: "user" | "assistant",
    content: string,
    metadata?: Record<string, any>
  ): Promise<ChatMessage | null> {
    const { data, error } = await (supabase as any)
      .from("chat_messages")
      .insert({
        session_id: sessionId,
        company_id: companyId,
        user_id: userId,
        role,
        content,
        metadata,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error("Error saving chat message:", error);
      return null;
    }

    return data as ChatMessage;
  }

  /**
   * Get chat history for a company
   */
  async getChatHistory(companyId: string, limit: number = 50): Promise<ChatMessage[]> {
    const { data, error } = await (supabase as any)
      .from("chat_messages")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Error fetching chat history:", error);
      return [];
    }

    return (data || []) as ChatMessage[];
  }

  /**
   * Get user's chat sessions
   */
  async getUserSessions(userId: string): Promise<ChatSession[]> {
    const { data, error } = await (supabase as any)
      .from("chat_sessions")
      .select("*")
      .eq("user_id", userId)
      .order("started_at", { ascending: false });

    if (error) {
      console.error("Error fetching user sessions:", error);
      return [];
    }

    return (data || []) as ChatSession[];
  }

  /**
   * Analyze company data for AI context (placeholder for future LLM integration)
   */
  async getCompanyContext(companyId: string, userRole: string): Promise<Record<string, any>> {
    try {
      // This will fetch relevant data based on user role
      // For now, returns basic structure - will be enhanced with LLM
      const context: Record<string, any> = {
        companyId,
        userRole,
        timestamp: new Date().toISOString()
      };

      // Role-specific data fetching
      switch (userRole) {
        case "admin":
          // Fetch orders, revenue, staff data
          const { data: orders, error: ordersErr } = await supabase
            .from("orders")
            .select("status, total, event_date")
            .eq("company_id", companyId)
            .limit(10);
          if (ordersErr) console.error("[chatBotService/getCompanyContext] orders lookup failed:", ordersErr);
          context.recentOrders = orders;
          break;

        case "driver":
          // Fetch driver assignments
          const { data: assignments, error: assignmentsErr } = await supabase
            .from("driver_assignments")
            .select("*")
            .eq("company_id", companyId)
            .limit(10);
          if (assignmentsErr) console.error("[chatBotService/getCompanyContext] driver_assignments lookup failed:", assignmentsErr);
          context.assignments = assignments;
          break;

        case "kitchen":
          // Fetch kitchen orders
          const { data: kitchenOrders, error: kitchenOrdersErr } = await supabase
            .from("orders")
            .select("*")
            .eq("company_id", companyId)
            .in("status", ["confirmed", "preparing"])
            .limit(10);
          if (kitchenOrdersErr) console.error("[chatBotService/getCompanyContext] kitchen orders lookup failed:", kitchenOrdersErr);
          context.activeOrders = kitchenOrders;
          break;

        case "shopping":
          // Fetch inventory data
          const { data: inventory, error: inventoryErr } = await (supabase as any)
            .from("inventory_items")
            .select("*")
            .eq("company_id", companyId)
            .limit(20);
          if (inventoryErr) console.error("[chatBotService/getCompanyContext] inventory_items lookup failed:", inventoryErr);
          context.inventory = inventory;
          break;

        case "cleaning":
          // Fetch equipment data
          const { data: equipment, error: equipmentErr } = await supabase
            .from("equipment")
            .select("*")
            .eq("company_id", companyId)
            .limit(20);
          if (equipmentErr) console.error("[chatBotService/getCompanyContext] equipment lookup failed:", equipmentErr);
          context.equipment = equipment;
          break;
      }

      return context;
    } catch (error) {
      console.error("Error fetching company context:", error);
      return { companyId, userRole, error: "Failed to fetch context" };
    }
  }

  /**
   * Process AI query (placeholder for future OpenAI/Claude integration)
   */
  async processAIQuery(
    _query: string,
    _companyId: string,
    _userRole: string,
    _context: Record<string, any>
  ): Promise<string> {
    // Audit (May 2026): every "placeholder response" here was a
    // fabricated answer ("you have N recent orders" pulled from a
    // partial context object, "your company is performing well"
    // unconditional, etc). Until a real LLM is wired in, return one
    // honest not-connected message rather than inventing operational
    // facts a chef or driver might act on.
    return "The chat assistant isn't connected yet. Open the relevant dashboard for live numbers.";
  }
}

export const chatBotService = new ChatBotService();