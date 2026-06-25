/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Send, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { orderChatService, type OrderChatMessage, type OrderChatRole } from "@/services/orderChatService";
import { notificationService } from "@/services/notificationService";
import { UserRole } from "@/types/app";

interface Props {
  companyId: string | null;
  orderId: string;
  userId: string;
  senderRole: OrderChatRole;
  // Used to format the notification deeplink + title differently per
  // audience. Optional - falls back to a generic "New message" copy.
  orderLabel?: string | null;
  // When the sender is a staff member, the notification recipient is
  // the client.user_id mapped to this order. Resolved by the caller
  // (admin Messages tab knows the order_id; the lookup is RLS-safe
  // because admin has SELECT on clients).
  clientUserId?: string | null;
  compact?: boolean;
  maxHeight?: string;
}

function relativeShort(iso: string): string {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return "";
  const diffMin = Math.round((Date.now() - t) / 60_000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

function bubbleClass(senderRole: OrderChatRole, mine: boolean): string {
  if (mine) return "bg-blue-600 text-white";
  if (senderRole === "client") return "bg-brand-primary/15 border border-brand-primary/20 text-brand-primary";
  return "bg-white border border-slate-200 text-slate-900";
}

// CLI-J: shared client <-> caterer chat panel. Mirrors the dispatch
// OrderChatPanel layout but talks to order_chat_messages and treats
// "the other side" as the inverse audience (client vs any staff
// role). Notification fan-out is done from this component so both
// embed points (client dashboard dialog + admin Messages tab) ship
// the bell update.
export function OrderClientChatPanel({
  companyId,
  orderId,
  userId,
  senderRole,
  orderLabel,
  clientUserId,
  compact = false,
  maxHeight = "320px",
}: Props) {
  const [messages, setMessages] = useState<OrderChatMessage[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const isStaff = senderRole !== "client";
  const otherSideLabel = isStaff ? "client" : "the team";

  // Mark every counterpart message read on mount.
  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const list = await orderChatService.getMessagesForOrder(orderId);
      if (cancelled) return;
      setMessages(list);
      setLoading(false);
      const unreadIds = list
        .filter(m => (isStaff ? m.sender_role === "client" : m.sender_role !== "client") && !m.read_at)
        .map(m => m.id);
      if (unreadIds.length > 0) await orderChatService.markRead(unreadIds);
    })();
    return () => { cancelled = true; };
  }, [orderId, isStaff]);

  // Realtime: new messages on this order.
  useEffect(() => {
    if (!orderId) return;
    const channel = supabase
      .channel(`order-chat-${orderId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "order_chat_messages", filter: `order_id=eq.${orderId}` },
        async (payload: any) => {
          const row = payload?.new;
          if (!row) return;
          // Re-fetch the row (realtime payloads can lag the projection).
          // sender_id is polymorphic (client or staff), so there's no FK to
          // embed a name through - the panel keys off sender_role, not name.
          const { data } = await supabase
            .from("order_chat_messages")
            .select("*")
            .eq("id", row.id)
            .maybeSingle();
          if (data) {
            const msg: OrderChatMessage = { ...(data as any) };
            setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
            const fromOtherSide = isStaff ? msg.sender_role === "client" : msg.sender_role !== "client";
            if (fromOtherSide && !msg.read_at) {
              orderChatService.markRead([msg.id]);
            }
          }
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [orderId, isStaff]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // WHY: notify the OPPOSITE audience on every outbound message. The
  // client gets a single recipient (their user_id). Staff get a
  // tenant-wide broadcast filtered to admin / dispatcher / kitchen
  // roles so the kitchen lead sees the chat ping in the bell.
  const fanOutNotification = async (sentBody: string) => {
    if (!companyId) return;
    const preview = sentBody.length > 140 ? `${sentBody.slice(0, 137)}...` : sentBody;
    const orderRef = orderLabel || "your event";
    if (isStaff) {
      // Staff -> client.
      if (!clientUserId) return;
      try {
        await notificationService.createNotification({
          company_id: companyId,
          recipient_id: clientUserId,
          notification_type: "order_message",
          title: `New message about ${orderRef}`,
          message: preview,
          priority: "normal",
          related_entity_type: "order",
          related_entity_id: orderId,
          link: `/client-portal/my-orders?orderId=${orderId}`,
        });
      } catch (e) {
        console.warn("[OrderClientChatPanel] staff->client notification failed:", e);
      }
    } else {
      // Client -> staff. Broadcast to admin + dispatcher + kitchen
      // roles. recipient_id on the row points at each profile via
      // broadcastNotification's fan-out.
      try {
        await notificationService.broadcastNotification({
          companyId,
          type: "order_message",
          title: `Client message - ${orderRef}`,
          message: preview,
          targetRoles: [
            UserRole.COMPANY_ADMIN,
            UserRole.ADMIN,
            UserRole.SUPER_ADMIN,
            UserRole.SALES_ADMIN,
            UserRole.REGION_ADMIN,
            UserRole.KITCHEN_MANAGER,
            UserRole.KITCHEN_STAFF,
          ],
          priority: "high",
          link: `/admin/orders?orderId=${orderId}&tab=messages`,
          relatedEntityType: "order",
          relatedEntityId: orderId,
        });
      } catch (e) {
        console.warn("[OrderClientChatPanel] client->staff notification failed:", e);
      }
    }
  };

  const handleSend = async () => {
    if (!companyId || !userId || !body.trim()) return;
    const outgoing = body.trim();
    setSending(true);
    try {
      const msg = await orderChatService.sendMessage({
        companyId, orderId, senderId: userId, senderRole, body: outgoing,
      });
      if (msg) {
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        setBody("");
        inputRef.current?.focus();
        // Fire-and-forget so the UI returns to ready immediately.
        void fanOutNotification(outgoing);
      }
    } catch (e) {
      console.error("[OrderClientChatPanel/handleSend]", e);
    } finally {
      setSending(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const text = compact ? "text-xs" : "text-sm";
  const pad = compact ? "px-2.5 py-1.5" : "px-3 py-2";

  return (
    <div className="flex flex-col">
      <div
        ref={scrollRef}
        className="overflow-y-auto rounded-md bg-slate-50 border border-slate-200 px-2 py-2 space-y-1.5"
        style={{ maxHeight }}
      >
        {loading ? (
          <p className={`${text} text-slate-500 text-center py-4`}>Loading messages...</p>
        ) : messages.length === 0 ? (
          <div className={`${text} text-slate-500 text-center py-6 flex flex-col items-center gap-2`}>
            <MessageCircle className="w-6 h-6 text-slate-300" />
            No messages yet. Send the first one.
          </div>
        ) : messages.map(m => {
          const mine = m.sender_id === userId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`${pad} ${text} rounded-lg max-w-[80%] ${bubbleClass(m.sender_role, mine)}`}>
                {!mine && (
                  <p className="text-[10px] font-semibold opacity-70 mb-0.5">
                    {m.sender_name ?? (m.sender_role === "client" ? "Client" : "Team")}
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`text-[10px] mt-0.5 ${mine ? "text-blue-100" : "text-slate-500"}`}>
                  {relativeShort(m.created_at)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={handleKey}
          placeholder={`Message ${otherSideLabel}...`}
          rows={2}
          className="flex-1 resize-none border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={sending || !companyId}
        />
        <Button
          size="sm"
          onClick={handleSend}
          disabled={sending || !body.trim() || !companyId}
          className="bg-blue-600 hover:bg-blue-700 gap-1.5 h-9"
        >
          <Send className="w-3.5 h-3.5" />
          Send
        </Button>
      </div>
      <p className="text-[10px] text-slate-400 mt-1">Enter to send · Shift+Enter for newline</p>
    </div>
  );
}
