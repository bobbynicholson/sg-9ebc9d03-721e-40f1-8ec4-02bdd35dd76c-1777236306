/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { supabase } from "@/integrations/supabase/client";

export type SenderRole = "dispatcher" | "driver";

export interface DispatchMessage {
  id: string;
  company_id: string;
  order_id: string;
  sender_id: string;
  sender_role: SenderRole;
  body: string;
  read_at: string | null;
  created_at: string;
  sender_name?: string;
}

export const dispatchMessageService = {
  async getMessagesForOrder(orderId: string): Promise<DispatchMessage[]> {
    const { data, error } = await supabase
      .from("dispatch_messages")
      .select("*, sender:sender_id(full_name)")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("Error loading messages:", error);
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
    senderRole: SenderRole;
    body: string;
  }): Promise<DispatchMessage | null> {
    const text = payload.body.trim();
    if (!text) return null;
    const { data, error } = await supabase
      .from("dispatch_messages")
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
      .from("dispatch_messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", messageIds)
      .is("read_at", null);
    if (error) console.warn("Could not mark messages read:", error);
  },

  /**
   * Unread count per order for a viewer. We pass viewerRole so a dispatcher
   * counts driver-sent messages they haven't read, and vice versa.
   */
  async getUnreadCountByOrder(
    companyId: string,
    viewerRole: SenderRole,
  ): Promise<Record<string, number>> {
    const otherRole: SenderRole = viewerRole === "dispatcher" ? "driver" : "dispatcher";
    const { data, error } = await supabase
      .from("dispatch_messages")
      .select("order_id")
      .eq("company_id", companyId)
      .eq("sender_role", otherRole)
      .is("read_at", null);
    if (error) console.error("[dispatchMessageService/getUnreadCountByOrder] dispatch_messages lookup failed:", error);
    const map: Record<string, number> = {};
    for (const r of (data || []) as any[]) {
      const id = r.order_id;
      map[id] = (map[id] || 0) + 1;
    }
    return map;
  },
};
