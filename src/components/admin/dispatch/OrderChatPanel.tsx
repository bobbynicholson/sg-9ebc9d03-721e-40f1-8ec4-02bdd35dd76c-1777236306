/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Send, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { dispatchMessageService, type DispatchMessage, type SenderRole } from "@/services/dispatchMessageService";

interface Props {
  companyId: string | null;
  orderId: string;
  userId: string;
  senderRole: SenderRole;
  /** Compact = denser styling for sidebars (smaller spacing, smaller font). */
  compact?: boolean;
  /** Limits height; chat scrolls inside. */
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

/**
 * Per-order chat between dispatcher and driver. Same component is used on
 * both Live Operations and the driver portal. Realtime via the
 * `dispatch_messages` table; messages mark as read when the panel mounts
 * and again when new messages arrive while it's visible.
 */
export function OrderChatPanel({ companyId, orderId, userId, senderRole, compact = false, maxHeight = "280px" }: Props) {
  const [messages, setMessages] = useState<DispatchMessage[]>([]);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "live" | "reconnecting">("connecting");
  const [notificationStatus, setNotificationStatus] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Load + mark-read on mount
  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const list = await dispatchMessageService.getMessagesForOrder(orderId);
      if (cancelled) return;
      setMessages(list);
      setLoading(false);
      // Mark messages from the other side as read
      const otherRole: SenderRole = senderRole === "dispatcher" ? "driver" : "dispatcher";
      const unreadIds = list.filter(m => m.sender_role === otherRole && !m.read_at).map(m => m.id);
      if (unreadIds.length > 0) await dispatchMessageService.markRead(unreadIds);
    })();
    return () => { cancelled = true; };
  }, [orderId, senderRole]);

  // Realtime: subscribe to new messages on this order
  useEffect(() => {
    if (!orderId) return;
    setConnectionStatus("connecting");
    const channel = supabase
      .channel(`dispatch-msgs-${orderId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "dispatch_messages", filter: `order_id=eq.${orderId}` },
        async (payload: any) => {
          const row = payload?.new;
          if (!row) return;
          // Re-fetch with the sender name join (the realtime payload doesn't include it)
          const { data } = await supabase
            .from("dispatch_messages")
            .select("*, sender:sender_id(full_name)")
            .eq("id", row.id)
            .maybeSingle();
          if (data) {
            const msg: DispatchMessage = { ...(data as any), sender_name: (data as any).sender?.full_name };
            setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
            // If from the other side, mark read since the panel is visible
            const otherRole: SenderRole = senderRole === "dispatcher" ? "driver" : "dispatcher";
            if (msg.sender_role === otherRole && !msg.read_at) {
              dispatchMessageService.markRead([msg.id]);
            }
          }
        },
      )
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") setConnectionStatus("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setConnectionStatus("reconnecting");
      });
    return () => { channel.unsubscribe(); };
  }, [orderId, senderRole]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const handleSend = async () => {
    if (!companyId || !userId || !body.trim()) return;
    setSending(true);
    try {
      const msg = await dispatchMessageService.sendMessage({
        companyId, orderId, senderId: userId, senderRole, body,
      });
      if (msg) {
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
        setBody("");
        inputRef.current?.focus();
        setNotificationStatus("sending");
        try {
          await dispatchMessageService.notifyMessage(msg.id);
          setNotificationStatus("sent");
        } catch (notificationError) {
          console.warn("[OrderChatPanel] admin notification failed", notificationError);
          setNotificationStatus("failed");
        }
      }
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
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/50">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-blue-50/60 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-600/20">
            <MessageCircle className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">Dispatch chat</p>
            <p className="truncate text-[11px] text-slate-500">Dispatcher ↔ Driver · Messages stay with this order</p>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-600">
          <span className={`h-1.5 w-1.5 rounded-full ${connectionStatus === "live" ? "bg-emerald-500" : "bg-amber-400 animate-pulse"}`} />
          {connectionStatus === "live" ? "Live" : connectionStatus === "reconnecting" ? "Reconnecting" : "Connecting"}
        </span>
      </div>
      {/* Messages */}
      <div
        ref={scrollRef}
        className="overflow-y-auto bg-gradient-to-b from-slate-50 to-blue-50/30 px-3 py-4 space-y-3"
        style={{ maxHeight }}
      >
        {loading ? (
          <p className={`${text} text-slate-500 text-center py-4`}>Loading messages...</p>
        ) : messages.length === 0 ? (
            <div className={`${text} text-slate-500 text-center py-8 flex flex-col items-center gap-2`}>
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-600"><MessageCircle className="w-5 h-5" /></span>
            <span className="font-medium text-slate-700">No messages yet</span>
            <span>Send the first update to start the handover.</span>
          </div>
        ) : messages.map(m => {
          const mine = m.sender_id === userId;
          return (
            <div
              key={m.id}
              className={`flex ${mine ? "justify-end" : "justify-start"}`}
            >
              <div className={`${pad} ${text} rounded-2xl max-w-[84%] shadow-sm ${
                mine
                  ? "rounded-br-md bg-blue-600 text-white"
                  : m.sender_role === "dispatcher"
                    ? "rounded-bl-md border border-slate-200 bg-white text-slate-900"
                    : "rounded-bl-md border border-brand-primary/20 bg-brand-primary/10 text-brand-primary"
              }`}>
                <div className={`mb-1 flex items-baseline justify-between gap-3 text-[10px] ${mine ? "text-blue-100" : "text-slate-500"}`}>
                  <span className={`font-semibold ${mine ? "text-white" : "text-slate-800"}`}>{mine ? "You" : (m.sender_name ?? (m.sender_role === "dispatcher" ? "Dispatcher" : "Driver"))}</span>
                  {relativeShort(m.created_at)}
                </div>
                <p className="whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <div className="border-t border-slate-200 bg-white p-3">
        <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={handleKey}
          placeholder={senderRole === "dispatcher" ? "Message the driver..." : "Message the dispatcher..."}
          rows={2}
          className="min-h-11 flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
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
      <p className="px-1 pt-1 text-[10px] text-slate-400">Enter to send · Shift+Enter for a new line</p>
      {notificationStatus === "sending" && <p className="mt-2 rounded-lg bg-blue-50 px-2.5 py-2 text-[11px] text-blue-700">Message sent · notifying admins…</p>}
      {notificationStatus === "sent" && <p className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-2 text-[11px] text-emerald-700">Message sent · admins received an in-app alert.</p>}
      {notificationStatus === "failed" && <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] text-amber-700">Message sent, but the admin alert could not be delivered.</p>}
      </div>
    </div>
  );
}
