/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * Catering CRM -- a single view of every person ever on this company's
 * radar (existing client, lead, anyone who placed an order). For each
 * one we compute a status (hot lead / active / quiet / cold / VIP / etc),
 * a suggested next action, and surface a quick-mail panel with Gmail,
 * Outlook, default mail and clipboard options. No bulk send -- this is
 * for the personal "drop them a hi" follow-ups that Mailchimp doesn't do.
 *
 * Silicon Valley UX touches:
 * - Smart filter chips with live counts at the top
 * - "/" and Cmd+F focus the search instantly
 * - Keyboard arrow keys move between rows; Enter opens the contact
 * - Optimistic mark-as-contacted (last_contacted_at written to localStorage
 *   for now until we ship the contacts log table)
 * - Suggested action chip on every row colour-coded to urgency
 */
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { logPiiAccess } from "@/services/piiAccessLogService";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ComposeDrawerHost } from "@/components/messaging/ComposeDrawerHost";
import { MessageComposer } from "@/components/messaging/MessageComposer";
import { RowPrimaryAction } from "@/components/admin/RowPrimaryAction";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Search, Mail, Phone, Users, Sparkles, Flame, Clock, AlertTriangle, Snowflake, Crown, Send, Inbox, ShoppingCart, CheckCircle2, RefreshCw, Filter, Plus, Pencil, Trash2, Ban, FileText, Upload, Download, X } from "lucide-react";
import { ImportRecordsModal } from "@/components/admin/ImportRecordsModal";
import { Checkbox } from "@/components/ui/checkbox";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types/app";
import { supabase } from "@/integrations/supabase/client";
import { composeEmail, templateFor, type ClientStatus } from "@/lib/composeEmail";
import { WhatsAppButton } from "@/components/messaging/WhatsAppButton";
import { trackRecentlyViewed } from "@/components/admin/RecentlyViewedWidget";
import type { ClientWhatsAppKind } from "@/lib/whatsappTemplates";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { useSortable, type ColumnDef } from "@/lib/useSortable";
import { SortHeader } from "@/components/ui/sort-header";
import { toLocalISO } from "@/lib/localDate";
import { useTenantHref } from "@/lib/tenantUrl";

interface Contact {
  key: string;          // canonical de-dupe key (lower-cased email or name)
  source: "client" | "lead" | "order_only";
  /** Underlying clients-table row id, set when source is 'client' or
   *  when a lead/order row was promoted by an Add. Drives Edit/Delete
   *  on the row -- if null, those actions are hidden. */
  clientId: string | null;
  /** Every lead row that merged into this contact. Used by the
   *  delete handler so a single bin click sweeps the lead, the
   *  client, and the orders together. */
  leadIds: string[];
  /** Every order row matched to this contact by email/name. Same
   *  reason -- delete fans out across all backing records. */
  orderIds: string[];
  /** Every quote row matched to this contact. Lets the delete fan
   *  out wipe their quote history at the same time. */
  quoteIds: string[];
  /** Every invoice row matched to this contact (via order_id). */
  invoiceIds: string[];
  name: string;
  email: string | null;
  phone: string | null;
  mobile_number: string | null;
  landline_number: string | null;
  // Imported-history rollup (Feature B). Sums into LTV display when
  // present so a freshly-imported client doesn't look brand new.
  historicalTotalEvents: number | null;
  historicalLifetimeSpend: number | null;
  historicalLastEventDate: string | null;
  // Source attribution (Feature C). When set, the contact card
  // shows "Imported via X.xlsx" so operators can trace lineage and
  // know which batch a record came in on.
  importedFilename: string | null;
  // Aggregated metrics
  orderCount: number;
  totalSpent: number;
  lastEventDate: string | null;     // most recent past event
  nextEventDate: string | null;     // next upcoming event
  outstandingBalance: number;
  // Lead-side
  leadStatus: string | null;
  leadSource: string | null;
  // Derived
  daysSinceLastTouch: number | null;
  status: ClientStatus;
  suggestion: { tone: "urgent" | "warm" | "neutral"; label: string; reason: string };
  createdAt: string | null;
  /** Phase 8 #10: free-form customer tags from clients.tags. */
  tags: string[];
  /** Phase 16 #4: client_type from clients.client_type. Surfaced
   *  as a small Individual / Company badge on the contact row so
   *  the sales rep doesn't have to open the dialog to check. */
  clientType: string | null;
}

const STATUS_META: Record<ClientStatus, {
  label: string; tone: string; icon: typeof Flame;
}> = {
  hot_lead:  { label: "Hot lead",     tone: "bg-red-100 text-red-700 border-red-200",         icon: Flame },
  quoted:    { label: "Quoted",       tone: "bg-orange-100 text-orange-700 border-orange-200", icon: Mail },
  won:       { label: "Won",          tone: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle2 },
  active:    { label: "Active",       tone: "bg-green-100 text-green-700 border-green-200",   icon: Sparkles },
  returning: { label: "Returning",    tone: "bg-blue-100 text-blue-700 border-blue-200",       icon: RefreshCw },
  vip:       { label: "VIP",          tone: "bg-purple-100 text-purple-700 border-purple-200", icon: Crown },
  quiet:     { label: "Quiet",        tone: "bg-amber-100 text-amber-700 border-amber-200",   icon: Clock },
  cold:      { label: "Cold",         tone: "bg-slate-100 text-slate-600 border-slate-200",   icon: Snowflake },
  lost:      { label: "Lost",         tone: "bg-rose-100 text-rose-700 border-rose-200",      icon: AlertTriangle },
};

// Every status in STATUS_META gets a pill so the segment counts add up to the
// "All" total. Previously "won" and "returning" were defined as statuses but
// not rendered, so imported clients with no leads/orders (which fall through
// to status="won") were invisible to every filter -- making "All=604" while
// the visible pills summed to 2.
const FILTERS: Array<{ id: "all" | ClientStatus; label: string }> = [
  { id: "all",       label: "All" },
  { id: "hot_lead",  label: "Hot leads" },
  { id: "quoted",    label: "Quoted" },
  { id: "won",       label: "Won" },
  { id: "active",    label: "Active" },
  { id: "returning", label: "Returning" },
  { id: "vip",       label: "VIP" },
  { id: "quiet",     label: "Quiet" },
  { id: "cold",      label: "Cold" },
  { id: "lost",      label: "Lost" },
];

const daysBetween = (from: Date, to: Date) =>
  Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));

const fmtMoney = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });

function ClientsCRM() {
  const { user, profile } = useAuth() as any;
  // Resilient companyId resolution. Different auth paths populate
  // different fields -- profile.company_id is the canonical one but
  // user.user_metadata.company_id and user.company_id are both used
  // by sibling pages (client-search, leads). Read all three so a
  // partial auth bootstrap doesn't leave the page empty.
  const companyId =
    (profile as any)?.company_id ||
    (user as any)?.company_id ||
    (user as any)?.user_metadata?.company_id ||
    null;
  const { toast } = useToast();
  const router = useRouter();
  // Wave 27: tenant-slug wrapper for internal navigations.
  const { withSlug } = useTenantHref();
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  // Phase 23 #7: seed the search box from ?q on mount so the
  // dashboard's TopClients widget (and any future inbound link)
  // can deep-link a pre-filtered contacts view. Runs once when
  // router.isReady flips so SSR rehydration doesn't fight us.
  useEffect(() => {
    if (!router.isReady) return;
    const q = typeof router.query.q === "string" ? router.query.q : "";
    if (q) setSearch(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);
  // Default to Hot leads instead of All so the first paint isn't
  // blocked rendering thousands of cold/lost rows the operator
  // rarely needs first thing. The All chip stays one click away.
  // ?clientId / ?q deep-links flip back to "all" inside their own
  // effects so a row jump still finds the target.
  const [filter, setFilter] = useState<"all" | ClientStatus>("hot_lead");
  // Phase 9 #4: tag filter. Multi-select set of tag strings; a
  // contact passes if it has at least one of the selected tags.
  // Empty set means no tag filter is active.
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set());
  // Phase 16 #8: saved-view chips. Sales reps with several
  // standing segments ('VIPs', 'Active in JHB', 'Hot leads
  // unread') had to manually re-set the status pill + tag
  // filter + search box every switch. Snapshot all three
  // dimensions under a named chip in localStorage.
  interface SavedContactView {
    id: string;
    name: string;
    filter: "all" | ClientStatus;
    search: string;
    tags: string[];
  }
  const [savedContactViews, setSavedContactViews] = useState<SavedContactView[]>([]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("cateringms.adminContacts.savedViews.v1");
      if (raw) setSavedContactViews(JSON.parse(raw) as SavedContactView[]);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        "cateringms.adminContacts.savedViews.v1",
        JSON.stringify(savedContactViews),
      );
    } catch { /* storage blocked */ }
  }, [savedContactViews]);
  const saveCurrentContactView = () => {
    if (typeof window === "undefined") return;
    const name = window.prompt("Name this view:", "");
    if (!name || !name.trim()) return;
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    setSavedContactViews((prev) => [
      ...prev.filter((v) => v.name.toLowerCase() !== name.trim().toLowerCase()),
      { id, name: name.trim(), filter, search, tags: Array.from(tagFilter) },
    ]);
  };
  const applySavedContactView = (v: SavedContactView) => {
    setFilter(v.filter);
    setSearch(v.search);
    setTagFilter(new Set(v.tags));
  };
  const removeSavedContactView = (id: string) => {
    setSavedContactViews((prev) => prev.filter((v) => v.id !== id));
  };
  const [active, setActive] = useState<Contact | null>(null);
  // Phase 18 #2: track opened contact for the recently-viewed
  // widget on /admin/dashboard. Fires when the compose drawer
  // opens, which covers every meaningful 'open' on the page.
  useEffect(() => {
    if (!active?.key) return;
    const id = active.clientId || active.key;
    trackRecentlyViewed({
      id,
      type: "contact",
      label: active.name || active.email || "Unknown contact",
      href: "/admin/contacts",
    });
  }, [active?.key, active?.clientId, active?.name, active?.email]);
  const [contactedKeys, setContactedKeys] = useState<Record<string, string>>({});
  const searchRef = useRef<HTMLInputElement>(null);
  // CRUD state. `editing` carries an existing client id to load + update;
  // `null` means a fresh add. `confirmDelete` keeps the contact whose row
  // the operator clicked the bin on so we can show a confirm prompt before
  // soft-deleting.
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Contact | null>(null);
  // Bulk-import modal -- "Import clients" button feeds the same engine
  // the onboarding wizard uses. After commit we reload the contact list.
  const [importOpen, setImportOpen] = useState(false);
  // Block-list opt-in stamped at delete time. Default off so a quick
  // bin-click doesn't quietly cut off a real client; the operator has
  // to tick "Block from future comms" deliberately.
  const [deleteBlockToo, setDeleteBlockToo] = useState(false);
  // Typing-confirm gate. When the contact has live orders attached,
  // the operator has to type the contact's name to enable the Delete
  // button. Stops a careless click from wiping a paying customer.
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  // Deep-link focus. When the page loads with ?clientId=... (typically
  // from Client Search), we find the matching contact row, scroll it
  // into view, and ring it for a few seconds so the operator lands on
  // the right person instead of scanning the full list.
  const [focusedContactKey, setFocusedContactKey] = useState<string | null>(null);

  // Load contactedKeys from localStorage
  useEffect(() => {
    if (!companyId) return;
    const raw = localStorage.getItem(`crm-contacted-${companyId}`);
    if (raw) try { setContactedKeys(JSON.parse(raw)); } catch { /* noop */ }
  }, [companyId]);

  // Save contactedKeys to localStorage on change
  useEffect(() => {
    if (!companyId) return;
    localStorage.setItem(`crm-contacted-${companyId}`, JSON.stringify(contactedKeys));
  }, [contactedKeys, companyId]);

  // Pull from clients + leads + orders, merge by lowercased email.
  // Extracted so Add/Edit/Delete can reload after writes.
  const loadContacts = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    // Page through clients in 1000-row chunks. PostgREST silently caps a
    // single response at 1000 rows, so a customer who imports 5,000
    // contacts would otherwise only ever see the first 1000 here.
    const fetchAllClients = async () => {
      const out: any[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const to = from + PAGE - 1;
        const { data, error } = await supabase
          .from("clients")
          .select("id, client_name, email, phone, mobile_number, landline_number, client_type, is_active, outstanding_balance, created_at, historical_total_events, historical_lifetime_spend, historical_last_event_date, imported_filename, tags")
          .eq("company_id", companyId)
          .is("deleted_at", null)
          .range(from, to);
        if (error) return { data: out, error };
        const rows = data || [];
        out.push(...rows);
        if (rows.length < PAGE) break;
        // Hard cap so a runaway query can't DOS the page. 50k contacts
        // is far above any reasonable single-tenant book.
        if (out.length >= 50000) break;
      }
      return { data: out, error: null };
    };
    const [clientsRes, leadsRes, ordersRes, quotesRes, invoicesRes] = await Promise.all([
      fetchAllClients(),
      supabase
        .from("leads")
        .select("id, contact_name, email, phone, mobile_number, landline_number, status, source, event_date, created_at, imported_filename")
        .eq("company_id", companyId)
        .is("deleted_at", null),
      supabase
        .from("orders")
        .select("id, client_name, client_email, client_phone, event_date, total_amount, status, payment_status, created_at")
        .eq("company_id", companyId)
        .is("deleted_at", null),
      supabase
        .from("quotes")
        .select("id, client_name, client_email, client_id, lead_id")
        .eq("company_id", companyId)
        .is("deleted_at", null),
      supabase
        .from("invoices")
        .select("id, client_id, order_id")
        .eq("company_id", companyId)
        .is("deleted_at", null),
    ]);

    // Surface fetch errors loudly. The aggregator below treats null
    // data as an empty list, which silently produced an empty page
    // when a fetch failed (RLS hiccup, bad column ref, etc.). With
    // 906 imported clients in production we can't keep guessing.
    const fetchErrors: string[] = [];
    if ((clientsRes as any)?.error) fetchErrors.push(`clients: ${(clientsRes as any).error.message}`);
    if (leadsRes.error) fetchErrors.push(`leads: ${leadsRes.error.message}`);
    if (ordersRes.error) fetchErrors.push(`orders: ${ordersRes.error.message}`);
    if (quotesRes.error) fetchErrors.push(`quotes: ${quotesRes.error.message}`);
    if (invoicesRes.error) fetchErrors.push(`invoices: ${invoicesRes.error.message}`);
    if (fetchErrors.length > 0) {
      console.error("[contacts] fetch errors:", fetchErrors);
      toast({
        title: "Couldn't load all contacts",
        description: fetchErrors.join(" · "),
        variant: "destructive",
      });
    }
    // Diagnostic log so we can see exactly what came back when the
    // page renders empty. Counts only -- no PII.
    console.info("[contacts] loaded:", {
      clients: (clientsRes as any)?.data?.length ?? 0,
      leads: leadsRes.data?.length ?? 0,
      orders: ordersRes.data?.length ?? 0,
      quotes: quotesRes.data?.length ?? 0,
      invoices: invoicesRes.data?.length ?? 0,
    });

      const today = new Date();
      const map = new Map<string, Contact>();
      // Order id -> contact key, populated when we walk the orders.
      // Lets us bind invoices back to the right contact when the
      // invoice's only link is via order_id.
      const orderIdToKey = new Map<string, string>();
      // Client id -> contact key, populated from the clients seed.
      // Same purpose for quote.client_id and invoice.client_id.
      const clientIdToKey = new Map<string, string>();

      const keyOf = (email: string | null, name: string | null) =>
        (email || name || "").toLowerCase().trim() || `unknown-${Math.random()}`;

      // Seed from clients
      (clientsRes.data || []).forEach((c: any) => {
        const k = keyOf(c.email, c.client_name);
        clientIdToKey.set(c.id, k);
        map.set(k, {
          key: k,
          source: "client",
          clientId: c.id,
          leadIds: [],
          orderIds: [],
          quoteIds: [],
          invoiceIds: [],
          name: c.client_name || "Unnamed",
          email: c.email,
          phone: c.phone,
          mobile_number: c.mobile_number ?? null,
          landline_number: c.landline_number ?? null,
          historicalTotalEvents: c.historical_total_events ?? null,
          historicalLifetimeSpend: c.historical_lifetime_spend != null ? Number(c.historical_lifetime_spend) : null,
          historicalLastEventDate: c.historical_last_event_date ?? null,
          importedFilename: c.imported_filename ?? null,
          orderCount: 0, totalSpent: 0,
          lastEventDate: null, nextEventDate: null,
          outstandingBalance: Number(c.outstanding_balance || 0),
          leadStatus: null, leadSource: null,
          daysSinceLastTouch: null,
          status: "won",
          suggestion: { tone: "neutral", label: "Stay in touch", reason: "Existing client" },
          createdAt: c.created_at,
          tags: Array.isArray(c.tags) ? (c.tags as string[]) : [],
          clientType: c.client_type || null,
        });
      });

      // Merge leads
      (leadsRes.data || []).forEach((l: any) => {
        const k = keyOf(l.email, l.contact_name);
        const existing = map.get(k);
        if (existing) {
          existing.leadStatus = l.status;
          existing.leadSource = l.source;
          existing.leadIds.push(l.id);
          if (!existing.phone && l.phone) existing.phone = l.phone;
          if (!existing.email && l.email) existing.email = l.email;
        } else {
          map.set(k, {
            key: k,
            source: "lead",
            clientId: null,
            leadIds: [l.id],
            orderIds: [],
            quoteIds: [],
            invoiceIds: [],
            name: l.contact_name || "Unnamed lead",
            email: l.email,
            phone: l.phone,
            mobile_number: l.mobile_number ?? null,
            landline_number: l.landline_number ?? null,
            historicalTotalEvents: null,
            historicalLifetimeSpend: null,
            historicalLastEventDate: null,
            importedFilename: l.imported_filename ?? null,
            orderCount: 0, totalSpent: 0,
            lastEventDate: null, nextEventDate: null,
            outstandingBalance: 0,
            leadStatus: l.status,
            leadSource: l.source,
            daysSinceLastTouch: null,
            status: "hot_lead",
            suggestion: { tone: "urgent", label: "Reply within 24h", reason: "Lead waiting" },
            createdAt: l.created_at,
            tags: [],
            clientType: null,
          });
        }
      });

      // Aggregate orders into whichever contact they match
      const todayISO = toLocalISO(today);
      (ordersRes.data || []).forEach((o: any) => {
        if (!o.client_email && !o.client_name) return;
        const k = keyOf(o.client_email, o.client_name);
        let c = map.get(k);
        if (!c) {
          c = {
            key: k,
            source: "order_only",
            clientId: null,
            leadIds: [],
            orderIds: [],
            quoteIds: [],
            invoiceIds: [],
            name: o.client_name || "Unnamed",
            email: o.client_email,
            phone: o.client_phone,
            mobile_number: null,
            landline_number: null,
            historicalTotalEvents: null,
            historicalLifetimeSpend: null,
            historicalLastEventDate: null,
            importedFilename: null,
            orderCount: 0, totalSpent: 0,
            lastEventDate: null, nextEventDate: null,
            outstandingBalance: 0,
            leadStatus: null, leadSource: null,
            daysSinceLastTouch: null,
            status: "won",
            suggestion: { tone: "neutral", label: "Stay in touch", reason: "Past customer" },
            createdAt: o.created_at,
            tags: [],
            clientType: null,
          };
          map.set(k, c);
        }
        c.orderIds.push(o.id);
        // We index orderId -> contact key here so the invoices merge
        // below can resolve invoice.order_id back to the right person
        // even when the invoice has no client_id (legacy orders).
        orderIdToKey.set(o.id, k);
        const status = String(o.status || "").toLowerCase();
        if (status !== "cancelled") {
          c.orderCount += 1;
          c.totalSpent += Number(o.total_amount || 0);
          if (o.event_date <= todayISO) {
            if (!c.lastEventDate || o.event_date > c.lastEventDate) c.lastEventDate = o.event_date;
          } else {
            if (!c.nextEventDate || o.event_date < c.nextEventDate) c.nextEventDate = o.event_date;
          }
        }
      });

      // Merge quotes. Resolve which contact each quote belongs to:
      // (1) client_id mapping if the quote was promoted from a client
      // (2) email/name fallback for legacy quotes where client_id is null
      (quotesRes.data || []).forEach((q: any) => {
        let k: string | null = null;
        if (q.client_id && clientIdToKey.has(q.client_id)) {
          k = clientIdToKey.get(q.client_id)!;
        } else {
          k = keyOf(q.client_email, q.client_name);
        }
        if (!k) return;
        const existing = map.get(k);
        if (existing) existing.quoteIds.push(q.id);
      });

      // Merge invoices. invoice.client_id is the cleanest path; fall
      // back to invoice.order_id -> orders.client_email mapping if the
      // invoice predates the lifecycle backbone work.
      (invoicesRes.data || []).forEach((inv: any) => {
        let k: string | null = null;
        if (inv.client_id && clientIdToKey.has(inv.client_id)) {
          k = clientIdToKey.get(inv.client_id)!;
        } else if (inv.order_id && orderIdToKey.has(inv.order_id)) {
          k = orderIdToKey.get(inv.order_id)!;
        }
        if (!k) return;
        const existing = map.get(k);
        if (existing) existing.invoiceIds.push(inv.id);
      });

      // Compute status + suggestion per contact
      for (const c of map.values()) {
        const last = c.lastEventDate ? new Date(c.lastEventDate) : (c.createdAt ? new Date(c.createdAt) : null);
        const next = c.nextEventDate ? new Date(c.nextEventDate) : null;
        c.daysSinceLastTouch = last ? daysBetween(last, today) : null;

        // Status logic
        if (c.totalSpent >= 75000 || c.outstandingBalance > 0) {
          c.status = "vip";
        } else if (next) {
          // Has upcoming event -- active
          c.status = "active";
        } else if (c.orderCount >= 2 && c.daysSinceLastTouch !== null && c.daysSinceLastTouch <= 90) {
          c.status = "returning";
        } else if (c.orderCount >= 1 && c.daysSinceLastTouch !== null && c.daysSinceLastTouch <= 90) {
          c.status = "won";
        } else if (c.orderCount >= 1 && c.daysSinceLastTouch !== null && c.daysSinceLastTouch <= 180) {
          c.status = "quiet";
        } else if (c.orderCount >= 1) {
          c.status = "cold";
        } else if (c.leadStatus === "lost") {
          c.status = "lost";
        } else if (c.leadStatus === "quoted" || c.leadStatus === "qualified") {
          c.status = "quoted";
        } else if (c.leadStatus) {
          c.status = "hot_lead";
        } else {
          // Fallthrough: imported contacts with no orders, no quotes, no
          // leads. Previously fell to "won" which was wrong (a contact
          // that's never bought anything isn't a won deal) and meant
          // bulk-imported lists landed under a pill that wasn't even
          // rendered. "cold" is the honest label.
          c.status = "cold";
        }

        // Suggestion based on status + recency
        const daysSinceCreated = c.createdAt ? daysBetween(new Date(c.createdAt), today) : 0;
        switch (c.status) {
          case "hot_lead":
            c.suggestion = daysSinceCreated > 7
              ? { tone: "urgent", label: "Follow up - 7+ days quiet", reason: "Lead is going cold" }
              : { tone: "urgent", label: "Reply ASAP", reason: "New enquiry waiting" };
            break;
          case "quoted":
            c.suggestion = daysSinceCreated > 5
              ? { tone: "urgent", label: "Chase the quote", reason: `Quoted ${daysSinceCreated}d ago` }
              : { tone: "warm", label: "Confirm interest", reason: "Quote sent recently" };
            break;
          case "active":
            const eventInDays = next ? daysBetween(today, next) : 999;
            c.suggestion = eventInDays <= 7
              ? { tone: "urgent", label: `Confirm - ${eventInDays}d to event`, reason: "Event imminent" }
              : { tone: "warm", label: "Confirm details", reason: `Event in ${eventInDays}d` };
            break;
          case "vip":
            c.suggestion = (c.daysSinceLastTouch ?? 0) > 30
              ? { tone: "warm", label: "Drop a hi", reason: `Quiet ${c.daysSinceLastTouch}d` }
              : { tone: "neutral", label: "Recently engaged", reason: "VIP" };
            break;
          case "quiet":
            c.suggestion = { tone: "warm", label: "Re-engage", reason: `${c.daysSinceLastTouch}d since last event` };
            break;
          case "cold":
            c.suggestion = { tone: "warm", label: "Win-back nudge", reason: `${c.daysSinceLastTouch}d quiet` };
            break;
          case "lost":
            c.suggestion = { tone: "neutral", label: "Door open", reason: "Lead was lost" };
            break;
          default:
            c.suggestion = { tone: "neutral", label: "Stay in touch", reason: "Past customer" };
        }
      }

      setContacts(Array.from(map.values()).sort((a, b) => {
        const order = { urgent: 0, warm: 1, neutral: 2 };
        return order[a.suggestion.tone] - order[b.suggestion.tone];
      }));
      setLoading(false);
  }, [companyId]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  // Deep-link handler -- when /admin/contacts?clientId=<uuid> is in
  // the URL (typically from Client Search), find the contact whose
  // backing client row matches, drop any active filter so the row is
  // reachable, scroll it into view and amber-ring it for a few
  // seconds. Strip the param afterwards so a refresh doesn't re-fire.
  useEffect(() => {
    if (!router.isReady) return;
    const target = typeof router.query.clientId === "string" ? router.query.clientId : null;
    if (!target) return;
    if (loading || contacts.length === 0) return;
    const match = contacts.find((c) => c.clientId === target);
    if (!match) return;

    setFilter("all");
    setSearch("");
    setFocusedContactKey(match.key);
    // Auto-open the compose drawer so operators get the same "see
    // everything about this contact" landing they expect from a
    // profile-view button.
    setActive(match);

    const t = setTimeout(() => {
      const el = typeof document !== "undefined"
        ? document.getElementById(`contact-row-${match.key}`)
        : null;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    const clearT = setTimeout(() => setFocusedContactKey(null), 4000);

    const { clientId: _drop, ...rest } = router.query;
    router.replace(
      { pathname: router.pathname, query: rest },
      undefined,
      { shallow: true },
    );

    return () => { clearTimeout(t); clearTimeout(clearT); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.clientId, loading, contacts]);

  // "/" or Cmd+F focuses the search box -- a tiny SV touch.
  // Phase 29 #8: "n" opens the Add contact dialog.
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
        setEditing(null);
        setFormOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const counts = useMemo(() => {
    const n = { all: contacts.length } as Record<string, number>;
    for (const c of contacts) n[c.status] = (n[c.status] || 0) + 1;
    return n;
  }, [contacts]);

  // All distinct tags currently in use across the loaded book.
  // Powers the tag-filter chip strip so the operator only sees
  // tags that actually exist on at least one contact.
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of contacts) for (const t of c.tags) set.add(t);
    return Array.from(set).sort();
  }, [contacts]);

  // Phase 9 #7: lead source breakdown. Counts how many contacts
  // came in via each lead source (website, referral, instagram,
  // walk-in etc.) so the marketing lead can see which channels
  // are actually pulling. Only counts contacts where leadSource
  // is set (i.e. contacts that came in as a lead at some point).
  const sourceBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    let withSource = 0;
    for (const c of contacts) {
      const s = (c.leadSource || "").trim().toLowerCase();
      if (!s) continue;
      counts[s] = (counts[s] || 0) + 1;
      withSource++;
    }
    const ranked = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    return { ranked, withSource };
  }, [contacts]);
  // Status filter is applied first so the fuzzy matcher only ranks contacts
  // the user is currently scoped to (e.g. "VIPs called Sarah"). Tag filter
  // (Phase 9 #4) layers on top -- a contact passes if it carries at
  // least one of the selected tags.
  const statusFiltered = useMemo(() => {
    let base = filter === "all" ? contacts : contacts.filter((c) => c.status === filter);
    if (tagFilter.size > 0) {
      base = base.filter((c) => c.tags.some((t) => tagFilter.has(t)));
    }
    return base;
  }, [contacts, filter, tagFilter]);

  // Smart fuzzy search across name, email, phone with name weighted highest.
  // The hook debounces and scores -- gives us prefix > substring > fuzzy.
  const fuzzyVisible = useFuzzyItems(
    statusFiltered,
    search,
    [
      { key: "name" as any, weight: 3 },
      { key: "email" as any, weight: 2 },
      { key: "phone" as any, weight: 1 },
    ],
    { limit: 0 },
  );

  // Column-sort wrapping. Default to "Suggested action urgency" via the
  // Status column ranking, but the user can click any header to flip
  // the order. Search ranking still applies first (we sort the fuzzy
  // result, not the source list).
  const sortColumns: ColumnDef<Contact>[] = useMemo(() => [
    { key: "name",      accessor: (r) => r.name,                                       type: "string" },
    { key: "status",    accessor: (r) => STATUS_META[r.status]?.label || r.status,     type: "string" },
    { key: "action",    accessor: (r) => STATUS_META[r.status]?.label || r.status,     type: "string" },
    { key: "orders",    accessor: (r) => r.orderCount,                                 type: "number" },
    { key: "spent",     accessor: (r) => r.totalSpent + (r.historicalLifetimeSpend ?? 0), type: "number" },
    { key: "lastTouch", accessor: (r) => r.daysSinceLastTouch ?? Number.POSITIVE_INFINITY, type: "number" },
  ], []);
  const sortedView = useSortable<Contact>(fuzzyVisible as Contact[], sortColumns, { defaultKey: "name", defaultDir: "asc" });
  const allVisible = sortedView.rows;
  // Render cap. The aggregation runs over the full book so the
  // pill counts + filters stay accurate, but rendering 7500+
  // table rows in a single pass tanked the page (8s+ to first
  // paint on a busy tenant). We render the first DISPLAY_CAP rows
  // by default and let the operator opt into 'show all'. Search /
  // status / tag filters bypass the cap because they're already
  // narrow enough.
  const DISPLAY_CAP = 500;
  const [showAll, setShowAll] = useState(false);
  // Reset 'show all' when filters change so a heavy view doesn't
  // re-explode after the operator narrows then widens again.
  useEffect(() => { setShowAll(false); }, [filter, search, tagFilter]);
  const filtersActive = filter !== "all" || search.trim().length > 0 || tagFilter.size > 0;
  const visible = (filtersActive || showAll) ? allVisible : allVisible.slice(0, DISPLAY_CAP);
  const cappedCount = allVisible.length - visible.length;

  const markContacted = (key: string) => {
    setContactedKeys((prev) => ({ ...prev, [key]: new Date().toISOString() }));
  };

  return (
    <>
      <NoIndexMeta />
      <Head><title>Contacts - CateringMS Admin</title></Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80">
        <div className="px-3 sm:px-4 md:px-6 pt-20 lg:pt-6 pb-6 max-w-screen-2xl">

          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg flex-shrink-0">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                  Contacts
                </h1>
                <p className="text-sm sm:text-base text-slate-600 mt-1">
                  Your CRM inbox. Everyone you've touched so far, leads and clients combined, sorted by suggested next action.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  ref={searchRef}
                  placeholder="Search name, email, phone... (press /)"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 pr-9 w-64 sm:w-80"
                />
                {/* Phase 24 #9: clear-search affordance, matching
                    /admin/orders + /admin/quotes. */}
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
              {/* Phase 15 #9: manual refresh. With the page now
                  capped at 500 rows (perf fix) operators sometimes
                  add a contact in another tab and don't see it
                  here without a hard reload. Single button +
                  loading spinner re-runs loadContacts. */}
              <Button
                variant="outline"
                onClick={() => loadContacts()}
                disabled={loading}
                className="gap-1.5"
                title="Re-pull the contact aggregate from the DB"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              {/* Phase 13 #2: bulk CSV export of the currently
                  filtered contact list (status + tag filters +
                  search all flow through fuzzyVisible). Marketing
                  team needed a way to pull a segment for a Mailchimp
                  / SendGrid blast without bouncing through the DB. */}
              <Button
                variant="outline"
                onClick={() => {
                  const rows = fuzzyVisible;
                  if (rows.length === 0) {
                    toast({ title: "Nothing to export", description: "Adjust filters until at least one contact is visible." });
                    return;
                  }
                  const headers = [
                    "Name", "Email", "Phone", "Status", "Source",
                    "Lead status", "Lead source",
                    "Order count", "Lifetime spend", "Outstanding balance",
                    "Last event", "Next event",
                    "Tags",
                  ];
                  const esc = (v: any) => {
                    if (v == null) return "";
                    const s = String(v).replace(/"/g, '""');
                    return /[",\n]/.test(s) ? `"${s}"` : s;
                  };
                  const lines = [headers.join(",")];
                  for (const c of rows) {
                    const ltv = c.totalSpent + (c.historicalLifetimeSpend ?? 0);
                    lines.push([
                      esc(c.name), esc(c.email), esc(c.phone),
                      esc(c.status), esc(c.source),
                      esc(c.leadStatus), esc(c.leadSource),
                      esc(c.orderCount + (c.historicalTotalEvents ?? 0)),
                      esc(ltv),
                      esc(c.outstandingBalance),
                      esc(c.lastEventDate), esc(c.nextEventDate),
                      esc((c.tags || []).join(";")),
                    ].join(","));
                  }
                  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  const stamp = new Date().toISOString().slice(0, 10);
                  a.download = `contacts_${stamp}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);

                  // Wave 70.3 -- POPIA. CSV export of contacts is
                  // a bulk PII read: every row name + email + phone
                  // + spend goes to disk. Log a single audit row
                  // covering the whole export so the SAR trail can
                  // reconstruct "who exported what set, when". Per-
                  // row logging would be 500+ rows of noise.
                  void logPiiAccess({
                    entityType: "client",
                    entityId: "bulk-export",
                    category: "contact_details",
                    fields: `bulk CSV export of ${rows.length} contacts: name, email, phone, lifetime spend, outstanding balance, tags`,
                    reason: "operator-initiated contacts CSV export",
                  });
                }}
                className="gap-1.5"
                title="Export the currently filtered contact list as CSV"
              >
                <Download className="w-4 h-4" /> Export CSV
              </Button>
              <Button
                variant="outline"
                onClick={() => setImportOpen(true)}
                className="gap-1.5"
                title="Bulk upload clients from an Excel or CSV file"
              >
                <Upload className="w-4 h-4" /> Import clients
              </Button>
              <Button
                onClick={() => { setEditing(null); setFormOpen(true); }}
                className="gap-1.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700"
              >
                <Plus className="w-4 h-4" /> Add contact
              </Button>
            </div>
          </div>

          {/* Phase 9 #7: lead source breakdown. Compact horizontal
              bar showing the top 6 lead sources in the book + the
              count + the share of total. Helps the marketing lead
              eyeball which channels are pulling. Only renders when
              at least one contact has a lead source on file. */}
          {sourceBreakdown.withSource > 0 && (
            <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-wider text-slate-500 font-semibold">
                  Lead source breakdown
                </span>
                <span className="text-[11px] text-slate-500 tabular-nums">
                  {sourceBreakdown.withSource} contacts with source
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {sourceBreakdown.ranked.map(([source, count]) => {
                  const share = Math.round((count / sourceBreakdown.withSource) * 100);
                  return (
                    <div
                      key={source}
                      className="inline-flex items-center gap-2 rounded-full bg-slate-50 border border-slate-200 px-2.5 py-1 text-xs"
                    >
                      <span className="font-medium text-slate-700 capitalize">{source.replace(/_/g, " ")}</span>
                      <span className="text-slate-500 tabular-nums">{count}</span>
                      <span className="text-[10px] text-slate-400 tabular-nums">{share}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Phase 16 #8: saved-view chips. Snapshot status + tag
              + search under a named chip so a sales rep can snap
              back to 'VIPs', 'Active in JHB', 'Hot leads unread'
              with one click. */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {savedContactViews.map((v) => (
              <span key={v.id} className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 text-purple-700 text-xs">
                <button
                  type="button"
                  onClick={() => applySavedContactView(v)}
                  className="px-2.5 py-0.5 hover:underline"
                  title={`Apply: ${v.filter}${v.search ? ` + '${v.search}'` : ""}${v.tags.length ? ` + tags(${v.tags.join(",")})` : ""}`}
                >
                  {v.name}
                </button>
                <button
                  type="button"
                  onClick={() => removeSavedContactView(v.id)}
                  className="pr-1.5 text-purple-500 hover:text-purple-800"
                  title="Remove this view"
                >
                  ×
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={saveCurrentContactView}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 text-slate-500 text-xs px-2.5 py-0.5 hover:border-purple-300 hover:text-purple-700"
              title="Save the current status + tag + search as a named view"
            >
              + Save view
            </button>
          </div>

          {/* Phase 9 #4: tag filter chip strip. Only renders when
              the book has at least one tagged contact. Click a chip
              to toggle it into the active filter set; multiple
              selected = OR (contact must have at least one). */}
          {allTags.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 inline-flex items-center gap-1">
                <Filter className="w-3.5 h-3.5" />
                Tags
              </span>
              {allTags.map((t) => {
                const active = tagFilter.has(t);
                return (
                  <button
                    key={t}
                    onClick={() => setTagFilter((prev) => {
                      const next = new Set(prev);
                      if (next.has(t)) next.delete(t);
                      else next.add(t);
                      return next;
                    })}
                    className={`text-[11px] px-2 py-0.5 rounded-full border transition ${
                      active
                        ? "bg-purple-600 text-white border-purple-700"
                        : "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100"
                    }`}
                  >
                    {t}
                  </button>
                );
              })}
              {tagFilter.size > 0 && (
                <button
                  onClick={() => setTagFilter(new Set())}
                  className="text-[11px] text-slate-500 hover:text-slate-700 underline ml-1"
                >
                  Clear ({tagFilter.size})
                </button>
              )}
            </div>
          )}

          {/* Smart filter chips with live counts */}
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            {FILTERS.map((f) => {
              const c = counts[f.id] ?? 0;
              const meta = f.id !== "all" ? STATUS_META[f.id as ClientStatus] : null;
              const active = filter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                    active
                      ? meta ? `${meta.tone} border-current` : "bg-purple-600 text-white border-purple-700"
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {meta && <meta.icon className="w-3 h-3" />}
                  {f.label}
                  <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] ${active ? "bg-white/30" : "bg-slate-100 text-slate-600"}`}>
                    {c}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Email cap notice, ties to pricing tier */}
          <Card className="border-0 shadow mb-6 bg-gradient-to-r from-blue-50 to-indigo-50">
            <CardContent className="py-3 px-4 flex items-start gap-3">
              <Inbox className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-slate-900">Personal mail, not bulk.</p>
                <p className="text-xs text-slate-600 mt-0.5">
                  Quick-mail sends through Gmail / Outlook / your default mail app, so it actually arrives from <span className="font-medium">your</span> address. For bulk newsletters, plug Mailchimp into Settings &rarr; Integrations.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Render-cap notice. Shows only when 'all' is active
              with no filters and the book is bigger than DISPLAY_CAP.
              Most contact lookups are 'find this one client' so the
              search box solves it instantly; this banner hands the
              dispatch lead the override when they really do want
              the whole 7000-row list. */}
          {cappedCount > 0 && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
              <span className="text-amber-900">
                Showing the first <strong className="tabular-nums">{visible.length}</strong> of <strong className="tabular-nums">{allVisible.length}</strong> contacts.
                Use search or a status filter to find someone specific -- or load them all.
              </span>
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="text-xs font-semibold text-amber-800 hover:text-amber-900 underline"
              >
                Show all {allVisible.length}
              </button>
            </div>
          )}

          {/* Table */}
          <Card className="border-0 shadow-lg">
            <CardContent className="p-0">
              {loading ? (
                <div className="py-16 text-center text-slate-500">Loading contacts...</div>
              ) : visible.length === 0 ? (
                <EmptyState
                  inCard
                  icon={Users}
                  title={contacts.length === 0 ? "No contacts yet" : "No contacts in this view"}
                  description={
                    contacts.length === 0
                      ? "Add your first contact, or import an existing client list to get going."
                      : "Try a different filter or clear the search."
                  }
                  cta={
                    contacts.length === 0
                      ? { label: "Add contact", onClick: () => { setEditing(null); setFormOpen(true); } }
                      : undefined
                  }
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="text-left py-3 pl-4 pr-2">
                          <span className="inline-flex items-center gap-1.5">
                            <SortHeader sortKey="name" activeKey={sortedView.sortKey} activeDir={sortedView.sortDir} onToggle={sortedView.toggle}>
                              Contact
                            </SortHeader>
                            <InfoTooltip content={"Name, email and phone, pulled together from your clients, leads and orders."} />
                          </span>
                        </th>
                        <th className="text-left py-3 px-2">
                          <span className="inline-flex items-center gap-1.5">
                            <SortHeader sortKey="status" activeKey={sortedView.sortKey} activeDir={sortedView.sortDir} onToggle={sortedView.toggle}>
                              Status
                            </SortHeader>
                            <InfoTooltip content={"Where this contact sits in their journey with you, from hot lead through to VIP or lost.\n\nWorked out from how often they have ordered, how much they have spent and how recently they have been active."} />
                          </span>
                        </th>
                        <th className="text-left py-3 px-2">
                          <span className="inline-flex items-center gap-1.5">
                            <SortHeader sortKey="action" activeKey={sortedView.sortKey} activeDir={sortedView.sortDir} onToggle={sortedView.toggle}>
                              Suggested action
                            </SortHeader>
                            <InfoTooltip content={"A suggested next step based on the contact's status and how long it has been since you last spoke."} />
                          </span>
                        </th>
                        <th className="text-right py-3 px-2">
                          <span className="inline-flex items-center gap-1.5 justify-end w-full">
                            <SortHeader sortKey="orders" activeKey={sortedView.sortKey} activeDir={sortedView.sortDir} onToggle={sortedView.toggle} align="right">
                              Orders
                            </SortHeader>
                            <InfoTooltip content={"How many orders this contact has placed, matched on their email or name. Cancelled orders are not counted."} />
                          </span>
                        </th>
                        <th className="text-right py-3 px-2">
                          <span className="inline-flex items-center gap-1.5 justify-end w-full">
                            <SortHeader sortKey="spent" activeKey={sortedView.sortKey} activeDir={sortedView.sortDir} onToggle={sortedView.toggle} align="right">
                              Total spent
                            </SortHeader>
                            <InfoTooltip content={"Total spent by this contact across all their orders.\n\nCancelled orders are not counted."} />
                          </span>
                        </th>
                        <th className="text-left py-3 px-2">
                          <span className="inline-flex items-center gap-1.5">
                            <SortHeader sortKey="lastTouch" activeKey={sortedView.sortKey} activeDir={sortedView.sortDir} onToggle={sortedView.toggle}>
                              Last touch
                            </SortHeader>
                            <InfoTooltip content={"Days since their last event, or since you last marked them as contacted."} />
                          </span>
                        </th>
                        <th className="text-right py-3 pr-4">
                          <span className="inline-flex items-center gap-1.5 justify-end w-full">
                            Quick mail
                            <InfoTooltip content={"Opens a draft in Gmail, Outlook or your default mail app so the email comes from your address. One contact at a time, no bulk send."} />
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((c) => {
                        const meta = STATUS_META[c.status];
                        const Icon = meta.icon;
                        const lastContacted = contactedKeys[c.key];
                        return (
                          <tr
                            key={c.key}
                            id={`contact-row-${c.key}`}
                            className={`border-b border-slate-100 hover:bg-slate-50 scroll-mt-24 transition-shadow ${
                              focusedContactKey === c.key
                                ? "ring-2 ring-amber-400 ring-inset bg-amber-50 animate-pulse"
                                : ""
                            }`}
                          >
                            <td className="py-3 pl-4 pr-2">
                              <button
                                onClick={() => setActive(c)}
                                className="text-left"
                              >
                                <div className="font-semibold text-slate-900 flex items-center gap-2">
                                  {c.name}
                                  {/* Phase 16 #4: client_type badge.
                                      Only renders for actual clients
                                      (source='client') so a lead /
                                      order-only row doesn't show a
                                      misleading 'Individual' chip. */}
                                  {c.source === "client" && c.clientType && (
                                    <span className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${
                                      c.clientType === "company"
                                        ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                                        : "bg-slate-50 text-slate-600 border-slate-200"
                                    }`}>
                                      {c.clientType === "company" ? "Company" : "Individual"}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                                  {c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>}
                                  {c.mobile_number ? (
                                    <span className="flex items-center gap-1" title="Mobile">
                                      <Phone className="w-3 h-3 text-emerald-600" />{c.mobile_number}
                                    </span>
                                  ) : null}
                                  {c.landline_number ? (
                                    <span className="flex items-center gap-1" title="Landline">
                                      <Phone className="w-3 h-3" />{c.landline_number}
                                    </span>
                                  ) : null}
                                  {!c.mobile_number && !c.landline_number && c.phone ? (
                                    <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>
                                  ) : null}
                                  {(c.historicalTotalEvents != null || c.historicalLifetimeSpend != null) && (
                                    <span className="flex items-center gap-1 text-violet-700" title="Imported event history">
                                      📅
                                      {c.historicalTotalEvents != null ? `${c.historicalTotalEvents} past events` : "Past history"}
                                      {c.historicalLifetimeSpend != null ? ` · R${Math.round(c.historicalLifetimeSpend).toLocaleString("en-ZA")} LTV` : ""}
                                    </span>
                                  )}
                                  {c.importedFilename && (
                                    <span
                                      className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200"
                                      title={`Imported via ${c.importedFilename}`}
                                    >
                                      Imported
                                    </span>
                                  )}
                                </div>
                                {/* Phase 8 #10: tag chips. Lowercased
                                    on save so a tenant doesn't end
                                    up with both 'VIP' and 'vip' chips. */}
                                {c.tags.length > 0 && (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {c.tags.map((t) => (
                                      <span
                                        key={t}
                                        className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200"
                                      >
                                        {t}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </button>
                            </td>
                            <td className="py-3 px-2">
                              <Badge variant="outline" className={`${meta.tone} border gap-1`}>
                                <Icon className="w-3 h-3" />
                                {meta.label}
                              </Badge>
                            </td>
                            <td className="py-3 px-2">
                              <div className={`text-xs font-medium ${
                                c.suggestion.tone === "urgent" ? "text-red-600" :
                                c.suggestion.tone === "warm"   ? "text-amber-600" : "text-slate-600"
                              }`}>
                                {c.suggestion.label}
                              </div>
                              <div className="text-[11px] text-slate-500">{c.suggestion.reason}</div>
                            </td>
                            <td className="py-3 px-2 text-right tabular-nums">
                              {/* Phase 10 #8: order count includes
                                  imported historical events so a
                                  freshly-onboarded client doesn't
                                  look brand new when their book has
                                  10 prior weddings. */}
                              {c.orderCount + (c.historicalTotalEvents ?? 0)}
                              {c.historicalTotalEvents ? (
                                <span className="text-[10px] text-violet-600 ml-1" title={`${c.historicalTotalEvents} imported`}>
                                  +{c.historicalTotalEvents}
                                </span>
                              ) : null}
                            </td>
                            <td className="py-3 px-2 text-right tabular-nums">
                              {/* Phase 10 #8: combined lifetime spend
                                  -- in-system orders + imported
                                  historical spend. Shows the full
                                  customer-value picture instead of
                                  only the new-system slice. */}
                              {(() => {
                                const combined = c.totalSpent + (c.historicalLifetimeSpend ?? 0);
                                if (combined <= 0) return "-";
                                const hasHistoric = (c.historicalLifetimeSpend ?? 0) > 0;
                                return (
                                  <span title={hasHistoric ? `In-system ${fmtMoney.format(c.totalSpent)} + imported ${fmtMoney.format(c.historicalLifetimeSpend!)}` : undefined}>
                                    {fmtMoney.format(combined)}
                                    {hasHistoric && (
                                      <span className="text-[10px] text-violet-600 ml-1">incl. history</span>
                                    )}
                                  </span>
                                );
                              })()}
                            </td>
                            <td className="py-3 px-2 text-xs text-slate-600">
                              {lastContacted ? (
                                <span className="text-emerald-600">
                                  {daysBetween(new Date(lastContacted), new Date())}d ago
                                </span>
                              ) : c.daysSinceLastTouch !== null ? (
                                <>{c.daysSinceLastTouch}d</>
                              ) : "-"}
                            </td>
                            <td className="py-3 pr-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {/* WhatsApp the client. Hidden when no
                                    mobile is on file or it looks like
                                    a landline. Default template depends
                                    on contact status (hot lead -> lead
                                    follow-up; quoted -> quote chase;
                                    everyone else -> generic check-in
                                    via lead follow-up). */}
                                <WhatsAppButton
                                  kind="client"
                                  phone={c.mobile_number || c.phone}
                                  clientId={c.clientId}
                                  variant="outline"
                                  size="sm"
                                  label=""
                                  className="h-8 w-8 p-0"
                                  templates={["touch_base", "lead_followup", "quote_chase", "quote_sent"] as ClientWhatsAppKind[]}
                                  defaultTemplate={
                                    c.status === "quoted" ? "quote_chase"
                                    : c.orderCount === 0 && !c.nextEventDate ? "touch_base"
                                    : "lead_followup"
                                  }
                                  ctx={{
                                    contactName: c.name,
                                    eventDate: c.nextEventDate
                                      ? new Date(c.nextEventDate).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })
                                      : null,
                                    fromName: profile?.full_name || profile?.company_name,
                                    companyName: profile?.company_name,
                                  }}
                                />
                                <RowPrimaryAction
                                  tone={c.suggestion?.tone || "neutral"}
                                  icon={<Send className="w-3.5 h-3.5" />}
                                  label={c.suggestion?.label
                                    ? (c.suggestion.label.length > 18
                                        ? c.suggestion.label.slice(0, 18) + "…"
                                        : c.suggestion.label)
                                    : "Compose"}
                                  tooltip={c.suggestion?.reason || "Send a personal email to this contact"}
                                  disabled={!c.email}
                                  onClick={() => setActive(c)}
                                />
                                {/* One-click "phone rang, sort the quote".
                                    If the contact already has a quote,
                                    open the latest one in the editable
                                    builder. Otherwise start a fresh
                                    quote prefilled from the lead row.
                                    Both routes land on the rich builder
                                    (/admin/quotes/new) which is fully
                                    editable -- the [id] detail page is
                                    a separate read-only-ish surface and
                                    we want operators in the builder. */}
                                {(c.quoteIds.length > 0 || c.leadIds.length > 0) && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      if (c.quoteIds.length > 0) {
                                        router.push(withSlug(`/admin/quotes/new?fromQuoteId=${c.quoteIds[0]}`));
                                      } else {
                                        router.push(withSlug(`/admin/quotes/new?leadId=${c.leadIds[0]}`));
                                      }
                                    }}
                                    className="gap-1.5 border-blue-300 text-blue-700 hover:bg-blue-50"
                                    title={c.quoteIds.length > 0 ? `Open the latest quote for ${c.name}` : `Create a new quote for ${c.name}`}
                                  >
                                    <FileText className="w-3.5 h-3.5" />
                                    {c.quoteIds.length > 0 ? "Open quote" : "New quote"}
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => { setEditing(c); setFormOpen(true); }}
                                  className="h-8 w-8 p-0"
                                  aria-label={c.clientId ? `Edit ${c.name}` : `Save ${c.name} as client`}
                                  title={c.clientId ? "Edit" : "Save as client"}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setConfirmDelete(c)}
                                  className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                                  aria-label={`Delete ${c.name}`}
                                  title="Delete contact"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Add / Edit client dialog */}
      <ClientFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        companyId={companyId}
        editing={editing}
        onSaved={async () => {
          const wasPromoting = !!editing && !editing.clientId;
          const wasEditing = !!editing?.clientId;
          setFormOpen(false);
          setEditing(null);
          await loadContacts();
          toast({
            title: wasEditing ? "Client updated" : wasPromoting ? "Saved as client" : "Client added",
          });
        }}
      />

      {/* High-friction delete dialog. Bobby's rule (May 2026): a staff
          member must never wipe a paying customer by accident, and a
          deleted contact must never re-surface in any future comms.
          So this dialog:
          (a) lists every backing record about to be hidden, with money
              attached so the impact is unmistakable,
          (b) makes the operator type the contact name when there are
              live orders, and
          (c) offers a "block from future comms" toggle that writes
              into blocked_contacts (the /api/send-email API refuses
              to deliver to anyone in that table).
          Soft-delete only -- the deleted_at columns mean support can
          always restore. */}
      <Dialog
        open={!!confirmDelete}
        onOpenChange={(o) => {
          if (!o) {
            setConfirmDelete(null);
            setDeleteBlockToo(false);
            setConfirmText("");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          {confirmDelete && (() => {
            const c = confirmDelete;
            const counts = [
              { kind: "client record", n: c.clientId ? 1 : 0, icon: Users },
              { kind: "lead", n: c.leadIds.length, icon: Sparkles },
              { kind: "quote", n: c.quoteIds.length, icon: FileText },
              { kind: "order", n: c.orderIds.length, icon: ShoppingCart },
              { kind: "invoice", n: c.invoiceIds.length, icon: FileText },
            ].filter((x) => x.n > 0);
            // Typing-confirm gate when there's real money on the row.
            // Either past spend or live orders attached.
            const requiresTyping = c.orderIds.length > 0 || c.totalSpent > 0;
            const typedOk = !requiresTyping
              || confirmText.trim().toLowerCase() === c.name.trim().toLowerCase();
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-rose-600">
                    <AlertTriangle className="h-5 w-5" />
                    Delete {c.name}?
                  </DialogTitle>
                  <DialogDescription>
                    Read the impact first. Every linked record will be hidden in the same action so nothing is left orphaned.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
                    <p className="text-sm font-semibold text-rose-900 mb-2">
                      What gets hidden
                    </p>
                    {counts.length === 0 ? (
                      <p className="text-sm text-rose-700">
                        Nothing on file beyond the contact entry itself.
                      </p>
                    ) : (
                      <ul className="space-y-1 text-sm text-rose-800">
                        {counts.map(({ kind, n, icon: Icon }) => (
                          <li key={kind} className="flex items-center gap-2">
                            <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                            <span>{n} {kind}{n === 1 ? "" : "s"}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {c.totalSpent > 0 && (
                      <p className="text-sm font-medium text-rose-900 mt-2 pt-2 border-t border-rose-200">
                        Lifetime spend on file: {fmtMoney.format(c.totalSpent)}
                      </p>
                    )}
                  </div>

                  {c.email && (
                    <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 cursor-pointer">
                      <Checkbox
                        checked={deleteBlockToo}
                        onCheckedChange={(v) => setDeleteBlockToo(v === true)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 text-sm">
                        <div className="font-medium text-slate-900 flex items-center gap-1.5">
                          <Ban className="h-3.5 w-3.5 text-slate-500" />
                          Also block {c.email} from future comms
                        </div>
                        <div className="text-slate-600 mt-0.5">
                          Stops emails and automated follow-ups from sending to this address even if the contact is recreated.
                        </div>
                      </div>
                    </label>
                  )}

                  {requiresTyping && (
                    <div className="space-y-1.5">
                      <label htmlFor="confirm-name" className="text-sm font-medium text-slate-900">
                        Type{" "}
                        <span className="font-mono text-rose-600">{c.name}</span>{" "}
                        to confirm
                      </label>
                      <Input
                        id="confirm-name"
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder={c.name}
                        autoComplete="off"
                      />
                      <p className="text-xs text-slate-500">
                        Required because this contact has paying history. Stops accidental deletes.
                      </p>
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setConfirmDelete(null);
                      setDeleteBlockToo(false);
                      setConfirmText("");
                    }}
                    disabled={deleting}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="bg-rose-600 hover:bg-rose-700 text-white"
                    disabled={deleting || !typedOk}
                    onClick={async () => {
                      setDeleting(true);
                      const stamp = new Date().toISOString();
                      const errors: string[] = [];
                      if (c.clientId) {
                        const { error } = await supabase
                          .from("clients")
                          .update({ deleted_at: stamp })
                          .eq("id", c.clientId)
                          .eq("company_id", companyId);
                        if (error) errors.push(`client: ${error.message}`);
                      }
                      if (c.leadIds.length > 0) {
                        const { error } = await supabase
                          .from("leads")
                          .update({ deleted_at: stamp })
                          .in("id", c.leadIds)
                          .eq("company_id", companyId);
                        if (error) errors.push(`leads: ${error.message}`);
                      }
                      if (c.quoteIds.length > 0) {
                        const { error } = await supabase
                          .from("quotes")
                          .update({ deleted_at: stamp })
                          .in("id", c.quoteIds)
                          .eq("company_id", companyId);
                        if (error) errors.push(`quotes: ${error.message}`);
                      }
                      if (c.orderIds.length > 0) {
                        const { error } = await supabase
                          .from("orders")
                          .update({ deleted_at: stamp })
                          .in("id", c.orderIds)
                          .eq("company_id", companyId);
                        if (error) errors.push(`orders: ${error.message}`);
                      }
                      if (c.invoiceIds.length > 0) {
                        const { error } = await supabase
                          .from("invoices")
                          .update({ deleted_at: stamp })
                          .in("id", c.invoiceIds)
                          .eq("company_id", companyId);
                        if (error) errors.push(`invoices: ${error.message}`);
                      }
                      if (deleteBlockToo && c.email) {
                        const { error } = await supabase
                          .from("blocked_contacts")
                          .insert({
                            company_id: companyId,
                            email_lower: c.email.toLowerCase().trim(),
                            phone: c.phone || null,
                            reason: `Deleted via Contacts on ${new Date().toLocaleDateString("en-ZA")}`,
                          });
                        // Conflict on existing block is fine -- means
                        // we already had them blocked, no toast.
                        if (error && !String(error.message).match(/duplicate|unique/i)) {
                          errors.push(`block: ${error.message}`);
                        }
                      }
                      setDeleting(false);
                      setConfirmDelete(null);
                      setDeleteBlockToo(false);
                      setConfirmText("");
                      if (errors.length > 0) {
                        toast({
                          title: "Partly failed",
                          description: errors.join("; "),
                          variant: "destructive",
                        });
                      } else {
                        toast({
                          title: deleteBlockToo
                            ? "Contact deleted and blocked"
                            : "Contact deleted",
                        });
                      }
                      await loadContacts();
                    }}
                  >
                    {deleting
                      ? "Deleting..."
                      : deleteBlockToo
                        ? "Delete and block"
                        : "Delete contact"}
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Compose drawer -- shared resizable host so this matches the
          quotes / leads compose UX. Default ~60% of viewport, draggable
          on the left edge, width persists across opens via sessionStorage. */}
      <ComposeDrawerHost open={!!active} onClose={() => setActive(null)}>
        {active && (
          <ComposeDrawer
            contact={active}
            fromName={profile?.full_name || profile?.company_name}
            companyId={profile?.company_id ?? null}
            onSent={() => markContacted(active.key)}
            onClose={() => setActive(null)}
          />
        )}
      </ComposeDrawerHost>

      {/* Bulk-import modal. Drives the same /api/imports/* engine the
          onboarding wizard uses; pre-scoped to clients via the
          template prop so the auto-mapping shortcut fires and the
          AI mapping step is skipped. */}
      <ImportRecordsModal
        open={importOpen}
        onOpenChange={setImportOpen}
        template="clients"
        recordLabel="client"
        recordLabelPlural="clients"
        onComplete={() => loadContacts()}
      />
    </>
  );
}

/**
 * ComposeDrawer -- thin wrapper around the shared MessageComposer
 * (same component Leads and Quotes use). Keeps the messaging UI
 * identical across all three CRM surfaces: same drawer chrome, same
 * send-channel buttons, same WhatsApp pivot, same context rail.
 *
 * Templates resolve through composeEmail.templateFor() which already
 * routes through resolveTemplateSync() for company overrides, so a
 * caterer who customised their "Quote chase" template on the
 * Messaging Templates page sees that wording here as well.
 */
function ComposeDrawer({
  contact, fromName, companyId, onSent, onClose,
}: {
  contact: Contact;
  fromName?: string;
  companyId?: string | null;
  onSent: () => void;
  onClose: () => void;
}) {
  const tpl = templateFor(contact.status, {
    contactName: contact.name,
    eventDate: contact.nextEventDate
      ? new Date(contact.nextEventDate).toLocaleDateString("en-ZA", { day: "numeric", month: "long" })
      : undefined,
    daysSinceLastContact: contact.daysSinceLastTouch ?? undefined,
    fromName,
    companyId: companyId ?? null,
  });

  // Pick the WhatsApp template that maps closest to the suggested
  // action. Mirror the lead drawer's logic so the same status nudges
  // the same default WA template across pages.
  const defaultWA: ClientWhatsAppKind =
    contact.status === "quoted" ? "quote_chase"
    : contact.status === "won" || contact.status === "active" || contact.status === "vip" ? "quote_accepted"
    : contact.orderCount === 0 && !contact.nextEventDate ? "touch_base"
    : "lead_followup";

  return (
    <MessageComposer
      title={`Message ${contact.name}`}
      subtitle={contact.suggestion?.reason || "Personal follow-up. Sent through your own inbox so it looks like it came from you."}
      contextLabel="This contact"
      contextRows={[
        { label: "Email",  value: contact.email || "(none)", title: contact.email || "(none)" },
        { label: "Phone",  value: contact.phone || "—" },
        { label: "Status", value: STATUS_META[contact.status]?.label || contact.status },
        { label: "Orders", value: `${contact.orderCount} (${fmtMoney.format(contact.totalSpent)})` },
        ...(contact.nextEventDate ? [{
          label: "Next event",
          value: new Date(contact.nextEventDate).toLocaleDateString("en-ZA", { day: "numeric", month: "long" }),
        }] : []),
        ...(contact.daysSinceLastTouch != null ? [{
          label: "Last touch",
          value: `${contact.daysSinceLastTouch}d ago`,
          divider: true,
        }] : []),
      ]}
      recipient={{
        name: contact.name,
        email: contact.email || null,
        phone: contact.phone || null,
        clientId: contact.clientId,
      }}
      template={{ subject: tpl.subject, body: tpl.body }}
      fromName={fromName}
      footerHint="Edit freely. The wording is just a starting point based on this contact's status. Drag the left edge of this drawer for more room."
      onSent={onSent}
      whatsapp={{
        kind: "client",
        ctx: {
          contactName: contact.name,
          eventName: null,
          eventDate: contact.nextEventDate
            ? new Date(contact.nextEventDate).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })
            : null,
          guestCount: null,
          fromName,
        },
        templates: ["touch_base", "lead_followup", "quote_chase", "quote_sent", "quote_accepted"],
        defaultTemplate: defaultWA,
      }}
      onClose={onClose}
    />
  );
}

/**
 * Add / Edit form for a clients-table row. Loads the row when `editing`
 * carries a clientId, otherwise inserts a new one. Hard-required: name,
 * email, phone (matches the table NOT NULL constraints). Everything else
 * is optional and folds into a 'More details' panel.
 */
function ClientFormDialog({
  open, onOpenChange, companyId, editing, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string | null | undefined;
  editing: Contact | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [form, setForm] = useState({
    client_name: "",
    email: "",
    phone: "",
    client_type: "individual",
    tax_number: "",
    billing_address_line1: "",
    billing_address_line2: "",
    billing_city: "",
    billing_postal_code: "",
    notes: "",
    // Phase 8 #10: customer tags. Stored as a comma-separated
    // string in the form state so the operator can type freely;
    // we normalise to a string[] before writing to clients.tags.
    tags: "",
    // Wave 66.8 -- per-client payment terms in days. Overrides the
    // company-wide balance_due_days default during invoice generation.
    // Lets corporate clients be set to Net 30 / Net 60 while everyone
    // else stays on the company's catering-default (typically 7).
    // "" = use the company default; positive integer = Net X days.
    payment_terms: "",
  });

  // Seed the form when the dialog opens. Two layers: first we seed from
  // the Contact aggregate we already have in memory (name/email/phone)
  // so the form is never blank, then we fetch the full clients row to
  // pick up billing address, VAT number and notes. On Add we clear it.
  useEffect(() => {
    if (!open) return;
    if (!editing?.clientId) {
      setForm({
        client_name: "", email: "", phone: "", client_type: "individual",
        tax_number: "", billing_address_line1: "", billing_address_line2: "",
        billing_city: "", billing_postal_code: "", notes: "", tags: "",
        payment_terms: "",
      });
      setShowMore(false);
      return;
    }
    // Layer 1: in-memory seed -- guarantees the form shows the contact
    // data we already know about even before the network round-trip.
    setForm({
      client_name: editing.name || "",
      email:       editing.email || "",
      phone:       editing.phone || "",
      client_type: "individual",
      tax_number: "", billing_address_line1: "", billing_address_line2: "",
      billing_city: "", billing_postal_code: "", notes: "", tags: "",
      payment_terms: "",
    });
    setShowMore(false);
    // Layer 2: enrich from the row (billing, tax, notes, tags).
    (async () => {
      const { data } = await supabase
        .from("clients")
        .select("client_name, email, phone, client_type, tax_number, billing_address_line1, billing_address_line2, billing_city, billing_postal_code, notes, tags, payment_terms")
        .eq("id", editing.clientId)
        .maybeSingle();
      // Wave 67.6 -- POPIA access log. Fire-and-forget; the read
      // itself isn't blocked if the log call fails. Categories
      // distinguish contact_details (phone/email/billing) from
      // identifying (VAT/tax). Extend to other PII-bearing surfaces
      // by importing and calling logPiiAccess.
      const hasIdentifying = !!(data as any)?.tax_number;
      void logPiiAccess({
        entityType: "client",
        entityId: editing.clientId,
        category: hasIdentifying ? "identifying" : "contact_details",
        fields: `opened client edit dialog: name, email, phone, billing address${hasIdentifying ? ", VAT/tax number" : ""}, notes, tags`,
      });
      if (!data) return;
      const dataTags = ((data as any).tags as string[] | null) || [];
      setForm({
        client_name: data.client_name || editing.name || "",
        email:       data.email || editing.email || "",
        phone:       data.phone || editing.phone || "",
        client_type: data.client_type || "individual",
        tax_number:  data.tax_number || "",
        billing_address_line1:       data.billing_address_line1 || "",
        billing_address_line2:       data.billing_address_line2 || "",
        billing_city:        data.billing_city || "",
        billing_postal_code: data.billing_postal_code || "",
        notes:       data.notes || "",
        tags:        dataTags.join(", "),
        payment_terms: (data as any).payment_terms != null ? String((data as any).payment_terms) : "",
      });
      const hasOptional = !!(data.billing_address_line1 || data.tax_number || data.notes || dataTags.length);
      setShowMore(hasOptional);
    })();
  }, [open, editing]);

  const handleSave = async () => {
    if (!companyId) return;
    if (!form.client_name.trim() || !form.email.trim() || !form.phone.trim()) {
      toast({ title: "Missing required fields", description: "Name, email and phone are required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    // Phase 8 #10: normalise the comma-separated tag string into
    // a clean string[]. Trim each entry, drop blanks, dedupe and
    // lowercase so 'VIP' and 'vip' don't show up twice on the
    // client card.
    const normalisedTags = Array.from(new Set(
      form.tags
        .split(",")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean),
    ));
    const payload: any = {
      company_id: companyId,
      client_name: form.client_name.trim(),
      email:       form.email.trim(),
      phone:       form.phone.trim(),
      client_type: form.client_type || null,
      tax_number:  form.tax_number.trim() || null,
      billing_address_line1:       form.billing_address_line1.trim() || null,
      billing_address_line2:       form.billing_address_line2.trim() || null,
      billing_city:        form.billing_city.trim() || null,
      billing_postal_code: form.billing_postal_code.trim() || null,
      notes:       form.notes.trim() || null,
      tags:        normalisedTags.length > 0 ? normalisedTags : null,
      // Wave 66.8 -- per-client payment terms override. Empty string
      // clears the override so invoice generation falls back to the
      // company default; positive integer sets Net X days.
      payment_terms: (() => {
        const n = parseInt(form.payment_terms.trim(), 10);
        return Number.isFinite(n) && n > 0 ? n : null;
      })(),
    };
    let error: any = null;
    if (editing?.clientId) {
      ({ error } = await supabase.from("clients").update(payload).eq("id", editing.clientId).eq("company_id", companyId));
    } else {
      ({ error } = await supabase.from("clients").insert({ ...payload, is_active: true }));
    }
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
      return;
    }
    onSaved();
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const promoting = !!editing && !editing.clientId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing?.clientId ? "Edit client" : promoting ? "Save as client" : "Add a client"}
          </DialogTitle>
          <DialogDescription>
            {editing?.clientId
              ? "Update the contact and billing details for this client."
              : promoting
                ? `${editing?.name || "This contact"} is currently surfaced from a lead or past order. Save the details to add them to your clients list.`
                : "Capture a new client. Name, email and phone are required."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Name</label>
            <Input value={form.client_name} onChange={set("client_name")} placeholder="Sarah Naidoo" className="mt-1" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Email</label>
              <Input type="email" value={form.email} onChange={set("email")} placeholder="sarah@example.co.za" className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Phone</label>
              <Input value={form.phone} onChange={set("phone")} placeholder="082 123 4567" className="mt-1" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Client type</label>
            <select
              value={form.client_type}
              onChange={(e) => setForm((f) => ({ ...f, client_type: e.target.value }))}
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="individual">Individual</option>
              <option value="company">Company</option>
              <option value="non_profit">Non-profit / NPO</option>
              <option value="government">Government</option>
            </select>
          </div>

          {!showMore ? (
            <Button variant="ghost" size="sm" onClick={() => setShowMore(true)} className="text-slate-600">
              + More details (billing, tax, notes)
            </Button>
          ) : (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div>
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">VAT / Tax number</label>
                <Input value={form.tax_number} onChange={set("tax_number")} placeholder="VAT 4123456789" className="mt-1" />
              </div>

              {/* Wave 66.8 -- per-client payment terms (days). Overrides
                  the company default during invoice generation. Lets
                  a corporate that needs Net 30 stay on Net 30 while
                  everyone else uses the catering-style 7-day balance.
                  Leave blank to use the company default. */}
              <div>
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Payment terms (days)</label>
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={form.payment_terms}
                  onChange={set("payment_terms")}
                  placeholder="Leave blank for the company default"
                  className="mt-1"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Net X days for this client&apos;s invoices. Useful for corporate accounts who need 30 or 60 days. Blank = use the company-wide default (typically 7 for catering).
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Billing address</label>
                <Input value={form.billing_address_line1} onChange={set("billing_address_line1")} placeholder="Line 1" className="mt-1" />
                <Input value={form.billing_address_line2} onChange={set("billing_address_line2")} placeholder="Line 2 (optional)" className="mt-2" />
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Input value={form.billing_city} onChange={set("billing_city")} placeholder="City" />
                  <Input value={form.billing_postal_code} onChange={set("billing_postal_code")} placeholder="Postal code" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Notes</label>
                <Textarea value={form.notes} onChange={set("notes")} rows={3} className="mt-1" placeholder="Allergies, preferences, anything worth remembering..." />
              </div>
              {/* Phase 8 #10: customer tags. Comma-separated free
                  text -- normalised to lowercase, deduped and
                  trimmed at save. The tags surface as little
                  chips on the contact card so VIP / corporate /
                  vegan / no-pork etc. is visible at a glance. */}
              <div>
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Tags</label>
                <Input
                  value={form.tags}
                  onChange={set("tags")}
                  className="mt-1"
                  placeholder="vip, corporate, halaal, repeat (comma separated)"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Comma-separated. Lowercased and deduped on save.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row sm:justify-between gap-2">
          {/* Phase 12 #3: per-client data export. Compiles every
              order, quote and invoice we hold for this client into
              a CSV the operator can hand to a POPI / GDPR data
              subject access request. Only renders when we know
              the underlying clients.id (i.e. an existing client,
              not a fresh capture). */}
          {editing?.clientId && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                if (!editing?.clientId) return;
                try {
                  const [ordersRes, quotesRes, invoicesRes] = await Promise.all([
                    supabase
                      .from("orders")
                      .select("id, order_number, status, event_date, total_amount, payment_status, created_at")
                      .eq("client_id", editing.clientId)
                      .is("deleted_at", null)
                      .order("event_date", { ascending: false }),
                    supabase
                      .from("quotes")
                      .select("id, quote_number, status, event_date, total, sent_at, accepted_at")
                      .eq("client_id", editing.clientId)
                      .is("deleted_at", null)
                      .order("created_at", { ascending: false }),
                    supabase
                      .from("invoices")
                      .select("id, invoice_number, status, invoice_date, due_date, total_amount, balance_due, paid_at")
                      .eq("client_id", editing.clientId)
                      .is("deleted_at", null)
                      .order("invoice_date", { ascending: false }),
                  ]);
                  const esc = (v: any) => {
                    if (v == null) return "";
                    const s = typeof v === "string" ? v : JSON.stringify(v);
                    const cleaned = s.replace(/"/g, '""');
                    return /[",\n]/.test(cleaned) ? `"${cleaned}"` : cleaned;
                  };
                  const lines: string[] = [];
                  lines.push(`# Client data export -- ${form.client_name}`);
                  lines.push(`# Exported ${new Date().toISOString()}`);
                  lines.push("");
                  lines.push("# Contact details");
                  lines.push("field,value");
                  for (const [k, v] of Object.entries({
                    name: form.client_name, email: form.email, phone: form.phone,
                    type: form.client_type, tax_number: form.tax_number,
                    billing_address_line1: form.billing_address_line1,
                    billing_address_line2: form.billing_address_line2,
                    billing_city: form.billing_city,
                    billing_postal_code: form.billing_postal_code,
                    notes: form.notes, tags: form.tags,
                  })) {
                    lines.push(`${esc(k)},${esc(v)}`);
                  }
                  lines.push("");
                  lines.push("# Orders");
                  lines.push("order_number,status,event_date,total_amount,payment_status,created_at");
                  for (const o of (ordersRes.data || []) as any[]) {
                    lines.push([o.order_number, o.status, o.event_date, o.total_amount, o.payment_status, o.created_at].map(esc).join(","));
                  }
                  lines.push("");
                  lines.push("# Quotes");
                  lines.push("quote_number,status,event_date,total,sent_at,accepted_at");
                  for (const q of (quotesRes.data || []) as any[]) {
                    lines.push([q.quote_number, q.status, q.event_date, q.total, q.sent_at, q.accepted_at].map(esc).join(","));
                  }
                  lines.push("");
                  lines.push("# Invoices");
                  lines.push("invoice_number,status,invoice_date,due_date,total_amount,balance_due,paid_at");
                  for (const inv of (invoicesRes.data || []) as any[]) {
                    lines.push([inv.invoice_number, inv.status, inv.invoice_date, inv.due_date, inv.total_amount, inv.balance_due, inv.paid_at].map(esc).join(","));
                  }
                  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  const safeName = (form.client_name || "client").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
                  a.download = `client_${safeName}_${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast({ title: "Client data exported", description: "CSV download started." });

                  // Wave 70.3 -- POPIA. Per-client SAR-style export
                  // dumps every PII field + the full order / quote /
                  // invoice history. This is the highest-impact PII
                  // event we record; log with category "identifying"
                  // when a tax number is present, else
                  // "contact_details".
                  void logPiiAccess({
                    entityType: "client",
                    entityId: editing?.clientId || "unknown",
                    category: form.tax_number ? "identifying" : "contact_details",
                    fields: `per-client CSV export: name, email, phone, billing address, tax number, notes, tags + full orders/quotes/invoices history`,
                    reason: "operator-initiated client data export (SAR-style)",
                  });
                } catch (e: any) {
                  toast({
                    title: "Export failed",
                    description: e?.message || "Try again",
                    variant: "destructive",
                  });
                }
              }}
            >
              Export client data
            </Button>
          )}
          <div className="flex gap-2 sm:ml-auto">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700">
              {saving ? "Saving..." : editing?.clientId ? "Save changes" : promoting ? "Save as client" : "Add client"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ClientsPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <ClientsCRM />
    </ProtectedRoute>
  );
}
