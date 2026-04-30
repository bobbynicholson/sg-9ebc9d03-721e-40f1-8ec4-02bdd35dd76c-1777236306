import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
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
import { composeEmail, templateForQuote, type QuoteStatus } from "@/lib/composeEmail";
import {
  deriveQuoteIntelligence,
  summariseAutoEmailsByQuote,
  quoteSortKey,
  countByBucket,
  type QuoteBucket,
  type QuoteRowState,
} from "@/lib/quoteIntelligence";
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
  const [deleteTarget, setDeleteTarget] = useState<Quote | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [companyName, setCompanyName] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [bucket, setBucket] = useState<QuoteBucket>("all");

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
            Smart filter pills -- mirrors the Clients CRM pattern. Each
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
                `Open ${cap} Gmail drafts to nudge these clients?\nEach draft is tailored from the quote's status -- you review every one before sending. The remaining ${Math.max(eligible.length - cap, 0)} will need a second pass.`,
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
                  quote{eligible.length === 1 ? "" : "s"} with a client email -- send personal nudges?
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
                  ? "No email on this quote -- add one to enable compose"
                  : quote.status === "draft"
                    ? "Send the quote first, then you can follow up"
                    : "Open a follow-up draft in Gmail / Outlook / mail app";
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
                              "New client request" pill -- shown when
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
                          </div>

                          {/*
                            Suggested-action strip -- the headline
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
                              -- {intel.reason}
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
                            onClick={() => setComposeQuote(quote)}
                          >
                            <Mail className="w-4 h-4 mr-2" />
                            Compose
                          </Button>
                          <Link href={`/admin/quotes/${quote.id}`}>
                            <Button variant="outline" size="sm">
                              <Edit className="w-4 h-4 mr-2" />
                              View
                            </Button>
                          </Link>
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

      {/* Compose drawer -- bigger default footprint and a drag handle on
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
                      <> -- event {new Date(deleteTarget.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}</>
                    )}
                    {deleteTarget.total != null && (
                      <> -- {fmtMoney.format(deleteTarget.total)}</>
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

/**
 * Sheet wrapper that's bigger out of the gate (60% of viewport, clamped
 * 640..1280) and resizable -- the team can drag the left edge to pull it
 * wider while drafting a long email. Width persists for the session in
 * sessionStorage so it doesn't snap back between opens.
 */
function ComposeDrawerHost({
  open, onClose, children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const MIN_W = 480;
  const MAX_W = 1280;
  const DEFAULT_FRAC = 0.6;

  const initialWidth = () => {
    if (typeof window === "undefined") return 800;
    const stored = Number(window.sessionStorage.getItem("compose_drawer_w") || "0");
    if (stored >= MIN_W && stored <= MAX_W) return stored;
    return Math.min(MAX_W, Math.max(MIN_W, Math.round(window.innerWidth * DEFAULT_FRAC)));
  };

  const [width, setWidth] = useState<number>(800);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (open) setWidth(initialWidth());
  }, [open]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      // Drag handle is on the left edge of the drawer; the drawer itself
      // sits on the right edge of the viewport. New width = distance from
      // mouse to the right edge.
      const next = Math.min(MAX_W, Math.max(MIN_W, window.innerWidth - e.clientX));
      setWidth(next);
    };
    const onUp = () => {
      setDragging(false);
      try {
        window.sessionStorage.setItem("compose_drawer_w", String(width));
      } catch { /* ignore */ }
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [dragging, width]);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="p-0 sm:max-w-none flex flex-col"
        style={{ width: `${width}px`, maxWidth: "100vw" }}
      >
        {/* Drag handle on the left edge */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize compose drawer"
          onMouseDown={(e) => { e.preventDefault(); setDragging(true); }}
          className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize group hover:bg-emerald-100/40"
          style={{ zIndex: 60 }}
        >
          <div
            className={cn(
              "absolute top-1/2 -translate-y-1/2 left-0 w-1.5 h-16 rounded-r-lg transition-colors",
              dragging ? "bg-emerald-500" : "bg-slate-200 group-hover:bg-emerald-400",
            )}
          />
          <GripVertical
            className={cn(
              "absolute top-1/2 -translate-y-1/2 left-0 w-3 h-3",
              dragging ? "text-emerald-700" : "text-slate-400 opacity-0 group-hover:opacity-100",
            )}
          />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-6 pl-8 py-6">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function QuoteComposeDrawer({
  quote, fromName, companyName, onClose,
}: {
  quote: Quote;
  fromName?: string;
  companyName?: string;
  onClose: () => void;
}) {
  const derivedStatus = useMemo(() => deriveQuoteStatus(quote), [quote]);
  const initial = useMemo(() => templateForQuote(derivedStatus, {
    contactName: quote.client_name,
    eventName: (quote as any).event_name || undefined,
    eventDate: quote.event_date
      ? new Date(quote.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
      : undefined,
    guestCount: quote.guest_count,
    total: quote.total ?? undefined,
    quoteRef: (quote as any).quote_number || quote.id?.slice(0, 8).toUpperCase(),
    fromName,
    companyName,
  }), [quote, derivedStatus, fromName, companyName]);

  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [copied, setCopied] = useState(false);

  // If the quote in the drawer changes, reset the composer to the new
  // template instead of leaving stale text from a previous client.
  useEffect(() => {
    setSubject(initial.subject);
    setBody(initial.body);
  }, [initial.subject, initial.body]);

  const payload = { to: quote.client_email || "", subject, body, fromName };

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <Send className="w-5 h-5 text-emerald-600" />
          Compose to {quote.client_name}
        </SheetTitle>
        <SheetDescription>
          Personal follow-up. Sent through your own inbox so it looks like it came from you.
        </SheetDescription>
      </SheetHeader>

      {/* Two-column layout when the drawer is wide enough: quote
          context lives on the right rail, the email composer takes the
          full main column. Falls back to one column under 880px. */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_minmax(240px,300px)] gap-6 mt-4">
        <div className="space-y-4 min-w-0">
          {/* Editable template */}
          <div>
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Subject</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 h-11 text-base" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={20}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-3 text-sm leading-6 min-h-[420px]"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Edit freely -- the template's just a starting point based on this quote's status.
              Drag the left edge of this drawer to give yourself more room.
            </p>
          </div>
        </div>

        {/* Quote summary -- right rail at xl+, stacked above the form
            on narrower drawers so it never gets squeezed. */}
        <Card className="border-0 shadow-sm bg-slate-50 xl:order-last order-first xl:sticky xl:top-2 xl:self-start">
          <CardContent className="py-4 px-4 text-xs space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
              This quote
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500 flex-shrink-0">Email</span>
              <span className="font-medium text-slate-900 truncate" title={quote.client_email || "(none)"}>
                {quote.client_email || "(none)"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Status</span>
              <span className="font-medium text-slate-900 capitalize">{derivedStatus}</span>
            </div>
            {quote.event_date && (
              <div className="flex justify-between">
                <span className="text-slate-500">Event date</span>
                <span className="font-medium text-slate-900">
                  {new Date(quote.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}
                </span>
              </div>
            )}
            {quote.guest_count != null && (
              <div className="flex justify-between">
                <span className="text-slate-500">Guests</span>
                <span className="font-medium text-slate-900">{quote.guest_count}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-200 pt-2">
              <span className="text-slate-500">Total</span>
              <span className="font-semibold text-slate-900">{fmtMoney.format(quote.total ?? 0)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 mt-6">

        {/* Action buttons -- four side by side at xl+, two at smaller. */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 pt-2 border-t border-slate-100">
          <Button
            variant="default"
            disabled={!quote.client_email}
            onClick={() => {
              window.open(composeEmail.gmailUrl(payload), "_blank", "noopener");
            }}
            className="gap-2 bg-emerald-600 hover:bg-emerald-700"
          >
            <ExternalLink className="w-4 h-4" /> Open in Gmail
          </Button>
          <Button
            variant="outline"
            disabled={!quote.client_email}
            onClick={() => {
              window.open(composeEmail.outlookUrl(payload), "_blank", "noopener");
            }}
            className="gap-2"
          >
            <ExternalLink className="w-4 h-4" /> Open in Outlook
          </Button>
          <Button
            variant="outline"
            disabled={!quote.client_email}
            onClick={() => {
              window.location.href = composeEmail.mailto(payload);
            }}
            className="gap-2"
          >
            <Mail className="w-4 h-4" /> Default mail app
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              const ok = await composeEmail.copyToClipboard(payload);
              if (ok) {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }
            }}
            className="gap-2"
          >
            <Copy className="w-4 h-4" /> {copied ? "Copied!" : "Copy"}
          </Button>
        </div>

        <p className="text-[11px] text-slate-500 text-center">
          Direct send via your own SMTP / Gmail OAuth coming soon. Until then these four options keep the email looking like it came from you, not from us.
        </p>

        <Button variant="ghost" onClick={onClose} className="w-full">Close</Button>
      </div>
    </>
  );
}
