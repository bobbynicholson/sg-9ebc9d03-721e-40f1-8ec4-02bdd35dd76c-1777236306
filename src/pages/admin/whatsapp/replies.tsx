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
  const selectedRef = useRef<string | null>(null);
  const threadScrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const olderScrollRef = useRef<{ top: number; height: number } | null>(null);
  const previousThreadPhoneRef = useRef<string | null>(null);
  selectedRef.current = selected;

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

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Head><title>WhatsApp replies - CateringMS</title></Head>
      <NoIndexMeta />
      <AdminNav />
      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            variant="hero"
            icon={MessageCircle}
            title="WhatsApp replies"
            subtitle={unreadConversations > 0
              ? `${unreadConversations} conversation${unreadConversations === 1 ? "" : "s"} waiting for you.`
              : "Read and answer what clients send back."}
          />
          <WhatsAppTabs active="replies" />

          {!available ? (
            <Card><CardContent className="flex flex-wrap items-center justify-center gap-3 py-8 text-center text-sm text-amber-800 dark:text-amber-200">
              <p>WhatsApp replies are temporarily unavailable. Refresh and try again; contact your administrator if this continues.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => void loadFirstPage(false)}>Refresh replies</Button>
            </CardContent></Card>
          ) : (
            <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)]">
              <Card className={cn(selected && "hidden md:block")}>
                <CardContent className="space-y-3 py-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input aria-label="Search conversations" className="pl-9" placeholder="Search by name or number" value={search} onChange={(event) => setSearch(event.target.value)} />
                  </div>
                  <div className="flex gap-1.5" role="group" aria-label="Filter conversations">
                    {([[false, "All conversations"], [true, "Unread"]] as const).map(([value, label]) => (
                      <button
                        key={label}
                        type="button"
                        aria-pressed={unreadOnly === value}
                        onClick={() => setUnreadOnly(value)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-medium",
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

                  <div className="max-h-[32rem] space-y-1 overflow-y-auto">
                    {conversations.map((item) => (
                      <button
                        key={item.phone}
                        type="button"
                        aria-current={selected === item.phone}
                        onClick={() => void openConversation(item.phone)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left",
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
                      <Button type="button" variant="outline" size="sm" className="w-full" disabled={loadingMore} onClick={() => void loadMore()}>
                        {loadingMore ? "Loading..." : "Load more conversations"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className={cn(!selected && "hidden md:block")}>
                <CardContent className="space-y-3 py-4">
                  {!selected ? (
                    <p className="py-16 text-center text-sm text-slate-500">Choose a conversation to read it.</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <Button type="button" variant="ghost" size="sm" className="gap-1 md:hidden" onClick={() => { setSelected(null); setThread(null); }}>
                            <ArrowLeft className="h-4 w-4" /> Back to conversations
                          </Button>
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
                        </div>
                        <div className="flex gap-1.5">
                          <Button asChild variant="outline" size="sm" className="gap-1.5">
                            <a href={`tel:+${selected}`}><Phone className="h-3.5 w-3.5" /> Call client</a>
                          </Button>
                          <Button asChild variant="outline" size="sm" className="gap-1.5">
                            <a href={buildWhatsAppUrl(selected, "")} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-3.5 w-3.5" /> Open in WhatsApp</a>
                          </Button>
                        </div>
                      </div>

                      <div
                        ref={threadScrollRef}
                        onScroll={(event) => {
                          const element = event.currentTarget;
                          stickToBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
                        }}
                        className="max-h-[28rem] space-y-2 overflow-y-auto rounded-lg bg-slate-100 p-3 dark:bg-slate-800"
                      >
                        {thread?.hasOlder && (
                          <div className="text-center">
                            <Button type="button" variant="outline" size="sm" disabled={loadingOlder} onClick={() => void loadOlder()}>
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
                        {thread?.messages.map((message) => (
                          <div key={message.id} className="space-y-1.5">
                            <div className={cn("flex", message.direction === "out" && "justify-end")}>
                              <div className={cn(
                                "max-w-[85%] rounded-lg px-3 py-2 text-sm shadow-sm",
                                message.direction === "out" ? "bg-brand-primary text-white" : "bg-white text-slate-800 dark:bg-slate-900 dark:text-slate-100",
                              )}>
                                <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
                                  <span className="rounded-full bg-black/5 px-2 py-0.5 dark:bg-white/10">{message.direction === "out" ? "You sent" : "Client sent"}</span>
                                  {message.kind !== "text" && <span className="rounded-full bg-black/5 px-2 py-0.5 dark:bg-white/10">{message.kind === "template" ? "Template" : messageKindLabel(message.kind)}</span>}
                                </div>
                                {message.direction === "out" && message.kind === "template" ? (
                                  <div>
                                    <p className="font-medium">{message.templateLabel || messageKindLabel(message.templateName || "template")}</p>
                                    <p className="mt-1 text-xs leading-relaxed opacity-80">The approved message content is managed in Meta and is not stored in this history.</p>
                                  </div>
                                ) : message.text.trim() ? (
                                  <p className="whitespace-pre-wrap break-words">{message.text}</p>
                                ) : (
                                  <div>
                                    <p>{mediaFallback(message.kind, message.direction)}</p>
                                    {message.direction === "in" && <p className="mt-1 text-xs opacity-75">{message.kind === "text" ? "The message text is not available in this conversation history." : "This inbox stores the message type, but not its media preview."}</p>}
                                  </div>
                                )}
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
                        <div className="space-y-2">
                          <p className="text-xs leading-relaxed text-slate-500">You can send a free-text reply within 24 hours of the client's latest WhatsApp message. A new client message starts that window again.</p>
                          <Label htmlFor="wa-reply" className="text-xs">Your reply</Label>
                          <Textarea id="wa-reply" rows={2} value={reply} onChange={(event) => setReply(event.target.value)} />
                          <Button
                            type="button"
                            className="gap-1.5"
                            disabled={!reply.trim() || sending}
                            title={reply.trim() ? undefined : "Type your reply first"}
                            onClick={() => void sendReply()}
                          >
                            <Send className="h-3.5 w-3.5" /> {sending ? "Sending..." : "Send reply"}
                          </Button>
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
