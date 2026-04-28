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
import { useState, useEffect, useMemo, useRef } from "react";
import Head from "next/head";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  Search, Mail, Phone, Users, Sparkles, Flame, Clock, AlertTriangle,
  Snowflake, Crown, ArrowRight, Send, Copy, ExternalLink, Inbox,
  Calendar as CalendarIcon, MapPin, ShoppingCart, MessageSquare,
  CheckCircle2, RefreshCw, Filter,
} from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types/app";
import { supabase } from "@/integrations/supabase/client";
import { composeEmail, templateFor, type ClientStatus } from "@/lib/composeEmail";

interface Contact {
  key: string;          // canonical de-dupe key (lower-cased email or name)
  source: "client" | "lead" | "order_only";
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
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | ClientStatus>("all");
  const [active, setActive] = useState<Contact | null>(null);
  const [contactedKeys, setContactedKeys] = useState<Record<string, string>>({});
  const searchRef = useRef<HTMLInputElement>(null);

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

  // Pull from clients + leads + orders, merge by lowercased email
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [clientsRes, leadsRes, ordersRes] = await Promise.all([
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
      ]);

      if (cancelled) return;

      const today = new Date();
      const map = new Map<string, Contact>();

      const keyOf = (email: string | null, name: string | null) =>
        (email || name || "").toLowerCase().trim() || `unknown-${Math.random()}`;

      // Seed from clients
      (clientsRes.data || []).forEach((c: any) => {
        const k = keyOf(c.email, c.client_name);
        map.set(k, {
          key: k,
          source: "client",
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
          if (!existing.phone && l.phone) existing.phone = l.phone;
          if (!existing.email && l.email) existing.email = l.email;
        } else {
          map.set(k, {
            key: k,
            source: "lead",
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
    })();
    return () => { cancelled = true; };
  }, [companyId]);

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

  const visible = useMemo(() => {
    let rows = contacts;
    if (filter !== "all") rows = rows.filter((c) => c.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((c) =>
        (c.name || "").toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q),
      );
    }
    return rows;
  }, [contacts, filter, search]);

  const markContacted = (key: string) => {
    setContactedKeys((prev) => ({ ...prev, [key]: new Date().toISOString() }));
  };

  return (
    <>
      <NoIndexMeta />
      <Head><title>Clients - CateringMS Admin</title></Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80">
        <div className="px-3 sm:px-4 md:px-6 py-6 max-w-screen-2xl">

          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg flex-shrink-0">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                  Clients
                </h1>
                <p className="text-sm sm:text-base text-slate-600 mt-1">
                  Every lead and customer in one place. Status, last touch, suggested next action.
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

          {/* Email cap notice -- ties to pricing tier */}
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
                        <th className="text-left py-3 pl-4 pr-2">Contact</th>
                        <th className="text-left py-3 px-2">Status</th>
                        <th className="text-left py-3 px-2">Suggested action</th>
                        <th className="text-right py-3 px-2">Orders</th>
                        <th className="text-right py-3 px-2">Total spent</th>
                        <th className="text-left py-3 px-2">Last touch</th>
                        <th className="text-right py-3 pr-4">Quick mail</th>
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
                              <Button
                                size="sm"
                                disabled={!c.email}
                                onClick={() => setActive(c)}
                                className="gap-1.5"
                              >
                                <Send className="w-3.5 h-3.5" />
                                Compose
                              </Button>
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

      {/* Compose drawer */}
      <Sheet open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <SheetContent side="right" className="w-full sm:w-[520px] overflow-y-auto">
          {active && (
            <ComposeDrawer
              contact={active}
              fromName={profile?.full_name || profile?.company_name}
              onSent={() => markContacted(active.key)}
              onClose={() => setActive(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function ComposeDrawer({
  contact, fromName, onSent, onClose,
}: {
  contact: Contact;
  fromName?: string;
  onSent: () => void;
  onClose: () => void;
}) {
  const initial = templateFor(contact.status, {
    contactName: contact.name,
    eventDate: contact.nextEventDate ? new Date(contact.nextEventDate).toLocaleDateString("en-ZA", { day: "numeric", month: "long" }) : undefined,
    daysSinceLastContact: contact.daysSinceLastTouch ?? undefined,
    fromName,
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
            Edit freely -- the template's just a starting point based on this contact's status.
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

export default function ClientsPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <ClientsCRM />
    </ProtectedRoute>
  );
}
