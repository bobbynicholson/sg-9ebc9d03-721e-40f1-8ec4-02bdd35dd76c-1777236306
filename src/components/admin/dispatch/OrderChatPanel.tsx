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
      .subscribe();
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
    <div className="flex flex-col">
      {/* Messages */}
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
            <div
              key={m.id}
              className={`flex ${mine ? "justify-end" : "justify-start"}`}
            >
              <div className={`${pad} ${text} rounded-lg max-w-[80%] ${
                mine
                  ? "bg-blue-600 text-white"
                  : m.sender_role === "dispatcher"
                    ? "bg-white border border-slate-200 text-slate-900"
                    : "bg-brand-primary/15 border border-brand-primary/20 text-brand-primary"
              }`}>
                {!mine && (
                  <p className="text-[10px] font-semibold opacity-70 mb-0.5">
                    {m.sender_name ?? (m.sender_role === "dispatcher" ? "Dispatcher" : "Driver")}
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

      {/* Composer */}
      <div className="mt-2 flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={handleKey}
          placeholder={senderRole === "dispatcher" ? "Message the driver..." : "Message the dispatcher..."}
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
