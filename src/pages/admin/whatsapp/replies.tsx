/**
 * /admin/whatsapp/replies - every WhatsApp conversation for the company.
 * Conversations and messages are paged on the server. ?phone= opens one
 * person's history, even if they haven't replied yet.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { ArrowLeft, MessageCircle, Minus, Phone, RefreshCw, Search, Send } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminNav } from "@/components/admin/AdminNav";
import { WhatsAppTabs } from "@/components/admin/whatsapp/WhatsAppTabs";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { PortalHeader, PortalShell } from "@/components/portal/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WhatsAppFailureNotice } from "@/components/admin/whatsapp/WhatsAppFailureNotice";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { buildWhatsAppUrl, normaliseToE164 } from "@/lib/whatsapp";
import { mergeConversations, type ThreadMessage } from "@/lib/whatsapp/conversations";
import { statusLabel } from "@/lib/whatsapp/activity";
import { describeWhatsAppFailure, readableWhatsAppError } from "@/lib/whatsapp/failureReason";
import { cn } from "@/lib/utils";
import { UserRole } from "@/types/app";

const REFRESH_MS = 20_000;

interface Conversation {
  id: string;
  phone: string;
  contact_name: string | null;
  last_message_at: string;
  last_preview: string | null;
  unread_count: number;
}

interface Thread {
  phone: string;
  name: string | null;
  canReply: boolean;
  messages: ThreadMessage[];
  hasOlder: boolean;
  olderCursor: string | null;
}

function shortTime(value: string): string {
  return new Date(value).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function messageKindLabel(kind: string | undefined): string {
  const labels: Record<string, string> = {
    text: "Text",
    template: "Template",
    image: "Image",
    video: "Video",
    audio: "Voice message",
    document: "Document",
    sticker: "Sticker",
    location: "Location",
    interactive: "Interactive reply",
    button: "Button reply",
    contacts: "Contact card",
    reaction: "Reaction",
    media_placeholder: "Media message",
    unsupported: "Unsupported message",
    ephemeral: "Disappearing message",
  };
  return labels[kind || ""] || (kind ? kind.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Message");
}

function mediaFallback(kind: string | undefined, direction: "in" | "out"): string {
  const label = messageKindLabel(kind);
  if (direction === "in") {
    if (kind === "image") return "Image received";
    if (kind === "video") return "Video received";
    if (kind === "audio") return "Voice message received";
    if (kind === "document") return "Document received";
    if (kind === "location") return "Location received";
    if (kind === "sticker") return "Sticker received";
    return `${label} received`;
  }
  return `${label} sent`;
}

function WhatsAppMedia({ message, companyId }: { message: ThreadMessage; companyId: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!message.mediaId || failed) {
    return <p className="mt-1 text-xs opacity-75">
      {failed ? "Media could not be loaded. It may have expired or WhatsApp may need reconnecting." : "This older message was saved without its media file."}
    </p>;
  }
  const params = new URLSearchParams({ messageId: message.id });
  if (companyId) params.set("companyId", companyId);
  const src = `/api/admin/whatsapp/media?${params.toString()}`;
  if (message.kind === "audio") return <audio className="mt-2 block w-full min-w-[min(16rem,70vw)] max-w-full" controls preload="metadata" src={src} onError={() => setFailed(true)} aria-label="WhatsApp voice message" />;
  if (message.kind === "video") return <video className="mt-2 block max-h-[min(24rem,55vh)] w-full max-w-full rounded-lg bg-black" controls playsInline preload="metadata" src={src} onError={() => setFailed(true)} aria-label="WhatsApp video message" />;
  if (message.kind === "image" || message.kind === "sticker") return <img className="mt-2 block max-h-[min(24rem,55vh)] max-w-full rounded-lg object-contain" src={src} alt={message.text || `WhatsApp ${message.kind}`} onError={() => setFailed(true)} />;
  if (message.kind === "document") return <a className="mt-2 inline-flex max-w-full items-center gap-2 rounded-lg border border-current/20 px-3 py-2 font-medium underline underline-offset-2" href={src} target="_blank" rel="noreferrer">{message.mediaFilename || "Open shared document"}</a>;
  return null;
}

function reactionTargetId(message: ThreadMessage): string | null {
  if (message.relatedMessageId) return message.relatedMessageId;
  return message.text.match(/(?:to|from) message (wamid\.[^\s]+)/i)?.[1] || null;
}

function reactionEmoji(message: ThreadMessage): string | null {
  if (message.reactionEmoji) return message.reactionEmoji;
  return message.text.match(/^Reacted\s+(.+?)\s+to (?:a )?message/i)?.[1] || null;
}

function reactionWasRemoved(message: ThreadMessage): boolean {
  return /^Removed a reaction/i.test(message.text);
}

function reactionEventLabel(message: ThreadMessage, hasOlderMessages: boolean): string {
  const participant = message.direction === "in" ? "Client" : "Business";
  if (reactionWasRemoved(message)) return `${participant} removed a reaction`;
  if (!reactionTargetId(message)) return `${participant} reacted in this chat`;
  return `${participant} reacted to ${hasOlderMessages ? "an earlier message" : "a message in this chat"}`;
}

function conversationPreview(value: string | null): string {
  if (!value) return "No message preview";
  if (/^Reacted\s+.+\s+to message\b/i.test(value)) return "Reaction on a message";
  if (/^Removed a reaction\b/i.test(value)) return "Reaction updated";
  const media = value.match(/^\((.+) message\)$/i);
  if (media) return `${messageKindLabel(media[1].toLowerCase())} received`;
  return value;
}

function summarizeReactions(reactions: ThreadMessage[]) {
  const byEmoji = new Map<string, ThreadMessage[]>();
  for (const reaction of reactions) {
    const emoji = reactionEmoji(reaction);
    if (emoji) byEmoji.set(emoji, [...(byEmoji.get(emoji) || []), reaction]);
  }
  return [...byEmoji.entries()].map(([emoji, items]) => {
    const participants = items.map((item) => item.direction === "in" ? "Client" : "Business");
    const count = items.length;
    return {
      emoji,
      count,
      title: items.map((item) => `${item.direction === "in" ? "Client" : "Business"} - ${shortTime(item.at)}`).join("; "),
      label: `${count} ${emoji} reaction${count === 1 ? "" : "s"} from ${participants.join(" and ")}`,
    };
  });
}

function RepliesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, company } = useAuth() as any;
  const companyId = company?.id || user?.company_id || null;
  const isMobile = useIsMobile();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [unreadConversations, setUnreadConversations] = useState(0);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [reply, setReply] = useState("");
  const [replyError, setReplyError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [mobileViewportHeight, setMobileViewportHeight] = useState<number | null>(null);
  const selectedRef = useRef<string | null>(null);
  const threadScrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const viewportResizeRef = useRef(false);
  const olderScrollRef = useRef<{ top: number; height: number } | null>(null);
  const previousThreadPhoneRef = useRef<string | null>(null);
  selectedRef.current = selected;

  useEffect(() => {
    if (!isMobile) {
      setMobileViewportHeight(null);
      return;
    }

    const viewport = window.visualViewport;
    const updateViewportHeight = () => {
      viewportResizeRef.current = true;
      setMobileViewportHeight(Math.round(viewport?.height || window.innerHeight));
      window.requestAnimationFrame(() => {
        const element = threadScrollRef.current;
        if (element && stickToBottomRef.current) element.scrollTop = element.scrollHeight;
        window.requestAnimationFrame(() => { viewportResizeRef.current = false; });
      });
    };

    updateViewportHeight();
    viewport?.addEventListener("resize", updateViewportHeight);
    window.addEventListener("resize", updateViewportHeight);
    return () => {
      viewport?.removeEventListener("resize", updateViewportHeight);
      window.removeEventListener("resize", updateViewportHeight);
      viewportResizeRef.current = false;
    };
  }, [isMobile]);

  useEffect(() => {
    if (!thread) return;
    const element = threadScrollRef.current;
    if (!element) return;
    const olderPosition = olderScrollRef.current;
    if (olderPosition) {
      element.scrollTop = olderPosition.top + element.scrollHeight - olderPosition.height;
      olderScrollRef.current = null;
    } else if (previousThreadPhoneRef.current !== thread.phone || stickToBottomRef.current) {
      element.scrollTop = element.scrollHeight;
    }
    previousThreadPhoneRef.current = thread.phone;
  }, [thread?.phone, thread?.messages.length]);

  const companyQuery = companyId ? `companyId=${encodeURIComponent(companyId)}` : "";
  const listUrl = useCallback((cursor?: string | null) => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (unreadOnly) params.set("unread", "1");
    if (cursor) params.set("cursor", cursor);
    const query = [companyQuery, params.toString()].filter(Boolean).join("&");
    return `/api/admin/whatsapp/inbox${query ? `?${query}` : ""}`;
  }, [companyQuery, search, unreadOnly]);
  const baseUrl = useMemo(() => `/api/admin/whatsapp/inbox${companyQuery ? `?${companyQuery}` : ""}`, [companyQuery]);

  useEffect(() => {
    setConversations([]);
    setNextCursor(null);
    setUnreadConversations(0);
    setSelected(null);
    selectedRef.current = null;
    setThread(null);
    setLoadError(null);
    setRefreshError(null);
    setLoading(Boolean(companyId));
  }, [companyId]);

  const fetchJson = async (url: string, body?: unknown) => {
    const response = await fetch(url, body
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : undefined);
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(json?.error || "That didn't work. Try again.");
    return json;
  };

  const loadFirstPage = useCallback(async (quiet: boolean) => {
    if (!quiet) setLoading(true);
    try {
      const json = await fetchJson(listUrl());
      setAvailable(json.available);
      setUnreadConversations(json.unreadConversations);
      setLoadError(null);
      setRefreshError(null);
      if (quiet) {
        setConversations((current) => mergeConversations(json.conversations, current));
      } else {
        setConversations(json.conversations);
        setNextCursor(json.nextCursor);
      }
    } catch (e) {
      const message = readableWhatsAppError(e, "Could not load replies.");
      if (!quiet) setLoadError(message);
      else setRefreshError(message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [listUrl]);

  // Search waits for a pause in typing. Changing it starts again from page one.
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadFirstPage(false); }, search ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [loadFirstPage, search]);

  const loadThread = useCallback(async (phone: string) => {
    const joiner = baseUrl.includes("?") ? "&" : "?";
    const json = await fetchJson(`${baseUrl}${joiner}phone=${encodeURIComponent(phone)}`);
    if (selectedRef.current !== phone) return;
    setThreadError(null);
    setThread((current) => {
      if (!current || current.phone !== json.phone) return json;
      // Keep older messages that were already loaded.
      const ids = new Set(json.messages.map((message: ThreadMessage) => message.id));
      return { ...current, canReply: json.canReply, name: json.name, messages: [...current.messages.filter((message) => !ids.has(message.id)), ...json.messages] };
    });
  }, [baseUrl]);

  const openConversation = useCallback(async (rawPhone: string) => {
    const phone = normaliseToE164(rawPhone);
    if (!phone) return;
    setSelected(phone);
    selectedRef.current = phone;
    setThread(null);
    setThreadError(null);
    setReplyError(null);
    stickToBottomRef.current = true;
    setReply("");
    try {
      await loadThread(phone);
      await fetchJson(baseUrl, { action: "read", phone });
      setConversations((current) => current.map((item) => (item.phone === phone ? { ...item, unread_count: 0 } : item)));
    } catch (e) {
      setThreadError(readableWhatsAppError(e, "Could not load this conversation. Try again."));
      toast({ title: "WhatsApp", description: readableWhatsAppError(e, "Try again."), variant: "destructive" });
    }
  }, [baseUrl, loadThread, toast]);

  // A link from a client's contact row opens their history straight away.
  const requestedPhone = typeof router.query.phone === "string" ? router.query.phone : "";
  useEffect(() => {
    if (requestedPhone && !selectedRef.current) void openConversation(requestedPhone);
  }, [requestedPhone, openConversation]);

  // New replies appear by themselves while the page is open.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void loadFirstPage(true);
      if (selectedRef.current) {
        void loadThread(selectedRef.current).catch((error) => setThreadError(readableWhatsAppError(error, "Could not refresh this conversation.")));
      }
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [loadFirstPage, loadThread]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const json = await fetchJson(listUrl(nextCursor));
      setConversations((current) => [...current, ...json.conversations.filter((item: Conversation) => !current.some((row) => row.phone === item.phone))]);
      setNextCursor(json.nextCursor);
    } catch (e) {
      toast({ title: "WhatsApp", description: readableWhatsAppError(e, "Try again."), variant: "destructive" });
    } finally {
      setLoadingMore(false);
    }
  };

  const loadOlder = async () => {
    if (!thread?.olderCursor) return;
    setLoadingOlder(true);
    try {
      const element = threadScrollRef.current;
      const previousPosition = element ? { top: element.scrollTop, height: element.scrollHeight } : null;
      const joiner = baseUrl.includes("?") ? "&" : "?";
      const json = await fetchJson(`${baseUrl}${joiner}phone=${encodeURIComponent(thread.phone)}&before=${encodeURIComponent(thread.olderCursor)}`);
      olderScrollRef.current = previousPosition;
      setThread({ ...thread, messages: [...json.messages, ...thread.messages], hasOlder: json.hasOlder, olderCursor: json.olderCursor });
    } catch (e) {
      toast({ title: "WhatsApp", description: readableWhatsAppError(e, "Try again."), variant: "destructive" });
    } finally {
      setLoadingOlder(false);
    }
  };

  const sendReply = async () => {
    if (!thread) return;
    setReplyError(null);
    setSending(true);
    try {
      const result = await fetchJson(baseUrl, { action: "reply", phone: thread.phone, text: reply });
      setReply("");
      toast({
        title: result.tracked === false ? "Reply accepted; delivery tracking unavailable" : "Reply accepted by Meta",
        description: result.tracked === false
          ? "Meta accepted the reply, but CateringMS could not save its delivery reference. Check the phone directly."
          : "Sent means accepted. Delivered confirms it reached the phone.",
        variant: result.tracked === false ? "destructive" : undefined,
      });
      void Promise.all([loadThread(thread.phone), loadFirstPage(true)]).catch(() => {
        toast({ title: "Reply accepted; history not refreshed", description: "Meta accepted the reply. Refresh this conversation to see its latest status." });
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "WhatsApp could not send your reply. Try again.";
      setReplyError(message);
      const failure = describeWhatsAppFailure(message);
      toast({ title: failure.title, description: failure.nextStep, variant: "destructive" });
      void loadThread(thread.phone).catch(() => undefined);
    } finally {
      setSending(false);
    }
  };

  const title = thread?.name || selected || "";
  const mobileThreadView = Boolean(selected && isMobile);
  const mobileThreadHeight = mobileViewportHeight === null
    ? undefined
    : `${Math.max(0, mobileViewportHeight - 88)}px`;
  const reactionGroups = useMemo(() => {
    const messages = thread?.messages || [];
    const messageByWhatsappId = new Map<string, string>();
    for (const message of messages) {
      if (message.kind === "reaction") continue;
      messageByWhatsappId.set(message.id, message.id);
      if (message.dedupeId) messageByWhatsappId.set(message.dedupeId, message.id);
    }
    const latestByMessage = new Map<string, Map<ThreadMessage["direction"], ThreadMessage>>();
    const attachedIds = new Set<string>();
    for (const reaction of messages) {
      const targetMessageId = reactionTargetId(reaction);
      if (reaction.kind !== "reaction" || !targetMessageId) continue;
      const targetId = messageByWhatsappId.get(targetMessageId);
      if (!targetId) continue;
      const byDirection = latestByMessage.get(targetId) || new Map<ThreadMessage["direction"], ThreadMessage>();
      // The latest reaction from each side is the current state. An empty
      // emoji is Meta's removal event and replaces that side's prior emoji.
      byDirection.set(reaction.direction, reaction);
      latestByMessage.set(targetId, byDirection);
      attachedIds.add(reaction.id);
    }
    const byMessage = new Map<string, ThreadMessage[]>();
    for (const [targetId, byDirection] of latestByMessage) {
      const active = [...byDirection.values()].filter((reaction) => !reactionWasRemoved(reaction) && !!reactionEmoji(reaction));
      if (active.length) byMessage.set(targetId, active);
    }
    return { byMessage, attachedIds };
  }, [thread?.messages]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950" data-chatbot-suppress={mobileThreadView ? "true" : undefined}>
      <Head><title>WhatsApp replies - CateringMS</title></Head>
      <NoIndexMeta />
      <AdminNav />
      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <div className={cn(selected && "hidden md:block")}>
            <PortalHeader
              variant="hero"
              icon={MessageCircle}
              title="WhatsApp replies"
              subtitle={unreadConversations > 0
                ? `${unreadConversations} conversation${unreadConversations === 1 ? "" : "s"} waiting for you.`
                : "Read and answer what clients send back."}
            />
            <WhatsAppTabs active="replies" />
          </div>

          {!available ? (
            <Card><CardContent className="flex flex-wrap items-center justify-center gap-3 py-8 text-center text-sm text-amber-800 dark:text-amber-200">
              <p>WhatsApp replies are temporarily unavailable. Refresh and try again; contact your administrator if this continues.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void loadFirstPage(false)}>Refresh replies</Button>
            </CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)]">
              <Card className={cn("min-w-0", selected && "hidden md:block")}>
                <CardContent className="space-y-3 py-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input aria-label="Search conversations" className="pl-9 text-base sm:text-sm" placeholder="Search by name or number" value={search} onChange={(event) => setSearch(event.target.value)} />
                  </div>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter conversations">
                    {([[false, "All conversations"], [true, "Unread"]] as const).map(([value, label]) => (
                      <button
                        key={label}
                        type="button"
                        aria-pressed={unreadOnly === value}
                        onClick={() => setUnreadOnly(value)}
                        className={cn(
                          "min-h-11 rounded-full border px-3 py-2 text-xs font-medium",
                          unreadOnly === value ? "border-brand-primary bg-brand-primary text-white" : "border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {loadError && (
                    <div className="space-y-2 text-sm text-rose-700">
                      <p>{loadError}</p>
                      <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void loadFirstPage(false)}>
                        <RefreshCw className="h-3.5 w-3.5" /> Try loading again
                      </Button>
                    </div>
                  )}
                  {refreshError && (
                    <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                      <p>Live conversation updates paused: {refreshError}</p>
                      <Button type="button" variant="outline" size="sm" onClick={() => void loadFirstPage(false)}>Refresh now</Button>
                    </div>
                  )}
                  {loading && <p className="py-6 text-center text-sm text-slate-500">Loading conversations...</p>}
                  {!loading && !loadError && conversations.length === 0 && (
                    <p className="py-6 text-center text-sm text-slate-500">
                      {search || unreadOnly ? "No conversations match." : "No replies yet. They appear here once the webhook is set up in Meta."}
                    </p>
                  )}

                  <div className="max-h-[min(32rem,55dvh)] space-y-1 overflow-y-auto overscroll-contain">
                    {conversations.map((item) => (
                      <button
                        key={item.phone}
                        type="button"
                        aria-current={selected === item.phone}
                        onClick={() => void openConversation(item.phone)}
                        className={cn(
                          "flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left",
                          selected === item.phone ? "border-brand-primary bg-brand-primary/10" : "border-transparent hover:bg-slate-100 dark:hover:bg-slate-800",
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">{item.contact_name || item.phone}</span>
                          <span className="block truncate text-xs text-slate-500">{conversationPreview(item.last_preview)}</span>
                          <span className="block text-xs text-slate-400">{shortTime(item.last_message_at)}</span>
                        </span>
                        {item.unread_count > 0 && <Badge className="bg-brand-primary text-white hover:bg-brand-primary">{item.unread_count}</Badge>}
                      </button>
                    ))}
                    {nextCursor && (
                      <Button type="button" variant="outline" size="sm" className="h-auto min-h-11 w-full whitespace-normal" disabled={loadingMore} onClick={() => void loadMore()}>
                        {loadingMore ? "Loading..." : "Load more conversations"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card
                className={cn(
                  "min-w-0",
                  !selected && "hidden md:block",
                  selected && "md:flex md:h-[calc(100dvh-27rem)] md:min-h-[34rem] md:max-h-[56rem] md:flex-col md:overflow-hidden",
                  mobileThreadView && "flex min-h-0 flex-col overflow-hidden",
                )}
                style={mobileThreadView && mobileThreadHeight ? { height: mobileThreadHeight } : undefined}
              >
                <CardContent className={cn(
                  "space-y-3 py-4",
                  selected && "md:flex md:min-h-0 md:flex-1 md:flex-col md:gap-3 md:space-y-0",
                  mobileThreadView && "flex min-h-0 flex-1 flex-col gap-3 space-y-0 p-3",
                )}>
                  {!selected ? (
                    <p className="py-16 text-center text-sm text-slate-500">Choose a conversation to read it.</p>
                  ) : (
                    <>
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label="Back to conversations"
                            className="h-auto min-h-11 shrink-0 gap-1 whitespace-nowrap px-2 md:hidden"
                            onClick={() => { setSelected(null); setThread(null); }}
                          >
                            <ArrowLeft className="h-4 w-4" />
                            <span className="sm:hidden">Inbox</span>
                            <span className="hidden sm:inline">Back to conversations</span>
                          </Button>
                          <p className="min-w-0 truncate text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button asChild variant="outline" size="sm" className="h-11 min-w-11 shrink-0 px-0 sm:px-3">
                            <a href={`tel:+${selected}`} aria-label="Call client"><Phone className="h-4 w-4" /><span className="hidden sm:inline">Call client</span></a>
                          </Button>
                          <Button asChild variant="outline" size="sm" className="h-11 min-w-11 shrink-0 px-0 sm:px-3">
                            <a href={buildWhatsAppUrl(selected, "")} target="_blank" rel="noopener noreferrer" aria-label="Open in WhatsApp"><MessageCircle className="h-4 w-4" /><span className="hidden sm:inline">Open in WhatsApp</span></a>
                          </Button>
                        </div>
                      </div>

                      <div
                        ref={threadScrollRef}
                        data-whatsapp-thread-messages
                        onScroll={(event) => {
                          if (viewportResizeRef.current) return;
                          const element = event.currentTarget;
                          stickToBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
                        }}
                        className={cn(
                          "min-h-32 max-h-[min(28rem,60dvh)] space-y-2 overflow-y-auto overscroll-contain rounded-lg bg-slate-100 p-3 dark:bg-slate-800",
                          selected && "md:min-h-0 md:max-h-none md:flex-1 md:space-y-3 md:p-4",
                          mobileThreadView && "min-h-0 max-h-none flex-1",
                        )}
                      >
                        {thread?.hasOlder && (
                          <div className="text-center">
                            <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={loadingOlder} onClick={() => void loadOlder()}>
                              {loadingOlder ? "Loading..." : "Load older messages"}
                            </Button>
                          </div>
                        )}
                        {!thread && !threadError && <p className="py-8 text-center text-sm text-slate-500">Loading messages...</p>}
                        {!thread && threadError && (
                          <div role="alert" className="space-y-2 py-8 text-center">
                            <p className="text-sm font-medium text-rose-800 dark:text-rose-200">Could not load this conversation</p>
                            <p className="text-xs text-slate-600 dark:text-slate-300">{threadError}</p>
                            <Button type="button" variant="outline" size="sm" onClick={() => void openConversation(selected)}>Try again</Button>
                          </div>
                        )}
                        {thread?.messages.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No WhatsApp messages with this number yet.</p>}
                        {thread?.messages.filter((message) => !reactionGroups.attachedIds.has(message.id)).map((message) => {
                          const messageReactions = summarizeReactions(reactionGroups.byMessage.get(message.id) || []);
                          return (
                            <div key={message.id} className="space-y-1.5">
                              {message.kind === "reaction" ? (
                                <div className="flex justify-center px-2 py-0.5">
                                  <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-300">
                                    {reactionEmoji(message) ? (
                                      <span className="text-base leading-none" aria-hidden="true">{reactionEmoji(message)}</span>
                                    ) : reactionWasRemoved(message) ? (
                                      <Minus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                    ) : (
                                      <MessageCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                    )}
                                    <span className="truncate">{reactionEventLabel(message, !!thread?.hasOlder)}</span>
                                    <time className="shrink-0 text-xs text-slate-400">{shortTime(message.at)}</time>
                                  </span>
                                </div>
                              ) : (
                                <>
                                  <div className={cn("flex w-full", message.direction === "out" ? "justify-end" : "justify-start")}>
                                    <div className={cn(
                                      cn("w-fit min-w-0 max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm md:max-w-[78%]",
                                        message.mediaId && ["audio", "video", "image", "sticker"].includes(message.kind || "") && "w-[min(30rem,88%)] md:max-w-[min(32rem,78%)]"),
                                      message.direction === "out"
                                        ? "rounded-tr-md bg-brand-primary text-white"
                                        : "rounded-tl-md border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
                                    )}>
                                      <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
                                        <span
                                          title={message.senderName || (message.direction === "out" ? "Business" : thread?.name || "Client")}
                                          className="inline-flex max-w-[min(18rem,65vw)] truncate rounded-full bg-black/5 px-2 py-0.5 dark:bg-white/10"
                                        >
                                          {message.senderName || (message.direction === "out" ? "Business" : thread?.name || "Client")}
                                        </span>
                                        {message.source === "whatsapp_business_app" && <span className="rounded-full bg-black/5 px-2 py-0.5 dark:bg-white/10">WhatsApp app</span>}
                                        {message.source === "synced_history" && <span className="rounded-full bg-black/5 px-2 py-0.5 dark:bg-white/10">Synced history</span>}
                                        {message.kind !== "text" && <span className="rounded-full bg-black/5 px-2 py-0.5 dark:bg-white/10">{message.kind === "template" ? "Template" : messageKindLabel(message.kind)}</span>}
                                      </div>
                                      {message.direction === "out" && message.kind === "template" ? (
                                        <div>
                                          <p className="font-medium">{message.templateLabel || messageKindLabel(message.templateName || "template")}</p>
                                          <p className="mt-1 text-xs leading-relaxed opacity-80">The approved message content is managed in Meta and is not stored in this history.</p>
                                        </div>
                                      ) : (
                                        <div>
                                          {message.text.trim() && <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.text}</p>}
                                          {message.mediaId && <WhatsAppMedia message={message} companyId={companyId} />}
                                          {!message.text.trim() && !message.mediaId && <p>{mediaFallback(message.kind, message.direction)}</p>}
                                          {!message.mediaId && message.direction === "in" && !message.text.trim() && <p className="mt-1 text-xs opacity-75">{message.kind === "text" ? "The message text is not available in this conversation history." : "This message was saved without its media file."}</p>}
                                        </div>
                                      )}
                                      <div className="flex items-center justify-end gap-1.5 pt-1 text-xs opacity-80">
                                        <span>{shortTime(message.at)}</span>
                                        {message.status && <span aria-label={`Delivery status: ${statusLabel(message.status)}`}>· {statusLabel(message.status)}</span>}
                                      </div>
                                    </div>
                                  </div>
                                  {messageReactions.length > 0 && (
                                    <div
                                      className={cn(
                                        "relative z-10 -mt-1 flex w-fit max-w-[85%] items-center gap-1 rounded-full border border-slate-200 bg-white px-1.5 py-1 shadow-sm dark:border-slate-700 dark:bg-slate-900",
                                        message.direction === "out" ? "ml-auto mr-3" : "ml-3",
                                      )}
                                      aria-label="Reactions to this message"
                                    >
                                      {messageReactions.map((reaction) => (
                                        <span
                                          key={reaction.emoji}
                                          title={reaction.title}
                                          aria-label={reaction.label}
                                          className="inline-flex min-h-6 items-center gap-0.5 rounded-full px-1 text-xs text-slate-700 dark:text-slate-100"
                                        >
                                          <span className="text-base leading-none">{reaction.emoji}</span>
                                          {reaction.count > 1 && <span className="text-xs font-medium tabular-nums">{reaction.count}</span>}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </>
                              )}
                              {message.failureReason && (message.status === "failed" || message.status === "pending" || message.status === "sending") && (
                                <WhatsAppFailureNotice
                                  reason={message.failureReason}
                                  state={message.status === "failed" ? "failed" : "retrying"}
                                  className="ml-auto max-w-[85%]"
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {thread && threadError && (
                        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                          <p>Could not refresh the latest messages: {threadError}</p>
                          <Button type="button" variant="outline" size="sm" onClick={() => void loadThread(thread.phone).catch((error) => setThreadError(readableWhatsAppError(error, "Could not refresh this conversation.")))}>Refresh conversation</Button>
                        </div>
                      )}

                      {thread && replyError && <WhatsAppFailureNotice reason={replyError} />}

                      {thread?.canReply ? (
                        <div className={cn(
                          "space-y-2",
                          mobileThreadView && "flex-none border-t border-slate-200 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] dark:border-slate-700",
                        )}>
                          <p className={cn("text-xs leading-relaxed text-slate-500", mobileThreadView && "hidden sm:block")}>
                            You can send a free-text reply within 24 hours of the client's latest WhatsApp message. A new client message starts that window again.
                          </p>
                          {mobileThreadView && <p className="text-xs leading-tight text-slate-500 sm:hidden">Reply within 24 hours of the latest client message.</p>}
                          <Label htmlFor="wa-reply" className={cn("text-xs", mobileThreadView && "sr-only")}>Your reply</Label>
                          <div className="flex min-w-0 items-end gap-2">
                            <Textarea
                              id="wa-reply"
                              rows={2}
                              placeholder="Type your reply..."
                              className={cn("text-base sm:text-sm", mobileThreadView && "min-h-[68px] flex-1 resize-none")}
                              value={reply}
                              onChange={(event) => setReply(event.target.value)}
                              onFocus={() => {
                                stickToBottomRef.current = true;
                                window.requestAnimationFrame(() => {
                                  const element = threadScrollRef.current;
                                  if (element) element.scrollTop = element.scrollHeight;
                                });
                              }}
                            />
                            <Button
                              type="button"
                              className={cn("min-h-11 gap-1.5", mobileThreadView && "h-11 w-11 shrink-0 p-0")}
                              disabled={!reply.trim() || sending}
                              title={reply.trim() ? undefined : "Type your reply first"}
                              aria-label={sending ? "Sending reply" : "Send reply"}
                              onClick={() => void sendReply()}
                            >
                              <Send className="h-4 w-4" />
                              <span className={mobileThreadView ? "sr-only" : ""}>{sending ? "Sending..." : "Send reply"}</span>
                            </Button>
                          </div>
                        </div>
                      ) : thread ? (
                        <p className="text-xs text-amber-700">
                          WhatsApp only allows a business reply within 24 hours of the client's last message. Use Call client or Open in WhatsApp instead.
                        </p>
                      ) : null}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </PortalShell>
        <Footer />
      </div>
    </div>
  );
}

export default function ProtectedRepliesPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.COMPANY_ADMIN, UserRole.OWNER, UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
      <RepliesPage />
    </ProtectedRoute>
  );
}
