/**
 * /admin/whatsapp/replies - every WhatsApp conversation for the company.
 * Conversations and messages are paged on the server. ?phone= opens one
 * person's history, even if they haven't replied yet.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { ArrowLeft, MessageCircle, Phone, RefreshCw, Search, Send } from "lucide-react";
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

function conversationPreview(value: string | null): string {
  if (!value) return "No message preview";
  const media = value.match(/^\((.+) message\)$/i);
  if (media) return `${messageKindLabel(media[1].toLowerCase())} received`;
  return value;
}

function RepliesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
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

  const companyQuery = user?.company_id ? `companyId=${encodeURIComponent(user.company_id)}` : "";
  const listUrl = useCallback((cursor?: string | null) => {
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    if (unreadOnly) params.set("unread", "1");
    if (cursor) params.set("cursor", cursor);
    const query = [companyQuery, params.toString()].filter(Boolean).join("&");
    return `/api/admin/whatsapp/inbox${query ? `?${query}` : ""}`;
  }, [companyQuery, search, unreadOnly]);
  const baseUrl = useMemo(() => `/api/admin/whatsapp/inbox${companyQuery ? `?${companyQuery}` : ""}`, [companyQuery]);

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
    const byMessage = new Map<string, ThreadMessage[]>();
    const attachedIds = new Set<string>();
    for (const reaction of messages) {
      const targetMessageId = reactionTargetId(reaction);
      if (reaction.kind !== "reaction" || !targetMessageId) continue;
      const targetId = messageByWhatsappId.get(targetMessageId);
      if (!targetId) continue;
      byMessage.set(targetId, [...(byMessage.get(targetId) || []), reaction]);
      attachedIds.add(reaction.id);
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
                          <span className="block text-[10px] text-slate-400">{shortTime(item.last_message_at)}</span>
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
                        {thread?.messages.filter((message) => !reactionGroups.attachedIds.has(message.id)).map((message) => (
                          <div key={message.id} className="space-y-1.5">
                            <div className={cn("flex w-full", message.direction === "out" ? "justify-end" : "justify-start")}>
                              <div className={cn(
                                "w-fit min-w-0 max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm md:max-w-[78%]",
                                message.direction === "out"
                                  ? "rounded-tr-md bg-brand-primary text-white"
                                  : "rounded-tl-md border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
                              )}>
                                <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
                                  <span className="rounded-full bg-black/5 px-2 py-0.5 dark:bg-white/10">{message.direction === "out" ? "You" : "Client"}</span>
                                  {message.source === "whatsapp_business_app" && <span className="rounded-full bg-black/5 px-2 py-0.5 dark:bg-white/10">WhatsApp app</span>}
                                  {message.source === "synced_history" && <span className="rounded-full bg-black/5 px-2 py-0.5 dark:bg-white/10">Synced history</span>}
                                  {message.kind !== "text" && <span className="rounded-full bg-black/5 px-2 py-0.5 dark:bg-white/10">{message.kind === "template" ? "Template" : messageKindLabel(message.kind)}</span>}
                                </div>
                                {message.direction === "out" && message.kind === "template" ? (
                                  <div>
                                    <p className="font-medium">{message.templateLabel || messageKindLabel(message.templateName || "template")}</p>
                                    <p className="mt-1 text-xs leading-relaxed opacity-80">The approved message content is managed in Meta and is not stored in this history.</p>
                                  </div>
                                ) : message.kind === "reaction" ? (
                                  <div className="flex items-start gap-2">
                                    <span className="text-2xl leading-none" aria-hidden="true">{reactionEmoji(message) || (reactionWasRemoved(message) ? "−" : "💬")}</span>
                                    <div>
                                      <p className="font-medium">{reactionEmoji(message) ? `Reacted ${reactionEmoji(message)}` : reactionWasRemoved(message) ? "Reaction removed" : "Reaction received"}</p>
                                      <p className="mt-1 text-xs leading-relaxed opacity-80">
                                        {reactionTargetId(message)
                                          ? thread?.hasOlder ? "Load older messages to see which message this reaction refers to." : "The original message is not included in the loaded history."
                                          : reactionWasRemoved(message)
                                            ? "WhatsApp did not include a reference to the original message."
                                            : "Emoji and original message details were not saved with this older event."}
                                      </p>
                                    </div>
                                  </div>
                                ) : message.text.trim() ? (
                                  <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.text}</p>
                                ) : (
                                  <div>
                                    <p>{mediaFallback(message.kind, message.direction)}</p>
                                    {message.direction === "in" && <p className="mt-1 text-xs opacity-75">{message.kind === "text" ? "The message text is not available in this conversation history." : "This inbox stores the message type, but not its media preview."}</p>}
                                  </div>
                                )}
                                {reactionGroups.byMessage.get(message.id)?.length ? (
                                  <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Reactions to this message">
                                    {reactionGroups.byMessage.get(message.id)!.map((reaction) => (
                                      <span
                                        key={reaction.id}
                                        title={`${reaction.direction === "in" ? "Client" : "You"} reacted at ${shortTime(reaction.at)}`}
                                        aria-label={`${reaction.direction === "in" ? "Client" : "You"} reacted ${reactionEmoji(reaction) || "removed a reaction"} at ${shortTime(reaction.at)}`}
                                        className="inline-flex min-h-7 items-center gap-1 rounded-full border border-slate-300/70 bg-white/70 px-2 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-900/50 dark:text-slate-100"
                                      >
                                        <span className="text-base leading-none">{reactionEmoji(reaction) || "−"}</span>
                                        <span className="text-[9px] opacity-75">{shortTime(reaction.at)}</span>
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                                <div className="flex items-center justify-end gap-1.5 pt-1 text-[10px] opacity-80">
                                  <span>{shortTime(message.at)}</span>
                                  {message.status && <span aria-label={`Delivery status: ${statusLabel(message.status)}`}>· {statusLabel(message.status)}</span>}
                                </div>
                              </div>
                            </div>
                            {message.failureReason && (message.status === "failed" || message.status === "pending" || message.status === "sending") && (
                              <WhatsAppFailureNotice
                                reason={message.failureReason}
                                state={message.status === "failed" ? "failed" : "retrying"}
                                className="ml-auto max-w-[85%]"
                              />
                            )}
                          </div>
                        ))}
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
