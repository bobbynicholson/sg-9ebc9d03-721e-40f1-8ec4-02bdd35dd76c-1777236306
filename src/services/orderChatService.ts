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
  async getClientUserIdForOrder(orderId: string): Promise<string | null> {
    if (!orderId) return null;
    const { data, error } = await supabase
      .from("orders")
      .select("client_id")
      .eq("id", orderId)
      .maybeSingle();
    if (error) {
      console.warn("[orderChatService/getClientUserIdForOrder]", error);
      return null;
    }
    const clientId = (data as any)?.client_id;
    if (!clientId) return null;

    // clients is intentionally RLS-protected from ordinary staff reads.
    // Resolve only the auth uid through the SECURITY DEFINER function so a
    // driver can notify the correct client without exposing client PII.
    const { data: resolvedId, error: rpcError } = await supabase.rpc(
      "resolve_client_user_id",
      { p_client_id: clientId },
    );
    if (rpcError) {
      console.warn("[orderChatService/getClientUserIdForOrder] resolver failed", rpcError);
      return null;
    }
    return (resolvedId as string) || null;
  },

  async getMessagesForOrder(orderId: string): Promise<OrderChatMessage[]> {
    // sender_id is polymorphic (client | staff), so there's no FK to embed a
    // name through. Load the rows, then resolve staff names separately.
    const { data, error } = await supabase
      .from("order_chat_messages")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[orderChatService/getMessagesForOrder]", error);
      return [];
    }
    const rows = (data || []) as any[];
    const staffIds = [...new Set(rows.filter((m) => m.sender_role !== "client" && m.sender_id).map((m) => m.sender_id))];
    let nameById: Record<string, string> = {};
    if (staffIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", staffIds);
      nameById = Object.fromEntries(((profs || []) as any[]).map((p) => [p.id, p.full_name]));
    }
    return rows.map((m) => ({
      ...m,
      sender_name: nameById[m.sender_id],
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
      // sender_id references auth.users, not profiles. Embedding a
      // `sender:sender_id(full_name)` relation here makes PostgREST reject
      // the insert on deployments where that auth relation is not exposed.
      // Staff names are resolved separately when messages are read.
      .select("*")
      .single();
    if (error) {
      const detail = [error.message, error.details, error.hint].filter(Boolean).join(" ");
      throw new Error(detail || "The message could not be saved.");
    }
    return { ...(data as any) };
  },

  /**
   * Ask the server to fan the persisted message out to the opposite
   * audience. This must run server-side: a client session cannot enumerate
   * every staff profile in the tenant, and a driver must not be able to
   * choose arbitrary notification recipients.
   */
  async notifyMessage(messageId: string): Promise<{ notified: number }> {
    const response = await fetch("/api/orders/chat-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || "The message was sent, but notifications could not be delivered.");
    }
    return { notified: Number(payload?.notified || 0) };
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
