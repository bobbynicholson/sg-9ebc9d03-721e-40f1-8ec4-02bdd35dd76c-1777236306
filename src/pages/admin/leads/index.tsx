import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  Plus, Search, Phone, Mail, Calendar, DollarSign, TrendingUp,
  ArrowRight, FileText, ShoppingCart, UserCheck, Clock, Trash2,
  Send, MailQuestion, RefreshCw, ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { composeEmail } from "@/lib/composeEmail";
import { resolveTemplateSync } from "@/services/messageTemplateService";
import { ComposeDrawerHost } from "@/components/messaging/ComposeDrawerHost";
import { MessageComposer } from "@/components/messaging/MessageComposer";
import { useToast } from "@/hooks/use-toast";
import { AdminNav } from "@/components/admin/AdminNav";
import { RowPrimaryAction } from "@/components/admin/RowPrimaryAction";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { useRegionFilter } from "@/contexts/RegionFilterContext";
import { RegionBadge } from "@/components/admin/RegionBadge";
import { ChatBot } from "@/components/ChatBot";
import { leadService } from "@/services/leadService";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { supabase } from "@/integrations/supabase/client";

// Per-lead provenance summary -- which quotes/orders/clients have
// been spawned from this lead. Surfaced on the row so the catering
// team sees at a glance whether the lead is still "in the funnel" or
// already converted downstream.
/**
 * Slimmed-down quote shape we keep in memory for each lead. We only
 * need enough to label the picker (number, name, status, total, date)
 * and to route on click (id). Caterers routinely send 2+ alternate
 * quotes to the same lead -- "buffet vs plated", "100 vs 150 guests" --
 * so the multi-quote picker is the standard case, not the edge case.
 */
interface LeadQuoteSummary {
  id: string;
  number: string | null;
  name: string | null;
  status: string | null;
  total: number | null;
  createdAt: string | null;
}

/**
 * Format a quote summary into the picker label. We lead with the
 * quote_number when we have one (operators recognise "Q-0042" faster
 * than a name), then a status pill and the rand total. Nothing fancy --
 * just enough to pick the right one when there are 2 or 3 alternates.
 */
function formatQuoteLabel(q: LeadQuoteSummary): string {
  const head = q.number || q.name || "Quote";
  const total = typeof q.total === "number" && q.total > 0
    ? `R${Math.round(q.total).toLocaleString()}`
    : null;
  const status = q.status ? q.status.replace(/_/g, " ") : null;
  return [head, status, total].filter(Boolean).join(" · ");
}

interface LeadLinks {
  quoteCount: number;
  /** Every quote attached to this lead, newest first. */
  quotes: LeadQuoteSummary[];
  /** Most recent quote id for this lead -- used for the "View quote" chip. */
  latestQuoteId: string | null;
  latestQuoteStatus: string | null;
  /** Order id if any quote off this lead converted into an order. */
  orderId: string | null;
  clientId: string | null;
}

/**
 * Suggestion "kinds" map directly onto the call-to-action button on
 * each row. The labels above used to be decorative -- now each kind
 * carries an explicit action so the team can act on the suggestion in
 * one click.
 */
type LeadActionKind =
  | "reply_email"      // Reply ASAP, new lead waiting
  | "touch_base"       // 2-7 days quiet, send a warm check-in
  | "follow_up"        // 7+ days quiet, urgent follow-up
  | "chase_quote"      // Quote sent, no reply
  | "send_quote"       // Lead qualified, no quote yet
  | "open_quote_draft" // Draft quote in flight, finish + send
  | "convert_to_order" // Quote accepted, no order yet
  | "winback"          // Rejected quote, soft win-back
  | "reopen"           // Lead marked lost, friendly door-open
  | "view_order";      // Already booked, just open the order

function deriveLeadSuggestion(lead: any, links: LeadLinks): {
  tone: "urgent" | "warm" | "neutral";
  label: string;
  reason: string;
  kind: LeadActionKind;
} {
  const created = lead.created_at ? new Date(lead.created_at) : null;
  const ageDays = created
    ? Math.floor((Date.now() - created.getTime()) / 86_400_000)
    : 0;
  const status = (lead.status || "new") as string;

  if (links.orderId) {
    return { tone: "neutral", label: "Open order", reason: "Already booked", kind: "view_order" };
  }
  if (links.quoteCount > 0) {
    if (links.latestQuoteStatus === "accepted") {
      return { tone: "urgent", label: "Convert quote to order", reason: "Quote accepted, no order yet", kind: "convert_to_order" };
    }
    if (links.latestQuoteStatus === "rejected") {
      return { tone: "warm", label: "Win-back nudge", reason: "Quote was rejected", kind: "winback" };
    }
    if (links.latestQuoteStatus === "sent" || links.latestQuoteStatus === "viewed") {
      return { tone: "warm", label: "Chase the quote", reason: `${ageDays}d since lead came in`, kind: "chase_quote" };
    }
    return { tone: "warm", label: "Finish + send the quote", reason: "Draft quote in flight", kind: "open_quote_draft" };
  }
  if (status === "lost") {
    return { tone: "neutral", label: "Re-open with a soft note", reason: "Marked lost, circle back later", kind: "reopen" };
  }
  if (status === "qualified") {
    return { tone: "urgent", label: "Send a quote", reason: "Lead qualified, no quote yet", kind: "send_quote" };
  }
  if (ageDays >= 7) {
    return { tone: "urgent", label: `Follow up, ${ageDays}d quiet`, reason: "Lead is going cold", kind: "follow_up" };
  }
  if (ageDays >= 2) {
    return { tone: "warm", label: "Touch base", reason: `${ageDays}d since enquiry`, kind: "touch_base" };
  }
  return { tone: "urgent", label: "Reply ASAP", reason: "New enquiry waiting", kind: "reply_email" };
}

/** Short label and icon for the primary CTA button. Mirrors the
 *  text of the suggestion strip so the button is unambiguous. */
function suggestionCtaText(kind: LeadActionKind): string {
  switch (kind) {
    case "reply_email":      return "Reply ASAP";
    case "touch_base":       return "Send touch-base";
    case "follow_up":        return "Send follow-up";
    case "chase_quote":      return "Chase the quote";
    case "send_quote":       return "Send a quote";
    case "open_quote_draft": return "Finish quote";
    case "convert_to_order": return "Convert to order";
    case "winback":          return "Send win-back";
    case "reopen":           return "Re-open lead";
    case "view_order":       return "Open order";
  }
}

/** Hover tooltip explaining what the primary CTA actually does. */
function suggestionCtaTooltip(kind: LeadActionKind): string {
  switch (kind) {
    case "reply_email":      return "Open the email composer with a quick first-reply template, prefilled from the lead.";
    case "touch_base":       return "Open the email composer with a 'just checking in' template (lead is 2-6 days old).";
    case "follow_up":        return "Open the email composer with a 'haven't heard back, here's a nudge' template (lead has gone quiet 7+ days).";
    case "chase_quote":      return "Open the email composer with a 'just chasing on the quote' template -- you've already sent one, time to nudge.";
    case "send_quote":       return "Jump straight into the rich quote builder, prefilled from this lead.";
    case "open_quote_draft": return "Open the existing draft quote in the editable builder so you can finish + send it.";
    case "convert_to_order": return "The client accepted the quote -- open it so you can convert it to an order.";
    case "winback":          return "Quote was rejected. Open the email composer with a soft win-back template.";
    case "reopen":           return "Re-open this lost lead with a low-pressure check-in email.";
    case "view_order":       return "This lead is already booked -- jump to the order.";
  }
}

/** Inline icon for the CTA. JSX returned so we can use it directly. */
function suggestionCtaIcon(kind: LeadActionKind) {
  const cls = "w-4 h-4 mr-2";
  switch (kind) {
    case "reply_email":
    case "touch_base":
    case "winback":
    case "reopen":
      return <Mail className={cls} />;
    case "follow_up":
    case "chase_quote":
      return <MailQuestion className={cls} />;
    case "send_quote":
    case "open_quote_draft":
      return <FileText className={cls} />;
    case "convert_to_order":
      return <RefreshCw className={cls} />;
    case "view_order":
      return <ShoppingCart className={cls} />;
    default:
      return <Send className={cls} />;
  }
}

/**
 * Per-suggestion-kind email templates. Plain text, signed off with
 * the catering team's name. Lifts the same shape as the quote
 * compose templates so the body reads natural in Gmail / Outlook.
 */
// Map LeadActionKind values to the registry key the override resolver
// looks up. Statuses without a key fall through to the hardcoded
// default in the switch below (existing UX, unchanged).
const LEAD_ACTION_TO_REGISTRY: Partial<Record<LeadActionKind, string>> = {
  reply_email: "email_lead_reply",
  touch_base:  "email_lead_touch_base",
  follow_up:   "email_lead_follow_up",
  chase_quote: "email_lead_chase_quote",
  winback:     "email_lead_winback",
  reopen:      "email_lead_reopen",
};

function templateForLeadAction(
  kind: LeadActionKind,
  lead: any,
  fromName: string,
  companyId?: string | null,
): { subject: string; body: string } {
  const first = String(lead.client_name || "there").split(" ")[0];
  const eventLine = lead.event_type
    ? lead.event_date
      ? `your ${lead.event_type} on ${new Date(lead.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long" })}`
      : `your ${lead.event_type}`
    : lead.event_date
      ? `your event on ${new Date(lead.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long" })}`
      : `your enquiry`;
  const sig = `\n\nBest,\n${fromName || "the team"}`;

  // 1. Override path -- silent fallback to default when no customisation.
  const overrideKey = LEAD_ACTION_TO_REGISTRY[kind];
  if (overrideKey) {
    const eventDateLabel = lead.event_date
      ? new Date(lead.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long" })
      : "";
    const resolved = resolveTemplateSync({
      companyId: companyId ?? null,
      key: overrideKey,
      ctx: {
        first_name:   first,
        client_name:  lead.client_name || "",
        company_name: "",
        from_name:    fromName || "the team",
        event_name:   lead.event_type || "your event",
        event_date:   eventDateLabel,
        guest_count:  lead.guest_count ?? "",
      },
    });
    if (resolved && resolved.fromOverride) {
      return { subject: resolved.subject, body: resolved.body };
    }
  }

  // 2. Hardcoded defaults (existing UX, unchanged).
  switch (kind) {
    case "reply_email":
      return {
        subject: `Thanks for reaching out about ${eventLine}`,
        body: `Hi ${first},\n\nThanks for getting in touch about ${eventLine}. I have everything I need on this side to put a draft quote together for you. Could you confirm guest numbers and venue when you have a sec?\n\nHappy to walk through menu options if it would help.${sig}`,
      };
    case "touch_base":
      return {
        subject: `Quick check-in on ${eventLine}`,
        body: `Hi ${first},\n\nJust circling back on ${eventLine}. Did anything come up that I can help with on the catering side? Happy to share menu ideas before you commit to anything.${sig}`,
      };
    case "follow_up":
      return {
        subject: `Following up`,
        body: `Hi ${first},\n\nIt has been a few days since we last touched on ${eventLine}. Wanted to make sure your enquiry has not slipped through. Reply here and I can have a quote across to you the same day.${sig}`,
      };
    case "chase_quote":
      return {
        subject: `Following up on your quote`,
        body: `Hi ${first},\n\nJust circling back on the quote we sent for ${eventLine}. Anything you would like changed, or shall we lock the date in?${sig}`,
      };
    case "winback":
      return {
        subject: `Door is still open`,
        body: `Hi ${first},\n\nUnderstand the last quote did not land for ${eventLine}. No hard feelings. Happy to be considered for the next one. If anything comes up, drop me a line and I will put a fresh quote across quickly.${sig}`,
      };
    case "reopen":
      return {
        subject: `Hello again`,
        body: `Hi ${first},\n\nNo agenda here, just keeping the door open. If anything comes up where we can help on the catering side, I am happy to put together a quick quote.${sig}`,
      };
    default:
      return {
        subject: `Quick note about ${eventLine}`,
        body: `Hi ${first},\n\nJust touching base on ${eventLine}. Let me know if anything has changed your end and I will fold it in.${sig}`,
      };
  }
}

export default function AdminLeads() {
  const { user, profile } = useAuth() as any;
  // Email-settings status banner. If the tenant hasn't configured a
  // Resend or SMTP provider, embed-form / quote-acceptance / lead
  // notifications silently land in emailService's simulation branch
  // -- they never actually reach the operator's inbox. Surface this
  // up-front on /admin/leads so the operator notices BEFORE the
  // first lead lands in their funnel.
  const [emailSettingsEnabled, setEmailSettingsEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    if (!user?.company_id) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("email_settings")
        .select("enabled, provider, smtp_host, resend_api_key_set")
        .eq("user_id", user.company_id)
        .maybeSingle();
      if (cancelled) return;
      // Treat as enabled when row exists AND .enabled is not false
      // AND provider is configured (resend key OR smtp host).
      const provider = (data as any)?.provider;
      const hasResend = (data as any)?.resend_api_key_set === true;
      const hasSmtp = !!(data as any)?.smtp_host;
      const isEnabled = !!data
        && (data as any).enabled !== false
        && (provider === "resend" ? hasResend : provider === "smtp" ? hasSmtp : (hasResend || hasSmtp));
      setEmailSettingsEnabled(isEnabled);
    })();
    return () => { cancelled = true; };
  }, [user?.company_id]);
  const { regionFilterId } = useRegionFilter();
  const { toast } = useToast();
  const router = useRouter();
  const [leads, setLeads] = useState<any[]>([]);
  const [linksByLeadId, setLinksByLeadId] = useState<Map<string, LeadLinks>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  // Default to "active" -- the pipeline view. Leads that have already
  // won/converted are clients now, and lost leads are archived. Hiding
  // them by default stops the leads page from doubling as a graveyard.
  // The chip strip below lets the team toggle into archived buckets
  // when they want to do win-back or audit work.
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Compose drawer state -- mirrors the Quotes page so both surfaces
  // give the team the same rich follow-up flow (subject, body, four
  // send channels, recipient context rail, drag-to-resize). Email
  // CTAs on each row open this drawer rather than skipping straight
  // to Gmail.
  const [composeLead, setComposeLead] = useState<any | null>(null);
  const [composeKind, setComposeKind] = useState<LeadActionKind>("reply_email");

  const fromName = profile?.full_name || profile?.company_name || "the team";

  const runSuggestionAction = (lead: any, links: LeadLinks, kind: LeadActionKind) => {
    if (kind === "view_order" && links.orderId) {
      router.push(`/admin/orders?orderId=${links.orderId}`);
      return;
    }
    if (kind === "convert_to_order" && links.latestQuoteId) {
      router.push(`/admin/quotes/new?fromQuoteId=${links.latestQuoteId}`);
      return;
    }
    if (kind === "open_quote_draft" && links.latestQuoteId) {
      router.push(`/admin/quotes/new?fromQuoteId=${links.latestQuoteId}`);
      return;
    }
    if (kind === "send_quote") {
      router.push(`/admin/quotes/new?leadId=${lead.id}`);
      return;
    }
    // Email-driven kinds open the rich compose drawer, same UX as the
    // Quote Management page. The drawer surfaces the lead context
    // (event date, guests, days waiting) on the right rail and lets
    // the operator edit the AI-suggested wording before sending.
    if (!lead.client_email) {
      toast({
        title: "No email on this lead",
        description: "Add an email address to send a follow-up.",
        variant: "destructive",
      });
      return;
    }
    setComposeKind(kind);
    setComposeLead(lead);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleting(true);
    try {
      await leadService.deleteLead(id);
      setLeads((prev) => prev.filter((l) => l.id !== id));
      toast({
        title: "Lead deleted",
        description: `Removed ${deleteTarget.client_name || "lead"}.`,
      });
      setDeleteTarget(null);
    } catch (err: any) {
      console.error("Delete lead failed:", err);
      toast({
        title: "Delete failed",
        description: err?.message || "Could not delete this lead.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadLeads();
    }
  }, [user]);

  const loadLeads = async () => {
    if (!user?.company_id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await leadService.getLeads(user.company_id);
      setLeads(data);

      // Build the lead-id -> linked-records index. Two queries: one
      // for quotes off these leads, one for the converted_to_client_id
      // we already have on the lead rows. Keeps it cheap.
      const leadIds = data.map((l: any) => l.id).filter(Boolean);
      const map = new Map<string, LeadLinks>();
      data.forEach((l: any) => {
        map.set(l.id, {
          quoteCount: 0,
          quotes: [],
          latestQuoteId: null,
          latestQuoteStatus: null,
          orderId: null,
          clientId: l.converted_to_client_id ?? null,
        });
      });
      if (leadIds.length > 0) {
        // Build a client_id -> lead_id reverse index for leads that
        // have already converted to a client. Lets us catch quotes
        // that were created later off the Quotes page (no lead_id
        // stamped) but for the same client -- a common flow when the
        // operator builds a 2nd alternate quote without going back
        // through the lead row.
        const clientToLead = new Map<string, string>();
        const clientIds: string[] = [];
        data.forEach((l: any) => {
          if (l.converted_to_client_id) {
            clientToLead.set(l.converted_to_client_id, l.id);
            clientIds.push(l.converted_to_client_id);
          }
        });

        // Pull quotes linked by lead_id OR by client_id. Two queries
        // is cleaner than an or() filter and scales the same. Results
        // get merged into the same map and deduped by quote id below.
        const [{ data: byLead }, { data: byClient }] = await Promise.all([
          supabase
            .from("quotes")
            .select("id, lead_id, client_id, status, converted_to_order_id, created_at, quote_number, quote_name, total_amount")
            .eq("company_id", user.company_id)
            .in("lead_id", leadIds)
            .order("created_at", { ascending: false }),
          clientIds.length > 0
            ? supabase
                .from("quotes")
                .select("id, lead_id, client_id, status, converted_to_order_id, created_at, quote_number, quote_name, total_amount")
                .eq("company_id", user.company_id)
                .in("client_id", clientIds)
                .order("created_at", { ascending: false })
            : Promise.resolve({ data: [] as any[] }),
        ]);

        const seenQuoteIdsByLead = new Map<string, Set<string>>();
        const attach = (q: any, leadId: string) => {
          const cur = map.get(leadId);
          if (!cur) return;
          let seen = seenQuoteIdsByLead.get(leadId);
          if (!seen) {
            seen = new Set();
            seenQuoteIdsByLead.set(leadId, seen);
          }
          if (seen.has(q.id)) return;
          seen.add(q.id);
          cur.quoteCount += 1;
          cur.quotes.push({
            id: q.id,
            number: q.quote_number ?? null,
            name: q.quote_name ?? null,
            status: q.status ?? null,
            total: q.total_amount ?? null,
            createdAt: q.created_at ?? null,
          });
          if (!cur.latestQuoteId) {
            cur.latestQuoteId = q.id;
            cur.latestQuoteStatus = q.status;
          }
          if (q.converted_to_order_id && !cur.orderId) {
            cur.orderId = q.converted_to_order_id;
          }
        };

        for (const q of byLead || []) {
          if (!q.lead_id) continue;
          attach(q, q.lead_id);
        }
        for (const q of byClient || []) {
          if (!q.client_id) continue;
          // Prefer the quote's own lead_id when stamped (the operator
          // started from the lead row). Otherwise, pin it to the lead
          // that converted into this client.
          const leadId = q.lead_id && map.has(q.lead_id)
            ? q.lead_id
            : clientToLead.get(q.client_id);
          if (!leadId) continue;
          attach(q, leadId);
        }

        // Re-sort each lead's quotes newest-first since they may have
        // arrived from two queries in any order.
        for (const cur of map.values()) {
          cur.quotes.sort((a, b) => {
            const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return tb - ta;
          });
          if (cur.quotes.length > 0) {
            cur.latestQuoteId = cur.quotes[0].id;
            cur.latestQuoteStatus = cur.quotes[0].status;
          }
        }
      }
      setLinksByLeadId(map);
    } catch (error) {
      console.error("Error loading leads:", error);
    } finally {
      setLoading(false);
    }
  };

  // Apply status filter first, then fuzzy-rank the remainder. Searches
  // across name, email, company, event type and notes so a query like
  // "wedding 25" still surfaces a lead with that event type + guest count.
  // "active" is the synthetic default -- everything that's still in the
  // pipeline (not won, not converted, not lost). Won/converted leads are
  // already clients now, lost leads are archived; both have their own
  // chip if the team needs to dig them out.
  // Apply the global branch filter first so chips, search and counts
  // all reflect the operator's current branch scope.
  const regionFilteredLeads = useMemo(() => {
    if (!regionFilterId) return leads;
    return leads.filter((l) => {
      const rid = (l as any).region_id;
      return !rid || rid === regionFilterId;
    });
  }, [leads, regionFilterId]);

  const statusFilteredLeads = useMemo(() => {
    if (statusFilter === "all") return regionFilteredLeads;
    if (statusFilter === "active") {
      const archived = new Set(["won", "converted", "lost"]);
      return regionFilteredLeads.filter((l) => !archived.has(l.status || "new"));
    }
    if (statusFilter === "won") {
      // Single chip covers both legacy "converted" rows and the new "won".
      return regionFilteredLeads.filter((l) => l.status === "won" || l.status === "converted");
    }
    return regionFilteredLeads.filter((l) => l.status === statusFilter);
  }, [regionFilteredLeads, statusFilter]);

  // Counts for the chip strip. Computed once so chips render with live
  // pipeline weight without re-walking the array per chip.
  const statusCounts = useMemo(() => {
    const archived = new Set(["won", "converted", "lost"]);
    let active = 0, neu = 0, qualified = 0, quoted = 0, won = 0, lost = 0;
    for (const l of regionFilteredLeads) {
      const s = l.status || "new";
      if (!archived.has(s)) active += 1;
      if (s === "new") neu += 1;
      if (s === "qualified") qualified += 1;
      if (s === "quoted") quoted += 1;
      if (s === "won" || s === "converted") won += 1;
      if (s === "lost") lost += 1;
    }
    return { all: regionFilteredLeads.length, active, new: neu, qualified, quoted, won, lost };
  }, [regionFilteredLeads]);

  const filteredLeads = useFuzzyItems(
    statusFilteredLeads,
    searchTerm,
    [
      { key: "client_name" as any, weight: 3 },
      { key: "client_email" as any, weight: 2 },
      { key: "company_name" as any, weight: 2 },
      { key: "event_type" as any, weight: 1 },
      { key: "notes" as any, weight: 1 },
    ],
    { limit: 0 },
  );

  const getStatusColor = (status: string) => {
    const colors = {
      new: "bg-blue-100 text-blue-800",
      contacted: "bg-yellow-100 text-yellow-800",
      qualified: "bg-purple-100 text-purple-800",
      converted: "bg-green-100 text-green-800",
      lost: "bg-slate-100 text-slate-800"
    };
    return colors[status as keyof typeof colors] || colors.new;
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Leads - CateringMS Admin</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 lg:pl-72 xl:pl-80">
        <div className="px-4 py-6 md:py-8 lg:py-12 max-w-full">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Leads</h1>
                <p className="text-slate-600">
                  Active enquiry pipeline. Once a quote is paid the lead becomes a{" "}
                  <Link href="/admin/clients" className="text-indigo-600 hover:underline font-medium">
                    client
                  </Link>
                  .
                </p>
              </div>
            </div>
            <Link href="/admin/leads/new">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Lead
              </Button>
            </Link>
          </div>

          {/* Email-settings warning banner. Renders only when we've
              resolved the email_settings row AND it's not configured.
              The auditors flagged that without a provider configured,
              every "we'll email you when..." path silently no-ops. */}
          {emailSettingsEnabled === false && (
            <div className="mb-6 p-4 rounded-lg border border-amber-200 bg-amber-50 flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <Mail className="w-4 h-4 text-amber-700" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-900">Email notifications are off</p>
                <p className="text-xs text-amber-800 mt-0.5">
                  No email provider is configured for your company. New embed-form leads, quote acceptances and lead alerts won't reach your inbox until you set this up. Configure Resend or your own SMTP in <Link href="/admin/email-settings" className="font-medium underline underline-offset-2">Email settings</Link>.
                </p>
              </div>
              <Link href="/admin/email-settings">
                <Button size="sm" variant="outline" className="border-amber-300 text-amber-900 hover:bg-amber-100 flex-shrink-0">
                  Set up
                </Button>
              </Link>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 flex items-center gap-1.5">Total Leads <InfoTooltip content={"Every lead on file for your company, across every status."} /></p>
                    <p className="text-2xl font-bold text-slate-900">{leads.length}</p>
                  </div>
                  <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 flex items-center gap-1.5">New <InfoTooltip content={"Fresh leads that have just come in and have not been worked yet."} /></p>
                    <p className="text-2xl font-bold text-blue-600">
                      {leads.filter(l => l.status === "new").length}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Plus className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 flex items-center gap-1.5">Qualified <InfoTooltip content={"Real opportunities that have been worked but not yet quoted."} /></p>
                    <p className="text-2xl font-bold text-purple-600">
                      {leads.filter(l => l.status === "qualified").length}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-purple-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 flex items-center gap-1.5">Won / Converted <InfoTooltip content={"Leads that turned into a confirmed booking."} /></p>
                    <p className="text-2xl font-bold text-green-600">
                      {leads.filter(l => l.status === "won" || l.status === "converted").length}
                    </p>
                  </div>
                  <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-0 shadow-lg">
            <CardHeader className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Search by name, company, email, event type..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              {/* Status chip strip. Active is the daily-driver default;
                  the archive chips (Won, Lost) are kept one click away
                  for win-back work and audits without polluting the
                  main pipeline view. */}
              <div className="flex flex-wrap items-center gap-2">
                {([
                  { key: "active",    label: "Active",    count: statusCounts.active,    tone: "primary" as const },
                  { key: "new",       label: "New",       count: statusCounts.new,       tone: "default" as const },
                  { key: "qualified", label: "Qualified", count: statusCounts.qualified, tone: "default" as const },
                  { key: "quoted",    label: "Quoted",    count: statusCounts.quoted,    tone: "default" as const },
                  { key: "won",       label: "Won (archive)",  count: statusCounts.won,  tone: "muted" as const },
                  { key: "lost",      label: "Lost (archive)", count: statusCounts.lost, tone: "muted" as const },
                  { key: "all",       label: "All",       count: statusCounts.all,       tone: "muted" as const },
                ]).map((chip) => {
                  const active = statusFilter === chip.key;
                  const base = "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors";
                  const cls = active
                    ? chip.tone === "primary"
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                      : chip.tone === "muted"
                        ? "bg-slate-700 text-white border-slate-700"
                        : "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50";
                  return (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={() => setStatusFilter(chip.key)}
                      className={`${base} ${cls}`}
                    >
                      {chip.label}
                      <span className={`ml-1.5 text-xs ${active ? "opacity-90" : "text-slate-500"}`}>
                        {chip.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-12 text-slate-600">Loading leads...</div>
              ) : filteredLeads.length === 0 ? (
                <div className="text-center py-12 text-slate-600">
                  <TrendingUp className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                  {statusFilter === "active" ? (
                    <>
                      <p className="font-medium">Your active pipeline is empty.</p>
                      <p className="text-sm text-slate-500 mt-1">
                        New enquiries land here automatically. Use the chips above to view archived leads.
                      </p>
                    </>
                  ) : (
                    <p>No leads match this filter.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredLeads.map((lead) => {
                    const links: LeadLinks = linksByLeadId.get(lead.id) || {
                      quoteCount: 0,
                      quotes: [],
                      latestQuoteId: null,
                      latestQuoteStatus: null,
                      orderId: null,
                      clientId: lead.converted_to_client_id ?? null,
                    };
                    const suggestion = deriveLeadSuggestion(lead, links);
                    const ageDays = lead.created_at
                      ? Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86_400_000)
                      : null;
                    return (
                    <div
                      key={lead.id}
                      className={`p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors ${
                        suggestion.tone === "urgent" ? "ring-2 ring-rose-200" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <h3 className="font-semibold text-slate-900">{lead.client_name}</h3>
                            <RegionBadge regionId={(lead as any).region_id} />
                            <Badge className={getStatusColor(lead.status || "new")}>
                              {lead.status || "new"}
                            </Badge>
                            {/* Provenance / conversion pills.
                                Single quote -> direct link.
                                Multiple quotes -> dropdown picker so the
                                operator can pick the right alternate
                                (caterers commonly send 2-3 to the same
                                lead -- buffet vs plated, 100 vs 150 pax). */}
                            {links.quoteCount === 1 && links.latestQuoteId && (
                              <Link
                                href={`/admin/quotes/new?fromQuoteId=${links.latestQuoteId}`}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-100"
                              >
                                <FileText className="w-3 h-3" />
                                1 quote
                              </Link>
                            )}
                            {links.quoteCount > 1 && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 hover:bg-blue-100"
                                  >
                                    <FileText className="w-3 h-3" />
                                    {links.quoteCount} quotes
                                    <ChevronDown className="w-3 h-3" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-72">
                                  {links.quotes.map((q) => (
                                    <DropdownMenuItem
                                      key={q.id}
                                      onClick={() => router.push(`/admin/quotes/new?fromQuoteId=${q.id}`)}
                                      className="flex flex-col items-start gap-0.5"
                                    >
                                      <span className="text-sm font-medium text-slate-900">
                                        {formatQuoteLabel(q)}
                                      </span>
                                      {q.createdAt && (
                                        <span className="text-[11px] text-slate-500">
                                          Created {new Date(q.createdAt).toLocaleDateString()}
                                        </span>
                                      )}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                            {links.orderId && (
                              <Link
                                href={`/admin/orders?orderId=${links.orderId}`}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 hover:bg-emerald-100"
                              >
                                <ShoppingCart className="w-3 h-3" />
                                booked
                              </Link>
                            )}
                            {links.clientId && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded px-1.5 py-0.5">
                                <UserCheck className="w-3 h-3" />
                                client
                              </span>
                            )}
                            {ageDays !== null && (
                              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                                <Clock className="w-3 h-3" />
                                {ageDays}d old
                              </span>
                            )}
                          </div>
                          {/* Suggested action strip, now clickable. Opens
                              the right next step (compose email, send a
                              quote, open the order, etc.) for this lead. */}
                          <button
                            type="button"
                            onClick={() => runSuggestionAction(lead, links, suggestion.kind)}
                            className={`group flex items-center gap-1.5 text-sm font-semibold mb-2 hover:underline focus:outline-none ${
                              suggestion.tone === "urgent"
                                ? "text-rose-600"
                                : suggestion.tone === "warm"
                                  ? "text-amber-600"
                                  : "text-slate-700"
                            }`}
                            title="Click to take this next step"
                          >
                            <ArrowRight className="w-4 h-4 flex-shrink-0" />
                            <span>{suggestion.label}</span>
                            <span className="font-normal text-xs text-slate-500 group-hover:text-slate-700">
                              · {suggestion.reason}
                            </span>
                          </button>
                          <div className="flex items-center gap-4 text-sm text-slate-600 flex-wrap">
                            {lead.company_name && (
                              <span className="flex items-center gap-1">
                                {lead.company_name}
                              </span>
                            )}
                            {lead.client_email && (
                              <span className="flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                {lead.client_email}
                              </span>
                            )}
                            {lead.client_phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {lead.client_phone}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-stretch gap-2 flex-shrink-0 min-w-[180px]">
                          {/* Primary CTA, always the suggested next step.
                              Uses the shared RowPrimaryAction so the colour
                              scheme matches Contacts and Quotes. */}
                          <RowPrimaryAction
                            tone={suggestion.tone}
                            icon={suggestionCtaIcon(suggestion.kind)}
                            label={suggestionCtaText(suggestion.kind)}
                            tooltip={suggestionCtaTooltip(suggestion.kind)}
                            onClick={() => runSuggestionAction(lead, links, suggestion.kind)}
                          />
                          <div className="flex items-center gap-1.5 justify-end flex-wrap">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setExpandedLeadId(expandedLeadId === lead.id ? null : lead.id)}
                            >
                              {expandedLeadId === lead.id ? "Hide" : "Details"}
                            </Button>
                            {/* Secondary "open / start a quote" button.
                                Only rendered when the primary CTA isn't
                                already routing to the same quote --
                                otherwise we end up with two buttons that
                                navigate to the same URL (Bobby flagged
                                this). */}
                            {(() => {
                              if (links.orderId) return null;
                              // Kinds whose primary CTA actually navigates
                              // straight into the quote builder. chase_quote
                              // and winback live in the email composer
                              // branch, so they DON'T belong here -- the
                              // secondary "Edit quote" button is exactly
                              // what an operator wants while chasing a
                              // quote that needs a quick tweak.
                              const primaryAlreadyOpensQuote = [
                                "open_quote_draft",
                                "convert_to_order",
                                "send_quote",
                              ].includes(suggestion.kind);
                              if (primaryAlreadyOpensQuote) return null;

                              // 0 quotes -> "New quote" button.
                              // 1 quote  -> "Edit quote" button (direct).
                              // 2+ quotes -> dropdown so the operator
                              //              picks which alternate to edit
                              //              (or starts a fresh one).
                              if (links.quoteCount === 0) {
                                return (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => router.push(`/admin/quotes/new?leadId=${lead.id}`)}
                                    className="gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
                                    title={`Start a fresh quote for ${lead.contact_name || lead.client_name || "this lead"}`}
                                  >
                                    <FileText className="w-3.5 h-3.5" />
                                    New quote
                                  </Button>
                                );
                              }
                              if (links.quoteCount === 1 && links.latestQuoteId) {
                                return (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => router.push(`/admin/quotes/new?fromQuoteId=${links.latestQuoteId}`)}
                                    className="gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
                                    title="Open the existing quote in the editable builder for a quick edit"
                                  >
                                    <FileText className="w-3.5 h-3.5" />
                                    Edit quote
                                  </Button>
                                );
                              }
                              return (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
                                      title="Pick which of the alternate quotes to edit"
                                    >
                                      <FileText className="w-3.5 h-3.5" />
                                      Edit quote
                                      <ChevronDown className="w-3.5 h-3.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-72">
                                    {links.quotes.map((q) => (
                                      <DropdownMenuItem
                                        key={q.id}
                                        onClick={() => router.push(`/admin/quotes/new?fromQuoteId=${q.id}`)}
                                        className="flex flex-col items-start gap-0.5"
                                      >
                                        <span className="text-sm font-medium text-slate-900">
                                          {formatQuoteLabel(q)}
                                        </span>
                                        {q.createdAt && (
                                          <span className="text-[11px] text-slate-500">
                                            Created {new Date(q.createdAt).toLocaleDateString()}
                                          </span>
                                        )}
                                      </DropdownMenuItem>
                                    ))}
                                    <DropdownMenuItem
                                      onClick={() => router.push(`/admin/quotes/new?leadId=${lead.id}`)}
                                      className="border-t border-slate-200 mt-1 pt-2 text-blue-700 font-medium"
                                    >
                                      <Plus className="w-3.5 h-3.5 mr-1" />
                                      Start a new quote
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              );
                            })()}
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Delete lead"
                              onClick={() => setDeleteTarget(lead)}
                              className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      {expandedLeadId === lead.id && (
                        <div className="mt-4 pt-4 border-t border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-slate-500 text-xs mb-1">Event Date</p>
                            <p className="text-slate-900 font-medium">
                              {lead.event_date ? new Date(lead.event_date).toLocaleDateString() : "TBD"}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-xs mb-1">Guests</p>
                            <p className="text-slate-900 font-medium">{lead.guest_count || "TBD"}</p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-xs mb-1">Event Type</p>
                            <p className="text-slate-900 font-medium">{lead.event_type || "Not specified"}</p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-xs mb-1">Estimated Value</p>
                            <p className="text-slate-900 font-medium">
                              {lead.estimated_value ? `R${Number(lead.estimated_value).toLocaleString()}` : "TBD"}
                            </p>
                          </div>
                          {lead.notes && (
                            <div className="col-span-2 md:col-span-4">
                              <p className="text-slate-500 text-xs mb-1">Notes</p>
                              <p className="text-slate-700">{lead.notes}</p>
                            </div>
                          )}
                          {/*
                            Menu picks from the client portal's rebook
                            form (requested_items JSONB). Displays as a
                            checklist the catering team can use as the
                            spine of the formal quote.
                          */}
                          {Array.isArray(lead.requested_items) && lead.requested_items.length > 0 && (
                            <div className="col-span-2 md:col-span-4">
                              <p className="text-slate-500 text-xs mb-1.5 flex items-center gap-1.5">
                                Items requested by client
                                <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                                  client portal
                                </span>
                              </p>
                              <ul className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
                                {lead.requested_items.map((it: any, i: number) => (
                                  <li
                                    key={`${it.menu_item_id || i}-${i}`}
                                    className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <span className="font-medium text-slate-900 truncate">
                                        {it.item_name}
                                      </span>
                                      {it.category && (
                                        <span className="ml-2 text-xs text-slate-400">
                                          {it.category}
                                        </span>
                                      )}
                                      {Array.isArray(it.dietary_tags) && it.dietary_tags.length > 0 && (
                                        <span className="ml-2 text-[11px] text-slate-500 capitalize">
                                          {it.dietary_tags.slice(0, 3).join(", ")}
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-sm font-semibold text-slate-700 flex-shrink-0">
                                      x{it.quantity}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                              <p className="text-[11px] text-slate-400 mt-1.5">
                                Pricing not set yet. Use these as the starting line items when you build the quote.
                              </p>
                            </div>
                          )}
                          {/*
                            Provenance: link back to the past order this
                            rebook came from, if any. Helps the team
                            replay context: who they are, what they
                            ordered last time.
                          */}
                          {lead.source_order_id && (
                            <div className="col-span-2 md:col-span-4">
                              <p className="text-[11px] text-slate-500">
                                Rebooked from past order
                                <Link
                                  href={`/admin/orders?orderId=${lead.source_order_id}`}
                                  className="ml-1.5 text-purple-600 hover:underline font-medium"
                                >
                                  view original
                                </Link>
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Footer />
      </div>

      {/* Lead compose drawer -- shared component, same UX as the Quote
          Management Compose drawer. Subject + body are pre-populated
          from the suggestion kind (Reply ASAP / Touch base / Win-back
          / etc.) with the lead's context woven in. The right rail
          shows the lead context (status, age, event date, source)
          so the operator never has to flick away while drafting. */}
      <ComposeDrawerHost
        open={!!composeLead}
        onClose={() => setComposeLead(null)}
      >
        {composeLead && (
          <LeadComposeDrawer
            lead={composeLead}
            kind={composeKind}
            fromName={fromName}
            companyId={profile?.company_id ?? null}
            onSent={async () => {
              // Mark the lead as 'contacted' if it was still 'new', so
              // the suggestion strip flips to 'Touch base' next time
              // and the team isn't nudged again on this lead.
              try {
                if ((composeLead.status || "new") === "new") {
                  await leadService.updateLead(composeLead.id, { status: "contacted" } as any);
                  setLeads((prev) => prev.map((l) =>
                    l.id === composeLead.id ? { ...l, status: "contacted" } : l,
                  ));
                }
              } catch (err) {
                // Non-fatal -- the email's already on its way.
                console.warn("[leads] auto status flip failed", err);
              }
            }}
            onClose={() => setComposeLead(null)}
          />
        )}
      </ComposeDrawerHost>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  <span className="block mb-2">
                    This permanently removes <span className="font-medium text-slate-900">{deleteTarget.client_name || "(unnamed)"}</span>
                    {deleteTarget.client_email && (
                      <> · {deleteTarget.client_email}</>
                    )}
                    {deleteTarget.event_date && (
                      <> · event {new Date(deleteTarget.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}</>
                    )}.
                  </span>
                  <span className="block text-rose-600">
                    This cannot be undone. Linked quotes are unaffected.
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
              {deleting ? "Deleting..." : "Delete lead"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ChatBot userRole="admin" companyId={user?.user_metadata?.company_id} />
    </>
  );
}

/**
 * Lead-side wrapper around the shared MessageComposer. Builds the
 * context-rail rows + the suggested template from the lead row and
 * the action kind the operator clicked.
 *
 * The template helper (templateForLeadAction) lives at module scope
 * so this component stays easy to test in isolation.
 */
function LeadComposeDrawer({
  lead, kind, fromName, companyId, onSent, onClose,
}: {
  lead: any;
  kind: LeadActionKind;
  fromName: string;
  companyId?: string | null;
  onSent: () => Promise<void> | void;
  onClose: () => void;
}) {
  const tpl = templateForLeadAction(kind, lead, fromName, companyId);

  const ageDays = lead.created_at
    ? Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86_400_000)
    : null;
  const eventDateLabel = lead.event_date
    ? new Date(lead.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
    : "Not set";

  const ctaText = suggestionCtaText(kind);
  const headerSubtitle =
    kind === "reply_email" ? "Brand-new enquiry, get a response across before they shop around."
    : kind === "touch_base" ? "A warm check-in to keep the lead warm without pushing too hard."
    : kind === "follow_up"  ? "It has gone quiet. Last chance to nudge before the lead goes cold."
    : kind === "chase_quote" ? "Quote sent, no reply. Friendly chase with the door still open."
    : kind === "winback"    ? "Quote did not land, soft win-back so we stay top of mind."
    : kind === "reopen"     ? "Lead is marked lost. Door-open note, no pressure."
    : "Personal follow-up. Sent through your own inbox so it looks like it came from you.";

  return (
    <MessageComposer
      icon={suggestionCtaIcon(kind)}
      title={`${ctaText} for ${lead.client_name || lead.contact_name || "this lead"}`}
      subtitle={headerSubtitle}
      contextLabel="This lead"
      contextRows={[
        { label: "Email",       value: lead.client_email || lead.email || "(none)", title: lead.client_email || lead.email || "(none)" },
        { label: "Phone",       value: lead.client_phone || lead.phone || "—" },
        { label: "Status",      value: lead.status || "new" },
        { label: "Source",      value: lead.source ? lead.source.replace(/_/g, " ") : "manual" },
        ...(lead.event_type ? [{ label: "Event type", value: lead.event_type as string }] : []),
        ...(lead.event_date ? [{ label: "Event date", value: eventDateLabel }] : []),
        ...(lead.guest_count != null ? [{ label: "Guests", value: String(lead.guest_count) }] : []),
        ...(lead.budget_range ? [{ label: "Budget", value: lead.budget_range as string }] : []),
        ...(ageDays !== null ? [{ label: "Lead age", value: `${ageDays}d`, divider: true }] : []),
      ]}
      recipient={{
        name: lead.client_name || lead.contact_name || "there",
        email: lead.client_email || lead.email || null,
        phone: lead.client_phone || lead.phone || null,
      }}
      template={{ subject: tpl.subject, body: tpl.body }}
      fromName={fromName}
      footerHint={
        "Edit freely, the wording is just a starting point based on this lead's status. Drag the left edge of this drawer to give yourself more room."
      }
      onSent={onSent}
      whatsapp={{
        kind: "client",
        ctx: {
          contactName: lead.client_name || lead.contact_name || "",
          eventName: lead.event_type || null,
          eventDate: lead.event_date
            ? new Date(lead.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })
            : null,
          guestCount: lead.guest_count ?? null,
          fromName,
        },
        templates: ["lead_followup", "quote_sent", "quote_chase"],
        defaultTemplate:
          kind === "reply_email" ? "lead_followup"
          : kind === "chase_quote" ? "quote_chase"
          : "lead_followup",
      }}
      onClose={onClose}
    />
  );
}