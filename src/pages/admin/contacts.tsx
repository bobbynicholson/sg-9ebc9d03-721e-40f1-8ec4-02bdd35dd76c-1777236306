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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ComposeDrawerHost } from "@/components/messaging/ComposeDrawerHost";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Search, Mail, Phone, Users, Sparkles, Flame, Clock, AlertTriangle,
  Snowflake, Crown, ArrowRight, Send, Copy, ExternalLink, Inbox,
  Calendar as CalendarIcon, MapPin, ShoppingCart, MessageSquare,
  CheckCircle2, RefreshCw, Filter, Plus, Pencil, Trash2, Ban, FileText,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types/app";
import { supabase } from "@/integrations/supabase/client";
import { composeEmail, templateFor, type ClientStatus } from "@/lib/composeEmail";
import { WhatsAppButton } from "@/components/messaging/WhatsAppButton";
import type { ClientWhatsAppKind } from "@/lib/whatsappTemplates";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { useSortable, type ColumnDef } from "@/lib/useSortable";
import { SortHeader } from "@/components/ui/sort-header";

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

const FILTERS: Array<{ id: "all" | ClientStatus; label: string }> = [
  { id: "all",       label: "All" },
  { id: "hot_lead",  label: "Hot leads" },
  { id: "quoted",    label: "Quoted" },
  { id: "active",    label: "Active" },
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
  const companyId = profile?.company_id || user?.company_id;
  const { toast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | ClientStatus>("all");
  const [active, setActive] = useState<Contact | null>(null);
  const [contactedKeys, setContactedKeys] = useState<Record<string, string>>({});
  const searchRef = useRef<HTMLInputElement>(null);
  // CRUD state. `editing` carries an existing client id to load + update;
  // `null` means a fresh add. `confirmDelete` keeps the contact whose row
  // the operator clicked the bin on so we can show a confirm prompt before
  // soft-deleting.
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Contact | null>(null);
  // Block-list opt-in stamped at delete time. Default off so a quick
  // bin-click doesn't quietly cut off a real client; the operator has
  // to tick "Block from future comms" deliberately.
  const [deleteBlockToo, setDeleteBlockToo] = useState(false);
  // Typing-confirm gate. When the contact has live orders attached,
  // the operator has to type the contact's name to enable the Delete
  // button. Stops a careless click from wiping a paying customer.
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

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
    const [clientsRes, leadsRes, ordersRes, quotesRes, invoicesRes] = await Promise.all([
      supabase
        .from("clients")
        .select("id, client_name, email, phone, client_type, is_active, outstanding_balance, created_at")
        .eq("company_id", companyId)
        .is("deleted_at", null),
      supabase
        .from("leads")
        .select("id, contact_name, email, phone, status, source, event_date, created_at")
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
          orderCount: 0, totalSpent: 0,
          lastEventDate: null, nextEventDate: null,
          outstandingBalance: Number(c.outstanding_balance || 0),
          leadStatus: null, leadSource: null,
          daysSinceLastTouch: null,
          status: "won",
          suggestion: { tone: "neutral", label: "Stay in touch", reason: "Existing client" },
          createdAt: c.created_at,
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
            orderCount: 0, totalSpent: 0,
            lastEventDate: null, nextEventDate: null,
            outstandingBalance: 0,
            leadStatus: l.status,
            leadSource: l.source,
            daysSinceLastTouch: null,
            status: "hot_lead",
            suggestion: { tone: "urgent", label: "Reply within 24h", reason: "Lead waiting" },
            createdAt: l.created_at,
          });
        }
      });

      // Aggregate orders into whichever contact they match
      const todayISO = today.toISOString().slice(0, 10);
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
            orderCount: 0, totalSpent: 0,
            lastEventDate: null, nextEventDate: null,
            outstandingBalance: 0,
            leadStatus: null, leadSource: null,
            daysSinceLastTouch: null,
            status: "won",
            suggestion: { tone: "neutral", label: "Stay in touch", reason: "Past customer" },
            createdAt: o.created_at,
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
          c.status = "won";
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

  // "/" or Cmd+F focuses the search box -- a tiny SV touch
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
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const counts = useMemo(() => {
    const n = { all: contacts.length } as Record<string, number>;
    for (const c of contacts) n[c.status] = (n[c.status] || 0) + 1;
    return n;
  }, [contacts]);

  // Status filter is applied first so the fuzzy matcher only ranks contacts
  // the user is currently scoped to (e.g. "VIPs called Sarah").
  const statusFiltered = useMemo(() => {
    return filter === "all" ? contacts : contacts.filter((c) => c.status === filter);
  }, [contacts, filter]);

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
    { key: "spent",     accessor: (r) => r.totalSpent,                                 type: "number" },
    { key: "lastTouch", accessor: (r) => r.daysSinceLastTouch ?? Number.POSITIVE_INFINITY, type: "number" },
  ], []);
  const sortedView = useSortable<Contact>(fuzzyVisible as Contact[], sortColumns, { defaultKey: "name", defaultDir: "asc" });
  const visible = sortedView.rows;

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
                  Everyone you've touched -- leads, prospects, clients -- sorted by suggested next action. The CRM inbox.
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
                  className="pl-9 w-64 sm:w-80"
                />
              </div>
              <Button
                onClick={() => { setEditing(null); setFormOpen(true); }}
                className="gap-1.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700"
              >
                <Plus className="w-4 h-4" /> Add contact
              </Button>
            </div>
          </div>

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

          {/* Table */}
          <Card className="border-0 shadow-lg">
            <CardContent className="p-0">
              {loading ? (
                <div className="py-16 text-center text-slate-500">Loading contacts...</div>
              ) : visible.length === 0 ? (
                <div className="py-16 text-center">
                  <Users className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                  <p className="text-slate-700 font-semibold">No contacts in this view</p>
                  <p className="text-sm text-slate-500">Try a different filter or clear the search.</p>
                </div>
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
                          <tr key={c.key} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-3 pl-4 pr-2">
                              <button
                                onClick={() => setActive(c)}
                                className="text-left"
                              >
                                <div className="font-semibold text-slate-900">{c.name}</div>
                                <div className="text-xs text-slate-500 flex items-center gap-2">
                                  {c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{c.email}</span>}
                                  {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                                </div>
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
                            <td className="py-3 px-2 text-right tabular-nums">{c.orderCount}</td>
                            <td className="py-3 px-2 text-right tabular-nums">{c.totalSpent > 0 ? fmtMoney.format(c.totalSpent) : "-"}</td>
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
                                  phone={c.phone}
                                  variant="outline"
                                  size="sm"
                                  label=""
                                  className="h-8 w-8 p-0"
                                  templates={["lead_followup", "quote_chase", "quote_sent"] as ClientWhatsAppKind[]}
                                  defaultTemplate={
                                    c.status === "quoted" ? "quote_chase"
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
                                <Button
                                  size="sm"
                                  disabled={!c.email}
                                  onClick={() => setActive(c)}
                                  className="gap-1.5"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                  Compose
                                </Button>
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
                                        router.push(`/admin/quotes/new?fromQuoteId=${c.quoteIds[0]}`);
                                      } else {
                                        router.push(`/admin/quotes/new?leadId=${c.leadIds[0]}`);
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
    </>
  );
}

function ComposeDrawer({
  contact, fromName, companyId, onSent, onClose,
}: {
  contact: Contact;
  fromName?: string;
  companyId?: string | null;
  onSent: () => void;
  onClose: () => void;
}) {
  const initial = templateFor(contact.status, {
    contactName: contact.name,
    eventDate: contact.nextEventDate ? new Date(contact.nextEventDate).toLocaleDateString("en-ZA", { day: "numeric", month: "long" }) : undefined,
    daysSinceLastContact: contact.daysSinceLastTouch ?? undefined,
    fromName,
    companyId: companyId ?? null,
  });
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [copied, setCopied] = useState(false);

  const payload = { to: contact.email || "", subject, body, fromName };

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <Send className="w-5 h-5 text-purple-600" />
          Compose to {contact.name}
        </SheetTitle>
        <SheetDescription>
          Quick personal mail. Sent through your own inbox so it looks like it came from you.
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-4 mt-4">
        {/* Contact summary */}
        <Card className="border-0 shadow-sm bg-slate-50">
          <CardContent className="py-3 px-4 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Email</span>
              <span className="font-medium text-slate-900">{contact.email || "(none)"}</span>
            </div>
            {contact.phone && (
              <div className="flex justify-between">
                <span className="text-slate-500">Phone</span>
                <span className="font-medium text-slate-900">{contact.phone}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-500">Status</span>
              <span className="font-medium text-slate-900">{STATUS_META[contact.status].label}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Orders</span>
              <span className="font-medium text-slate-900">{contact.orderCount} ({fmtMoney.format(contact.totalSpent)})</span>
            </div>
            {contact.nextEventDate && (
              <div className="flex justify-between">
                <span className="text-slate-500">Next event</span>
                <span className="font-medium text-slate-900">{new Date(contact.nextEventDate).toLocaleDateString("en-ZA", { day: "numeric", month: "long" })}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Editable template */}
        <div>
          <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Subject</label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1" />
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono"
          />
          <p className="text-[11px] text-slate-500 mt-1">
            Edit freely, the template's just a starting point based on this contact's status.
          </p>
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
          <Button
            variant="default"
            disabled={!contact.email}
            onClick={() => {
              window.open(composeEmail.gmailUrl(payload), "_blank", "noopener");
              onSent();
            }}
            className="gap-2"
          >
            <ExternalLink className="w-4 h-4" /> Open in Gmail
          </Button>
          <Button
            variant="outline"
            disabled={!contact.email}
            onClick={() => {
              window.open(composeEmail.outlookUrl(payload), "_blank", "noopener");
              onSent();
            }}
            className="gap-2"
          >
            <ExternalLink className="w-4 h-4" /> Open in Outlook
          </Button>
          <Button
            variant="outline"
            disabled={!contact.email}
            onClick={() => {
              window.location.href = composeEmail.mailto(payload);
              onSent();
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
                onSent();
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
        billing_city: "", billing_postal_code: "", notes: "",
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
      billing_city: "", billing_postal_code: "", notes: "",
    });
    setShowMore(false);
    // Layer 2: enrich from the row (billing, tax, notes).
    (async () => {
      const { data } = await supabase
        .from("clients")
        .select("client_name, email, phone, client_type, tax_number, billing_address_line1, billing_address_line2, billing_city, billing_postal_code, notes")
        .eq("id", editing.clientId)
        .maybeSingle();
      if (!data) return;
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
      });
      const hasOptional = !!(data.billing_address_line1 || data.tax_number || data.notes);
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
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700">
            {saving ? "Saving..." : editing?.clientId ? "Save changes" : promoting ? "Save as client" : "Add client"}
          </Button>
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
