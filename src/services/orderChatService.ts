/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase as supabaseTyped } from "@/integrations/supabase/client";
// WHY: order_chat_messages was added in 20260519120000 and the
// generated supabase types file doesn't include it yet. Cast once at
// the module boundary so the service body keeps its real types.
const supabase = supabaseTyped as any;

// CLI-J: client <-> caterer thread per order. Parallel to
// dispatchMessageService (driver <-> dispatcher) because the audiences
// are different: dispatch_messages must stay invisible to clients;
// order_chat_messages is the customer-facing channel.

export type OrderChatRole = "client" | "admin" | "kitchen" | "dispatcher" | "driver";

const STAFF_ROLES: OrderChatRole[] = ["admin", "kitchen", "dispatcher", "driver"];

export interface OrderChatMessage {
  id: string;
  company_id: string;
  order_id: string;
  sender_id: string;
  sender_role: OrderChatRole;
  body: string;
  read_at: string | null;
  created_at: string;
  sender_name?: string;
}

function otherSide(role: OrderChatRole): OrderChatRole[] {
  return role === "client" ? STAFF_ROLES : ["client"];
}

export const orderChatService = {
  async getMessagesForOrder(orderId: string): Promise<OrderChatMessage[]> {
    const { data, error } = await supabase
      .from("order_chat_messages")
      .select("*, sender:sender_id(full_name)")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[orderChatService/getMessagesForOrder]", error);
      return [];
    }
    return (data || []).map((m: any) => ({
      ...m,
      sender_name: m.sender?.full_name,
    }));
  },

  async sendMessage(payload: {
    companyId: string;
    orderId: string;
    senderId: string;
    senderRole: OrderChatRole;
    body: string;
  }): Promise<OrderChatMessage | null> {
    const text = payload.body.trim();
    if (!text) return null;
    const { data, error } = await supabase
      .from("order_chat_messages")
      .insert([{
        company_id: payload.companyId,
        order_id: payload.orderId,
        sender_id: payload.senderId,
        sender_role: payload.senderRole,
        body: text,
      }])
      .select("*, sender:sender_id(full_name)")
      .single();
    if (error) throw error;
    return { ...(data as any), sender_name: (data as any).sender?.full_name };
  },

  async markRead(messageIds: string[]): Promise<void> {
    if (messageIds.length === 0) return;
    const { error } = await supabase
      .from("order_chat_messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", messageIds)
      .is("read_at", null);
    if (error) console.warn("[orderChatService/markRead]", error);
  },

  // Unread count per order, for the viewer's role. Staff viewers see
  // unread counts of client messages; the client sees unread counts of
  // any staff message.
  async getUnreadCountByOrder(
    viewerRole: OrderChatRole,
    opts: { companyId?: string; orderIds?: string[] } = {},
  ): Promise<Record<string, number>> {
    const counterparts = otherSide(viewerRole);
    let query = supabase
      .from("order_chat_messages")
      .select("order_id")
      .in("sender_role", counterparts)
      .is("read_at", null);
    if (opts.companyId) query = query.eq("company_id", opts.companyId);
    if (opts.orderIds && opts.orderIds.length > 0) query = query.in("order_id", opts.orderIds);
    const { data, error } = await query;
    if (error) {
      console.error("[orderChatService/getUnreadCountByOrder]", error);
      return {};
    }
    const map: Record<string, number> = {};
    for (const r of (data || []) as any[]) {
      const id = r.order_id;
      map[id] = (map[id] || 0) + 1;
    }
    return map;
  },

  isStaffRole(role: OrderChatRole): boolean {
    return STAFF_ROLES.includes(role);
  },
};
