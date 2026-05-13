import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ComposeDrawerHost } from "@/components/messaging/ComposeDrawerHost";
import { MessageComposer, type ContextRow } from "@/components/messaging/MessageComposer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DollarSign, Plus, Calendar, Mail, Users, FileText, Edit, Send, Copy, ExternalLink, Search, Flame, Sparkles, Crown, Snowflake, AlertTriangle, Clock, Inbox, ArrowRight, Trash2, CalendarDays, Gift, CheckCircle, List, LayoutGrid, Download, X, RefreshCw, MoreHorizontal } from "lucide-react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { Quote } from "@/types";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { RowPrimaryAction } from "@/components/admin/RowPrimaryAction";
import {
  computeFollowupState,
  loadFollowupLogsForQuotes,
  readCadenceFromAdminSettings,
  recordFollowupSent,
  templateKeyFor,
  TRAFFIC_LIGHT_CLASS,
  type FollowupLogRow,
  type FollowupState,
} from "@/services/quoteFollowupService";
import Head from "next/head";
import { useAuth } from "@/contexts/AuthContext";
import { useRegionFilter } from "@/contexts/RegionFilterContext";
import { RegionBadge } from "@/components/admin/RegionBadge";
import { ChatBot } from "@/components/ChatBot";
import { quoteService } from "@/services/quoteService";
import { trackRecentlyViewed } from "@/components/admin/RecentlyViewedWidget";
import { QuoteSendDialog, type QuoteSendDialogQuote } from "@/components/billing/QuoteSendDialog";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useToast } from "@/hooks/use-toast";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { composeEmail, templateForQuote, templateSweetener, type QuoteStatus } from "@/lib/composeEmail";
import { buildPublicQuoteUrl } from "@/services/publicQuoteService";
import {
  pushQuoteToAccounting,
  accountingProviderLabel,
  type AccountingProvider,
  type PushResult,
} from "@/services/accountingExportService";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  deriveQuoteIntelligence,
  summariseAutoEmailsByQuote,
  quoteSortKey,
  countByBucket,
  type QuoteBucket,
  type QuoteRowState,
} from "@/lib/quoteIntelligence";
import {
  buildDiaryIndex,
  computeDiarySignal,
  toDateKey,
  DIARY_TONE,
  type DiaryEntry,
  type DiarySignal,
} from "@/lib/quoteDiarySignal";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toLocalISO } from "@/lib/localDate";

const fmtMoney = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });

/**
 * Maps a Quote row -> the QuoteStatus our compose templates know about.
 * Folds in an "expired" check based on valid_until so an old "sent" quote
 * gets the urgency template instead of the default follow-up.
 */
function deriveQuoteStatus(quote: Quote): QuoteStatus {
  const validUntil = (quote as any).valid_until as string | null | undefined;
  const status = quote.status as QuoteStatus;
  // Enum cleanup (flow audit Leg B): 'revised' + 'viewed' dropped
  // from quote_status. Only 'sent' is active-and-action-needed now.
  if (status === "sent" && validUntil) {
    if (new Date(validUntil).getTime() < Date.now()) return "expired";
  }
  return status;
}

/**
 * Phase 8 #8: pipeline kanban. Six columns keyed off the
 * intelligence bucket (action_needed / in_play / stale / won /
 * expired / lost). Cards show the minimum the sales lead needs
 * to triage: client, total, event date, last action label.
 * Click jumps to the row in the list view.
 */
const PIPELINE_COLUMNS: Array<{
  bucket: Exclude<QuoteBucket, "all">;
  title: string;
  tone: string;
  Icon: any;
}> = [
  { bucket: "action_needed", title: "Action needed", tone: "border-rose-300 bg-rose-50",       Icon: Flame },
  { bucket: "in_play",       title: "In play",       tone: "border-blue-300 bg-blue-50",       Icon: Sparkles },
  { bucket: "stale",         title: "Stale",         tone: "border-amber-300 bg-amber-50",     Icon: Clock },
  { bucket: "won",           title: "Won",           tone: "border-emerald-300 bg-emerald-50", Icon: Crown },
  { bucket: "expired",       title: "Expired",       tone: "border-orange-300 bg-orange-50",   Icon: AlertTriangle },
  { bucket: "lost",          title: "Lost",          tone: "border-slate-300 bg-slate-50",     Icon: Snowflake },
];

function PipelineBoard({
  rows,
  onOpen,
  currencySymbol = "R",
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[];
  onOpen: (quoteId: string) => void;
  /** Phase 9 #1: tenant currency symbol for the per-card totals
   *  + per-column rollup. Defaults to R so existing ZAR tenants
   *  see no behaviour change. */
  currencySymbol?: string;
}) {
  // Pre-bucket once so each column doesn't re-filter the whole list.
  const grouped = (() => {
    const out: Record<string, any[]> = {};
    for (const col of PIPELINE_COLUMNS) out[col.bucket] = [];
    for (const r of rows) {
      const b = r.intelligence?.bucket;
      if (out[b]) out[b].push(r);
    }
    return out;
  })();
  return (
    <div className="overflow-x-auto pb-4 mb-6">
      <div className="flex gap-4 min-w-max px-1">
        {PIPELINE_COLUMNS.map((col) => {
          const list = grouped[col.bucket] || [];
          const total = list.reduce((acc: number, r: any) => acc + Number(r.quote?.total || 0), 0);
          const Icon = col.Icon;
          return (
            <div key={col.bucket} className={`w-72 shrink-0 rounded-xl border-2 ${col.tone}`}>
              <div className="px-3 py-2 flex items-center justify-between border-b border-slate-200/70">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-slate-700" />
                  <span className="text-sm font-semibold text-slate-900">{col.title}</span>
                  <span className="text-xs text-slate-500 tabular-nums">{list.length}</span>
                </div>
                <span className="text-[11px] text-slate-500 tabular-nums">
                  {currencySymbol}{Math.round(total / 1000)}k
                </span>
              </div>
              <div className="p-2 space-y-2 max-h-[640px] overflow-y-auto">
                {list.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-6">Nothing here.</p>
                ) : (
                  list.map((r: any) => {
                    const q = r.quote;
                    const intel = r.intelligence;
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => onOpen(q.id)}
                        className="w-full text-left rounded-lg bg-white border border-slate-200 hover:border-slate-300 hover:shadow-sm transition p-2.5"
                      >
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="text-sm font-medium text-slate-900 truncate">{q.client_name || "Unknown"}</span>
                          <span className="text-xs font-semibold text-slate-700 tabular-nums shrink-0">
                            {currencySymbol}{Number(q.total || 0).toLocaleString("en-ZA", { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
                          {q.event_date && (
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(q.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                            </span>
                          )}
                          {q.guest_count != null && (
                            <span className="inline-flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              {q.guest_count}
                            </span>
                          )}
                        </div>
                        {intel?.label && (
                          <p className={`text-[11px] mt-1.5 ${intel.tone === "urgent" ? "text-rose-700 font-medium" : "text-slate-600"}`}>
                            {intel.label}
                          </p>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AdminQuotes() {
  const { user, profile } = useAuth() as any;
  // Phase 9 #1: tenant currency. Replaces the hardcoded R prefix
  // throughout the quotes list, totals card and detail panes.
  const tenantCurrency = useTenantCurrency(user?.company_id);
  const C = tenantCurrency.symbol;
  const { regionFilterId } = useRegionFilter();
  const { toast } = useToast();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [autoEmailRows, setAutoEmailRows] = useState<any[]>([]);
  const [followupLogs, setFollowupLogs] = useState<Record<string, FollowupLogRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [composeQuote, setComposeQuote] = useState<Quote | null>(null);
  // Phase 18 #1: record opened quote in the recently-viewed list
  // so the dashboard widget can offer a one-click jump back. Fires
  // when the compose drawer opens (which covers every Send / Edit
  // path through this page).
  useEffect(() => {
    if (!composeQuote?.id) return;
    trackRecentlyViewed({
      id: composeQuote.id,
      type: "quote",
      label: `${(composeQuote as any).quote_number || ""} -- ${composeQuote.client_name || "Unknown"}`,
      href: `/admin/quotes?quoteId=${composeQuote.id}`,
    });
  }, [composeQuote?.id]);
  const [composeMode, setComposeMode] = useState<"status" | "sweetener">("status");
  const [deleteTarget, setDeleteTarget] = useState<Quote | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([]);
  const [companyName, setCompanyName] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  // Phase 26 #2: "/" or Cmd-F focuses the search input. Same
  // pattern as /admin/orders + /admin/contacts.
  // Phase 29 #2: "n" jumps to the new-quote builder.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        router.push("/admin/quotes/new");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [bucket, setBucket] = useState<QuoteBucket>("all");
  // Phase 8 #8: list (default) vs pipeline kanban view. The kanban
  // groups by intelligence bucket (action_needed / in_play / stale /
  // won / lost / expired) so the sales lead can see where every
  // open quote sits in the pipeline at a glance.
  const [viewMode, setViewMode] = useState<"list" | "pipeline">("list");
  // Phase 9 #3: persist filter state (search + bucket + viewMode)
  // across reloads. Mirrors what /admin/orders does. Sales leads
  // usually camp on a working filter (e.g. action_needed + list)
  // and were losing it on every nav.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("cateringms.adminQuotes.filters.v1");
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (typeof saved.search === "string") setSearch(saved.search);
      if (typeof saved.bucket === "string") setBucket(saved.bucket as QuoteBucket);
      if (saved.viewMode === "list" || saved.viewMode === "pipeline") setViewMode(saved.viewMode);
    } catch {
      /* corrupt storage -- fall back to defaults */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        "cateringms.adminQuotes.filters.v1",
        JSON.stringify({ search, bucket, viewMode }),
      );
    } catch {
      /* storage blocked */
    }
  }, [search, bucket, viewMode]);
  // Phase 15 #1: saved-view chips. Mirrors the pattern on
  // /admin/orders -- snapshot search + bucket + viewMode under a
  // named chip so a sales lead can snap back to 'Stale -- list'
  // or 'Won -- pipeline' with one click.
  interface SavedQuoteView {
    id: string;
    name: string;
    search: string;
    bucket: QuoteBucket;
    viewMode: "list" | "pipeline";
  }
  const [savedViews, setSavedViews] = useState<SavedQuoteView[]>([]);
  // Phase 15 #4: 'Mine only' toggle. Restricts the visible list to
  // quotes the current user prepared. Useful when several sales
  // reps share the page and want to focus on their own pipeline.
  const [myQuotesOnly, setMyQuotesOnly] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("cateringms.adminQuotes.savedViews.v1");
      if (raw) setSavedViews(JSON.parse(raw) as SavedQuoteView[]);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        "cateringms.adminQuotes.savedViews.v1",
        JSON.stringify(savedViews),
      );
    } catch { /* storage blocked */ }
  }, [savedViews]);
  const saveCurrentQuoteView = () => {
    if (typeof window === "undefined") return;
    const name = window.prompt("Name this view:", "");
    if (!name || !name.trim()) return;
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    setSavedViews((prev) => [
      ...prev.filter((v) => v.name.toLowerCase() !== name.trim().toLowerCase()),
      { id, name: name.trim(), search, bucket, viewMode },
    ]);
  };
  const applySavedQuoteView = (v: SavedQuoteView) => {
    setSearch(v.search);
    setBucket(v.bucket);
    setViewMode(v.viewMode);
  };
  const removeSavedQuoteView = (id: string) => {
    setSavedViews((prev) => prev.filter((v) => v.id !== id));
  };
  // Authoritative event details, sourced from the linked order whenever
  // a quote has converted (quote.converted_to_order_id is set). Without
  // this, a quote row's event_date / guest_count / total continue to
  // show the original enquiry numbers even after the order was edited
  // (postponed dates, guest count revisions, equipment add-ons), so the
  // operator looks at stale values and second-guesses the diary.
  const [resolvedByQuoteId, setResolvedByQuoteId] = useState<Map<string, {
    sourceOrderId: string;
    orderNumber: string | null;
    eventDate: string | null;
    eventName: string | null;
    guestCount: number | null;
    totalAmount: number | null;
    venueName: string | null;
  }>>(new Map());

  // Deep-link target from notifications + email links: clicking a
  // "Client wants changes on a quote" notification lands here with
  // ?quoteId=<uuid>. We track which quote to focus, switch the bucket
  // filter to "all" so the row is reachable regardless of state, and
  // scroll the row into view with a temporary highlight ring after
  // the load completes. The query param gets stripped after handling
  // so a refresh doesn't re-trigger the focus indefinitely.
  const router = useRouter();
  const [focusedQuoteId, setFocusedQuoteId] = useState<string | null>(null);

  // Diary index: every confirmed order + accepted quote pivoted by
  // event_date so each open quote's row can show "wide open day" or
  // "stacked" without a per-row roundtrip.
  const diaryIndex = useMemo(() => buildDiaryIndex(diaryEntries), [diaryEntries]);

  // Roll quotes + auto-email queue into a single per-row state object
  // with derived intelligence (status bucket, suggested action, last
  // touch, auto-email summary). Sort urgent + old to the top.
  const cadence = useMemo(() => readCadenceFromAdminSettings(), []);
  const followupByQuote = useMemo<Record<string, FollowupState>>(() => {
    const out: Record<string, FollowupState> = {};
    for (const q of quotes) {
      out[q.id] = computeFollowupState(q as any, followupLogs[q.id] || [], cadence);
    }
    return out;
  }, [quotes, followupLogs, cadence]);

  const rowStates = useMemo<QuoteRowState[]>(() => {
    const autoMap = summariseAutoEmailsByQuote(autoEmailRows as any);
    return quotes
      .map((q) => {
        const intelligence = deriveQuoteIntelligence(q);
        const autoEmail =
          autoMap.get(q.id) || { queued: 0, sent: 0, latest: null };
        return {
          quote: q,
          intelligence,
          autoEmail,
          sortKey: quoteSortKey(intelligence),
        };
      })
      .sort((a, b) => a.sortKey - b.sortKey);
  }, [quotes, autoEmailRows]);

  // Apply the global branch filter before bucketing so the bucket
  // counts reflect only the branch the operator is scoped to.
  // Phase 15 #4: 'mine only' layers on top of the region filter
  // so the bucket counts also reflect the user-scoped subset.
  const regionFilteredRows = useMemo(() => {
    let base = !regionFilterId
      ? rowStates
      : rowStates.filter((r) => {
          const rid = (r.quote as any).region_id;
          return !rid || rid === regionFilterId;
        });
    if (myQuotesOnly && (user as any)?.id) {
      const me = (user as any).id;
      base = base.filter((r) => {
        const q = r.quote as any;
        return q.prepared_by === me || q.user_id === me;
      });
    }
    return base;
  }, [rowStates, regionFilterId, myQuotesOnly, (user as any)?.id]);

  const counts = useMemo(() => countByBucket(regionFilteredRows), [regionFilteredRows]);
  // Phase 18 #8: revenue-by-bucket chip. Sales asks "how much do we
  // have stuck in stale" and "what's the in-play pipeline worth";
  // counts alone don't answer that. Same regionFilteredRows source as
  // counts so the numbers always agree with the pill counts.
  const revenueByBucket = useMemo(() => {
    const sums: Record<string, number> = { all: 0, action_needed: 0, in_play: 0, stale: 0, won: 0, expired: 0, lost: 0 };
    for (const r of regionFilteredRows) {
      const t = Number((r.quote as any).total ?? (r.quote as any).subtotal ?? 0);
      if (!Number.isFinite(t)) continue;
      sums.all += t;
      const b = r.intelligence.bucket as string;
      if (b in sums) sums[b] += t;
    }
    return sums;
  }, [regionFilteredRows]);
  const fmtCompact = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
    return n.toFixed(0);
  };
  const bucketFilteredRows = useMemo(
    () => (bucket === "all" ? regionFilteredRows : regionFilteredRows.filter((r) => r.intelligence.bucket === bucket)),
    [regionFilteredRows, bucket],
  );

  // Smart fuzzy search across client name, email, event name, venue, ref
  // and the formatted total. Operates on the bucket-filtered rows so the
  // pill selection narrows the search universe.
  const filteredRows = useFuzzyItems(
    bucketFilteredRows,
    search,
    [
      { key: ((r: QuoteRowState) => r.quote.client_name) as any, weight: 3, label: "client_name" },
      { key: ((r: QuoteRowState) => r.quote.client_email) as any, weight: 2, label: "client_email" },
      { key: ((r: QuoteRowState) => (r.quote as any).event_name) as any, weight: 2, label: "event_name" },
      { key: ((r: QuoteRowState) => (r.quote as any).venue || (r.quote as any).venue_address) as any, weight: 1, label: "venue" },
      { key: ((r: QuoteRowState) => (r.quote as any).quote_number || r.quote.id) as any, weight: 2, label: "quote_ref" },
      { key: ((r: QuoteRowState) => r.quote.total != null ? `R${r.quote.total} ${r.quote.total}` : "") as any, weight: 1, label: "total" },
    ],
    { limit: 0 },
  );

  // Phase 27 #8: manual refresh bumper. Realtime channels handle
  // most refresh cases but operators want a button when they
  // expect a colleague to have just touched something.
  const [refreshTick, setRefreshTick] = useState(0);
  useEffect(() => {
    if (!user?.company_id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Phase 10 #5: auto-expire stale sent quotes. Any quote with
      // status in (sent, viewed, revised) and valid_until in the
      // past is logically expired -- deriveQuoteStatus already
      // renders it that way -- but the DB row stayed 'sent' which
      // skewed the bucket counts and the kanban grouping. Single
      // best-effort UPDATE before the read so the bucketing reads
      // the truth. RLS gates this to the operator's tenant; a
      // failure here is harmless because the derive helper still
      // shows the expired state in the UI.
      try {
        const todayIso = new Date().toISOString().slice(0, 10);
        await (supabase as any)
          .from("quotes")
          .update({ status: "expired" })
          .eq("company_id", user.company_id)
          .in("status", ["sent"])
          .lt("valid_until", todayIso)
          .is("deleted_at", null);
      } catch {
        /* non-blocking -- the derive helper still tags the row */
      }
      const fetched = await quoteService.getQuotes(user.company_id!);
      if (cancelled) return;
      setQuotes(fetched);

      // Order hydration runs in its own effect (see below) so the
      // realtime quote refresh and any local mutation that flips a
      // quote into "converted" stays in sync without rewiring this
      // load path.

      // Pull every auto-email row associated with this company's
      // quotes. trigger_event names start with 'quote.' for the
      // quote-driven automations, but we keep this loose so any
      // future trigger_event prefix tied to a quote_id still surfaces.
      try {
        const quoteIds = fetched.map((q) => q.id);
        if (quoteIds.length > 0) {
          const { data: queueRows } = await supabase
            .from("outgoing_email_queue")
            .select("trigger_ref_id, status, subject, sent_at, created_at, trigger_event")
            .eq("company_id", user.company_id)
            .in("trigger_ref_id", quoteIds);
          if (!cancelled) setAutoEmailRows(queueRows || []);
        }
      } catch (err) {
        // Non-fatal -- the page still works without auto-email
        // visibility, just without the "Auto follow-up sent 2d ago"
        // line on each row.
        console.warn("[quotes] auto-email queue fetch failed", err);
      }

      // Follow-up log -- per-quote audit trail of FU1 / FU2 / FU3
      // sends. Drives the traffic-light pill on the row + decides
      // which sequence position the Send-follow-up button is for.
      try {
        const ids = fetched.map((q) => q.id);
        const byQuote = await loadFollowupLogsForQuotes(ids);
        if (!cancelled) setFollowupLogs(byQuote);
      } catch (err) {
        console.warn("[quotes] followup log fetch failed", err);
      }

      // Diary lookup -- every confirmed order + accepted quote in the
      // company's calendar. Used to decide whether an open quote sits
      // on a wide-open day worth offering a sweetener for.
      try {
        const today = new Date();
        const horizon = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000);
        const startKey = toDateKey(today)!;
        const endKey = toDateKey(horizon)!;

        const [{ data: orderRows }, { data: acceptedQuoteRows }] = await Promise.all([
          supabase
            .from("orders")
            .select("id, event_date, client_name, guest_count, status")
            .eq("company_id", user.company_id)
            .gte("event_date", startKey)
            .lte("event_date", endKey),
          supabase
            .from("quotes")
            .select("id, event_date, client_name, guest_count, status")
            .eq("company_id", user.company_id)
            .eq("status", "accepted")
            .gte("event_date", startKey)
            .lte("event_date", endKey),
        ]);

        const entries: DiaryEntry[] = [];
        for (const o of (orderRows || [])) {
          const dk = toDateKey((o as any).event_date);
          if (!dk) continue;
          // Skip cancelled / draft orders -- they're not real commitments.
          const status = ((o as any).status || "").toLowerCase();
          if (status === "cancelled" || status === "canceled" || status === "draft") continue;
          entries.push({
            date: dk,
            kind: "order",
            label: (o as any).client_name || "Order",
            guests: (o as any).guest_count ?? null,
            sourceId: (o as any).id || null,
          });
        }
        for (const q of (acceptedQuoteRows || [])) {
          const dk = toDateKey((q as any).event_date);
          if (!dk) continue;
          entries.push({
            date: dk,
            kind: "accepted_quote",
            label: (q as any).client_name || "Accepted quote",
            guests: (q as any).guest_count ?? null,
            sourceId: (q as any).id || null,
          });
        }
        if (!cancelled) setDiaryEntries(entries);
      } catch (err) {
        console.warn("[quotes] diary fetch failed", err);
      }

      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.company_id, refreshTick]);

  // Hydrate authoritative event details from linked orders. When a
  // quote has converted_to_order_id set, the order is the source of
  // truth -- the team may have postponed the date, revised guests,
  // bolted on extra equipment. Runs whenever the quotes list changes
  // (initial load, realtime refresh, manual accept) so a quote that
  // just flipped to "accepted + converted" picks up its order numbers
  // on the next render rather than continuing to show stale enquiry
  // values.
  useEffect(() => {
    const companyId = user?.company_id;
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const orderIds = Array.from(new Set(
          quotes
            .map((q: any) => q.converted_to_order_id)
            .filter((id: string | null | undefined): id is string => !!id),
        ));
        if (orderIds.length === 0) {
          if (!cancelled) setResolvedByQuoteId(new Map());
          return;
        }
        const { data: orderRows } = await supabase
          .from("orders")
          .select("id, order_number, event_date, event_name, guest_count, total_amount, venue_name")
          .eq("company_id", companyId)
          .in("id", orderIds);
        const byOrderId = new Map<string, any>();
        for (const o of orderRows || []) byOrderId.set((o as any).id, o);
        const next = new Map<string, any>();
        for (const q of quotes as any[]) {
          const oid = q.converted_to_order_id;
          if (!oid) continue;
          const o = byOrderId.get(oid);
          if (!o) continue;
          next.set(q.id, {
            sourceOrderId: o.id,
            orderNumber: o.order_number ?? null,
            eventDate: o.event_date ?? null,
            eventName: o.event_name ?? null,
            guestCount: o.guest_count ?? null,
            totalAmount: o.total_amount ?? null,
            venueName: o.venue_name ?? null,
          });
        }
        if (!cancelled) setResolvedByQuoteId(next);
      } catch (err) {
        // Non-fatal -- the row falls back to the quote's own values,
        // which is the original behaviour.
        console.warn("[quotes] order hydration failed", err);
      }
    })();
    return () => { cancelled = true; };
  }, [quotes, user?.company_id]);

  // Deep-link handler: when ?quoteId=<uuid> is in the URL (typically
  // from a notification click), find the quote in our loaded list,
  // switch the bucket filter to "all" so the row is reachable, scroll
  // it into view, and apply a temporary highlight ring. Strip the
  // query param from the URL after handling so a refresh doesn't
  // re-fire and the user can scroll freely.
  useEffect(() => {
    if (!router.isReady) return;
    const target = typeof router.query.quoteId === "string" ? router.query.quoteId : null;
    if (!target) return;
    if (loading || quotes.length === 0) return;
    const exists = quotes.some((q) => q.id === target);
    if (!exists) return;

    setBucket("all");
    setSearch("");
    setFocusedQuoteId(target);

    const t = setTimeout(() => {
      const el = typeof document !== "undefined" ? document.getElementById(`quote-${target}`) : null;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);

    // Clear the focus highlight after a few seconds so the row settles
    // back into the normal list view.
    const clearT = setTimeout(() => setFocusedQuoteId(null), 4000);

    // Strip ?quoteId from the URL without reloading. shallow keeps state.
    const { quoteId: _drop, ...rest } = router.query;
    router.replace(
      { pathname: router.pathname, query: rest },
      undefined,
      { shallow: true },
    );

    return () => { clearTimeout(t); clearTimeout(clearT); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.quoteId, loading, quotes]);

  // Realtime subscription -- when a client submits a quote request via
  // their portal (or any other process inserts a quote for our
  // company), refetch so the new row appears at the top of the
  // "Action needed" pill without the team having to refresh manually.
  // Filtered to this company_id so we never receive other tenants'
  // events even though Supabase realtime broadcasts at the table
  // level by default.
  useEffect(() => {
    if (!user?.company_id) return;
    const channel = supabase
      .channel(`quotes:${user.company_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "quotes",
          filter: `company_id=eq.${user.company_id}`,
        },
        async () => {
          try {
            const fresh = await quoteService.getQuotes(user.company_id!);
            setQuotes(fresh);
          } catch (err) {
            console.warn("[quotes] realtime refresh failed", err);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.company_id]);

  // Realtime toast on client quote acceptance. The
  // /api/public/quotes/[token]/accept route inserts a 'quote_accepted'
  // notification on the operator's company; this listener turns that
  // insert into a toast + a quotes-list reload so the row visually
  // flips to accepted without the operator hitting refresh.
  useEffect(() => {
    const companyId = user?.company_id;
    if (!companyId) return;
    const ch = supabase
      .channel(`admin-quote-accepts:${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `company_id=eq.${companyId}`,
        },
        async (payload) => {
          const row = (payload as any).new;
          if (!row || row.notification_type !== "quote_accepted") return;
          toast({
            title: "Quote accepted",
            description: row.message || "A client just accepted a quote.",
          });
          try {
            const fresh = await quoteService.getQuotes(companyId);
            setQuotes(fresh);
          } catch (err) {
            console.warn("[quotes] realtime accept reload failed", err);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.company_id, toast]);

  // Pull the catering company's display name once so the email signature
  // reads as "Best, Spit Braai Delivery" rather than "Best, the team".
  useEffect(() => {
    setCompanyName(profile?.company_name || (user as any)?.company_name);
  }, [profile, user]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleting(true);
    try {
      await quoteService.deleteQuote(id);
      setQuotes((prev) => prev.filter((q) => q.id !== id));
      toast({
        title: "Quote deleted",
        description: `Removed ${deleteTarget.client_name}'s quote.`,
      });
      setDeleteTarget(null);
    } catch (err: any) {
      console.error("Delete quote failed:", err);
      toast({
        title: "Delete failed",
        description: err?.message || "Could not delete this quote.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  /**
   * Manual "Mark as sent" -- sets quotes.sent_at to now without
   * actually firing an email. Used when the operator sent the quote
   * outside the system (printed PDF, WhatsApp, walked it across) and
   * wants the follow-up timing baseline anchored. If the quote is
   * still in draft, status flips to 'sent' so the suggester picks it
   * up like any normal sent quote.
   */
  // Phase 11 #6: mark a quote as lost / rejected. Captures an
  // optional reason in audit_logs so the sales lead can later
  // review why deals fell through. No order is created.
  const handleMarkAsLost = async (quote: Quote) => {
    if (typeof window === "undefined") return;
    const reason = window.prompt(
      `Mark ${quote.client_name}'s quote as lost? Add a quick reason (optional):`,
      "",
    );
    if (reason === null) return; // cancel
    try {
      const { error } = await (supabase as any)
        .from("quotes")
        .update({ status: "rejected" })
        .eq("id", quote.id);
      if (error) throw error;
      setQuotes((prev) => prev.map((q) =>
        q.id === quote.id ? ({ ...q, status: "rejected" } as Quote) : q,
      ));
      // Best-effort audit log so /admin/audit-logs shows the loss
      // reason. Non-blocking if it trips.
      if (user?.company_id) {
        try {
          await (supabase as any).from("audit_logs").insert({
            company_id: user.company_id,
            user_id: (user as any)?.id ?? null,
            action: "quote_marked_lost",
            entity_type: "quote",
            entity_id: quote.id,
            details: {
              client_name: quote.client_name,
              total: quote.total,
              reason: reason.trim() || null,
            },
          });
        } catch {
          /* non-blocking */
        }
      }
      toast({
        title: "Marked as lost",
        description: reason.trim() ? `Reason: ${reason.trim()}` : "No reason recorded.",
      });
    } catch (err: any) {
      console.error("Mark as lost failed:", err);
      toast({
        title: "Could not mark as lost",
        description: err?.message || "Try again.",
        variant: "destructive",
      });
    }
  };

  const handleMarkAsSent = async (quote: Quote) => {
    const isAlreadySent = !!(quote as any).sent_at;
    const ok = isAlreadySent
      ? typeof window !== "undefined" && window.confirm(
          `Reset the 'sent' timestamp for ${quote.client_name}? Follow-up timing restarts from now.`
        )
      : true;
    if (!ok) return;

    const nowIso = new Date().toISOString();
    const nextStatus = quote.status === "draft" ? "sent" : quote.status;
    try {
      const { error } = await (supabase as any)
        .from("quotes")
        .update({ sent_at: nowIso, status: nextStatus })
        .eq("id", quote.id);
      if (error) throw error;

      setQuotes((prev) => prev.map((q) =>
        q.id === quote.id
          ? ({ ...q, sent_at: nowIso, status: nextStatus } as Quote)
          : q,
      ));
      toast({
        title: isAlreadySent ? "Sent timestamp reset" : "Marked as sent",
        description: isAlreadySent
          ? "Follow-up timing restarts from now."
          : "Follow-up timing now anchored to this moment.",
      });
    } catch (err: any) {
      console.error("Mark as sent failed:", err);
      toast({
        title: "Could not mark as sent",
        description: err?.message || "Try again.",
        variant: "destructive",
      });
    }
  };

  // Open the review-before-send composer rather than firing the email
  // immediately. The dialog handles the actual /api/send-email POST and
  // calls onSent on success; that's where we update local state.
  const handleSend = (quoteId: string) => {
    const q = quotes.find((row) => row.id === quoteId);
    if (!q) return;
    setSendDialogQuote(q);
    setSendDialogOpen(true);
  };

  const [sendDialogQuote, setSendDialogQuote] = useState<Quote | null>(null);
  const [sendDialogOpen, setSendDialogOpen] = useState<boolean>(false);

  const handleQuoteSent = (q: QuoteSendDialogQuote) => {
    setQuotes((prev) =>
      prev.map((row) =>
        row.id === q.id
          ? ({ ...row, status: "sent", sent_at: new Date().toISOString() } as Quote)
          : row,
      ),
    );
  };

  /** Open the compose drawer in follow-up mode. We re-use the
   *  existing QuoteComposeDrawer's "status" path since it already
   *  picks the registry template by quote.status -- the operator
   *  edits as needed and on send we log the position.
   *
   *  The button only appears when computeFollowupState returns a
   *  non-null nextPosition. Sequence advances ONLY on actual send
   *  (handled in the drawer's onSent callback below). */
  const handleSendFollowup = (quote: Quote) => {
    setComposeMode("status");
    setComposeQuote(quote);
    // The actual log-row insert happens in the drawer's onSent
    // callback so we don't double-log if the operator opens then
    // closes without sending.
  };

  /** Manual accept on behalf of the client. Use when the client phones
   *  / WhatsApps to confirm verbally and you want the lifecycle to
   *  catch up: marks quote 'accepted', creates the order, fires the
   *  deposit invoice + confirmation email + kitchen prep tasks.
   *
   *  Two-step UX: pre-flight dialog (acceptPreflight) shows what's
   *  about to fire so the operator can sanity-check the email
   *  destination before it goes; on confirm, runs the convert and
   *  surfaces a multi-line receipt toast so they know exactly what
   *  succeeded vs what they may need to chase manually. */
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [acceptPreflight, setAcceptPreflight] = useState<Quote | null>(null);
  // Deposit captured at accept time. The operator toggles 'paid?'
  // on the pre-flight; if yes they confirm the amount + method +
  // reference and the order + invoice get stamped paid in one shot.
  const [depositPaid, setDepositPaid] = useState<boolean>(false);
  const [depositAmount, setDepositAmount] = useState<string>("");
  const [depositMethod, setDepositMethod] = useState<"cash" | "eft" | "card" | "other">("eft");
  const [depositReference, setDepositReference] = useState<string>("");
  // Company-level deposit_percent fallback. Older quotes were created
  // before Settings -> Financial persisted the company default, so
  // quote.deposit_percentage on those rows is still 30 (the original
  // hardcoded constant) or null. Resolving the canonical company value
  // here lets the dialog show the current setting rather than the
  // stale stamp from the quote.
  const [companyDepositPct, setCompanyDepositPct] = useState<number | null>(null);
  useEffect(() => {
    if (!user?.company_id) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("companies")
        .select("deposit_percent")
        .eq("id", user.company_id)
        .maybeSingle();
      if (!cancelled) {
        const v = Number((data as any)?.deposit_percent);
        setCompanyDepositPct(Number.isFinite(v) && v > 0 ? v : null);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.company_id]);

  // Resolve the percentage to display + prefill against. Priority is
  // company default first, quote stamp as fallback, literal 30 last.
  // Why company default first: older quotes were created with the
  // builder's hardcoded 30 stamp regardless of company setting, so
  // those stamps don't represent an explicit operator decision -- the
  // current Settings -> Financial value is the canonical intent. If
  // an operator wants a different deposit on this specific accept,
  // they can edit the amount field directly.
  const resolveDepositPct = (q: Quote | null): number => {
    if (companyDepositPct != null) return companyDepositPct;
    const fromQuote = Number((q as any)?.deposit_percentage);
    if (Number.isFinite(fromQuote) && fromQuote > 0) return fromQuote;
    return 30;
  };

  // When the pre-flight opens, prefill the deposit amount with the
  // expected deposit (resolveDepositPct of total) so the operator
  // just toggles paid + tweaks if needed.
  useEffect(() => {
    if (acceptPreflight) {
      const total = Number((acceptPreflight as any).total ?? (acceptPreflight as any).total_amount ?? 0);
      const pct = resolveDepositPct(acceptPreflight);
      const expected = total > 0 ? Math.round((total * pct / 100) * 100) / 100 : 0;
      setDepositPaid(false);
      setDepositAmount(expected ? expected.toFixed(2) : "");
      setDepositMethod("eft");
      setDepositReference("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acceptPreflight, companyDepositPct]);

  const runAcceptOnBehalf = async (quote: Quote) => {
    setAcceptingId(quote.id);
    setAcceptPreflight(null);
    try {
      const depositPayload = depositPaid && Number(depositAmount) > 0
        ? {
            amount: Number(depositAmount),
            method: depositMethod,
            reference: depositReference.trim() || null,
          }
        : undefined;
      const receipt = await quoteService.convertQuoteToOrder(quote.id, {
        depositPaid: depositPayload,
      });
      if (!receipt.order) {
        toast({
          title: "Accept failed",
          description: receipt.error || "Conversion failed. Check the quote has a valid client + event date.",
          variant: "destructive",
        });
        return;
      }

      // Build a multi-line summary so the operator knows exactly what
      // landed and what didn't. Each step reports back independently.
      const orderNum = (receipt.order as any).order_number;
      const orderTotal = Number((receipt.order as any).total_amount || 0);
      const depositPaidAmount = Number(receipt.deposit.amount || 0);
      // Wave 13 audit: copy used to say "Order + invoice marked paid"
      // for any deposit, which was a lie -- the DB rightly stored
      // payment_status='partial' when the deposit didn't cover the
      // full balance. Now reflect reality: full / partial.
      const settlesInFull = depositPaidAmount > 0 && depositPaidAmount >= orderTotal - 0.01;
      const lines: string[] = [`Order ${orderNum} created.`];
      if (receipt.deposit.recorded) {
        if (settlesInFull) {
          lines.push(`${fmtMoney.format(depositPaidAmount)} recorded via ${receipt.deposit.method} -- order paid in full.`);
        } else {
          const balance = Math.max(0, orderTotal - depositPaidAmount);
          lines.push(`Deposit ${fmtMoney.format(depositPaidAmount)} recorded via ${receipt.deposit.method}. Balance ${fmtMoney.format(balance)} still due.`);
        }
      }
      if (receipt.invoice.ok) {
        lines.push(receipt.invoice.number
          ? (receipt.deposit.recorded
              ? (settlesInFull
                  ? `Invoice ${receipt.invoice.number} stamped paid.`
                  : `Invoice ${receipt.invoice.number} stamped partially paid.`)
              : `Deposit invoice ${receipt.invoice.number} queued.`)
          : `Deposit invoice queued.`);
      } else {
        lines.push(`Invoice did NOT generate. ${receipt.invoice.error || "unknown error"}. Generate it manually on the order.`);
      }
      if (receipt.email.sent) {
        lines.push(`Confirmation email sent to ${quote.client_email}.`);
      } else if (receipt.email.skipped && receipt.email.reason === "no_client_email") {
        lines.push(`No email on file. Client wasn't notified by email. Phone / WhatsApp them.`);
      } else if (!receipt.email.sent) {
        lines.push(`Email did NOT send. ${receipt.email.reason || "unknown"}. Send the confirmation manually.`);
      }
      if (receipt.kitchen.ok && receipt.kitchen.tasksCreated > 0) {
        lines.push(`${receipt.kitchen.tasksCreated} kitchen prep tasks planned.`);
      } else if (!receipt.kitchen.ok) {
        lines.push(`Kitchen prep tasks NOT generated. ${receipt.kitchen.reason || "unknown"}.`);
      }

      const allOk = receipt.invoice.ok && (receipt.email.sent || receipt.email.reason === "no_client_email") && receipt.kitchen.ok;
      toast({
        title: allOk ? "Quote accepted, full handoff complete" : "Quote accepted, with caveats",
        description: lines.join(" "),
        variant: allOk ? "default" : "destructive",
      });

      setQuotes((prev) => prev.map((q) =>
        q.id === quote.id ? { ...q, status: "accepted", accepted_at: new Date().toISOString() } as Quote : q
      ));
    } catch (err: any) {
      console.error("Accept on behalf failed:", err);
      toast({ title: "Accept failed", description: err?.message || "Something went wrong.", variant: "destructive" });
    } finally {
      setAcceptingId(null);
    }
  };

  const getStatusColor = (status: Quote["status"]) => {
    switch (status) {
      case "draft": return "bg-gray-100 text-gray-700 border-gray-200";
      case "sent": return "bg-blue-100 text-blue-700 border-blue-200";
      case "accepted": return "bg-green-100 text-green-700 border-green-200";
      case "rejected": return "bg-red-100 text-red-700 border-red-200";
      case "expired": return "bg-amber-100 text-amber-700 border-amber-200";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Quote Management - CateringMS Admin</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 lg:pl-72 xl:pl-80">
        <div className="px-4 pt-20 lg:pt-6 pb-12 max-w-full">
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-500 rounded-2xl shadow-lg">
                  <DollarSign className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                    Quotes
                  </h1>
                  <p className="text-slate-600 mt-1">Priced proposals. Build a quote from a lead or directly off a client, send the public link, then chase with reminders until accepted or declined. Accepted quotes convert to orders.</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* Phase 27 #8: manual refresh bumps refreshTick which
                    is wired into the load effect's deps. Realtime
                    channels handle most cases but operators want
                    a button when expecting a colleague to have just
                    touched a quote. */}
                <Button
                  variant="outline"
                  onClick={() => setRefreshTick((n) => n + 1)}
                  disabled={loading}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                {/* Phase 11 #2: CSV export of the currently filtered
                    quote set. Respects bucket + search so the file
                    matches what the operator sees on screen. */}
                <Button
                  variant="outline"
                  onClick={() => {
                    const rows = filteredRows;
                    if (rows.length === 0) {
                      toast({ title: "Nothing to export", description: "Adjust the bucket or search until at least one quote is visible." });
                      return;
                    }
                    const headers = [
                      "Quote number", "Status", "Bucket", "Client",
                      "Email", "Event date", "Guests", "Venue",
                      "Subtotal", "Tax", "Total", "Currency",
                      "Sent", "Viewed", "Accepted",
                    ];
                    const esc = (v: any) => {
                      if (v == null) return "";
                      const s = String(v).replace(/"/g, '""');
                      return /[",\n]/.test(s) ? `"${s}"` : s;
                    };
                    const lines = [headers.join(",")];
                    for (const rs of rows) {
                      const q: any = rs.quote;
                      const bucket = rs.intelligence?.bucket || "";
                      lines.push([
                        esc(q.quote_number),
                        esc(q.status),
                        esc(bucket),
                        esc(q.client_name),
                        esc(q.client_email),
                        esc(q.event_date),
                        esc(q.guest_count),
                        esc(q.venue_address),
                        esc(q.subtotal),
                        esc(q.tax),
                        esc(q.total),
                        esc(tenantCurrency.code),
                        esc(q.sent_at),
                        esc(q.viewed_at),
                        esc(q.accepted_at),
                      ].join(","));
                    }
                    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    const stamp = new Date().toISOString().slice(0, 10);
                    a.download = `quotes_${stamp}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </Button>
                <Link href="/admin/quotes/new">
                  <Button size="lg" className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700">
                    <Plus className="w-5 h-5 mr-2" />
                    New Quote
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card className="border-0 shadow-lg">
              <CardContent className="p-4">
                <p className="text-sm text-slate-600 mb-1 flex items-center gap-1.5">Total Quotes <InfoTooltip content={"Every quote on file for your company, across every status."} /></p>
                <p className="text-2xl font-bold text-slate-900">{quotes.length}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-lg">
              <CardContent className="p-4">
                <p className="text-sm text-slate-600 mb-1 flex items-center gap-1.5">Action needed <InfoTooltip content={"Drafts to price and send (including new client portal requests), and quotes whose validity is running out."} /></p>
                <p className="text-2xl font-bold text-rose-600">{counts.action_needed}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-lg">
              <CardContent className="p-4">
                <p className="text-sm text-slate-600 mb-1 flex items-center gap-1.5">Won this period <InfoTooltip content={"Quotes the client has accepted. Convert these to orders if not already done."} /></p>
                <p className="text-2xl font-bold text-emerald-600">{counts.won}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-lg">
              <CardContent className="p-4">
                <p className="text-sm text-slate-600 mb-1 flex items-center gap-1.5">Total Value <InfoTooltip content={"Total value of every quote in the list, no matter the status."} /></p>
                <p className="text-2xl font-bold text-emerald-600">
                  {C}{quotes.reduce((sum, q) => sum + (q.total ?? 0), 0).toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Phase 8 #8: list / pipeline view toggle. Pipeline groups
              every quote in scope by intelligence bucket so the sales
              lead can see the funnel at a glance without flipping
              through pill filters one by one. */}
          <div className="mb-3 flex justify-end">
            <div className="inline-flex border rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`px-3 py-1.5 text-sm flex items-center gap-1.5 ${viewMode === "list" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                <List className="w-3.5 h-3.5" />
                List
              </button>
              <button
                type="button"
                onClick={() => setViewMode("pipeline")}
                className={`px-3 py-1.5 text-sm flex items-center gap-1.5 ${viewMode === "pipeline" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                Pipeline
              </button>
            </div>
          </div>

          {/*
            Smart filter pills, mirrors the Clients CRM pattern. Each
            pill shows a live count so the team sees at a glance how
            many quotes need their attention. Click to narrow the list.
          */}
          <div className="mb-4 flex flex-wrap gap-2">
            {([
              { id: "all",            label: "All",           icon: Inbox,          tone: "bg-slate-100 text-slate-700 border-slate-200" },
              { id: "action_needed",  label: "Action needed", icon: Flame,          tone: "bg-rose-100 text-rose-700 border-rose-200" },
              { id: "in_play",        label: "In play",       icon: Sparkles,       tone: "bg-blue-100 text-blue-700 border-blue-200" },
              { id: "stale",          label: "Stale",         icon: Clock,          tone: "bg-amber-100 text-amber-700 border-amber-200" },
              { id: "won",            label: "Won",           icon: Crown,          tone: "bg-emerald-100 text-emerald-700 border-emerald-200" },
              { id: "expired",        label: "Expired",       icon: AlertTriangle,  tone: "bg-orange-100 text-orange-700 border-orange-200" },
              { id: "lost",           label: "Lost",          icon: Snowflake,      tone: "bg-slate-100 text-slate-600 border-slate-200" },
            ] as const).map((pill) => {
              const Icon = pill.icon;
              const active = bucket === pill.id;
              const count = (counts as any)[pill.id] as number;
              const revenue = (revenueByBucket as any)[pill.id] as number | undefined;
              return (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setBucket(pill.id as QuoteBucket)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
                    active
                      ? `${pill.tone} ring-2 ring-offset-1 ring-slate-300`
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                  }`}
                  title={revenue && revenue > 0 ? `${count} quote${count === 1 ? "" : "s"} totalling ${C} ${revenue.toFixed(2)}` : undefined}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="font-medium">{pill.label}</span>
                  <span className="text-xs font-semibold opacity-80">{count}</span>
                  {revenue && revenue > 0 && (
                    <span className="text-[10px] font-semibold opacity-70 border-l border-current/30 pl-1.5 ml-0.5">
                      {C}{fmtCompact(revenue)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Phase 15 #1 + #4: saved views chip strip with a
              'Mine only' toggle. Saved views snap back to named
              filter snapshots; mine-only restricts to quotes the
              current user prepared. */}
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setMyQuotesOnly((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-full text-xs px-2.5 py-0.5 border ${
                myQuotesOnly
                  ? "border-blue-500 bg-blue-100 text-blue-800"
                  : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700"
              }`}
              title="Restrict to quotes I prepared"
            >
              Mine only
            </button>
            {savedViews.map((v) => (
              <span key={v.id} className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 text-purple-700 text-xs">
                <button
                  type="button"
                  onClick={() => applySavedQuoteView(v)}
                  className="px-2.5 py-0.5 hover:underline"
                  title={`Apply: ${v.bucket} / ${v.viewMode}`}
                >
                  {v.name}
                </button>
                <button
                  type="button"
                  onClick={() => removeSavedQuoteView(v.id)}
                  className="pr-1.5 text-purple-500 hover:text-purple-800"
                  title="Remove this view"
                >
                  ×
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={saveCurrentQuoteView}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 text-slate-500 text-xs px-2.5 py-0.5 hover:border-purple-300 hover:text-purple-700"
              title="Save the current bucket + search + view as a named view"
            >
              + Save view
            </button>
          </div>

          {/*
            Bulk nudge bar. Only shown when a follow-up-eligible bucket
            is active AND there are quotes with client emails to nudge.
            Hard-capped at 10 to avoid the browser blocking pop-ups
            and to keep the "personal mail, not bulk" feel intact --
            10 individually-tailored Gmail drafts beats one generic
            blast every time.
          */}
          {(bucket === "action_needed" || bucket === "in_play" || bucket === "stale") && (() => {
            const eligible = bucketFilteredRows.filter(
              (r) => !!r.quote.client_email && r.quote.status !== "draft",
            );
            if (eligible.length === 0) return null;
            const cap = Math.min(eligible.length, 10);
            const handleBulkNudge = () => {
              const targets = eligible.slice(0, cap);
              const ok = window.confirm(
                `Open ${cap} Gmail drafts to nudge these clients?\nEach draft is tailored from the quote's status, you review every one before sending. The remaining ${Math.max(eligible.length - cap, 0)} will need a second pass.`,
              );
              if (!ok) return;
              targets.forEach((rs, i) => {
                const tpl = templateForQuote(rs.quote.status as QuoteStatus, {
                  contactName: rs.quote.client_name || "there",
                  companyName: companyName,
                  fromName: profile?.full_name || companyName,
                  eventDate: rs.quote.event_date
                    ? new Date(rs.quote.event_date).toLocaleDateString("en-ZA")
                    : undefined,
                  total: rs.quote.total ?? rs.quote.subtotal ?? 0,
                  quoteRef: (rs.quote as any).quote_number || rs.quote.id?.slice(0, 8),
                  companyId: profile?.company_id ?? null,
                });
                const url = composeEmail.gmailUrl({
                  to: rs.quote.client_email!,
                  subject: tpl.subject,
                  body: tpl.body,
                });
                // Stagger the window.open calls so the browser
                // doesn't classify them as a single popup burst.
                setTimeout(() => window.open(url, `_blank`), i * 250);
              });
              toast({
                title: `Opening ${cap} Gmail drafts...`,
                description:
                  "If your browser blocks new tabs, allow pop-ups for cateringms.com and try again.",
              });
            };
            return (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5">
                <div className="text-sm text-amber-900">
                  <span className="font-medium">{eligible.length}</span> {bucket === "stale" ? "stale " : bucket === "action_needed" ? "action " : "in-play "}
                  quote{eligible.length === 1 ? "" : "s"} with a client email, send personal nudges?
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="bg-white border-amber-300 text-amber-900 hover:bg-amber-100"
                  onClick={handleBulkNudge}
                >
                  <Mail className="w-3.5 h-3.5 mr-1.5" />
                  Open {cap} Gmail draft{cap === 1 ? "" : "s"}
                </Button>
              </div>
            );
          })()}

          {/* Quick-mail banner mirrors the Clients CRM pattern: explains why
              the "Compose" buttons open Gmail / Outlook / default mail rather
              than firing through a server. Personal mail, not bulk. */}
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <Mail className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-slate-900">Personal follow-ups, not bulk.</p>
              <p className="text-slate-600 mt-0.5">
                Compose opens a draft in Gmail / Outlook / your default mail app pre-filled from this quote, so it actually arrives from <span className="font-medium">your address</span>. Subject and body update automatically based on the quote's status.
              </p>
            </div>
          </div>

          {/* Smart search across client, event, ref + total. Debounced. */}
          {quotes.length > 0 && (
            <div className="mb-4">
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  ref={searchRef}
                  placeholder="Search by client, event, venue, quote ref or total... (press /)"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 pr-9"
                />
                {/* Phase 24 #8: clear-search affordance to match
                    Phase 24 #7 on /admin/orders. */}
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    title="Clear search"
                    aria-label="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              {(search.trim() || bucket !== "all") && (
                <p className="text-xs text-slate-500 mt-1.5">
                  Showing {filteredRows.length} of {rowStates.length} quotes.
                </p>
              )}
            </div>
          )}

          {viewMode === "pipeline" && quotes.length > 0 && filteredRows.length > 0 && (
            <PipelineBoard
              rows={filteredRows}
              currencySymbol={C}
              onOpen={(quoteId) => {
                setFocusedQuoteId(quoteId);
                setBucket("all");
                setTimeout(() => {
                  document.getElementById(`quote-${quoteId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                  setViewMode("list");
                }, 0);
              }}
            />
          )}
          <div className={`space-y-4 ${viewMode === "pipeline" ? "hidden" : ""}`}>
            {quotes.length === 0 ? (
              <Card className="border-2 border-dashed">
                <CardContent className="p-12 text-center">
                  <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">No quotes yet</h3>
                  <p className="text-slate-600 mb-6">Create your first quote from a lead</p>
                  <Link href="/admin/leads">
                    <Button>View Leads</Button>
                  </Link>
                </CardContent>
              </Card>
            ) : filteredRows.length === 0 ? (
              <Card className="border-2 border-dashed">
                <CardContent className="p-12 text-center">
                  <Search className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">No quotes in this view</h3>
                  <p className="text-slate-600">Try a different filter or clear the search.</p>
                </CardContent>
              </Card>
            ) : (
              filteredRows.map((rs) => {
                const quote = rs.quote;
                const intel = rs.intelligence;
                const auto = rs.autoEmail;
                const canCompose = !!quote.client_email && quote.status !== "draft";
                const composeHint = !quote.client_email
                  ? "No email on this quote, add one to enable compose"
                  : quote.status === "draft"
                    ? "Send the quote first, then you can follow up"
                    : "Open a follow-up draft in Gmail / Outlook / mail app";
                // Resolve the diary signal off the authoritative event
                // date when the quote has converted -- a postponed
                // order should land on the new date, not the original
                // enquiry date.
                const resolved = resolvedByQuoteId.get(quote.id) || null;
                const diary = computeDiarySignal(resolved?.eventDate ?? quote.event_date, diaryIndex, quote.id);
                const diaryTone = DIARY_TONE[diary.status];
                // We only nudge the team to send a sweetener on quotes that
                // are still in play. There's no point offering a discount
                // on a won, lost or expired quote.
                const sweetenerEligible =
                  diary.sweetenerWorthwhile &&
                  canCompose &&
                  ["sent", "pending"].includes((quote.status || "").toLowerCase()) &&
                  intel.bucket !== "won" &&
                  intel.bucket !== "lost";
                const followup = followupByQuote[quote.id];
                // Authoritative event details for the row. When the
                // quote has converted to an order, those numbers are
                // the source of truth; otherwise we fall back to the
                // quote row itself. `resolved` was set above for the
                // diary signal -- reuse it here.
                const displayEventDate = resolved?.eventDate ?? quote.event_date ?? null;
                const displayGuestCount = resolved?.guestCount ?? quote.guest_count ?? null;
                const displayTotal = resolved?.totalAmount ?? (quote.total ?? 0);
                return (
                  <Card
                    key={quote.id}
                    id={`quote-${quote.id}`}
                    className={`border-0 shadow-lg hover:shadow-xl transition-all scroll-mt-24 ${
                      // Deep-link focus wins over the urgency rings so
                      // the user instantly sees which quote they were
                      // pointed at by the notification.
                      focusedQuoteId === quote.id
                        ? "ring-4 ring-blue-400 ring-offset-2"
                        : intel.tone === "urgent"
                          ? "ring-2 ring-rose-300"
                          : intel.isClientRequest
                            ? "ring-2 ring-emerald-300"
                            : intel.bucket === "stale"
                              ? "ring-2 ring-amber-300"
                              : ""
                    }`}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-3 flex-wrap">
                            <h3 className="text-xl font-semibold text-slate-900">{quote.client_name}</h3>
                            {(quote as any).quote_number && (
                              <button
                                type="button"
                                onClick={async (e) => {
                                  // Phase 21 #1: row-level click-to-copy
                                  // for quote numbers, mirroring the
                                  // Phase 20 #10 pattern on orders. Sales
                                  // pastes quote refs into WhatsApp +
                                  // emails constantly when following up.
                                  e.stopPropagation();
                                  const num = String((quote as any).quote_number);
                                  try {
                                    await navigator.clipboard.writeText(num);
                                    toast({ title: "Copied", description: `${num} on clipboard.` });
                                  } catch {
                                    toast({ title: "Copy failed", description: "Browser blocked clipboard access.", variant: "destructive" });
                                  }
                                }}
                                className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 hover:bg-slate-200 hover:text-slate-900 transition"
                                title="Copy quote number"
                              >
                                <Copy className="w-3 h-3" />
                                {(quote as any).quote_number}
                              </button>
                            )}
                            <RegionBadge regionId={(quote as any).region_id} />
                            <Badge className={`${getStatusColor(quote.status)} border`}>
                              {quote.status}
                            </Badge>
                            {/*
                              "New client request" pill, shown when
                              the quote was submitted by the client via
                              their portal. Pricing isn't set yet, the
                              team needs to open and price it.
                            */}
                            {intel.isClientRequest && (
                              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 border">
                                New client request
                              </Badge>
                            )}
                            {/* Lead provenance / order conversion cues. */}
                            {(quote as any).lead_id && !intel.isClientRequest && (
                              <Badge variant="outline" className="text-[11px] text-slate-600 border-slate-200">
                                from lead
                              </Badge>
                            )}
                            {(quote as any).converted_to_order_id && (
                              <Badge variant="outline" className="text-[11px] text-emerald-700 border-emerald-200 bg-emerald-50">
                                booked
                              </Badge>
                            )}
                            {/* Sent-at pill -- the timing anchor for
                                follow-ups. Reads 'Sent today' /
                                'Sent 3d ago' / 'Sent 12 May' depending
                                on age. Click the Mark-as-sent action
                                in the row to reset / set this. */}
                            {(quote as any).sent_at && (() => {
                              const sentAt = new Date((quote as any).sent_at);
                              const diffMs = Date.now() - sentAt.getTime();
                              const diffDays = Math.floor(diffMs / 86_400_000);
                              const label = diffDays === 0 ? "Sent today"
                                : diffDays === 1 ? "Sent yesterday"
                                : diffDays < 14 ? `Sent ${diffDays}d ago`
                                : `Sent ${sentAt.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}`;
                              return (
                                <Badge
                                  variant="outline"
                                  className="text-[11px] text-slate-600 border-slate-200 bg-slate-50"
                                  title={`Sent at ${sentAt.toLocaleString("en-ZA")}`}
                                >
                                  {label}
                                </Badge>
                              );
                            })()}
                          </div>

                          {/*
                            Suggested-action strip, the headline
                            intelligence row. Tone colour matches the
                            urgency of the action: red urgent, amber
                            warm, slate neutral.
                          */}
                          <div className={`mb-3 flex items-center gap-2 text-sm font-semibold flex-wrap ${
                            intel.tone === "urgent"
                              ? "text-rose-600"
                              : intel.tone === "warm"
                                ? "text-amber-600"
                                : "text-slate-600"
                          }`}>
                            <ArrowRight className="w-4 h-4 flex-shrink-0" />
                            <span>{intel.label}</span>
                            <span className="font-normal text-xs text-slate-500">
                             , {intel.reason}
                            </span>
                            {followup && followup.label !== "—" && (
                              <span
                                title={followup.reason}
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${TRAFFIC_LIGHT_CLASS[followup.light]}`}
                              >
                                {followup.label}
                              </span>
                            )}
                          </div>

                          {/*
                            Last touch + auto-email status. The
                            outgoing_email_queue is our source of
                            truth for "did the auto follow-up fire?"
                          */}
                          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                            {intel.lastTouchAt && (
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" />
                                Last touch {intel.daysSinceTouch ?? 0}d ago
                              </span>
                            )}
                            {auto.sent > 0 && (
                              <span className="inline-flex items-center gap-1 text-emerald-600">
                                <Send className="w-3.5 h-3.5" />
                                {auto.sent} auto follow-up{auto.sent === 1 ? "" : "s"} sent
                              </span>
                            )}
                            {auto.queued > 0 && (
                              <span className="inline-flex items-center gap-1 text-blue-600">
                                <Mail className="w-3.5 h-3.5" />
                                {auto.queued} queued
                              </span>
                            )}
                            {intel.daysUntilExpiry !== null && intel.daysUntilExpiry >= 0 && intel.daysUntilExpiry <= 7 && (
                              <span className="inline-flex items-center gap-1 text-orange-600">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                Expires in {intel.daysUntilExpiry}d
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-2">
                            <div className="flex items-center gap-2 text-slate-600">
                              <Mail className="w-4 h-4" />
                              <span className="text-sm">{quote.client_email}</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-600">
                              <Calendar className="w-4 h-4" />
                              <span className="text-sm">{displayEventDate ? new Date(displayEventDate).toLocaleDateString() : "—"}</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-600">
                              <Users className="w-4 h-4" />
                              <span className="text-sm">{displayGuestCount ?? "—"} guests</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-600">
                              <DollarSign className="w-4 h-4" />
                              <span className="text-sm font-semibold text-green-600">
                                {C}{Number(displayTotal).toFixed(2)}
                              </span>
                            </div>
                          </div>
                          {/* Provenance caption -- only shows when a
                              linked order overrode the headline event
                              details. Stops the operator second-guessing
                              the numbers when the order has drifted from
                              the original quote. */}
                          {resolved && (
                            <div className="mb-4 text-[11px] text-emerald-700">
                              Pulled from booked order
                              {resolved.orderNumber ? ` ${resolved.orderNumber}` : ""}
                              {resolved.venueName ? ` · ${resolved.venueName}` : ""}
                            </div>
                          )}

                          {/*
                            Diary signal, "do we have a gap that day?"
                            Pulled from confirmed orders + accepted
                            quotes for this company. The "Wide open"
                            and "Quiet" states surface a one-click
                            "Offer a sweetener" CTA so the team can
                            push hard with a discount or treat instead
                            of leaving the kitchen idle.
                          */}
                          {quote.event_date && (
                            <div
                              className={cn(
                                "mb-4 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2",
                                diaryTone.chip,
                              )}
                              title={diary.detail}
                            >
                              <span className="inline-flex items-center gap-2 text-sm font-semibold">
                                <CalendarDays className="w-4 h-4" />
                                {diary.headline}
                              </span>
                              <span className="text-xs opacity-80 flex-1 min-w-0 truncate">
                                {diary.detail}
                              </span>
                              {sweetenerEligible && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2.5 text-xs gap-1.5 bg-white/80 hover:bg-white border-current"
                                  onClick={() => {
                                    setComposeMode("sweetener");
                                    setComposeQuote(quote);
                                  }}
                                  title="Send a thank-you / discount to lock this booking in"
                                >
                                  <Gift className="w-3.5 h-3.5" />
                                  Offer a sweetener
                                </Button>
                              )}
                            </div>
                          )}

                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-slate-600">
                              {Array.isArray(quote.menu_items) ? quote.menu_items.length : 0} menu items
                            </span>
                            <span className="text-slate-600">
                              {Array.isArray(quote.equipment_items) ? quote.equipment_items.length : 0} equipment items
                            </span>
                          </div>

                          <div className="space-y-2 mt-4">
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-600">Subtotal</span>
                              <span className="font-medium">{C}{quote.subtotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-600">VAT (15%)</span>
                              <span className="font-medium">{C}{(quote.tax ?? 0).toFixed(2)}</span>
                            </div>
                            <div className="h-px bg-slate-200" />
                            <div className="flex justify-between font-bold">
                              <span>Total</span>
                              <span className="text-green-600">{C}{(quote.total ?? 0).toFixed(2)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Action panel. Audit (May 2026) collapsed 11
                            stacked buttons into 3 inline + a More menu:
                            keeps the row compact so more quotes fit per
                            screen, and gives a clear primary / secondary
                            / overflow hierarchy. Two PDF buttons (one
                            branded server-render, one ?print=1 fallback)
                            were redundant -- only Download PDF remains.
                            Lifecycle moves (Mark sent, Mark lost) and
                            CRUD (Edit, Duplicate, Delete) live in the
                            menu since they're not row-level urgent. */}
                        <div className="flex flex-col gap-2 ml-4 items-stretch w-44 shrink-0">
                          {/* Primary CTA -- tone-coloured. Draft -> Send,
                              everything else -> Compose. */}
                          {quote.status === "draft" ? (
                            <RowPrimaryAction
                              tone={intel.tone}
                              icon={<Send className="w-4 h-4" />}
                              label={sendingId === quote.id ? "Sending..." : "Send"}
                              tooltip="Send this draft. Emails the client and stamps the quote 'sent'."
                              disabled={sendingId === quote.id}
                              onClick={() => handleSend(quote.id)}
                            />
                          ) : (
                            <RowPrimaryAction
                              tone={intel.tone}
                              icon={<Mail className="w-4 h-4" />}
                              label="Compose"
                              tooltip={composeHint}
                              disabled={!canCompose}
                              onClick={() => {
                                setComposeMode("status");
                                setComposeQuote(quote);
                              }}
                            />
                          )}
                          {/* Mark accepted -- single highest-value
                              follow-on action. Converts to a live order
                              + fires deposit invoice. Hidden once
                              accepted / rejected. */}
                          {quote.status !== "accepted" && quote.status !== "rejected" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setAcceptPreflight(quote)}
                              disabled={acceptingId === quote.id}
                              title="Client confirmed verbally? Mark accepted and convert to a live order in one click."
                              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                            >
                              <CheckCircle className="w-4 h-4 mr-2" />
                              {acceptingId === quote.id ? "Accepting..." : "Mark accepted"}
                            </Button>
                          )}
                          {/* Send next follow-up -- only visible when
                              amber or rose, otherwise we'd be nagging. */}
                          {followup?.nextPosition && (followup.light === "amber" || followup.light === "rose") && canCompose && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSendFollowup(quote)}
                              className={
                                followup.light === "rose"
                                  ? "border-rose-300 text-rose-700 hover:bg-rose-50"
                                  : "border-amber-300 text-amber-700 hover:bg-amber-50"
                              }
                              title={followup.reason}
                            >
                              <ArrowRight className="w-4 h-4 mr-2" />
                              Send FU {followup.nextPosition}
                            </Button>
                          )}
                          {/* Overflow menu. Holds every secondary
                              action -- lifecycle tweaks, share /
                              export, CRUD, accounting push, delete. */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                title="More actions for this quote"
                              >
                                <MoreHorizontal className="w-4 h-4 mr-2" />
                                More
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-slate-500">Manage</DropdownMenuLabel>
                              <DropdownMenuItem asChild>
                                <Link href={`/admin/quotes/new?fromQuoteId=${quote.id}`}>
                                  <Edit className="w-4 h-4 mr-2" />
                                  Edit
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={async () => {
                                  if (typeof window === "undefined") return;
                                  const todayPlus7 = (() => {
                                    const d = new Date();
                                    d.setDate(d.getDate() + 7);
                                    return d.toISOString().slice(0, 10);
                                  })();
                                  const newDate = window.prompt("New event date for the duplicate (YYYY-MM-DD):", todayPlus7);
                                  if (!newDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return;
                                  const res = await quoteService.duplicateQuote(quote.id, newDate);
                                  if (!res.success) {
                                    toast({
                                      title: "Could not duplicate",
                                      description: (res as { success: false; error: string }).error,
                                      variant: "destructive",
                                    });
                                    return;
                                  }
                                  toast({
                                    title: "Quote duplicated",
                                    description: `New quote ${(res.data as any).quote_number} created on ${newDate}.`,
                                  });
                                  const fresh = await quoteService.getQuotes(user.company_id!);
                                  setQuotes(fresh);
                                }}
                              >
                                <Copy className="w-4 h-4 mr-2" />
                                Duplicate
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-slate-500">Share</DropdownMenuLabel>
                              <DropdownMenuItem
                                onClick={async () => {
                                  try {
                                    const r = await fetch(`/api/admin/quote-pdf?id=${quote.id}`);
                                    if (!r.ok) {
                                      // Server returns JSON on error; surface its message
                                      // instead of the generic HTTP status so the toast
                                      // tells the operator what actually broke.
                                      let serverMsg = `HTTP ${r.status}`;
                                      try {
                                        const errBody = await r.json();
                                        if (errBody?.error) serverMsg = errBody.error;
                                      } catch { /* not JSON, keep generic */ }
                                      throw new Error(serverMsg);
                                    }
                                    const blob = await r.blob();
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement("a");
                                    a.href = url;
                                    a.download = `Quote-${quote.quote_number || quote.id}.pdf`;
                                    a.click();
                                    URL.revokeObjectURL(url);
                                  } catch (e: any) {
                                    toast({
                                      title: "Could not download PDF",
                                      description: e?.message || "Try again",
                                      variant: "destructive",
                                    });
                                  }
                                }}
                              >
                                <Download className="w-4 h-4 mr-2" />
                                Download PDF
                              </DropdownMenuItem>
                              {(quote as any).public_token && (
                                <DropdownMenuItem
                                  onClick={async () => {
                                    const url = buildPublicQuoteUrl((quote as any).public_token);
                                    if (!url) return;
                                    try {
                                      await navigator.clipboard.writeText(url);
                                      toast({ title: "Link copied", description: "Paste it into an email or WhatsApp." });
                                    } catch {
                                      toast({ title: "Couldn't copy", description: url, variant: "destructive" });
                                    }
                                  }}
                                >
                                  <ExternalLink className="w-4 h-4 mr-2" />
                                  Copy public link
                                </DropdownMenuItem>
                              )}
                              {(quote as any).public_token && (
                                <DropdownMenuSub>
                                  <DropdownMenuSubTrigger>
                                    <ExternalLink className="w-4 h-4 mr-2" />
                                    Push to accounting
                                  </DropdownMenuSubTrigger>
                                  <DropdownMenuSubContent>
                                    {(["xero", "quickbooks", "sage"] as AccountingProvider[]).map((p) => (
                                      <DropdownMenuItem
                                        key={p}
                                        onClick={async () => {
                                          const res: PushResult = await pushQuoteToAccounting({ quoteId: quote.id, provider: p });
                                          const label = accountingProviderLabel(p);
                                          if (res.ok) {
                                            toast({ title: `Synced to ${label}`, description: `Quote ${quote.quote_number} pushed as a draft.` });
                                            return;
                                          }
                                          if (res.reason === "not_connected") {
                                            toast({
                                              title: `Connect ${label} first`,
                                              description: "Open Integrations to link the account, then try again.",
                                              variant: "destructive",
                                            });
                                            return;
                                          }
                                          if (res.reason === "no_endpoint" && res.payload && typeof window !== "undefined") {
                                            try {
                                              await navigator.clipboard.writeText(JSON.stringify(res.payload, null, 2));
                                              toast({
                                                title: `${label} endpoint not deployed yet`,
                                                description: `Copied the prepared payload to your clipboard so you can paste into ${label} manually for now.`,
                                              });
                                            } catch {
                                              toast({ title: "Couldn't copy payload", variant: "destructive" });
                                            }
                                            return;
                                          }
                                          toast({ title: `Couldn't sync to ${label}`, description: res.error, variant: "destructive" });
                                        }}
                                      >
                                        {accountingProviderLabel(p)}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuSubContent>
                                </DropdownMenuSub>
                              )}
                              {quote.status !== "accepted" && quote.status !== "rejected" && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-slate-500">Lifecycle</DropdownMenuLabel>
                                  <DropdownMenuItem
                                    onClick={() => handleMarkAsSent(quote)}
                                    title={(quote as any).sent_at
                                      ? "Reset the sent timestamp to right now"
                                      : "Mark this quote as sent (without firing an email)"}
                                  >
                                    <Clock className="w-4 h-4 mr-2" />
                                    {(quote as any).sent_at ? "Reset sent" : "Mark sent"}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleMarkAsLost(quote)}
                                    className="text-rose-700 focus:text-rose-700 focus:bg-rose-50"
                                  >
                                    <X className="w-4 h-4 mr-2" />
                                    Mark lost
                                  </DropdownMenuItem>
                                </>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => setDeleteTarget(quote)}
                                className="text-rose-600 focus:text-rose-700 focus:bg-rose-50"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete quote
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>

        <Footer />
      </div>

      {/* Compose drawer, bigger default footprint and a drag handle on
          the left edge so the team can pull it wider and use the proper
          screen real estate while drafting. The body textarea gets the
          extra space first via flex-grow. */}
      <ComposeDrawerHost
        open={!!composeQuote}
        onClose={() => setComposeQuote(null)}
      >
        {composeQuote && (
          <QuoteComposeDrawer
            quote={composeQuote}
            fromName={profile?.full_name || companyName}
            companyName={companyName}
            companyId={profile?.company_id ?? null}
            mode={composeMode}
            diary={computeDiarySignal(composeQuote.event_date, diaryIndex, composeQuote.id)}
            onSweetenerApplied={async (offer) => {
              // Persist the offer to the quote so the figures the
              // client sees on /q match the email the operator sent.
              // Percent / amount apply to the total; perk leaves the
              // numbers alone but stamps the perk in notes so the
              // kitchen + driver know about it. Status flips to
              // 'revised' to mark this is a tweaked version.
              if (!composeQuote) return;
              const oldTotal = Number(composeQuote.total ?? composeQuote.total_amount ?? 0);
              const oldSubtotal = Number(composeQuote.subtotal ?? 0);
              const oldDiscount = Number((composeQuote as any).discount_amount ?? 0);
              const oldTax = Number((composeQuote as any).tax_amount ?? composeQuote.tax ?? 0);

              let newDiscount = oldDiscount;
              let newSubtotal = oldSubtotal;
              let newTax = oldTax;
              let newTotal = oldTotal;
              let perkNote: string | null = null;

              if (offer.discountKind === "percent" && offer.discountPercent > 0) {
                const discountValue = oldTotal * (offer.discountPercent / 100);
                newDiscount = oldDiscount + discountValue;
                newSubtotal = Math.max(0, oldSubtotal - discountValue);
                // Recompute VAT proportionally to keep the math clean
                newTax = oldSubtotal > 0 ? oldTax * (newSubtotal / oldSubtotal) : 0;
                newTotal = newSubtotal + newTax;
              } else if (offer.discountKind === "amount" && offer.discountAmount > 0) {
                newDiscount = oldDiscount + offer.discountAmount;
                newSubtotal = Math.max(0, oldSubtotal - offer.discountAmount);
                newTax = oldSubtotal > 0 ? oldTax * (newSubtotal / oldSubtotal) : 0;
                newTotal = newSubtotal + newTax;
              } else if (offer.discountKind === "perk" && offer.perk.trim()) {
                perkNote = `Sweetener: ${offer.perk.trim()}`;
              }

              try {
                // Flow audit Leg B P0-1: quote_status enum no longer
                // includes 'revised'. Sweetener apply keeps the quote
                // at 'sent' (still actionable) and pushes the change
                // intent via the existing valid_until / total updates.
                const patch: any = {
                  valid_until: offer.validUntil || (composeQuote as any).valid_until,
                };
                if (offer.discountKind !== "perk") {
                  patch.discount_amount = Number(newDiscount.toFixed(2));
                  patch.subtotal = Number(newSubtotal.toFixed(2));
                  patch.tax_amount = Number(newTax.toFixed(2));
                  patch.tax = Number(newTax.toFixed(2));
                  patch.total = Number(newTotal.toFixed(2));
                  patch.total_amount = Number(newTotal.toFixed(2));
                }
                if (perkNote) {
                  const existingNotes = (composeQuote as any).notes || "";
                  patch.notes = existingNotes ? `${existingNotes}\n\n${perkNote}` : perkNote;
                }
                await (supabase as any).from("quotes").update(patch).eq("id", composeQuote.id);
                setQuotes((prev) => prev.map((q) =>
                  q.id === composeQuote.id ? ({ ...q, ...patch } as Quote) : q,
                ));
                toast({
                  title: "Sweetener applied to the quote",
                  description: offer.discountKind === "perk"
                    ? `Perk noted on the quote. Status flipped to revised.`
                    : `Total dropped from ${fmtMoney.format(oldTotal)} to ${fmtMoney.format(newTotal)}. Status flipped to revised.`,
                });
              } catch (err: any) {
                toast({
                  title: "Saved email but couldn't update quote",
                  description: err?.message || "Apply the discount manually on the quote.",
                  variant: "destructive",
                });
              }
            }}
            onSent={async (channel) => {
              if (!composeQuote) return;

              // Step 1: Anchor sent_at on the first send channel pick
              // for a draft. Otherwise the original baseline is the
              // right anchor for follow-up timing.
              if (!(composeQuote as any).sent_at) {
                const nowIso = new Date().toISOString();
                const nextStatus = composeQuote.status === "draft" ? "sent" : composeQuote.status;
                try {
                  await (supabase as any)
                    .from("quotes")
                    .update({ sent_at: nowIso, status: nextStatus })
                    .eq("id", composeQuote.id);
                  setQuotes((prev) => prev.map((q) =>
                    q.id === composeQuote.id
                      ? ({ ...q, sent_at: nowIso, status: nextStatus } as Quote)
                      : q,
                  ));
                } catch (err) {
                  // Non-fatal.
                  console.warn("Auto sent_at stamp failed:", err);
                }
              }

              // Step 2: If there's a follow-up due for this quote and
              // this isn't the first send (sent_at was already set),
              // log a row in quote_followup_log so the traffic light
              // flips green. Channel mapped from the MessageComposer
              // signal: gmail/outlook/mailto/clipboard -> email,
              // whatsapp -> whatsapp.
              if ((composeQuote as any).sent_at && composeMode === "status") {
                const fu = followupByQuote[composeQuote.id];
                if (fu?.nextPosition && (fu.light === "amber" || fu.light === "rose")) {
                  const ch: "email" | "whatsapp" = channel === "whatsapp" ? "whatsapp" : "email";
                  const tplKey = templateKeyFor(fu.nextPosition, ch);
                  try {
                    await recordFollowupSent({
                      companyId: (composeQuote as any).company_id,
                      quoteId: composeQuote.id,
                      position: fu.nextPosition,
                      templateKey: tplKey,
                      channel: ch,
                      sentByUserId: user?.id ?? null,
                    });
                    // Optimistic local update so the pill flips
                    // immediately without re-fetching.
                    setFollowupLogs((prev) => ({
                      ...prev,
                      [composeQuote.id]: [
                        ...(prev[composeQuote.id] || []),
                        {
                          id: `local-${Date.now()}`,
                          quote_id: composeQuote.id,
                          sequence_position: fu.nextPosition,
                          template_key: tplKey,
                          channel: ch,
                          status: "sent",
                          sent_at: new Date().toISOString(),
                        } as FollowupLogRow,
                      ],
                    }));
                    toast({
                      title: `FU ${fu.nextPosition} logged (${ch})`,
                      description: `Pill flipped green. Next follow-up due in your standard cadence.`,
                    });
                  } catch (logErr) {
                    console.warn("[quotes] follow-up log insert failed:", logErr);
                  }
                }
              }
            }}
            onClose={() => setComposeQuote(null)}
          />
        )}
      </ComposeDrawerHost>

      {/* Pre-flight: shows the operator exactly what's about to fire
          when they manually accept on behalf of the client. Lets them
          eyeball the email destination before it goes out. */}
      <AlertDialog
        open={!!acceptPreflight}
        onOpenChange={(o) => { if (!o) setAcceptPreflight(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              Accept on behalf of {acceptPreflight?.client_name}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 pt-2 text-sm text-slate-700">
                <p>This converts the quote into a confirmed order and fires the standard accept handoff. The quote stays in the system as audit history.</p>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 space-y-1.5 text-xs">
                  <p className="font-semibold uppercase tracking-wide text-slate-600">What happens on confirm</p>
                  <div className="flex items-start gap-2">
                    <span className="text-emerald-600 shrink-0">•</span>
                    <span>Order created, status <span className="font-mono">confirmed</span></span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-emerald-600 shrink-0">•</span>
                    <span>Deposit invoice generated{(() => {
                      const total = Number(
                        (acceptPreflight as any)?.total
                        ?? (acceptPreflight as any)?.total_amount
                        ?? 0,
                      );
                      if (!total) return "";
                      // Same fallback chain as the prefill: quote ->
                      // company default -> 30. Older quotes have
                      // deposit_percentage = 30 stamped from when the
                      // builder defaulted to 30; in that case the
                      // company default takes precedence so the label
                      // reflects the current Settings -> Financial
                      // value rather than a stale stamp.
                      const pct = resolveDepositPct(acceptPreflight);
                      const expected = Math.round((total * pct / 100) * 100) / 100;
                      return ` (~${fmtMoney.format(expected)} at ${pct}%)`;
                    })()}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className={acceptPreflight?.client_email ? "text-emerald-600 shrink-0" : "text-amber-600 shrink-0"}>•</span>
                    <span>
                      {acceptPreflight?.client_email
                        ? <>Confirmation email to <span className="font-mono">{acceptPreflight.client_email}</span></>
                        : <span className="text-amber-700">No client email on file. The client won't get an automated email; phone or WhatsApp them after.</span>}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-emerald-600 shrink-0">•</span>
                    <span>Kitchen prep tasks planned (skipped for past-date events)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-emerald-600 shrink-0">•</span>
                    <span>Day shows as Booked on the calendar gap finder</span>
                  </div>
                </div>
                <p className="text-xs text-slate-500">If any sub-step fails, the order still gets created and the toast tells you what to chase manually.</p>

                {/* Deposit capture. Operator confirms whether the
                    client has already paid the deposit (cash on
                    handover, EFT cleared, card swiped). When yes,
                    the order + invoice both get stamped paid in one
                    go so the records match the bank. */}
                <div className="rounded-md border border-emerald-200 bg-emerald-50/50 px-3 py-3 space-y-2.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={depositPaid}
                      onChange={(e) => setDepositPaid(e.target.checked)}
                      className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-sm font-semibold text-emerald-900">
                      Client has already paid the deposit
                    </span>
                  </label>
                  {depositPaid ? (
                    <div className="space-y-2 pt-1">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">Amount paid (R)</label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={depositAmount}
                            onChange={(e) => setDepositAmount(e.target.value)}
                            className="mt-1 h-8 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">Method</label>
                          <select
                            value={depositMethod}
                            onChange={(e) => setDepositMethod(e.target.value as any)}
                            className="mt-1 h-8 text-sm w-full border border-slate-200 rounded-md px-2 bg-white"
                          >
                            <option value="eft">EFT / Bank transfer</option>
                            <option value="cash">Cash</option>
                            <option value="card">Card</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">Reference (optional)</label>
                        <Input
                          value={depositReference}
                          onChange={(e) => setDepositReference(e.target.value)}
                          placeholder="EFT reference, receipt number, etc."
                          className="mt-1 h-8 text-sm"
                        />
                      </div>
                      <p className="text-[11px] text-emerald-800">
                        Order + deposit invoice will be marked paid for {depositAmount ? fmtMoney.format(Number(depositAmount)) : "R 0"}
                        {Number(depositAmount) > 0 && acceptPreflight?.total && Number(depositAmount) < Number(acceptPreflight.total)
                          ? `. Balance ${fmtMoney.format(Number(acceptPreflight.total) - Number(depositAmount))} stays open.`
                          : "."}
                      </p>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-600">
                      Leave unticked if you're accepting before the deposit lands. Invoice will be generated as outstanding. The client can pay via the public link, and you can record the payment manually on the invoice once it clears.
                    </p>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => acceptPreflight && runAcceptOnBehalf(acceptPreflight)}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Confirm and convert
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this quote?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  <span className="block mb-2">
                    This permanently removes <span className="font-medium text-slate-900">{deleteTarget.client_name}</span>
                    {deleteTarget.event_date && (
                      <>, event {new Date(deleteTarget.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}</>
                    )}
                    {deleteTarget.total != null && (
                      <>, {fmtMoney.format(deleteTarget.total)}</>
                    )}.
                  </span>
                  <span className="block text-rose-600">
                    This cannot be undone. Any linked order is unaffected.
                  </span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-rose-600 hover:bg-rose-700 focus:ring-rose-600"
            >
              {deleting ? "Deleting..." : "Delete quote"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ChatBot userRole="admin" companyId={user?.user_metadata?.company_id} />

      {/* Review-before-send composer for the draft Send button. The
          dialog handles the /api/send-email POST itself; we only react
          on success via onSent so the row flips to status='sent'. */}
      <QuoteSendDialog
        open={sendDialogOpen}
        onOpenChange={(o) => {
          setSendDialogOpen(o);
          if (!o) setSendDialogQuote(null);
        }}
        companyId={(user as any)?.company_id || ""}
        tenantName={(user as any)?.user_metadata?.company_name || null}
        quote={sendDialogQuote as QuoteSendDialogQuote | null}
        onSent={handleQuoteSent}
      />
    </>
  );
}

/* The drawer chrome (resize, drag handle, sticky position) lives in
   /components/messaging/ComposeDrawerHost so the leads page and the
   quotes page stay in lockstep on UX. */

function QuoteComposeDrawer({
  quote, fromName, companyName, companyId, mode, diary, onSent, onSweetenerApplied, onClose,
}: {
  quote: Quote;
  fromName?: string;
  companyName?: string;
  companyId?: string | null;
  mode: "status" | "sweetener";
  diary: DiarySignal;
  onSent?: (channel: string) => void;
  /** Fires when the operator hits any send channel WHILE in sweetener
   *  mode. Carries the offer details so the parent can persist them
   *  to the quote (apply discount, save valid_until, set status to
   *  'revised') -- the email needs to match what the quote actually
   *  shows to the client. */
  onSweetenerApplied?: (offer: {
    discountKind: "percent" | "amount" | "perk";
    discountPercent: number;
    discountAmount: number;
    perk: string;
    validUntil: string;
  }) => Promise<void> | void;
  onClose: () => void;
}) {
  const derivedStatus = useMemo(() => deriveQuoteStatus(quote), [quote]);
  const eventDateLabel = quote.event_date
    ? new Date(quote.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
    : undefined;
  const quoteRef = (quote as any).quote_number || quote.id?.slice(0, 8).toUpperCase();

  const baseCtx = {
    contactName: quote.client_name,
    eventName: (quote as any).event_name || undefined,
    eventDate: eventDateLabel,
    guestCount: quote.guest_count,
    total: quote.total ?? undefined,
    quoteRef,
    fromName,
    companyName,
    companyId: companyId ?? null,
  };

  // Sweetener controls. Default to a 10% nudge with a 7-day expiry --
  // most catering teams will tune from there.
  const [discountKind, setDiscountKind] = useState<"percent" | "amount" | "perk">("percent");
  const [discountPercent, setDiscountPercent] = useState<number>(10);
  const [discountAmount, setDiscountAmount] = useState<number>(500);
  const [perk, setPerk] = useState<string>("a complimentary dessert station");
  const [validUntil, setValidUntil] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return toLocalISO(d);
  });

  const validUntilLabel = validUntil
    ? new Date(validUntil).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
    : undefined;

  // Pick the right template based on mode + the live sweetener controls.
  const initial = useMemo(() => {
    if (mode === "sweetener") {
      return templateSweetener({
        ...baseCtx,
        discountPercent: discountKind === "percent" ? discountPercent : undefined,
        discountAmount: discountKind === "amount" ? discountAmount : undefined,
        perk: discountKind === "perk" ? perk : undefined,
        validUntil: validUntilLabel,
      });
    }
    return templateForQuote(derivedStatus, baseCtx);
  // baseCtx is rebuilt every render but its members are stable refs of
  // the quote -- the deps below cover everything that actually changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, derivedStatus, quote, fromName, companyName, discountKind, discountPercent, discountAmount, perk, validUntilLabel]);

  // Sweetener controls render into the MessageComposer's `controls`
  // slot so the layout stays in lockstep with the leads compose flow.
  // The composer takes care of the subject / body / send actions.
  const sweetenerControls = mode === "sweetener" ? (
    <Card className="border-emerald-200 bg-emerald-50/50">
      <CardContent className="py-4 px-4 space-y-3">
        <div className="text-[11px] uppercase tracking-wide text-emerald-700 font-semibold">
          Pick the offer
        </div>
        <div className="flex flex-wrap gap-2">
          {([
            { id: "percent", label: "% off" },
            { id: "amount",  label: "R off" },
            { id: "perk",    label: "Free perk" },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setDiscountKind(opt.id)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                discountKind === opt.id
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white text-slate-700 border-slate-200 hover:border-emerald-300",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {discountKind === "percent" && (
          <div>
            <label className="text-xs font-semibold text-slate-700">Discount %</label>
            <Input
              type="number"
              min={0}
              max={50}
              value={discountPercent}
              onChange={(e) => setDiscountPercent(Number(e.target.value) || 0)}
              className="mt-1 max-w-[120px]"
            />
            {quote.total != null && discountPercent > 0 && (
              <p className="text-[11px] text-slate-500 mt-1">
                Drops {fmtMoney.format(quote.total)} to {fmtMoney.format(quote.total * (1 - discountPercent / 100))}.
              </p>
            )}
          </div>
        )}
        {discountKind === "amount" && (
          <div>
            <label className="text-xs font-semibold text-slate-700">Rand off</label>
            <Input
              type="number"
              min={0}
              value={discountAmount}
              onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)}
              className="mt-1 max-w-[160px]"
            />
            {quote.total != null && discountAmount > 0 && (
              <p className="text-[11px] text-slate-500 mt-1">
                Drops {fmtMoney.format(quote.total)} to {fmtMoney.format(quote.total - discountAmount)}.
              </p>
            )}
          </div>
        )}
        {discountKind === "perk" && (
          <div>
            <label className="text-xs font-semibold text-slate-700">Free perk</label>
            <Input
              value={perk}
              onChange={(e) => setPerk(e.target.value)}
              placeholder="a complimentary dessert station"
              className="mt-1"
            />
          </div>
        )}
        <div>
          <label className="text-xs font-semibold text-slate-700">Offer holds until</label>
          <Input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            className="mt-1 max-w-[200px]"
          />
        </div>
      </CardContent>
    </Card>
  ) : undefined;

  // Diary callout, shown in both modes so the team knows why they're
  // sending this email. Same tone classes as the inline chip on the row.
  const diaryBanner = quote.event_date ? (
    <div
      className={cn(
        "rounded-lg border px-3 py-2 text-sm flex flex-wrap items-center gap-2",
        DIARY_TONE[diary.status].chip,
      )}
    >
      <CalendarDays className="w-4 h-4" />
      <span className="font-semibold">{diary.headline}</span>
      <span className="text-xs opacity-80">{diary.detail}</span>
    </div>
  ) : undefined;

  const contextRows: ContextRow[] = [
    { label: "Email", value: quote.client_email || "(none)", title: quote.client_email || "(none)" },
    { label: "Status", value: <span className="capitalize">{derivedStatus}</span> },
    ...(quote.event_date ? [{
      label: "Event date",
      value: new Date(quote.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" }),
    } as ContextRow] : []),
    ...(quote.guest_count != null ? [{ label: "Guests", value: String(quote.guest_count) } as ContextRow] : []),
    { label: "Total", value: fmtMoney.format(quote.total ?? 0), divider: true, emphasis: true },
  ];

  return (
    <MessageComposer
      icon={mode === "sweetener" ? <Gift className="w-5 h-5 text-emerald-600" /> : <Send className="w-5 h-5 text-emerald-600" />}
      title={mode === "sweetener"
        ? `Offer ${quote.client_name} a sweetener`
        : `Compose to ${quote.client_name}`}
      subtitle={mode === "sweetener"
        ? "Lock in a wide-open day with a thank-you discount or treat. Tweak the offer and the body updates."
        : "Personal follow-up. Sent through your own inbox so it looks like it came from you."}
      banner={diaryBanner}
      controls={sweetenerControls}
      contextLabel="This quote"
      contextRows={contextRows}
      recipient={{
        name: quote.client_name,
        email: quote.client_email || null,
        phone: (quote as any).client_phone || null,
      }}
      template={initial}
      fromName={fromName}
      footerHint={mode === "sweetener"
        ? "Tweak the offer above and the body refreshes, once you start typing here we keep your wording."
        : "Edit freely, the template's just a starting point based on this quote's status. Drag the left edge of this drawer to give yourself more room."}
      whatsapp={{
        kind: "client",
        ctx: {
          contactName: quote.client_name,
          eventName: (quote as any).event_name ?? null,
          eventDate: quote.event_date
            ? new Date(quote.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })
            : null,
          guestCount: quote.guest_count ?? null,
          total: quote.total ?? null,
          quoteRef: quote.quote_number || null,
          fromName,
        },
        templates: ["quote_sent", "quote_chase", "quote_accepted", "lead_followup"],
        defaultTemplate: quote.status === "accepted" ? "quote_accepted"
          : quote.status === "sent" ? "quote_chase"
          : "quote_sent",
      }}
      publicLink={(quote as any).public_token ? buildPublicQuoteUrl((quote as any).public_token) : null}
      onSent={async (channel) => {
        if (mode === "sweetener" && onSweetenerApplied) {
          await onSweetenerApplied({
            discountKind, discountPercent, discountAmount, perk, validUntil,
          });
        }
        if (onSent) onSent(channel);
      }}
      onClose={onClose}
    />
  );
}
