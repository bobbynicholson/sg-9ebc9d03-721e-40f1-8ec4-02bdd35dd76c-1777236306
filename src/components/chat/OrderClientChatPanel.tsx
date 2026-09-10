/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Send, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { orderChatService, type OrderChatMessage, type OrderChatRole } from "@/services/orderChatService";
import { useToast } from "@/hooks/use-toast";

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
  if (senderRole === "client") return "bg-white border border-slate-200 text-slate-800 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100";
  return "bg-slate-100 border border-slate-200 text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100";
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
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "live" | "reconnecting">("connecting");
  const [sendError, setSendError] = useState<string | null>(null);
  const [notificationStatus, setNotificationStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const { toast } = useToast();

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
    setConnectionStatus("connecting");
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
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") setConnectionStatus("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConnectionStatus("reconnecting");
        }
      });
    return () => { supabase.removeChannel(channel); };
  }, [orderId, isStaff]);

  // A parked tab or installed PWA can suspend its websocket. Reconcile the
  // thread when it returns to the foreground so no message is missed during
  // the reconnect window.
  useEffect(() => {
    if (!orderId) return;
    const refreshOnVisible = () => {
      if (document.visibilityState !== "visible") return;
      void orderChatService.getMessagesForOrder(orderId).then(setMessages);
    };
    document.addEventListener("visibilitychange", refreshOnVisible);
    return () => document.removeEventListener("visibilitychange", refreshOnVisible);
  }, [orderId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const handleSend = async () => {
    if (!companyId || !userId || !body.trim()) return;
    const outgoing = body.trim();
    setSending(true);
    setSendError(null);
    try {
      const msg = await orderChatService.sendMessage({
        companyId, orderId, senderId: userId, senderRole, body: outgoing,
      });
      if (msg) {
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        setBody("");
        inputRef.current?.focus();
        setNotificationStatus("sending");
        try {
          await orderChatService.notifyMessage(msg.id);
          setNotificationStatus("sent");
        } catch (notificationError) {
          console.warn("[OrderClientChatPanel] notification fan-out failed", notificationError);
          setNotificationStatus("failed");
        }
      }
    } catch (e) {
      console.error("[OrderClientChatPanel/handleSend]", e);
      const message = e instanceof Error ? e.message : "Your message could not be sent.";
      setSendError(message);
      toast({
        title: "Message not sent",
        description: message,
        variant: "destructive",
      });
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
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50 dark:border-slate-700 dark:bg-slate-950 dark:shadow-black/20">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-3 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/25">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
            {isStaff ? "Client conversation" : "Your catering team"}
          </p>
          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
            {orderLabel || "Order conversation"} · Messages stay with this order
          </p>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          <span className={`h-1.5 w-1.5 rounded-full ${connectionStatus === "live" ? "bg-emerald-500" : "bg-amber-400 animate-pulse"}`} />
          {connectionStatus === "live" ? "Live" : "Connecting"}
        </span>
      </div>
      <div
        ref={scrollRef}
        className="overflow-y-auto bg-slate-50/90 px-3 py-4 space-y-3 dark:bg-slate-950/60"
        style={{ maxHeight }}
      >
        {loading ? (
          <p className={`${text} text-slate-500 text-center py-4`}>Loading messages...</p>
        ) : messages.length === 0 ? (
          <div className={`${text} text-slate-500 text-center py-8 flex flex-col items-center gap-2`}>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-400">
              <MessageCircle className="h-6 w-6" />
            </div>
            <span className="font-medium text-slate-700 dark:text-slate-200">No messages yet</span>
            <span>Send a message to start the conversation.</span>
          </div>
        ) : messages.map(m => {
          const mine = m.sender_id === userId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`${pad} ${text} rounded-2xl max-w-[84%] shadow-sm ${bubbleClass(m.sender_role, mine)}`}>
                {!mine && (
                  <p className="text-[10px] font-semibold opacity-70 mb-0.5">
                    {m.sender_name ?? (m.sender_role === "client" ? "Client" : "Team")}
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`text-[10px] mt-1 ${mine ? "text-blue-100" : "text-slate-500 dark:text-slate-400"}`}>
                  {relativeShort(m.created_at)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={handleKey}
          placeholder={`Message ${otherSideLabel}...`}
          rows={2}
          maxLength={2000}
          aria-label={`Message ${otherSideLabel}`}
          className="min-h-11 flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          disabled={sending || !companyId}
        />
        <Button
          size="sm"
          onClick={handleSend}
          disabled={sending || !body.trim() || !companyId}
          className="h-11 rounded-xl bg-blue-600 px-4 shadow-sm shadow-blue-600/20 hover:bg-blue-700 gap-1.5"
        >
          <Send className="w-3.5 h-3.5" />
          Send
        </Button>
      </div>
      <p className="text-[10px] text-slate-400 mt-1">Enter to send · Shift+Enter for newline</p>
       {notificationStatus === "sending" && <p className="border-t border-blue-100 bg-blue-50 px-3 py-2 text-[11px] text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-300">Message sent · notifying the other side…</p>}
       {notificationStatus === "sent" && <p className="border-t border-emerald-100 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">Message delivered · the other side will see an in-app alert.</p>}
       {notificationStatus === "failed" && <p className="border-t border-amber-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">Message sent, but the in-app alert could not be delivered.</p>}
       {sendError && <p className="mt-1 px-3 pb-2 text-[11px] text-rose-600 dark:text-rose-400">{sendError}</p>}
      </div>
    </div>
  );
}
