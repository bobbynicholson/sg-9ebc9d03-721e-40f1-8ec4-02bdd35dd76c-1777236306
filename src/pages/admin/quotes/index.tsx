import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
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
import {
  DollarSign,
  Plus,
  Calendar,
  Mail,
  Users,
  FileText,
  Edit,
  Send,
  Copy,
  ExternalLink,
  Search,
  Flame,
  Sparkles,
  Crown,
  Snowflake,
  AlertTriangle,
  Clock,
  Inbox,
  ArrowRight,
  Trash2,
  GripVertical,
  CalendarDays,
  Gift,
} from "lucide-react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { Quote } from "@/types";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import Head from "next/head";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";
import { quoteService } from "@/services/quoteService";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useToast } from "@/hooks/use-toast";
import { composeEmail, templateForQuote, templateSweetener, type QuoteStatus } from "@/lib/composeEmail";
import { buildPublicQuoteUrl } from "@/services/publicQuoteService";
import { pushQuoteToXero } from "@/services/accountingExportService";
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

const fmtMoney = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });

/**
 * Maps a Quote row -> the QuoteStatus our compose templates know about.
 * Folds in an "expired" check based on valid_until so an old "sent" quote
 * gets the urgency template instead of the default follow-up.
 */
function deriveQuoteStatus(quote: Quote): QuoteStatus {
  const validUntil = (quote as any).valid_until as string | null | undefined;
  const status = quote.status as QuoteStatus;
  if ((status === "sent" || status === "revised") && validUntil) {
    if (new Date(validUntil).getTime() < Date.now()) return "expired";
  }
  return status;
}

export default function AdminQuotes() {
  const { user, profile } = useAuth() as any;
  const { toast } = useToast();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [autoEmailRows, setAutoEmailRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [composeQuote, setComposeQuote] = useState<Quote | null>(null);
  const [composeMode, setComposeMode] = useState<"status" | "sweetener">("status");
  const [deleteTarget, setDeleteTarget] = useState<Quote | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([]);
  const [companyName, setCompanyName] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [bucket, setBucket] = useState<QuoteBucket>("all");

  // Diary index: every confirmed order + accepted quote pivoted by
  // event_date so each open quote's row can show "wide open day" or
  // "stacked" without a per-row roundtrip.
  const diaryIndex = useMemo(() => buildDiaryIndex(diaryEntries), [diaryEntries]);

  // Roll quotes + auto-email queue into a single per-row state object
  // with derived intelligence (status bucket, suggested action, last
  // touch, auto-email summary). Sort urgent + old to the top.
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

  const counts = useMemo(() => countByBucket(rowStates), [rowStates]);
  const bucketFilteredRows = useMemo(
    () => (bucket === "all" ? rowStates : rowStates.filter((r) => r.intelligence.bucket === bucket)),
    [rowStates, bucket],
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

  useEffect(() => {
    if (!user?.company_id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const fetched = await quoteService.getQuotes(user.company_id!);
      if (cancelled) return;
      setQuotes(fetched);

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
  }, [user?.company_id]);

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

  const handleSend = async (quoteId: string) => {
    setSendingId(quoteId);
    try {
      const ok = await quoteService.sendQuoteToClient(quoteId);
      if (ok) {
        toast({ title: "Quote sent", description: "Email queued and status updated to Sent." });
        setQuotes((prev) => prev.map((q) =>
          q.id === quoteId ? { ...q, status: "sent", sent_at: new Date().toISOString() } as Quote : q
        ));
      } else {
        toast({ title: "Send failed", description: "Could not send the quote. Check the client email.", variant: "destructive" });
      }
    } catch (err) {
      console.error("Send quote failed:", err);
      toast({ title: "Send failed", description: "Something went wrong sending this quote.", variant: "destructive" });
    } finally {
      setSendingId(null);
    }
  };

  const getStatusColor = (status: Quote["status"]) => {
    switch (status) {
      case "draft": return "bg-gray-100 text-gray-700 border-gray-200";
      case "sent": return "bg-blue-100 text-blue-700 border-blue-200";
      case "revised": return "bg-orange-100 text-orange-700 border-orange-200";
      case "accepted": return "bg-green-100 text-green-700 border-green-200";
      case "rejected": return "bg-red-100 text-red-700 border-red-200";
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
        <div className="px-4 py-6 md:py-8 lg:py-12 max-w-full">
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-500 rounded-2xl shadow-lg">
                  <DollarSign className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-4xl font-bold bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                    Quote Management
                  </h1>
                  <p className="text-slate-600 mt-1">Create and manage client quotes</p>
                </div>
              </div>
              <Link href="/admin/quotes/new">
                <Button size="lg" className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700">
                  <Plus className="w-5 h-5 mr-2" />
                  New Quote
                </Button>
              </Link>
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
                  R{quotes.reduce((sum, q) => sum + (q.total ?? 0), 0).toLocaleString()}
                </p>
              </CardContent>
            </Card>
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
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="font-medium">{pill.label}</span>
                  <span className="text-xs font-semibold opacity-80">{count}</span>
                </button>
              );
            })}
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
                  placeholder="Search by client, event, venue, quote ref or total..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              {(search.trim() || bucket !== "all") && (
                <p className="text-xs text-slate-500 mt-1.5">
                  Showing {filteredRows.length} of {rowStates.length} quotes.
                </p>
              )}
            </div>
          )}

          <div className="space-y-4">
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
                const diary = computeDiarySignal(quote.event_date, diaryIndex, quote.id);
                const diaryTone = DIARY_TONE[diary.status];
                // We only nudge the team to send a sweetener on quotes that
                // are still in play. There's no point offering a discount
                // on a won, lost or expired quote.
                const sweetenerEligible =
                  diary.sweetenerWorthwhile &&
                  canCompose &&
                  ["sent", "revised", "viewed", "pending"].includes((quote.status || "").toLowerCase()) &&
                  intel.bucket !== "won" &&
                  intel.bucket !== "lost";
                return (
                  <Card
                    key={quote.id}
                    className={`border-0 shadow-lg hover:shadow-xl transition-all ${
                      // Visual urgency cues: red ring for urgent action
                      // needed, emerald for client portal requests,
                      // amber for stale follow-ups.
                      intel.tone === "urgent"
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
                          <div className={`mb-3 flex items-center gap-2 text-sm font-semibold ${
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

                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                            <div className="flex items-center gap-2 text-slate-600">
                              <Mail className="w-4 h-4" />
                              <span className="text-sm">{quote.client_email}</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-600">
                              <Calendar className="w-4 h-4" />
                              <span className="text-sm">{quote.event_date ? new Date(quote.event_date).toLocaleDateString() : "—"}</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-600">
                              <Users className="w-4 h-4" />
                              <span className="text-sm">{quote.guest_count} guests</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-600">
                              <DollarSign className="w-4 h-4" />
                              <span className="text-sm font-semibold text-green-600">
                                R{(quote.total ?? 0).toFixed(2)}
                              </span>
                            </div>
                          </div>

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
                              <span className="font-medium">R{quote.subtotal.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="text-slate-600">VAT (15%)</span>
                              <span className="font-medium">R{(quote.tax ?? 0).toFixed(2)}</span>
                            </div>
                            <div className="h-px bg-slate-200" />
                            <div className="flex justify-between font-bold">
                              <span>Total</span>
                              <span className="text-green-600">R{(quote.total ?? 0).toFixed(2)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 ml-4 items-end">
                          {quote.status === "draft" && (
                            <Button
                              size="sm"
                              onClick={() => handleSend(quote.id)}
                              disabled={sendingId === quote.id}
                            >
                              <Send className="w-4 h-4 mr-2" />
                              {sendingId === quote.id ? "Sending..." : "Send"}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!canCompose}
                            title={composeHint}
                            onClick={() => {
                              setComposeMode("status");
                              setComposeQuote(quote);
                            }}
                          >
                            <Mail className="w-4 h-4 mr-2" />
                            Compose
                          </Button>
                          {/* Mark-as-sent / Reset timestamp. Anchors
                              the follow-up timing baseline so the
                              suggester knows when to nudge. Use this
                              when you sent the quote outside the
                              system (PDF / WhatsApp / over a call). */}
                          {quote.status !== "accepted" && quote.status !== "rejected" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleMarkAsSent(quote)}
                              title={(quote as any).sent_at
                                ? "Reset the sent timestamp to right now"
                                : "Mark this quote as sent (without firing an email)"}
                            >
                              <Clock className="w-4 h-4 mr-2" />
                              {(quote as any).sent_at ? "Reset sent" : "Mark sent"}
                            </Button>
                          )}
                          <Link href={`/admin/quotes/${quote.id}`}>
                            <Button variant="outline" size="sm">
                              <Edit className="w-4 h-4 mr-2" />
                              View
                            </Button>
                          </Link>
                          {/* Public share link. Copies a /q/[token]
                              URL the client opens with no login. The
                              row keeps a per-quote token (uuid) on
                              quotes.public_token. Page tracks viewed
                              and accepted timestamps. */}
                          {(quote as any).public_token && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                title="Copy public quote link to clipboard"
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
                                Copy link
                              </Button>
                              {/* PDF -- opens the public quote page
                                  with ?print=1 which auto-fires the
                                  print dialog. Save as PDF from there
                                  and attach to email / WhatsApp. */}
                              <Button
                                variant="outline"
                                size="sm"
                                title="Open the printable view, save as PDF, attach to email or WhatsApp"
                                onClick={() => {
                                  const url = buildPublicQuoteUrl((quote as any).public_token);
                                  if (!url) return;
                                  window.open(`${url}?print=1`, "_blank", "noopener");
                                }}
                              >
                                <FileText className="w-4 h-4 mr-2" />
                                PDF
                              </Button>
                              {/* Push to Xero. Tries the live endpoint
                                  first; falls back to a 'Copy JSON'
                                  toast when Xero isn't connected yet
                                  or the server endpoint isn't live --
                                  the operator can paste into Xero
                                  manually as a stop-gap. */}
                              <Button
                                variant="outline"
                                size="sm"
                                title="Push this quote to your accounting package (Xero)"
                                onClick={async () => {
                                  const res = await pushQuoteToXero(quote.id);
                                  if (res.ok) {
                                    toast({ title: "Synced to Xero", description: `Quote ${quote.quote_number} pushed as a draft.` });
                                    return;
                                  }
                                  if (res.reason === "not_connected") {
                                    toast({
                                      title: "Connect Xero first",
                                      description: "Open Integrations to link your Xero account, then try again.",
                                      variant: "destructive",
                                    });
                                    return;
                                  }
                                  if (res.reason === "no_endpoint") {
                                    if (res.payload && typeof window !== "undefined") {
                                      try {
                                        await navigator.clipboard.writeText(JSON.stringify(res.payload, null, 2));
                                        toast({
                                          title: "Xero endpoint not deployed yet",
                                          description: "Copied the prepared payload to your clipboard so you can paste into Xero manually for now.",
                                        });
                                      } catch {
                                        toast({ title: "Couldn't copy payload", variant: "destructive" });
                                      }
                                    }
                                    return;
                                  }
                                  toast({ title: "Couldn't sync to Xero", description: res.error, variant: "destructive" });
                                }}
                              >
                                <ExternalLink className="w-4 h-4 mr-2" />
                                Push to Xero
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            title="Delete quote"
                            onClick={() => setDeleteTarget(quote)}
                            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </Button>
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
            onSent={async () => {
              // Auto-anchor sent_at the first time the operator picks
              // any send channel (Gmail / Outlook / mailto / Copy /
              // WhatsApp). We only stamp when there's no existing
              // sent_at -- otherwise the original baseline is the
              // right anchor for follow-up timing, not the latest
              // touch. Reset is the explicit Mark-sent button.
              if (!composeQuote || (composeQuote as any).sent_at) return;
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
                // Non-fatal -- the operator can still hit Mark sent
                // manually if the auto-stamp fails.
                console.warn("Auto sent_at stamp failed:", err);
              }
            }}
            onClose={() => setComposeQuote(null)}
          />
        )}
      </ComposeDrawerHost>

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
    </>
  );
}

/* The drawer chrome (resize, drag handle, sticky position) lives in
   /components/messaging/ComposeDrawerHost so the leads page and the
   quotes page stay in lockstep on UX. */

function QuoteComposeDrawer({
  quote, fromName, companyName, companyId, mode, diary, onSent, onClose,
}: {
  quote: Quote;
  fromName?: string;
  companyName?: string;
  companyId?: string | null;
  mode: "status" | "sweetener";
  diary: DiarySignal;
  onSent?: (channel: string) => void;
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
    return d.toISOString().slice(0, 10);
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
      onSent={onSent}
      onClose={onClose}
    />
  );
}
