import { Fragment, useState, useEffect, useRef, type ReactNode } from "react";
import { MessageSquare, X, Send, Sparkles, User, Bot, ArrowUpRight, ShieldCheck, Loader2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useTenantHref } from "@/lib/tenantUrl";
import { useRouter } from "next/router";
import type { ChatResponsePayload } from "@/lib/chatbot/responseRenderer";
import { filterRelevantNavigation } from "@/lib/chatbot/navigation";

interface NavigationLink {
  ref: string;
  label: string;
  href: string;
  description: string;
  keywords?: string[];
  targetType?: "page" | "section" | "tab" | "record";
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  navigation?: NavigationLink[];
  rendered?: ChatResponsePayload;
  intentRoute?: string;
}

interface ChatRequestError extends Error {
  code?: string;
  retryable?: boolean;
}

interface RoleConfig {
  title: string;
  greeting: string;
  examples: string[];
  color: string;
  icon?: string;
}

const ROLE_CONFIGS: Record<string, RoleConfig> = {
  super_admin: {
    title: "Platform Admin Assistant",
    greeting: "I can help you manage the entire CateringMS platform, monitor all companies, and handle system-wide operations.",
    examples: [],
    color: "from-slate-600 to-rose-600"
  },
  company_admin: {
    title: "Company Admin Assistant",
    greeting: "I can help you manage your catering business, including orders, staff, inventory, and financial operations.",
    examples: [],
    color: "from-blue-600 to-blue-600"
  },
  admin: {
    title: "Admin Assistant",
    greeting: "I can help you manage company operations, orders, staff, and inventory. For financial matters, contact your company administrator.",
    examples: [
      "Show me today's revenue",
      "Which orders need immediate attention?",
      "Staff performance this week",
      "Upcoming events summary"
    ],
    color: "from-slate-600 to-slate-600",
    icon: "🎯"
  },
  owner: {
    title: "Owner Assistant",
    greeting: "I can help you manage your business operations and oversee your team.",
    examples: [],
    color: "from-brand-primary to-brand-secondary"
  },
  driver: {
    title: "Driver Assistant",
    greeting: "Hey driver! I'm here to help with your routes, deliveries, and earnings.",
    examples: [
      "When is my next collection?",
      "Optimal route for today's deliveries",
      "My earnings this month",
      "Traffic updates for current route"
    ],
    color: "from-blue-500 to-blue-500",
    icon: "🚚"
  },
  kitchen: {
    title: "Kitchen Assistant",
    greeting: "Hello chef! I can help with prep schedules, ingredient planning, and production timing.",
    examples: [
      "When to start prepping order #3216?",
      "What ingredients are running low?",
      "Tomorrow's production schedule",
      "Recipe scaling for 200 guests"
    ],
    color: "from-orange-500 to-rose-500",
    icon: "👨‍🍳"
  },
  shopping: {
    title: "Procurement Assistant",
    greeting: "Hi! I'm your procurement assistant. I can help with inventory, suppliers, and purchasing decisions.",
    examples: [
      "What needs restocking urgently?",
      "Best supplier for bulk chicken?",
      "This week's procurement spending",
      "Compare prices for olive oil"
    ],
    color: "from-brand-primary to-brand-secondary",
    icon: "🛒"
  },
  cleaning: {
    title: "Maintenance Assistant",
    greeting: "Hello! I'm here to help with equipment tracking, maintenance schedules, and inspections.",
    examples: [
      "Which equipment needs inspection today?",
      "Damaged items report this week",
      "My cleaning tasks for today",
      "Equipment usage history"
    ],
    color: "from-brand-primary to-blue-500",
    icon: "✨"
  },
  client: {
    title: "Event Assistant",
    greeting: "Welcome! I can help you track your orders, answer questions about your events, and assist with bookings.",
    examples: [
      "When is my next event?",
      "Update my event details",
      "What's included in my package?",
      "Payment schedule for my order"
    ],
    color: "from-blue-500 to-brand-secondary",
    icon: "🎉"
  }
};

interface ChatBotProps {
  userRole?: string;
  companyId?: string;
  global?: boolean;
}

function renderLinkedText(value: string, withSlug: (href: string) => string, keyPrefix: string): ReactNode[] {
  const pattern = /(\[[^\]]+\]\((?:https?:\/\/[^\s)]+|\/[^\s)]+)\)|https?:\/\/[^\s<]+)/gi;
  const output: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) {
    if (match.index > cursor) output.push(<Fragment key={`${keyPrefix}-text-${cursor}`}>{value.slice(cursor, match.index)}</Fragment>);
    const raw = match[0];
    const markdown = raw.match(/^\[([^\]]+)\]\((.+)\)$/);
    const href = (markdown ? markdown[2] : raw).replace(/[),.;!?]+$/, "");
    const label = markdown ? markdown[1] : href;
    const safeHref = href.startsWith("/") || /^https?:\/\//i.test(href) ? href : "";
    if (!safeHref) {
      output.push(<Fragment key={`${keyPrefix}-raw-${match.index}`}>{raw}</Fragment>);
    } else if (safeHref.startsWith("/")) {
      output.push(<Link key={`${keyPrefix}-link-${match.index}`} href={withSlug(safeHref)} className="font-medium text-brand-primary underline underline-offset-2 hover:opacity-80">{label}</Link>);
    } else {
      output.push(<a key={`${keyPrefix}-link-${match.index}`} href={safeHref} target="_blank" rel="noreferrer" className="font-medium text-brand-primary underline underline-offset-2 hover:opacity-80">{label}</a>);
    }
    cursor = match.index + raw.length;
  }
  if (cursor < value.length) output.push(<Fragment key={`${keyPrefix}-tail`}>{value.slice(cursor)}</Fragment>);
  return output;
}

function collectFrontendContext(): { controls: Array<{ label: string; kind: string }>; tags: string[] } {
  if (typeof document === "undefined") return { controls: [], tags: [] };
  const elements = Array.from(document.querySelectorAll(
    "button, a, input, select, textarea, [role='button'], [role='tab'], [role='option']",
  )).filter((element) => !element.closest("[data-chatbot-root]"));
  const seen = new Set<string>();
  const controls = elements.map((element) => {
    const explicit = element.getAttribute("data-chat-action-label")
      || element.getAttribute("aria-label")
      || element.getAttribute("title")
      || (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.placeholder : "")
      || (element.textContent || "");
    const label = explicit.replace(/\s+/g, " ").trim().slice(0, 160);
    const kind = element.tagName.toLowerCase() === "a" ? "link" : element.getAttribute("role") || element.tagName.toLowerCase();
    return { label, kind };
  }).filter((item) => {
    if (item.label.length < 2 || seen.has(item.label.toLowerCase())) return false;
    seen.add(item.label.toLowerCase());
    return true;
  }).slice(0, 120);
  const tags = Array.from(document.querySelectorAll("[data-chat-tag], [data-tag], [data-filter-tag]"))
    .map((element) => (element.getAttribute("data-chat-tag") || element.getAttribute("data-tag") || element.getAttribute("data-filter-tag") || element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 100))
    .filter((tag, index, values) => tag.length >= 1 && values.indexOf(tag) === index)
    .slice(0, 80);
  return { controls, tags };
}

function actionNavigation(action: string, navigation: NavigationLink[]): NavigationLink | null {
  const normalizedAction = action.toLowerCase().replace(/^view\s+|^open\s+/, "").replace(/[^a-z0-9]+/g, " ").trim();
  if (!normalizedAction) return null;
  const labelMatch = navigation.find((item) => {
    const normalizedLabel = item.label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    return normalizedAction === normalizedLabel || normalizedAction.includes(normalizedLabel) || normalizedLabel.includes(normalizedAction);
  });
  if (labelMatch) return labelMatch;
  // Some model responses use a useful business shorthand such as “Open MRR
  // section” instead of repeating the full registered page label. Resolve
  // that shorthand only against the page's approved keywords; never turn an
  // arbitrary action into a URL.
  const actionTerms = new Set(normalizedAction.split(/\s+/).filter((term) => term.length >= 3));
  return navigation.find((item) => (item.keywords || []).some((keyword) => {
    const normalizedKeyword = keyword.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    return normalizedKeyword.length >= 3 && (actionTerms.has(normalizedKeyword) || normalizedAction.includes(normalizedKeyword));
  })) || null;
}

const NAVIGATION_MATCH_STOPWORDS = new Set(["the", "and", "for", "with", "your", "this", "that", "page", "view", "open", "manage", "review"]);

function navigationTerms(item: NavigationLink): string[] {
  return [item.label, item.description, ...(item.keywords || [])]
    .flatMap((value) => value.toLowerCase().match(/[a-z0-9]{4,}/g) || [])
    .filter((term) => !NAVIGATION_MATCH_STOPWORDS.has(term));
}

function navigationMatchesText(item: NavigationLink, text: string): boolean {
  const normalized = text.toLowerCase();
  return navigationTerms(item).some((term) => new RegExp(`\\b${term}\\w*\\b`, "i").test(normalized));
}

function inlineNavigationByBlock(navigation: NavigationLink[], blocks: string[]): NavigationLink[][] {
  const output = blocks.map(() => [] as NavigationLink[]);
  if (!blocks.length) return output;
  navigation.forEach((item, index) => {
    const matchedIndex = blocks.findIndex((block) => navigationMatchesText(item, block));
    output[matchedIndex >= 0 ? matchedIndex : Math.min(index, blocks.length - 1)].push(item);
  });
  return output;
}

const ROLE_UI_ALIASES: Record<string, string> = {
  company_admin: "owner",
  region_admin: "admin",
  sales_admin: "admin",
  kitchen_manager: "kitchen",
  kitchen_staff: "kitchen",
  shopping_staff: "shopping",
  cleaning_manager: "cleaning",
  cleaning_staff: "cleaning",
  waiter: "admin",
  staff: "admin",
};

const WORKING_STEPS = [
  "Understanding your request...",
  "Checking the information available to your role...",
  "Organising the clearest answer...",
];

function readableChatError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");
  if (!message || /unexpected token|json|network|fetch failed|failed to fetch/i.test(message)) {
    return "The assistant is temporarily unavailable. Please try again in a moment.";
  }
  return message
    .replace(/couldn.{0,4}t/gi, "could not")
    .replace(/\b(?:database|schema|query|api|provider|metadata|tenant|rag)\b/gi, "service")
    .replace(/\s+/g, " ")
    .trim();
}

function chatRequestError(payload: any, fallback: string): ChatRequestError {
  const apiError = typeof payload?.error === "string"
    ? payload.error
    : typeof payload?.error?.message === "string"
      ? payload.error.message
      : fallback;
  const error = new Error(apiError) as ChatRequestError;
  error.code = typeof payload?.code === "string"
    ? payload.code
    : typeof payload?.error?.code === "string"
      ? payload.error.code
      : undefined;
  error.retryable = payload?.retryable !== false;
  return error;
}

function intentRouteLabel(route?: string): string | null {
  if (route === "live_data") return "Current information";
  if (route === "hybrid") return "Current information + guidance";
  if (route === "knowledge") return "Product guidance";
  return null;
}

export function ChatBot({ userRole = "admin", companyId, global = false }: ChatBotProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [workingStep, setWorkingStep] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const { withSlug } = useTenantHref();
  const router = useRouter();

  // Theme-driven: every role's chat chrome (FAB, header, bubbles, avatar,
  // send button) uses the tenant brand gradient instead of the old
  // per-role purple/blue/cyan/orange palette.
  const authenticatedRole = String(user?.role || "");
  const resolvedUserRole = ["super_admin", "owner", "company_admin"].includes(authenticatedRole)
    ? authenticatedRole
    : String(user?.active_role || userRole || authenticatedRole || "admin");
  const isPlatformRole = resolvedUserRole === "super_admin";
  const chatScopeKey = `${resolvedUserRole}:${companyId || user?.company_id || user?.user_metadata?.company_id || "platform"}`;
  const config = {
    ...(ROLE_CONFIGS[ROLE_UI_ALIASES[resolvedUserRole] || resolvedUserRole] || ROLE_CONFIGS.admin),
    // Platform-owner chat belongs to the black platform command surface;
    // tenant owners keep their company's configured palette.
    color: isPlatformRole ? "from-slate-700 to-slate-950" : "from-brand-primary to-brand-secondary",
  };
  const workspaceLabel = isPlatformRole ? "Platform workspace" : "Company workspace";
  const chatApiUrl = router.asPath.includes("dev=true")
    || (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("dev"))
    ? "/api/chat?dev=true"
    : "/api/chat";

  const welcomeMessage = (): Message => ({ id: "welcome", role: "assistant", content: config.greeting, timestamp: new Date() });

  // Never carry a conversation across a company or active-role change.
  // The server enforces the same boundary; clearing locally prevents old
  // role-scoped messages from remaining visible during the transition.
  useEffect(() => {
    setSessionId(null);
    setMessages([]);
  }, [chatScopeKey]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const loadConversation = async () => {
      if (!user?.id) {
        setMessages([welcomeMessage()]);
        return;
      }
      try {
        const historyUrl = chatApiUrl.includes("?") ? `${chatApiUrl}&limit=50` : `${chatApiUrl}?limit=50`;
        const response = await fetch(historyUrl, { credentials: "include" });
        let payload: any = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }
        if (!response.ok) throw chatRequestError(payload, "Your chat history could not be loaded. Please try again.");
        if (cancelled) return;
        const loaded = (payload.messages || []).map((item: { id: string; role: "user" | "assistant"; content: string; created_at: string; metadata?: { navigation?: NavigationLink[]; response_payload?: ChatResponsePayload; intent_route?: string } }) => ({
          id: item.id,
          role: item.role,
          content: item.content,
          timestamp: new Date(item.created_at),
          navigation: filterRelevantNavigation(item.content, resolvedUserRole, item.metadata?.navigation || []),
          rendered: item.metadata?.response_payload,
          intentRoute: item.metadata?.intent_route,
        }));
        setSessionId(payload.sessionId || null);
        setMessages(loaded.length ? loaded : [welcomeMessage()]);
      } catch (error) {
        console.warn("[ChatBot] history load failed:", (error as ChatRequestError)?.code || "HISTORY_LOAD_FAILED", error);
        if (!cancelled) setMessages([
          welcomeMessage(),
          {
            id: "history-load-warning",
            role: "assistant",
            content: "I could not load the previous chat, so I opened a fresh conversation for you.",
            timestamp: new Date(),
          },
        ]);
      }
    };

    void loadConversation();
    return () => { cancelled = true; };
  }, [isOpen, user?.id, config.greeting, chatScopeKey]);

  // Mirror persisted messages through Supabase realtime so another open tab
  // stays current without ever subscribing to another user's messages.
  useEffect(() => {
    if (!isOpen || !user?.id) return;
    const channel = supabase
      .channel(`ai-chat-${user.id}-${Math.random().toString(36).slice(2, 10)}`)
      .on("postgres_changes" as any, {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
        filter: `user_id=eq.${user.id}`,
      }, (event: any) => {
        const row = event.new;
        if (!row?.id || (sessionId && row.session_id !== sessionId)) return;
        setMessages((current) => {
          if (current.some((item) => item.id === row.id)) return current;
          const clientMessageId = String(row.metadata?.client_message_id || "");
          if (row.role === "user" && clientMessageId) {
            const localIndex = current.findIndex((item) => item.id === `local-${clientMessageId}`);
            if (localIndex >= 0) {
              const next = [...current];
              next[localIndex] = { id: row.id, role: row.role, content: row.content, timestamp: new Date(row.created_at), navigation: filterRelevantNavigation(row.content, resolvedUserRole, row.metadata?.navigation || []), rendered: row.metadata?.response_payload, intentRoute: row.metadata?.intent_route };
              return next;
            }
          }
          return [...current, { id: row.id, role: row.role, content: row.content, timestamp: new Date(row.created_at), navigation: filterRelevantNavigation(row.content, resolvedUserRole, row.metadata?.navigation || []), rendered: row.metadata?.response_payload, intentRoute: row.metadata?.intent_route }];
        });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [isOpen, sessionId, user?.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!isTyping) {
      setWorkingStep(0);
      return;
    }
    setWorkingStep(0);
    const timer = window.setInterval(() => {
      setWorkingStep((current) => (current + 1) % WORKING_STEPS.length);
    }, 1_200);
    return () => window.clearInterval(timer);
  }, [isTyping]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSendMessage = async (content?: string) => {
    const messageContent = content || inputValue.trim();
    if (!messageContent) return;

    const clientMessageId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const userMessage: Message = {
      id: `local-${clientMessageId}`,
      role: "user",
      content: messageContent,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsTyping(true);

    const currentSections = typeof document === "undefined" ? [] : Array.from(document.querySelectorAll("[data-chat-section]"))
      .filter((element) => !element.closest("[data-chatbot-root]"))
      .map((element) => ({
        id: element.id,
        ref: element.getAttribute("data-chat-section") || undefined,
        kind: element.getAttribute("data-chat-section-kind") || undefined,
        label: element.getAttribute("data-chat-section-label") || (element.textContent || "").replace(/\s+/g, " ").trim(),
      }))
      .filter((section) => section.id && section.label);
    const currentFrontend = collectFrontendContext();

    try {
      const response = await fetch(chatApiUrl, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          clientMessageId,
          message: messageContent,
          history: messages
            .filter((item) => item.id !== "welcome")
            .slice(-8)
            .map((item) => ({ role: item.role, content: item.content })),
          currentPath: router.asPath,
          currentSections,
          currentControls: currentFrontend.controls,
          currentTags: currentFrontend.tags,
        }),
      });
      let payload: any = null;
      try {
        payload = await response.json();
      } catch {
        payload = null;
      }
      if (!response.ok) throw chatRequestError(payload, "The assistant is temporarily unavailable. Please try again in a moment.");
      setSessionId(payload.sessionId || sessionId);
      if (payload.sessionReset) setMessages([userMessage]);
      const assistant = payload.message;
      if (assistant) {
        setMessages((current) => current.some((item) => item.id === assistant.id) ? current : [
          ...current,
          {
            id: assistant.id,
            role: "assistant",
            content: assistant.content,
            timestamp: new Date(assistant.created_at),
            navigation: filterRelevantNavigation(assistant.content, resolvedUserRole, payload.navigation || assistant.metadata?.navigation || []),
            rendered: payload.response_payload || assistant.metadata?.response_payload,
            intentRoute: payload.intent_route || assistant.metadata?.intent_route,
          },
        ]);
      }
      } catch (error) {
        console.warn("[ChatBot] message request failed:", (error as ChatRequestError)?.code || "CHAT_REQUEST_FAILED");
        setMessages((current) => [...current, {
        id: `error-${Date.now()}`,
        role: "assistant",
          content: readableChatError(error),
        timestamp: new Date(),
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleExampleClick = (example: string) => {
    handleSendMessage(example);
  };

  return (
    <>
      {/* Floating Chat Button */}
      <div data-chatbot-root data-chatbot-global={global ? "true" : undefined} className="fixed bottom-4 right-4 z-50 block sm:bottom-5 sm:right-5">
        {!isOpen && (
          <Button
            onClick={() => setIsOpen(true)}
            aria-label="Open AI assistant"
            className={cn(
              "group relative h-14 w-14 rounded-2xl border border-white/15 bg-slate-950 p-0 shadow-[0_16px_40px_-14px_rgba(15,23,42,0.65)] transition duration-200 hover:-translate-y-0.5 hover:bg-slate-900 hover:shadow-[0_20px_46px_-14px_rgba(15,23,42,0.75)]",
            )}
          >
            <MessageSquare className="h-5 w-5 text-white transition-transform duration-200 group-hover:scale-105" />
            <span className="absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-400" aria-hidden="true" />
          </Button>
        )}

        {/* Chat Window */}
        {isOpen && (
          <Card className="flex h-[min(740px,calc(100vh-28px))] w-[min(456px,calc(100vw-24px))] flex-col overflow-hidden rounded-[28px] border-slate-200/90 bg-white shadow-[0_30px_90px_-30px_rgba(15,23,42,0.55)] ring-1 ring-black/[0.03] animate-in slide-in-from-bottom-4 duration-300">
            {/* Header */}
            <CardHeader data-chatbot-header className="relative shrink-0 overflow-hidden rounded-none bg-[radial-gradient(circle_at_86%_4%,rgba(96,165,250,0.22),transparent_34%),linear-gradient(145deg,#0f172a_0%,#111827_58%,#172033_100%)] px-5 pb-4 pt-5 text-white">
              <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full border border-white/[0.06]" />
              <div className="pointer-events-none absolute -right-5 -top-9 h-28 w-28 rounded-full border border-white/[0.06]" />
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/80 to-transparent" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.11] shadow-inner shadow-white/10">
                    <Sparkles className="h-4 w-4 text-sky-200" />
                    <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-slate-900 bg-emerald-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-sky-200/80">CateringMS / Assistant</p>
                    <CardTitle className="truncate text-[16px] font-semibold tracking-[-0.02em] text-white">{config.title}</CardTitle>
                    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.12)]" />Ready for {workspaceLabel.toLowerCase()}</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)} aria-label="Close AI assistant" className="relative h-8 w-8 shrink-0 rounded-xl border border-white/10 bg-white/[0.04] p-0 text-slate-300 transition hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></Button>
              </div>
              <div className="mt-4 flex items-center gap-2 text-[10px] font-medium text-slate-400"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />Role-scoped assistant <span className="text-slate-600">•</span> Live data protected</div>
              <div className="relative mt-5 flex items-center gap-2.5 text-[10px] font-medium text-slate-200">
                <span className="inline-flex items-center gap-1.5 text-white"><ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />Private to your role</span>
                <span className="h-1 w-1 rounded-full bg-slate-500/70" aria-hidden="true" />
                <span className="text-slate-200">Live data protected</span>
              </div>
              <style jsx global>{`
                [data-chatbot-header] > div.mt-4 { display: none !important; }
              `}</style>
            </CardHeader>

            {/* Messages */}
            <ScrollArea className="flex-1 bg-[linear-gradient(180deg,#f8fafc_0%,#f5f7fa_100%)] px-4 py-5">
              <div className="space-y-6">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex items-start gap-3",
                      message.role === "user" ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl",
                        message.role === "user"
                          ? "border border-slate-200 bg-white text-slate-500 shadow-sm"
                          : "border border-slate-200/90 bg-white text-slate-500 shadow-sm"
                      )}
                    >
                      {message.role === "user" ? (
                        <User className="h-3.5 w-3.5" />
                      ) : (
                        <Bot className="h-3.5 w-3.5" />
                      )}
                    </div>
                    <div
                      className={cn(
                        "max-w-[91%] rounded-[22px] px-4 py-3.5 shadow-sm",
                        message.role === "user"
                          ? "rounded-tr-md bg-slate-950 text-white shadow-[0_10px_26px_-14px_rgba(15,23,42,0.9)]"
                          : "rounded-tl-md border border-slate-200/90 bg-white text-slate-900 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.55)]"
                      )}
                    >
                      {message.role === "assistant" && (
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-400">CateringMS AI</p>
                          {intentRouteLabel(message.intentRoute) && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold text-emerald-700">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              {intentRouteLabel(message.intentRoute)}
                            </span>
                          )}
                        </div>
                      )}
                      {message.rendered?.title && (
                        <p className="mb-1 text-[13px] font-semibold tracking-[-0.01em] text-slate-950">{message.rendered.title}</p>
                      )}
                      {(() => {
                        const answerBlocks = [message.rendered?.message || message.content, ...(message.rendered?.details || [])];
                        const inlineNavigation = message.role === "assistant"
                          ? inlineNavigationByBlock(message.navigation || [], answerBlocks)
                          : [];
                        const inlineLinks = (items: NavigationLink[], keyPrefix: string) => items.length ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {items.map((item) => (
                              <Link key={`${keyPrefix}-${item.ref}`} href={withSlug(item.href)} prefetch={false} className="inline-flex items-center gap-1 rounded-lg border border-brand-primary/20 bg-brand-primary/[0.05] px-2 py-1 text-[10px] font-semibold text-brand-primary transition hover:border-brand-primary/40 hover:bg-brand-primary/10">
                                {item.label}<ArrowUpRight className="h-3 w-3" />
                              </Link>
                            ))}
                          </div>
                        ) : null;
                        return (
                          <>
                            <p className="whitespace-pre-wrap text-[13px] leading-6">{renderLinkedText(answerBlocks[0], withSlug, `${message.id}-message`)}</p>
                            {inlineLinks(inlineNavigation[0] || [], `${message.id}-message-link`)}
                            {!!message.rendered?.details?.length && (
                              <div className="mt-3 space-y-2.5 border-l-2 border-brand-primary/30 pl-3 text-xs leading-5 text-slate-600">
                                {message.rendered.details.map((detail, index) => (
                                  <div key={`${message.id}-detail-${index}`}>
                                    <p>{renderLinkedText(detail, withSlug, `${message.id}-detail-${index}`)}</p>
                                    {inlineLinks(inlineNavigation[index + 1] || [], `${message.id}-detail-${index}-link`)}
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        );
                      })()}
                      {message.rendered?.workflow && message.rendered.workflow.steps.length > 0 && (
                        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-primary">Recommended process</p>
                              <p className="mt-1 text-[13px] font-semibold tracking-[-0.01em] text-slate-900">{message.rendered.workflow.label}</p>
                              <p className="mt-0.5 text-xs leading-5 text-slate-500">{message.rendered.workflow.description}</p>
                            </div>
                            <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-500">{message.rendered.workflow.steps.length} steps</span>
                          </div>
                          <ol className="mt-3 space-y-2.5">
                            {message.rendered.workflow.steps.map((step, index) => (
                              <li key={`${message.id}-workflow-${step.id}`} className="flex items-start gap-2.5">
                                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-slate-900 text-[10px] font-semibold text-white">{index + 1}</span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-semibold text-slate-800">{step.title}</p>
                                  <p className="mt-0.5 text-[11px] leading-5 text-slate-500">{step.description}</p>
                                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                    <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[9px] text-slate-500">{step.ref}</span>
                                    <Link href={withSlug(step.href)} prefetch={false} className="inline-flex items-center gap-1 text-[10px] font-semibold text-brand-primary hover:underline hover:underline-offset-2">Open {step.targetType === "page" ? "page" : step.targetType}<ArrowUpRight className="h-3 w-3" /></Link>
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                        {!!message.rendered?.actions?.length && (
                          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200/80 pt-3">
                            {message.rendered.actions.map((action) => {
                              const destination = actionNavigation(action.label, message.navigation || []);
                              // A navigation ref is already rendered beside
                              // the answer/detail where it is relevant. Do
                              // not repeat the same destination as a second
                              // action button when a model also suggests it.
                              const navigationRefs = new Set((message.navigation || []).map((item) => item.ref));
                              if (destination && navigationRefs.has(destination.ref)) return null;
                              return destination ? (
                                <Link key={`${message.id}-${action.label}`} href={withSlug(destination.href)} prefetch={false} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-700 transition hover:border-brand-primary/40 hover:text-brand-primary">
                                  {action.label}<ArrowUpRight className="h-3 w-3" />
                                </Link>
                              ) : (
                                <span key={`${message.id}-${action.label}`} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-slate-600">
                                  {action.label}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      {!!message.rendered?.trace?.length && (
                        <details className="hidden">
                          <summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-wide text-slate-500">How this answer was grounded</summary>
                          <div className="mt-2 space-y-1.5 text-[11px] text-slate-600">
                            {message.rendered.trace.filter((step) => step.type !== "final").map((step) => (
                              <div key={`${message.id}-trace-${step.id}`} className="flex items-start gap-2">
                                <span className={cn("mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold", step.status === "completed" ? "bg-emerald-100 text-emerald-700" : step.status === "failed" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500")}>
                                  {step.status === "completed" ? "✓" : step.status === "failed" ? "!" : "–"}
                                </span>
                                <span><span className="font-medium">{step.title}</span>{step.detail ? <span className="block text-[10px] text-slate-500">{step.detail}</span> : null}</span>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                      <p className="mt-2 text-[10px] text-slate-400">
                        {message.timestamp.toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </p>
                    </div>
                  </div>
                ))}

                {isTyping && (
                  <div className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500">
                      <Bot className="h-3.5 w-3.5" />
                    </div>
                    <div className="rounded-[20px] rounded-tl-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-2.5">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-primary" />
                        <span className="text-[11px] font-medium text-slate-500">{WORKING_STEPS[workingStep]}</span>
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "0ms" }} />
                          <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "150ms" }} />
                          <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: "300ms" }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Example Questions (show only at start) */}
                {messages.length === 1 && (
                  <div className="mt-5 space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Suggested questions</p>
                    {config.examples.map((example, index) => (
                      <Button
                        key={index}
                        variant="outline"
                        className="h-auto min-h-10 w-full justify-start rounded-xl border-slate-200 bg-white px-3 py-2.5 text-left shadow-sm transition hover:border-brand-primary/40 hover:bg-white"
                        onClick={() => handleExampleClick(example)}
                      >
                        <Sparkles className="mr-2 h-3.5 w-3.5 shrink-0 text-brand-primary/70" />
                        <span className="text-xs font-medium text-slate-700">{example}</span>
                      </Button>
                    ))}
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Input */}
            <CardContent className="border-t border-slate-200/90 bg-white p-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center gap-2 rounded-[18px] border border-slate-200 bg-slate-50 p-1.5 pl-4 shadow-[0_4px_14px_-10px_rgba(15,23,42,0.5)] transition focus-within:border-slate-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-slate-900/[0.04]"
              >
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Ask about your workspace..."
                  className="h-9 flex-1 border-0 bg-transparent px-0 text-[13px] shadow-none focus-visible:ring-0"
                />
                <Button
                  type="submit"
                  disabled={!inputValue.trim() || isTyping}
                  aria-label="Send message"
                  className="h-9 w-9 shrink-0 rounded-xl bg-slate-950 p-0 text-white shadow-sm transition hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400"
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </form>
              <p className="hidden">
                🚀 AI-powered • Company-specific data
              </p>
              <p className="mt-2 text-center text-[10px] text-slate-400">Trusted guidance · information for your role</p>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
