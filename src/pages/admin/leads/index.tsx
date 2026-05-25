import { useState, useEffect, useMemo, useRef, useCallback } from "react";
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
import { Plus, Search, Phone, Mail, DollarSign, TrendingUp, ArrowRight, FileText, ShoppingCart, UserCheck, Clock, Trash2, Send, MailQuestion, RefreshCw, ChevronDown, Download, X } from "lucide-react";
import { ConvertLeadDialog } from "@/components/admin/leads/ConvertLeadDialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { formatLocalDate } from "@/lib/localFormat";
import { toLocalISO } from "@/lib/localDate";
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
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useTenantHref } from "@/lib/tenantUrl";

// Per-lead provenance summary - which quotes/orders/clients have
// been spawned from this lead. Surfaced on the row so the catering
// team sees at a glance whether the lead is still "in the funnel" or
// already converted downstream.
/**
 * Slimmed-down quote shape we keep in memory for each lead. We only
 * need enough to label the picker (number, name, status, total, date)
 * and to route on click (id). Caterers routinely send 2+ alternate
 * quotes to the same lead - "buffet vs plated", "100 vs 150 guests" --
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

/**
 * Wave 70.32 - maps the linked order's status to a short pill label
 * + colour tone for the "this lead converted" pill on lead rows.
 * Previously the pill said a blanket "booked" no matter what state
 * the order was in - misleading when the order was still pending
 * or cancelled.
 */
function orderStatusBadge(status: string | null | undefined): { label: string; classes: string } | null {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s === "pending" || s === "draft" || s === "quote") {
    return { label: "Pending", classes: "text-amber-700 border-amber-200 bg-amber-50" };
  }
  if (s === "cancelled" || s === "declined" || s === "rejected") {
    return { label: "Cancelled", classes: "text-rose-700 border-rose-200 bg-rose-50" };
  }
  if (s === "confirmed") return { label: "Booked",    classes: "text-emerald-700 border-emerald-200 bg-emerald-50" };
  if (s === "preparing") return { label: "In prep",   classes: "text-purple-700 border-purple-200 bg-purple-50" };
  if (s === "ready")     return { label: "Ready",     classes: "text-blue-700 border-blue-200 bg-blue-50" };
  if (s === "in_transit") return { label: "Driving",  classes: "text-blue-700 border-blue-200 bg-blue-50" };
  if (s === "delivered") return { label: "Delivered", classes: "text-emerald-700 border-emerald-200 bg-emerald-50" };
  if (s === "completed" || s === "paid") return { label: "Completed", classes: "text-emerald-700 border-emerald-200 bg-emerald-50" };
  return { label: status[0].toUpperCase() + status.slice(1).replace(/_/g, " "), classes: "text-slate-700 border-slate-200 bg-slate-50" };
}

interface LeadLinks {
  quoteCount: number;
  /** Every quote attached to this lead, newest first. */
  quotes: LeadQuoteSummary[];
  /** Most recent quote id for this lead - used for the "View quote" chip. */
  latestQuoteId: string | null;
  latestQuoteStatus: string | null;
  /** Wave 70.82: every linked order id, across every quote attached
   *  to this lead. Pre-fix the page only tracked ONE orderId (the
   *  first converted-to-order seen) - so a client with both
   *  cancelled + live orders had their lead bucket flip to
   *  "archived" if the first walked quote happened to be the
   *  cancelled one. orderId below is the BEST (most-live) order id;
   *  orderStatus mirrors that one. */
  orderIds: string[];
  /** Best-live order id chosen from orderIds. Used by the chip
   *  math and the resolved view. */
  orderId: string | null;
  /** Status of the best-live order (or 'cancelled' if every linked
   *  order is cancelled). Was previously the first-walked order's
   *  status which lied on multi-order leads. */
  orderStatus: string | null;
  clientId: string | null;
  /**
   * Resolved event details, sourced (in priority order) from the linked
   * order, the latest quote, or the lead row itself. Drives the
   * accordion read-out so the operator sees the booked numbers, not the
   * stale enquiry guesses. `source` tells the UI which one we landed on
   * so we can show a small provenance caption.
   */
  resolved: {
    source: "order" | "quote" | "lead";
    /** Short human label for the source (order_number / quote_number / null). */
    sourceLabel: string | null;
    eventDate: string | null;
    guestCount: number | null;
    /** Best-effort event description: order.event_name -> quote.quote_name -> lead.event_type */
    eventType: string | null;
    /** Money figure: order/quote total_amount when available, else null. */
    estimatedValue: number | null;
    /** Optional venue name from the order, if it has one. */
    venueName: string | null;
  };
}

/**
 * Suggestion "kinds" map directly onto the call-to-action button on
 * each row. The labels above used to be decorative - now each kind
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
  // Wave 70.89: prefer last_contacted_at over created_at for the
  // "X days quiet" math. If the operator emailed a follow-up
  // yesterday, the lead isn't "23d quiet" today - it's "1d
  // quiet". Pre-fix the column didn't exist and the suggestion
  // would keep saying the lead was going cold forever even
  // after replies. Falls back to created_at on legacy rows that
  // haven't had a follow-up sent yet.
  const lastTouch = lead.last_contacted_at
    ? new Date(lead.last_contacted_at)
    : (lead.created_at ? new Date(lead.created_at) : null);
  const ageDays = lastTouch
    ? Math.floor((Date.now() - lastTouch.getTime()) / 86_400_000)
    : 0;
  const status = (lead.status || "new") as string;

  if (links.orderId) {
    // Wave 70.32 - reason mirrors the order's real status so a
    // pending order doesn't show "Already booked" misleadingly.
    const meta = orderStatusBadge(links.orderStatus);
    const reason = meta?.label === "Booked"     ? "Already booked"
                 : meta?.label === "Pending"    ? "Order pending confirmation"
                 : meta?.label === "Cancelled"  ? "Order cancelled"
                 : meta?.label                  ? `Order ${meta.label.toLowerCase()}`
                 : "Linked to order";
    return { tone: "neutral", label: "Open order", reason, kind: "view_order" };
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
  // Wave 70.82: contacted bucket. Pre-fix contacted leads fell into
  // the default "Reply ASAP - New enquiry waiting" branch even
  // though the operator had already replied (which is what flipped
  // the status to contacted in the first place). The right next
  // move on a contacted lead is to qualify them - learn the guest
  // count / event date / budget so the quote-builder can do its
  // job - not pretend the enquiry is new.
  if (status === "contacted") {
    if (ageDays >= 7) {
      return { tone: "urgent", label: "Qualify - they've gone quiet", reason: `${ageDays}d since first reply`, kind: "follow_up" };
    }
    return { tone: "warm", label: "Qualify the brief", reason: "Already replied - now gather event details", kind: "touch_base" };
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
    case "chase_quote":      return "Open the email composer with a 'just chasing on the quote' template. You've already sent one, time to nudge.";
    case "send_quote":       return "Jump straight into the rich quote builder, prefilled from this lead.";
    case "open_quote_draft": return "Open the existing draft quote in the editable builder so you can finish + send it.";
    case "convert_to_order": return "The client accepted the quote. Open it so you can convert it to an order.";
    case "winback":          return "Quote was rejected. Open the email composer with a soft win-back template.";
    case "reopen":           return "Re-open this lost lead with a low-pressure check-in email.";
    case "view_order":       return "This lead is already booked. Jump to the order.";
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

  // 1. Override path - silent fallback to default when no customisation.
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

function AdminLeadsInner() {
  const { user, profile } = useAuth() as any;
  // Email-settings status banner. If the tenant hasn't configured a
  // Resend or SMTP provider, embed-form / quote-acceptance / lead
  // notifications silently land in emailService's simulation branch
  // - they never actually reach the operator's inbox. Surface this
  // up-front on /admin/leads so the operator notices BEFORE the
  // first lead lands in their funnel.
  const [emailSettingsEnabled, setEmailSettingsEnabled] = useState<boolean | null>(null);
  // Wave 70.84: extracted into a stable callback so the Refresh
  // button can re-run it. Pre-fix the banner state only loaded
  // once on mount, so an operator who set up the provider in
  // another tab couldn't dismiss the banner without a full
  // page reload.
  const refreshEmailProviderStatus = useCallback(async () => {
    if (!user?.company_id) return;
    const { getEmailProviderStatus } = await import("@/lib/email/providerStatus");
    const status = await getEmailProviderStatus(supabase as any, user.company_id);
    setEmailSettingsEnabled(status.configured);
  }, [user?.company_id]);
  useEffect(() => {
    if (!user?.company_id) return;
    let cancelled = false;
    (async () => {
      // Wave 40.2: was querying email_settings (wrong table) by
      // user_id (wrong column) for resend_api_key_set / smtp_host
      // (columns that don't exist on that table). Net effect:
      // emailSettingsEnabled stayed null forever, the "Email is on"
      // banner could never read true. Helper queries the right
      // table (email_provider_settings) and applies the per-
      // provider readiness logic in one place.
      const { getEmailProviderStatus } = await import("@/lib/email/providerStatus");
      const status = await getEmailProviderStatus(supabase as any, user.company_id);
      if (cancelled) return;
      setEmailSettingsEnabled(status.configured);
    })();
    return () => { cancelled = true; };
  }, [user?.company_id]);
  const { regionFilterId } = useRegionFilter();
  const { toast } = useToast();
  const router = useRouter();
  // Wave 27: tenant-slug wrapper for every internal navigation. Keeps
  // the operator inside /spit-braai-delivery/admin/... when they
  // jump from a lead row to the linked quote / order / contact, or
  // when they convert a lead into a quote / order via the action
  // buttons. See src/lib/tenantUrl.ts.
  const { withSlug } = useTenantHref();
  const [leads, setLeads] = useState<any[]>([]);
  const [linksByLeadId, setLinksByLeadId] = useState<Map<string, LeadLinks>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  // Phase 26 #4: "/" or Cmd-F focuses the search input.
  // Phase 29 #3: "n" jumps to /admin/leads/new.
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
        router.push(withSlug("/admin/leads/new"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Default to "active" - the pipeline view. Leads that have already
  // won/converted are clients now, and lost leads are archived. Hiding
  // them by default stops the leads page from doubling as a graveyard.
  // The chip strip below lets the team toggle into archived buckets
  // when they want to do win-back or audit work.
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Bulk-import modal state. Same engine as Contacts and the
  // onboarding wizard, scoped to the leads target.
  // Import + add surface moved to /admin/contacts - see comment on
  // the hidden buttons above. Modal mount + state removed below.

  // Compose drawer state - mirrors the Quotes page so both surfaces
  // give the team the same rich follow-up flow (subject, body, four
  // send channels, recipient context rail, drag-to-resize). Email
  // CTAs on each row open this drawer rather than skipping straight
  // to Gmail.
  const [composeLead, setComposeLead] = useState<any | null>(null);
  // Phase 27 #2: ?leadId scrolls to and highlights the matching row.
  // Used by the dashboard's LeadAging + NewLeadsToday widgets so
  // the sales lead lands exactly on the row they were chasing.
  const [focusedLeadId, setFocusedLeadId] = useState<string | null>(null);
  useEffect(() => {
    if (!router.isReady || loading) return;
    const target = typeof router.query.leadId === "string" ? router.query.leadId : null;
    if (!target) return;
    setStatusFilter("all");
    setSearchTerm("");
    setFocusedLeadId(target);
    const t = setTimeout(() => {
      const el = typeof document !== "undefined"
        ? document.getElementById(`lead-row-${target}`)
        : null;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    const clearT = setTimeout(() => setFocusedLeadId(null), 4000);
    const { leadId: _drop, ...rest } = router.query;
    router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
    return () => { clearTimeout(t); clearTimeout(clearT); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.leadId, loading]);
  const [composeKind, setComposeKind] = useState<LeadActionKind>("reply_email");

  // Convert-to-order confirmation modal. Replaces the legacy
  // "/admin/quotes/new?fromQuoteId=..." redirect (which only cloned
  // the quote rather than booking the order). Pre-flight checks the
  // lead's quote state and routes to the right next step.
  const [convertLead, setConvertLead] = useState<any | null>(null);

  const fromName = profile?.full_name || profile?.company_name || "the team";

  // Wave 70.88: flip a lead to "quoted" when the operator starts
  // building a quote from it. Only flips upstream statuses (new /
  // contacted / qualified) - never downgrades a lead that's
  // already in negotiating / won / converted / lost. Updates the
  // local state optimistically so the row's chip reflects the
  // new status before the page refetches.
  const flipLeadToQuoted = async (lead: any) => {
    const current = String(lead.status || "new").toLowerCase();
    const upstream = new Set(["new", "contacted", "qualified"]);
    if (!upstream.has(current)) return;
    try {
      await leadService.updateLead(lead.id, { status: "quoted" } as any);
      setLeads((prev) => prev.map((l) =>
        l.id === lead.id ? { ...l, status: "quoted" } : l,
      ));
    } catch {
      // Non-fatal - operator is already navigating to the quote
      // builder; next page reload will re-read the real status.
    }
  };

  const runSuggestionAction = (lead: any, links: LeadLinks, kind: LeadActionKind) => {
    if (kind === "view_order" && links.orderId) {
      router.push(withSlug(`/order/${links.orderId}`));
      return;
    }
    if (kind === "convert_to_order") {
      // Open the proper confirmation dialog. The dialog re-checks the
      // lead's quote state on open and either offers a Confirm button
      // (accepted quote ready), a "go accept the quote first" CTA
      // (draft / sent quotes only), or a "create a quote" CTA
      // (no quotes yet). On success the dialog hits
      // POST /api/admin/leads/:id/convert-to-order which atomically
      // books the order and stamps the lead.
      setConvertLead(lead);
      return;
    }
    if (kind === "open_quote_draft" && links.latestQuoteId) {
      router.push(withSlug(`/admin/quotes/new?fromQuoteId=${links.latestQuoteId}`));
      return;
    }
    if (kind === "send_quote") {
      // Wave 70.88: flip the lead status to "quoted" before
      // navigating. Pre-fix the lead stayed in its current
      // bucket forever (new / qualified / contacted) even
      // after the operator started building a quote, so the
      // funnel KPIs lied. We DO NOT downgrade leads that are
      // already past quoted (negotiating / won / converted)
      // since those are progressed states.
      void flipLeadToQuoted(lead);
      router.push(withSlug(`/admin/quotes/new?leadId=${lead.id}`));
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
      // Wave 70.83: dropped production console.error - the toast
      // below already surfaces the failure to the operator.
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

  // LDS-A (leads audit, LDS-2): supabase realtime sub on leads +
  // quotes + orders filtered by company_id. When a quote is sent
  // from /admin/quotes or an order lands from acceptance, the lead
  // row's status + suggested-action recompute without a manual
  // refresh. Mirrors the CAL-2 / CTS-2 pattern.
  useEffect(() => {
    const companyId = user?.company_id;
    if (!companyId) return;
    // Wave 70.90: debounce + v2 cleanup. The leads page re-runs
    // leadService.getLeads + 4 follow-on queries on every realtime
    // event. Pre-fix a bulk-import or a 50-order day's worth of
    // status updates fired N full re-aggregations. 250ms debounce
    // collapses bursts; supabase.removeChannel(v2) releases the
    // channel object cleanly. Same pattern shipped on tracking +
    // dispatch + contacts.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refetch = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        loadLeads();
      }, 250);
    };
    const sub = supabase
      .channel(`leads-${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "leads",  filter: `company_id=eq.${companyId}` }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "quotes", filter: `company_id=eq.${companyId}` }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `company_id=eq.${companyId}` }, refetch)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(sub);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id]);

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
          orderIds: [],
          orderId: null,
          orderStatus: null,
          clientId: l.converted_to_client_id ?? null,
          // Default the resolved view to the lead row - keeps things
          // working for brand-new leads with no quote/order yet. We
          // overwrite this below once we know about a linked order or
          // a latest quote.
          resolved: {
            source: "lead",
            sourceLabel: null,
            eventDate: l.event_date ?? null,
            guestCount: l.guest_count ?? null,
            eventType: l.event_type ?? null,
            estimatedValue: typeof l.estimated_value === "number" ? l.estimated_value : null,
            venueName: null,
          },
        });
      });
      if (leadIds.length > 0) {
        // Build a client_id -> lead_id reverse index for leads that
        // have already converted to a client. Lets us catch quotes
        // that were created later off the Quotes page (no lead_id
        // stamped) but for the same client - a common flow when the
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
          // Wave 70.82: collect every linked order across all
          // attached quotes. The best-live one is picked once we
          // know each order's status (later in this load).
          if (q.converted_to_order_id && !cur.orderIds.includes(q.converted_to_order_id)) {
            cur.orderIds.push(q.converted_to_order_id);
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

        // Hydrate the "resolved" view of each lead's event details.
        // Priority order: linked order > latest quote > lead row. We
        // batch these into two queries so the page never N+1s, even
        // when every lead has been booked.
        //
        // 1. Pull the orders we know are linked (from converted_to_order_id
        //    on quotes).
        // 2. Pull the latest-quote details for leads that have a quote
        //    but no order - the quote summaries above only carry totals
        //    and numbers, not event_date / guest_count, so we need a
        //    second select. We fetch all matching quote rows (cheap)
        //    and pick the right one per lead from the latestQuoteId.
        // Wave 70.82: union every linked order across every lead
        // (was just the first orderId per lead). After we have each
        // order's status we'll pick the best-live one back into
        // cur.orderId / cur.orderStatus.
        const allOrderIds = new Set<string>();
        const latestQuoteIds: string[] = [];
        for (const cur of map.values()) {
          if (cur.orderIds.length > 0) {
            for (const id of cur.orderIds) allOrderIds.add(id);
          } else if (cur.latestQuoteId) {
            latestQuoteIds.push(cur.latestQuoteId);
          }
        }
        const orderIds = Array.from(allOrderIds);

        const [{ data: orderRows }, { data: quoteDetailRows }] = await Promise.all([
          orderIds.length > 0
            ? supabase
                .from("orders")
                // Wave 70.32: pull status so the badge / subtitle can
                // tell the truth about the order's real state (was a
                // blanket "booked" before, misleading for pending /
                // cancelled orders).
                .select("id, order_number, event_name, event_date, guest_count, venue_name, total_amount, status")
                .in("id", orderIds)
            : Promise.resolve({ data: [] as any[] }),
          latestQuoteIds.length > 0
            ? supabase
                .from("quotes")
                .select("id, quote_number, quote_name, event_date, guest_count, total_amount")
                .in("id", latestQuoteIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);

        const ordersById = new Map<string, any>();
        for (const o of orderRows || []) ordersById.set(o.id, o);
        const quotesById = new Map<string, any>();
        for (const q of quoteDetailRows || []) quotesById.set(q.id, q);

        // Wave 70.82: pick the best-live order per lead. Priority
        // tracks the order lifecycle: a confirmed / preparing /
        // ready / in_transit / delivered / completed order outranks
        // a pending one; pending outranks cancelled. The chip math
        // below then reads cur.orderStatus and only archives the
        // lead if there's no live order at all - so a multi-order
        // client with cancelled history + a live booking stays in
        // the "quoted" / "won" bucket where they belong.
        const STATUS_PRIORITY: Record<string, number> = {
          confirmed: 100, preparing: 95, ready: 90,
          in_transit: 85, delivered: 80, completed: 75,
          pending: 50, draft: 40,
          cancelled: 0, rejected: 0,
        };
        for (const cur of map.values()) {
          if (cur.orderIds.length === 0) continue;
          let bestId: string | null = null;
          let bestPriority = -1;
          for (const id of cur.orderIds) {
            const o = ordersById.get(id);
            const s = (o?.status || "").toLowerCase();
            const p = STATUS_PRIORITY[s] ?? 30;
            if (p > bestPriority) {
              bestPriority = p;
              bestId = id;
            }
          }
          cur.orderId = bestId;
        }

        for (const [leadId, cur] of map.entries()) {
          const lead = data.find((l: any) => l.id === leadId);
          if (cur.orderId && ordersById.has(cur.orderId)) {
            const o = ordersById.get(cur.orderId);
            // Wave 70.32: capture the actual order status so the
            // badge + provenance caption can show the real state
            // rather than a misleading "booked" word.
            cur.orderStatus = o.status ?? null;
            cur.resolved = {
              source: "order",
              sourceLabel: o.order_number || cur.orderId.slice(0, 8),
              eventDate: o.event_date ?? lead?.event_date ?? null,
              guestCount: o.guest_count ?? lead?.guest_count ?? null,
              // Orders don't have an event_type column, but event_name
              // is the operator-facing description ("Smith corporate
              // lunch"). Fall back to the lead's event_type if event_name
              // somehow isn't set.
              eventType: o.event_name || lead?.event_type || null,
              estimatedValue: typeof o.total_amount === "number" ? o.total_amount : null,
              venueName: o.venue_name || null,
            };
          } else if (cur.latestQuoteId && quotesById.has(cur.latestQuoteId)) {
            const q = quotesById.get(cur.latestQuoteId);
            cur.resolved = {
              source: "quote",
              sourceLabel: q.quote_number || cur.latestQuoteId.slice(0, 8),
              eventDate: q.event_date ?? lead?.event_date ?? null,
              guestCount: q.guest_count ?? lead?.guest_count ?? null,
              // Quotes don't store event_type either - quote_name is
              // the closest equivalent ("Wedding cocktail buffet"). Fall
              // back to the lead's event_type when the quote name is
              // generic.
              eventType: q.quote_name || lead?.event_type || null,
              estimatedValue: typeof q.total_amount === "number" ? q.total_amount : null,
              venueName: null,
            };
          }
          // Else leave the default lead-sourced resolved view in place.
        }
      }
      setLinksByLeadId(map);
    } catch {
      // Wave 70.83: dropped production console.error. Failures
      // bubble through the empty-state / toast paths below.
    } finally {
      setLoading(false);
    }
  };

  // Apply status filter first, then fuzzy-rank the remainder. Searches
  // across name, email, company, event type and notes so a query like
  // "wedding 25" still surfaces a lead with that event type + guest count.
  // "active" is the synthetic default - everything that's still in the
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

  // Wave 70.43b - lead is considered archived (out of "Active")
  // when EITHER its own status is in (won/converted/lost) OR its
  // linked order has been cancelled. Bobby flagged a lead with a
  // cancelled order still showing in the Active tab - the lead's
  // own status was "quoted" so the previous filter let it through,
  // even though the order it converted to had been cancelled.
  // Same logic as Wave 70.42b on the quotes page.
  const isLeadArchived = (lead: any, links: LeadLinks | undefined): boolean => {
    const s = (lead?.status || "new") as string;
    if (s === "won" || s === "converted" || s === "lost") return true;
    const orderStatus = (links?.orderStatus || "").toLowerCase();
    if (orderStatus === "cancelled" || orderStatus === "rejected") return true;
    return false;
  };

  const statusFilteredLeads = useMemo(() => {
    if (statusFilter === "all") return regionFilteredLeads;
    if (statusFilter === "active") {
      return regionFilteredLeads.filter((l) => !isLeadArchived(l, linksByLeadId.get(l.id)));
    }
    if (statusFilter === "lost") {
      // Lost now includes leads whose linked order was cancelled.
      return regionFilteredLeads.filter((l) => {
        if (l.status === "lost") return true;
        const orderStatus = (linksByLeadId.get(l.id)?.orderStatus || "").toLowerCase();
        return orderStatus === "cancelled" || orderStatus === "rejected";
      });
    }
    if (statusFilter === "won") {
      // Single chip covers both legacy "converted" rows and the new "won".
      return regionFilteredLeads.filter((l) => l.status === "won" || l.status === "converted");
    }
    return regionFilteredLeads.filter((l) => l.status === statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionFilteredLeads, statusFilter, linksByLeadId]);

  // Counts for the chip strip. Computed once so chips render with live
  // pipeline weight without re-walking the array per chip.
  const statusCounts = useMemo(() => {
    let active = 0, neu = 0, qualified = 0, quoted = 0, won = 0, lost = 0;
    for (const l of regionFilteredLeads) {
      const s = l.status || "new";
      const links = linksByLeadId.get(l.id);
      const cancelledOrder = (links?.orderStatus || "").toLowerCase() === "cancelled"
        || (links?.orderStatus || "").toLowerCase() === "rejected";
      if (!isLeadArchived(l, links)) active += 1;
      if (s === "new" && !cancelledOrder) neu += 1;
      if (s === "qualified" && !cancelledOrder) qualified += 1;
      if (s === "quoted" && !cancelledOrder) quoted += 1;
      if (s === "won" || s === "converted") won += 1;
      // Lost count also includes cancelled-order leads (mirrors the
      // statusFilteredLeads "lost" branch).
      if (s === "lost" || cancelledOrder) lost += 1;
    }
    return { all: regionFilteredLeads.length, active, new: neu, qualified, quoted, won, lost };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionFilteredLeads, linksByLeadId]);

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
                  Structured enquiry capture. When someone asks for catering through an embed form, email, or phone call, create a lead to track event details (type, guest count, budget, venue, source) before quoting. Leads also appear in your{" "}
                  <Link href={withSlug("/admin/contacts")} className="text-indigo-600 hover:underline font-medium">
                    Contacts inbox
                  </Link>
                  {" "}automatically.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {/*
                Bulk import lives on /admin/contacts only - one
                import surface across the whole CRM. The unified
                wizard auto-classifies each row by event_date so
                "Import leads" here is redundant.
                Add Lead stays - /admin/leads/new is the
                rich-enquiry-capture form (event type, guest count,
                budget, venue, source) that the leaner Add contact
                doesn't cover.
              */}
              {/* Phase 19 #4: lead CSV export. Sales keeps wanting an
                  offline list of the current pipeline for handover,
                  prospecting reports, and outreach planning. Exports
                  exactly what the user is looking at (the filter-
                  applied + fuzzy-search filtered set) so what they
                  see is what they get. */}
              <Button
                variant="outline"
                onClick={() => {
                  if (filteredLeads.length === 0) {
                    toast({ title: "Nothing to export", description: "Adjust filters until at least one lead is visible." });
                    return;
                  }
                  const esc = (v: any) => {
                    if (v == null) return "";
                    const s = String(v).replace(/"/g, '""');
                    return /[",\n]/.test(s) ? `"${s}"` : s;
                  };
                  const headers = [
                    "Created", "Status", "Name", "Email", "Phone", "Company",
                    "Event type", "Event date", "Guest count", "Budget", "Venue", "Source", "Notes",
                  ];
                  const lines = [headers.join(",")];
                  for (const l of filteredLeads as any[]) {
                    lines.push([
                      esc(l.created_at ? toLocalISO(new Date(l.created_at)) : ""),
                      esc(l.status || ""),
                      esc(l.client_name || ""),
                      esc(l.client_email || ""),
                      esc(l.client_phone || ""),
                      esc(l.company_name || ""),
                      esc(l.event_type || ""),
                      esc(l.event_date || ""),
                      esc(l.guest_count ?? ""),
                      esc(l.budget_range || ""),
                      esc(l.venue_address || ""),
                      esc(l.source || ""),
                      esc(l.notes || ""),
                    ].join(","));
                  }
                  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `leads-${toLocalISO(new Date())}.csv`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
              {/* Phase 27 #6: manual refresh. Inbound enquiry channel
                  is real-time; sales reps want to pick up overnight
                  leads without hard-reloading. */}
              <Button
                variant="outline"
                onClick={() => {
                  // Wave 70.84: refresh button re-runs both the
                  // leads fetch AND the email-provider banner
                  // check. Previously the banner state was stuck
                  // from mount, so configuring a provider in
                  // another tab needed a full reload to clear.
                  loadLeads();
                  void refreshEmailProviderStatus();
                }}
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Link href={withSlug("/admin/leads/new")}>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Lead
                </Button>
              </Link>
            </div>
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
                  No email provider is configured for your company. New embed-form leads, quote acceptances and lead alerts won't reach your inbox until you set this up. Configure Resend or your own SMTP in <Link href={withSlug("/admin/email-settings")} className="font-medium underline underline-offset-2">Email settings</Link>.
                </p>
              </div>
              <Link href={withSlug("/admin/email-settings")}>
                <Button size="sm" variant="outline" className="border-amber-300 text-amber-900 hover:bg-amber-100 flex-shrink-0">
                  Set up
                </Button>
              </Link>
            </div>
          )}

          {/* Wave 70.82: KPI tiles now read from the SAME source the
              chip strip uses (regionFilteredLeads + statusCounts) so
              a branch-scoped operator no longer sees mismatched
              numbers between the tiles and chips. New/Qualified/
              Quoted apply the same cancelled-order exclusion the
              chip math does (a lead whose ONLY linked order is
              cancelled is archived). Total Leads also respects
              the region filter. */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <Card className="border-0 shadow-lg">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-600 flex items-center gap-1.5">Total Leads <InfoTooltip content={"Every lead on file for your company (or this branch if you've filtered), across every status."} /></p>
                    <p className="text-2xl font-bold text-slate-900">{statusCounts.all}</p>
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
                    <p className="text-sm text-slate-600 flex items-center gap-1.5">New <InfoTooltip content={"Fresh leads that have just come in and have not been worked yet. Leads whose only linked order was cancelled are excluded - those land in Lost (archive)."} /></p>
                    <p className="text-2xl font-bold text-blue-600">
                      {statusCounts.new}
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
                      {statusCounts.qualified}
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
                      {statusCounts.won}
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
                    ref={searchRef}
                    placeholder="Search by name, company, email, event type... (press /)"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-10"
                  />
                  {/* Phase 25 #1: clear-search affordance, matching
                      the Phase 24 #7-10 sweep across orders /
                      quotes / contacts / invoices. */}
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                      title="Clear search"
                      aria-label="Clear search"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
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
                      orderIds: [],
                      orderId: null,
                      orderStatus: null,
                      clientId: lead.converted_to_client_id ?? null,
                      resolved: {
                        source: "lead",
                        sourceLabel: null,
                        eventDate: lead.event_date ?? null,
                        guestCount: lead.guest_count ?? null,
                        eventType: lead.event_type ?? null,
                        estimatedValue: typeof lead.estimated_value === "number" ? lead.estimated_value : null,
                        venueName: null,
                      },
                    };
                    const suggestion = deriveLeadSuggestion(lead, links);
                    const ageDays = lead.created_at
                      ? Math.floor((Date.now() - new Date(lead.created_at).getTime()) / 86_400_000)
                      : null;
                    return (
                    <div
                      key={lead.id}
                      id={`lead-row-${lead.id}`}
                      className={`p-4 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors ${
                        suggestion.tone === "urgent" ? "ring-2 ring-rose-200" : ""
                      } ${
                        focusedLeadId === lead.id ? "ring-2 ring-amber-400 ring-inset bg-amber-50 animate-pulse" : ""
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
                            {/* Wave 70.85: unreachable-lead guard. A
                                lead with no email AND no phone can't
                                be contacted from the system at all -
                                the operator wastes a click on the
                                red Send-follow-up CTA, gets a toast
                                saying "no email", and learns the
                                hard way. Amber chip surfaces the
                                problem on the row so the next move
                                is obvious. */}
                            {!lead.client_email && !lead.client_phone && (
                              <Badge
                                className="bg-amber-100 text-amber-800 border-amber-200 gap-1"
                                title="No email or phone on this lead - the operator can't contact them from inside the system. Open Details to add a channel."
                              >
                                <MailQuestion className="w-3 h-3" />
                                Unreachable
                              </Badge>
                            )}
                            {/* Wave 70.86: past event_date warning. A
                                lead with an event date in the past
                                is either already played out (move to
                                Won / Lost) or stale (archive). Either
                                way the row shouldn't read as a fresh
                                opportunity. Rose chip surfaces the
                                stale-date so the operator re-qualifies
                                or archives. Hidden once the lead is
                                won / lost / converted (the archive
                                bucket already covers it). */}
                            {(() => {
                              const eventDate = links.resolved.eventDate || lead.event_date;
                              if (!eventDate) return null;
                              const status = (lead.status || "new").toLowerCase();
                              if (status === "won" || status === "converted" || status === "lost") return null;
                              const todayIso = toLocalISO(new Date());
                              const ed = String(eventDate).slice(0, 10);
                              if (ed >= todayIso) return null;
                              return (
                                <Badge
                                  className="bg-rose-50 text-rose-800 border-rose-200 gap-1"
                                  title={`Event date ${ed} has already passed. Re-qualify the lead with a new date or mark Lost / Won.`}
                                >
                                  <Clock className="w-3 h-3" />
                                  Event date passed
                                </Badge>
                              );
                            })()}
                            {/* Provenance / conversion pills.
                                Single quote -> direct link.
                                Multiple quotes -> dropdown picker so the
                                operator can pick the right alternate
                                (caterers commonly send 2-3 to the same
                                lead - buffet vs plated, 100 vs 150 pax). */}
                            {links.quoteCount === 1 && links.latestQuoteId && (
                              <Link
                                href={withSlug(`/admin/quotes/new?fromQuoteId=${links.latestQuoteId}`)}
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
                                      onClick={() => router.push(withSlug(`/admin/quotes/new?fromQuoteId=${q.id}`))}
                                      className="flex flex-col items-start gap-0.5"
                                    >
                                      <span className="text-sm font-medium text-slate-900">
                                        {formatQuoteLabel(q)}
                                      </span>
                                      {q.createdAt && (
                                        <span className="text-[11px] text-slate-500">
                                          Created {formatLocalDate(q.createdAt)}
                                        </span>
                                      )}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                            {links.orderId && (() => {
                              // Wave 70.32 - pill colour + label
                              // reflect the order's actual status.
                              // Falls back to "linked order" when
                              // status hasn't hydrated yet.
                              const meta = orderStatusBadge(links.orderStatus);
                              const label = meta?.label ?? "Linked";
                              const classes = meta?.classes ?? "text-slate-700 border-slate-200 bg-slate-50 hover:bg-slate-100";
                              const hoverClasses = meta?.label === "Booked" || meta?.label === "Delivered" || meta?.label === "Completed"
                                ? "hover:bg-emerald-100"
                                : meta?.label === "Pending"   ? "hover:bg-amber-100"
                                : meta?.label === "Cancelled" ? "hover:bg-rose-100"
                                : meta?.label === "In prep"   ? "hover:bg-purple-100"
                                : meta?.label === "Ready" || meta?.label === "Driving" ? "hover:bg-blue-100"
                                : "hover:bg-slate-100";
                              return (
                                <Link
                                  href={withSlug(`/order/${links.orderId}`)}
                                  className={`inline-flex items-center gap-1 text-[11px] font-medium border rounded px-1.5 py-0.5 ${classes} ${hoverClasses}`}
                                  title={`Linked order is ${label.toLowerCase()}. Click to open.`}
                                >
                                  <ShoppingCart className="w-3 h-3" />
                                  {label.toLowerCase()}
                                </Link>
                              );
                            })()}
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
                              <a
                                href={`tel:${lead.client_phone}`}
                                className="flex items-center gap-1 hover:text-slate-900 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Phone className="w-3 h-3" />
                                {lead.client_phone}
                              </a>
                            )}
                          </div>
                        </div>
                        {/* Wave 70.87: action column min-width is now
                            responsive. Pre-fix the fixed min-w-[180px]
                            forced a vertical split with long client
                            names on phones (~360px width = 180px
                            action col + 180px detail col, but a name
                            like "Khanyi Mbatha + family" wraps). At
                            < sm the column drops the min-width and
                            stretches full width below the detail
                            block. */}
                        <div className="flex flex-col items-stretch gap-2 flex-shrink-0 w-full sm:w-auto sm:min-w-[180px]">
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
                              // branch, so they DON'T belong here - the
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
                                    // Wave 70.88: flip the lead to
                                    // quoted before navigating, same
                                    // as the suggestion CTA's
                                    // send_quote path.
                                    onClick={() => {
                                      void flipLeadToQuoted(lead);
                                      router.push(withSlug(`/admin/quotes/new?leadId=${lead.id}`));
                                    }}
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
                                    onClick={() => router.push(withSlug(`/admin/quotes/new?fromQuoteId=${links.latestQuoteId}`))}
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
                                        onClick={() => router.push(withSlug(`/admin/quotes/new?fromQuoteId=${q.id}`))}
                                        className="flex flex-col items-start gap-0.5"
                                      >
                                        <span className="text-sm font-medium text-slate-900">
                                          {formatQuoteLabel(q)}
                                        </span>
                                        {q.createdAt && (
                                          <span className="text-[11px] text-slate-500">
                                            Created {formatLocalDate(q.createdAt)}
                                          </span>
                                        )}
                                      </DropdownMenuItem>
                                    ))}
                                    <DropdownMenuItem
                                      onClick={() => router.push(withSlug(`/admin/quotes/new?leadId=${lead.id}`))}
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
                        <div className="mt-4 pt-4 border-t border-slate-200 text-sm">
                          {/* Provenance caption - tells the operator
                              which underlying record we're reading
                              from. Keeps drift bugs visible: if a
                              booked lead reads the lead row, the team
                              knows immediately. */}
                          <p className="text-xs text-slate-500 mb-3">
                            {links.resolved.source === "order"
                              // Wave 70.32 - caption verb reflects
                              // the order's real status. "Booked" only
                              // when the order really is confirmed-or-
                              // later. Pending/cancelled etc. read
                              // honestly so the operator isn't misled.
                              ? (() => {
                                  const meta = orderStatusBadge(links.orderStatus);
                                  const verb = !meta
                                    ? "Pulled from order"
                                    : meta.label === "Booked"     ? "Pulled from booked order"
                                    : meta.label === "Pending"    ? "Pulled from pending order"
                                    : meta.label === "Cancelled"  ? "Pulled from cancelled order"
                                    : `Pulled from ${meta.label.toLowerCase()} order`;
                                  return `${verb} ${links.resolved.sourceLabel || ""}`.trim();
                                })()
                              : links.resolved.source === "quote"
                                ? `Pulled from quote ${links.resolved.sourceLabel || ""}`.trim()
                                : "From the original enquiry"}
                            {links.resolved.source !== "lead" && links.resolved.venueName && (
                              <> · {links.resolved.venueName}</>
                            )}
                          </p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div>
                            <p className="text-slate-500 text-xs mb-1">Event Date</p>
                            <p className="text-slate-900 font-medium">
                              {links.resolved.eventDate
                                ? formatLocalDate(links.resolved.eventDate)
                                : "TBD"}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-xs mb-1">Guests</p>
                            <p className="text-slate-900 font-medium">
                              {links.resolved.guestCount || "TBD"}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-xs mb-1">Event Type</p>
                            <p className="text-slate-900 font-medium">
                              {links.resolved.eventType || "Not specified"}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-xs mb-1">Estimated Value</p>
                            <p className="text-slate-900 font-medium">
                              {typeof links.resolved.estimatedValue === "number" && links.resolved.estimatedValue > 0
                                ? `R${Math.round(links.resolved.estimatedValue).toLocaleString()}`
                                : "TBD"}
                            </p>
                          </div>
                          </div>
                          {lead.notes && (
                            <div className="mt-4">
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
                            <div className="mt-4">
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
                            <div className="mt-4">
                              <p className="text-[11px] text-slate-500">
                                Rebooked from past order
                                <Link
                                  href={withSlug(`/order/${lead.source_order_id}`)}
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

      {/* Lead compose drawer - shared component, same UX as the Quote
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
              // Wave 70.89: stamp last_contacted_at on every send,
              // not just the "new -> contacted" transition. The
              // suggestion engine reads this to compute "X days
              // quiet" instead of the old "X days since created"
              // (which kept claiming a freshly-contacted lead was
              // going cold). Flip to 'contacted' only when the
              // lead was still 'new'.
              try {
                const patch: Record<string, any> = { last_contacted_at: new Date().toISOString() };
                const wasNew = (composeLead.status || "new") === "new";
                if (wasNew) patch.status = "contacted";
                await leadService.updateLead(composeLead.id, patch as any);
                setLeads((prev) => prev.map((l) =>
                  l.id === composeLead.id
                    ? {
                        ...l,
                        last_contacted_at: patch.last_contacted_at,
                        status: wasNew ? "contacted" : l.status,
                      }
                    : l,
                ));
              } catch {
                // Non-fatal - the email's already on its way; the
                // worst case is the stamp didn't land and the
                // operator sees a stale "Xd quiet" until next
                // refresh.
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

      {/* Bulk-import modal removed - imports live on /admin/contacts now. */}

      {/* Lead -> order conversion dialog. Pre-flight checks the
          lead's quote state and routes to the right next step
          (confirm, accept-quote-first, or create-quote-first). */}
      <ConvertLeadDialog
        open={!!convertLead}
        onOpenChange={(o) => {
          if (!o) setConvertLead(null);
        }}
        lead={convertLead}
        onConverted={({ orderId, orderNumber }) => {
          toast({
            title: "Order created",
            description: orderNumber
              ? `Booked as ${orderNumber}.`
              : "Lead converted to a confirmed order.",
          });
          setConvertLead(null);
          // Refresh the leads page in the background so the row picks
          // up the new "booked" pill on return, and deep-link straight
          // into the new orders dashboard with the order pre-selected.
          void loadLeads();
          router.push(withSlug(`/order/${orderId}`));
        }}
      />
    </>
  );
}

// LDS-A (LDS-10): leads is the sales_admin's primary CRM surface.
// Middleware already gates /admin/* to them; matching the component-
// level rule. Region admin reads via RLS narrowing.
export default function AdminLeads() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SALES_ADMIN, UserRole.REGION_ADMIN]}>
      <AdminLeadsInner />
    </ProtectedRoute>
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