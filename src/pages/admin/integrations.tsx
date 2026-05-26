/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * Integrations & Zapier
 *
 * Catering company connects CateringMS to their other tools via Zapier
 * (or any webhook receiver). Two flows:
 *
 *  OUTBOUND (CateringMS -> their tools):
 *    They paste a Zapier "Catch Hook" URL, pick which event to listen
 *    for, and CateringMS POSTs JSON to that URL whenever the event
 *    fires. Postgres triggers do the dispatch via pg_net so it works
 *    even when no Next.js API process is running.
 *
 *  INBOUND (their tools -> CateringMS):
 *    They generate an API key and Zapier (or anything else) calls our
 *    /api/integrations/leads endpoint with `Authorization: Bearer
 *    <key>` to drop a new lead into the pipeline.
 *
 *  Plus a gallery of pre-baked Zap recipe ideas tuned to catering
 *  workflows so they can get something useful running in 60 seconds.
 *
 *  SV UX: shows the raw API key once on creation with a copy-to-
 *  clipboard pulse, then masks forever after. Fire-test button on each
 *  webhook subscription that POSTs a sample payload and shows the live
 *  response inline.
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Zap, Key, Webhook, Copy, Check, Trash2, Plus, ExternalLink, ArrowRight, Sparkles, Activity, AlertTriangle, Loader2, FileSpreadsheet, Bell, Hash, MessageSquare, ChefHat, Mail, Link2, Send, Receipt, Banknote, Users, XCircle, Clock } from "lucide-react";
import { captureException } from "@/lib/observability";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types/app";
import { supabase } from "@/integrations/supabase/client";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useToast } from "@/hooks/use-toast";
import { generateApiKey, generateWebhookSecret } from "@/lib/apiKeys";

interface ApiKey {
  id: string;
  label: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  is_active: boolean;
  created_at: string;
  revoked_at: string | null;
}

interface WebhookSub {
  id: string;
  label: string | null;
  event_type: string;
  target_url: string;
  signing_secret: string;
  is_active: boolean;
  last_fired_at: string | null;
  last_status: number | null;
  failure_count: number;
}

const EVENT_TYPES: { id: string; label: string }[] = [
  { id: "lead.created",         label: "New lead" },
  { id: "lead.status_changed",  label: "Lead status changed" },
  { id: "quote.created",        label: "New quote (any status)" },
  { id: "quote.sent",           label: "Quote sent" },
  { id: "quote.accepted",       label: "Quote accepted" },
  { id: "order.created",        label: "New order booked" },
  { id: "order.status_changed", label: "Order status changed" },
  { id: "inventory.low_stock",  label: "Inventory low" },
];

interface Recipe {
  title: string;
  description: string;
  trigger: string;
  action: string;
  icon: typeof FileSpreadsheet;
  badge: string;
}

const RECIPES: Recipe[] = [
  // INT-B (task #222, 2026-05-25): four top-quality catering-shaped
  // recipes Bobby asked for. Each one ties to a real day-to-day
  // pain point the team has flagged + uses event triggers we
  // already dispatch on (with a Zapier-side filter for the
  // variants). Slotted above the existing 11 so they get top
  // placement.
  {
    title: "Quote going cold -> chase by SMS",
    description: "Quote was sent 3 days ago and the client hasn't replied? Auto-SMS via Twilio with a friendly 'still keen?' nudge and a deep-link back to their quote. Conversion lift on the leads that ghost.",
    trigger: "quote.sent",
    action: "Zapier Delay (3 days) -> Twilio - Send SMS (filter: order_id IS NULL)",
    icon: Clock,
    badge: "Catering gold",
  },
  {
    title: "Final headcount due -> WhatsApp the client",
    description: "48 hours before the event, auto-WhatsApp the client to confirm the final headcount. Cuts the day-of 'how many are we cooking for' phone tag in half and locks the kitchen number in.",
    trigger: "order.created",
    action: "Zapier Schedule (event_date - 2 days) -> WhatsApp - Send template",
    icon: Users,
    badge: "Catering gold",
  },
  {
    title: "Payment received -> Slack #money",
    description: "EFT confirmed, deposit lands, balance paid - whichever fires, your finance channel pops. Includes amount, client name and the invoice link. Team morale + cashflow awareness in one beat.",
    trigger: "order.status_changed",
    action: "Slack - Post #money (filter: payment_status IN paid,partial)",
    icon: Banknote,
    badge: "Catering gold",
  },
  {
    title: "Order cancelled -> free the kitchen + driver",
    description: "Cancellation lands; kitchen and driver WhatsApp groups get an instant heads-up so they can free up the cooker, the vehicle and the prep slots. Stops the silent waste of holding a 50-portion slot for a no-show.",
    trigger: "order.status_changed",
    action: "WhatsApp - Two group messages (filter: status = cancelled)",
    icon: XCircle,
    badge: "Catering gold",
  },
  {
    title: "Quote in here -> Quote in Xero",
    description: "Every quote you build in CateringMS auto-creates the matching Xero quote so accounting stays in sync. No more double entry.",
    trigger: "quote.created",
    action: "Xero - Create draft quote",
    icon: Receipt,
    badge: "Xero sync",
  },
  {
    title: "Xero invoice paid -> Order paid",
    description: "Client pays the Xero invoice? Their CateringMS order auto-flips to paid (full or partial) and the kitchen / drivers see the green tick.",
    trigger: "xero.invoice_paid",
    action: "Webhooks - POST to /api/integrations/invoice-paid",
    icon: Receipt,
    badge: "Xero sync",
  },
  {
    title: "Quote in Xero -> Quote in here",
    description: "Accountant builds a quote in Xero? Zapier mirrors it back so kitchen, ops and dispatch all see it without anyone re-typing.",
    trigger: "xero.quote_created",
    action: "Webhooks - POST to /api/integrations/quotes",
    icon: Receipt,
    badge: "Xero sync",
  },
  {
    title: "New leads -> Google Sheet",
    description: "Every fresh enquiry lands as a new row in your sales pipeline sheet, with name, event date, guests, source.",
    trigger: "lead.created",
    action: "Google Sheets - Create row",
    icon: FileSpreadsheet,
    badge: "Most popular",
  },
  {
    title: "Quote accepted -> Slack #wins",
    description: "Pop open champagne in the team chat the moment a quote is signed off. Includes total + client name.",
    trigger: "quote.accepted",
    action: "Slack - Send channel message",
    icon: Hash,
    badge: "Team morale",
  },
  {
    title: "New lead -> SMS the owner",
    description: "Don't let a lead sit. The boss gets a Twilio / SMS within seconds of the form submit.",
    trigger: "lead.created",
    action: "Twilio - Send SMS",
    icon: MessageSquare,
    badge: "Fast follow-up",
  },
  {
    title: "Order delivered -> review request",
    description: "When the kitchen marks an order completed, the client gets a Trustpilot or Google review request.",
    trigger: "order.status_changed",
    action: "Trustpilot - Send invitation",
    icon: Sparkles,
    badge: "Reviews",
  },
  {
    title: "Low stock -> email supplier",
    description: "Lamb leg drops below par on Friday for Saturday's spit braai? Auto-email the butcher with the reorder sheet.",
    trigger: "inventory.low_stock",
    action: "Gmail / Outlook - Send email",
    icon: Mail,
    badge: "Operations",
  },
  {
    title: "New order -> Mailchimp client tag",
    description: "First order? Tag them as 'customer' in Mailchimp. Repeat order? Tag as 'returning'. Cleaner segmentation.",
    trigger: "order.created",
    action: "Mailchimp - Update subscriber",
    icon: Activity,
    badge: "CRM",
  },
  {
    title: "Quote sent -> calendar reminder",
    description: "Auto-create a Google Calendar follow-up 5 days after a quote goes out, so it doesn't slip.",
    trigger: "quote.sent",
    action: "Google Calendar - Create event",
    icon: Bell,
    badge: "No leaks",
  },
  {
    title: "New order -> kitchen WhatsApp",
    description: "Kitchen lead gets a WhatsApp the moment a confirmed booking lands. No more 'we didn't know'.",
    trigger: "order.created",
    action: "WhatsApp - Send message",
    icon: ChefHat,
    badge: "Kitchen ops",
  },
];

function IntegrationsPage() {
  const { profile, user } = useAuth() as any;
  const companyId = profile?.company_id || user?.company_id;
  const companySlug = profile?.company_slug || user?.company_slug;
  const { toast } = useToast();

  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [subs, setSubs] = useState<WebhookSub[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState<{ label: string }>({ label: "" });
  const [newKeyResult, setNewKeyResult] = useState<{ rawKey: string; prefix: string } | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);
  const [newSub, setNewSub] = useState<{ label: string; event_type: string; target_url: string }>({
    label: "",
    event_type: "lead.created",
    target_url: "",
  });
  const [firingId, setFiringId] = useState<string | null>(null);

  const reload = async () => {
    if (!companyId) return;
    const [keysRes, subsRes] = await Promise.all([
      supabase.from("api_keys").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
      supabase.from("webhook_subscriptions").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
    ]);
    setKeys(keysRes.data || []);
    setSubs(subsRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!companyId) return;
    reload();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const apiBaseUrl = useMemo(() => {
    if (typeof window === "undefined") return process.env.NEXT_PUBLIC_APP_URL || "https://cateringms.com";
    return `${window.location.protocol}//${window.location.host}`;
  }, []);

  const createKey = async () => {
    if (!companyId || !newKey.label.trim()) return;
    const { rawKey, keyHash, keyPrefix } = await generateApiKey(companySlug);
    const { error } = await supabase.from("api_keys").insert({
      company_id: companyId,
      label: newKey.label,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      created_by: user?.id,
    });
    if (error) {
      captureException(error, {
        tags: { route: "/admin/integrations", step: "create-api-key", companyId },
      });
      toast({ title: "Couldn't create key", description: error.message, variant: "destructive" });
      return;
    }
    setNewKeyResult({ rawKey, prefix: keyPrefix });
    setNewKey({ label: "" });
    reload();
  };

  const revokeKey = async (id: string) => {
    if (!confirm("Revoke this key? Anything using it will stop working immediately.")) return;
    await supabase.from("api_keys").update({ is_active: false, revoked_at: new Date().toISOString() }).eq("id", id);
    reload();
  };

  const createSub = async () => {
    if (!companyId || !newSub.target_url.trim() || !newSub.event_type) return;
    const secret = generateWebhookSecret();
    const { error } = await supabase.from("webhook_subscriptions").insert({
      company_id: companyId,
      label: newSub.label || null,
      event_type: newSub.event_type,
      target_url: newSub.target_url.trim(),
      signing_secret: secret,
    });
    if (error) {
      captureException(error, {
        tags: { route: "/admin/integrations", step: "create-webhook", companyId },
      });
      toast({ title: "Couldn't save webhook", description: error.message, variant: "destructive" });
      return;
    }
    setNewSub({ label: "", event_type: "lead.created", target_url: "" });
    reload();
  };

  const toggleSub = async (id: string, is_active: boolean) => {
    await supabase.from("webhook_subscriptions").update({ is_active }).eq("id", id);
    reload();
  };

  const deleteSub = async (id: string) => {
    if (!confirm("Delete this webhook subscription?")) return;
    await supabase.from("webhook_subscriptions").delete().eq("id", id);
    reload();
  };

  const fireTest = async (sub: WebhookSub) => {
    setFiringId(sub.id);
    try {
      const r = await fetch("/api/integrations/test-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription_id: sub.id }),
        credentials: "include",
      });
      const data = await r.json();
      if (r.ok) {
        toast({ title: "Test fired", description: `Status ${data.status_code} from your endpoint.` });
      } else {
        captureException(new Error(data.error || `HTTP ${r.status}`), {
          tags: { route: "/admin/integrations", step: "fire-test-webhook", companyId, subId: sub.id },
        });
        toast({ title: "Test failed", description: data.error || "Endpoint didn't accept the test.", variant: "destructive" });
      }
    } catch (e: any) {
      captureException(e, {
        tags: { route: "/admin/integrations", step: "fire-test-network", companyId, subId: sub.id },
      });
      toast({ title: "Test failed", description: e?.message, variant: "destructive" });
    } finally {
      setFiringId(null);
      reload();
    }
  };

  return (
    <>
      <NoIndexMeta />
      <Head><title>Integrations - CateringMS Admin</title></Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80">
        <div className="px-3 sm:px-4 md:px-6 pt-20 lg:pt-6 pb-6 max-w-screen-2xl">

          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center shadow-lg flex-shrink-0">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-orange-600 to-pink-600 bg-clip-text text-transparent flex items-center gap-2 flex-wrap">
                  Integrations & Zapier
                  <InfoTooltip content={"Push data in with API keys, send data out with webhooks.\n\nThis is what hooks CateringMS up to Zapier and the 5,000+ apps it reaches."} />
                </h1>
                <p className="text-sm sm:text-base text-slate-600 mt-1">
                  API keys for inbound data and webhooks for outbound. Hook CateringMS into Zapier so leads, orders, and payments flow into Google Sheets, Slack, WhatsApp, Mailchimp, or anywhere else you already work.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="https://zapier.com/apps/webhook/integrations" target="_blank" rel="noopener">
                <Button variant="outline" className="gap-2">
                  <ExternalLink className="w-4 h-4" /> Open Zapier
                </Button>
              </Link>
            </div>
          </div>

          {/* Quickstart */}
          <Card className="border-0 shadow-lg mb-6 bg-gradient-to-r from-orange-50 to-pink-50">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="w-5 h-5 text-orange-600" />
                Get a Zap running in 60 seconds
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div className="bg-white rounded-lg p-3 border border-orange-100">
                  <div className="flex items-center gap-2 font-semibold text-slate-900 mb-1">
                    <span className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs">1</span>
                    Pick a recipe
                  </div>
                  <p className="text-xs text-slate-600">Browse the gallery below and click "Open in Zapier".</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-orange-100">
                  <div className="flex items-center gap-2 font-semibold text-slate-900 mb-1">
                    <span className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs">2</span>
                    Copy the catch-hook URL
                  </div>
                  <p className="text-xs text-slate-600">Zapier shows it in step 1 of any "Webhooks - Catch Hook" trigger.</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-orange-100">
                  <div className="flex items-center gap-2 font-semibold text-slate-900 mb-1">
                    <span className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs">3</span>
                    Paste here & "Fire test"
                  </div>
                  <p className="text-xs text-slate-600">Zapier sees a sample payload and you can finish the Zap. Done.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Xero accounting */}
          <Card className="border-0 shadow-lg mb-6 bg-gradient-to-br from-blue-50 to-cyan-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-blue-600" />
                Xero accounting
                <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">Setup via Zapier</Badge>
              </CardTitle>
              <CardDescription>
                Two-way sync: quotes flow both directions, payments roll back into orders. No double entry.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                <div className="bg-white rounded-lg p-3 border border-blue-100">
                  <p className="font-semibold text-slate-900 mb-1">CateringMS quote &rarr; Xero</p>
                  <p className="text-xs text-slate-600 mb-2">Outbound webhook on <code className="bg-slate-100 px-1 rounded text-[11px]">quote.created</code> &rarr; Zapier "Xero - Create Draft Quote".</p>
                  <Link href="https://zapier.com/apps/xero/integrations/webhook" target="_blank" rel="noopener" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                    Open Xero in Zapier <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
                <div className="bg-white rounded-lg p-3 border border-blue-100">
                  <p className="font-semibold text-slate-900 mb-1">Xero quote &rarr; CateringMS</p>
                  <p className="text-xs text-slate-600 mb-2">Zapier "New Xero Quote" &rarr; "Webhooks - POST" to <code className="bg-slate-100 px-1 rounded text-[11px] break-all">/api/integrations/quotes</code> with your API key.</p>
                  <p className="text-[11px] text-slate-500">Idempotent on xero_quote_id, safe to re-deliver.</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-blue-100">
                  <p className="font-semibold text-slate-900 mb-1">Xero invoice paid &rarr; Order paid</p>
                  <p className="text-xs text-slate-600 mb-2">Zapier "Xero - Invoice Paid" &rarr; "Webhooks - POST" to <code className="bg-slate-100 px-1 rounded text-[11px] break-all">/api/integrations/invoice-paid</code>. Auto-flips order status.</p>
                </div>
              </div>
              <div className="bg-white rounded-lg p-3 border border-blue-100 text-xs space-y-1">
                <p className="font-semibold text-slate-900">Setup steps</p>
                <ol className="list-decimal list-inside text-slate-700 space-y-0.5">
                  <li>Generate an API key below (scopes: leads:write, quotes:write, orders:read, invoices:write).</li>
                  <li>Open Zapier, sign in to both Xero and "Webhooks by Zapier".</li>
                  <li>Build the three Zaps using the recipe gallery cards below as templates.</li>
                  <li>Fire test on each from your Zap editor and from the recipe card here, both should turn green.</li>
                </ol>
              </div>
              {/* Phase 5 #8: native Xero OAuth connect. Hits the
                  server-side initiator that mints state + cookies
                  before redirecting to login.xero.com. The callback
                  endpoint persists tokens to xero_integration_settings
                  and the existing sync-invoice / sync-credit-note
                  endpoints take it from there. */}
              <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-xs text-blue-900 flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold mb-1">One-click native Xero connect</p>
                  <p>Skip Zapier entirely. Sign in with your Xero account once and CateringMS pushes invoices + credit notes directly. Tokens auto-refresh; on Xero-side edits we surface a 409 conflict so nothing silently overwrites.</p>
                </div>
                <a
                  href="/api/accounting/xero/authorize"
                  className="inline-flex items-center gap-2 shrink-0 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-2"
                >
                  Connect Xero
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </CardContent>
          </Card>

          {/* Phase 5 #8: QuickBooks counterpart. Same OAuth pattern;
              the sync endpoint mirrors Xero's drift / 401-retry /
              token-refresh shape via the shared accountingTokens lib. */}
          <Card className="border-0 shadow-lg mb-6 bg-gradient-to-br from-emerald-50 to-teal-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-600" />
                QuickBooks Online
                <Badge variant="outline" className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200">Native OAuth</Badge>
              </CardTitle>
              <CardDescription>
                Direct push of CateringMS invoices into QuickBooks Online. Idempotent on external_id; QuickBooks-side edits land a 409 conflict instead of clobbering.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="bg-white rounded-lg p-3 border border-emerald-100 text-xs space-y-1">
                <p className="font-semibold text-slate-900">What gets pushed</p>
                <ul className="list-disc list-inside text-slate-700 space-y-0.5">
                  <li>Invoices created or marked sent in CateringMS land as draft invoices in QB.</li>
                  <li>Customer matched by email; created if absent.</li>
                  <li>Tokens refresh automatically on a 401 so you don't need to reconnect.</li>
                </ul>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 text-xs text-emerald-900 flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold mb-1">Connect QuickBooks Online</p>
                  <p>Sign in once with your Intuit / QuickBooks account and CateringMS pushes invoices straight in.</p>
                </div>
                <a
                  href="/api/accounting/quickbooks/authorize"
                  className="inline-flex items-center gap-2 shrink-0 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-3 py-2"
                >
                  Connect QuickBooks
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </CardContent>
          </Card>

          {/* Wave 70.1 - Sage Business Cloud sync mapping is live.
              Once an admin picks the four defaults (ledger, tax, bank,
              payment method) below the invoice + payment sync
              endpoints stop 412'ing and start pushing for real. */}
          <SageCard companyId={companyId} />

          {/* Legacy outsource-fulfilment recipes block stays untouched. */}

          {/* Outbound webhooks */}
          <Card className="border-0 shadow-lg mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Webhook className="w-5 h-5 text-orange-600" />
                Outbound webhooks
                <InfoTooltip content={"When something happens in CateringMS, we send the details to a URL you choose.\n\nPaste a Zapier 'Catch Hook' URL here and you can trigger any of the 5,000+ apps Zapier connects to."} />
              </CardTitle>
              <CardDescription>
                Paste a Zapier "Catch Hook" URL and CateringMS will POST every matching event to it.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="md:col-span-3">
                  <Label htmlFor="sub_label">Label</Label>
                  <Input id="sub_label" value={newSub.label} onChange={(e) => setNewSub({ ...newSub, label: e.target.value })} placeholder="Leads to sales sheet" />
                </div>
                <div className="md:col-span-3">
                  <Label htmlFor="sub_event">Event</Label>
                  <select
                    id="sub_event"
                    value={newSub.event_type}
                    onChange={(e) => setNewSub({ ...newSub, event_type: e.target.value })}
                    className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
                  >
                    {EVENT_TYPES.map((e) => (
                      <option key={e.id} value={e.id}>{e.label}</option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-5">
                  <Label htmlFor="sub_url">Target URL</Label>
                  <Input id="sub_url" value={newSub.target_url} onChange={(e) => setNewSub({ ...newSub, target_url: e.target.value })} placeholder="https://hooks.zapier.com/hooks/catch/..." />
                </div>
                <div className="md:col-span-1 flex items-end">
                  <Button onClick={createSub} disabled={!newSub.target_url} className="w-full gap-1">
                    <Plus className="w-4 h-4" /> Add
                  </Button>
                </div>
              </div>

              {loading ? (
                <div className="py-8 text-center text-slate-500"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
              ) : subs.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">No webhooks configured yet. Pick a recipe below to get started.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="text-left py-2">Label</th>
                        <th className="text-left py-2">Event</th>
                        <th className="text-left py-2">Endpoint</th>
                        <th className="text-left py-2">Last fired</th>
                        <th className="text-right py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subs.map((s) => (
                        <tr key={s.id} className="border-b border-slate-100 align-top">
                          <td className="py-3">
                            <div className="font-medium text-slate-900">{s.label || "Untitled"}</div>
                            {!s.is_active && <Badge variant="outline" className="text-[10px] mt-1">Paused</Badge>}
                          </td>
                          <td className="py-3 text-slate-700">
                            <Badge variant="outline" className="font-mono text-[11px]">{s.event_type}</Badge>
                          </td>
                          <td className="py-3 max-w-xs">
                            <div className="text-xs font-mono text-slate-600 truncate" title={s.target_url}>
                              {s.target_url}
                            </div>
                          </td>
                          <td className="py-3 text-xs text-slate-500">
                            {s.last_fired_at ? (
                              <>
                                {new Date(s.last_fired_at).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "numeric", minute: "numeric" })}
                                {s.last_status && <span className="ml-1 text-emerald-600">[{s.last_status}]</span>}
                                {s.failure_count > 0 && <span className="ml-1 text-red-600">{s.failure_count} fails</span>}
                              </>
                            ) : "Never"}
                          </td>
                          <td className="py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button size="sm" variant="outline" onClick={() => fireTest(s)} disabled={firingId === s.id} className="gap-1">
                                {firingId === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                                Test
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => toggleSub(s.id, !s.is_active)}>
                                {s.is_active ? "Pause" : "Resume"}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => deleteSub(s.id)} className="text-red-600">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="text-[11px] text-slate-500">
                Every payload is signed with HMAC-SHA256 in the <code className="bg-slate-100 px-1 rounded">X-Cms-Signature</code> header so you can verify it really came from CateringMS.
              </p>
            </CardContent>
          </Card>

          {/* Inbound API keys */}
          <Card className="border-0 shadow-lg mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5 text-emerald-600" />
                Inbound API keys
                <InfoTooltip content={"Use these to push data into CateringMS from anywhere, Zapier, Make, your own scripts, Facebook Lead Ads.\n\nExample: a Lead Ads form fills, Zapier hits our leads endpoint with the API key, and a new lead drops into your pipeline."} />
              </CardTitle>
              <CardDescription>
                Push leads into CateringMS from Zapier, Make, your own scripts, or Facebook Lead Ads.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-slate-900 text-slate-100 rounded-lg p-3 text-xs font-mono overflow-x-auto">
                <div className="text-slate-400 mb-1"># Create a new lead in CateringMS</div>
                <div>POST <span className="text-emerald-400">{apiBaseUrl}/api/integrations/leads</span></div>
                <div>Authorization: Bearer <span className="text-amber-400">cms_yourkey_xxx...</span></div>
                <div>Content-Type: application/json</div>
                <div className="mt-2 text-slate-400">
                  {`{ "contact_name": "...", "email": "...", "phone": "...", "event_date": "2026-08-15", "guest_count": 80, "source": "facebook_ads", "notes": "..." }`}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="md:col-span-9">
                  <Label htmlFor="key_label">Label</Label>
                  <Input id="key_label" value={newKey.label} onChange={(e) => setNewKey({ label: e.target.value })} placeholder="Zapier - lead intake" />
                </div>
                <div className="md:col-span-3 flex items-end">
                  <Button onClick={createKey} disabled={!newKey.label.trim()} className="w-full gap-1">
                    <Plus className="w-4 h-4" /> Generate key
                  </Button>
                </div>
              </div>

              {newKeyResult && (
                <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-emerald-900 mb-1 flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4" /> New API key, copy it now
                      </p>
                      <p className="text-xs text-emerald-700 mb-2">
                        We only show this once. Store it somewhere safe, if you lose it, revoke and create a new one.
                      </p>
                      <code className="block bg-white border border-emerald-200 rounded px-3 py-2 text-xs font-mono break-all">
                        {newKeyResult.rawKey}
                      </code>
                    </div>
                    <Button
                      onClick={async () => {
                        await navigator.clipboard.writeText(newKeyResult.rawKey);
                        setKeyCopied(true);
                        setTimeout(() => setKeyCopied(false), 2000);
                      }}
                      size="sm"
                      className="gap-1.5"
                    >
                      {keyCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {keyCopied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setNewKeyResult(null)} className="mt-3">
                    I've stored it
                  </Button>
                </div>
              )}

              {keys.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No keys yet. Generate one above.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase tracking-wide text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="text-left py-2">Label</th>
                        <th className="text-left py-2">Prefix</th>
                        <th className="text-left py-2">Created</th>
                        <th className="text-left py-2">Last used</th>
                        <th className="text-right py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {keys.map((k) => (
                        <tr key={k.id} className="border-b border-slate-100">
                          <td className="py-3 font-medium text-slate-900">{k.label}</td>
                          <td className="py-3 font-mono text-xs">{k.key_prefix}***</td>
                          <td className="py-3 text-xs text-slate-500">
                            {new Date(k.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                          </td>
                          <td className="py-3 text-xs text-slate-500">
                            {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short" }) : "Never"}
                          </td>
                          <td className="py-3 text-right">
                            {k.is_active ? (
                              <Button size="sm" variant="ghost" onClick={() => revokeKey(k.id)} className="text-red-600 gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" /> Revoke
                              </Button>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">Revoked</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recipe gallery */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-600" />
                Catering Zap recipes
              </CardTitle>
              <CardDescription>
                One-click ideas tuned for catering operations. Each one tells you which event to listen for, then click "Use" to seed the form above.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* INT-B (task #222, 2026-05-25): event-coverage primer.
                  The "Catering gold" four use a Zapier-side Delay /
                  Schedule / Filter on top of an existing trigger
                  (quote.sent + order.status_changed) - so they work
                  today, just with a one-step Zap detour. Spelling it
                  out here saves a debug round when a recipe doesn't
                  fire the way the title implies. */}
              <div className="mb-4 rounded-lg border border-purple-200 bg-purple-50/60 px-3 py-2 text-xs text-purple-900 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-purple-700" />
                <p>
                  <strong>How the triggers map.</strong> The events we fire today are
                  <code className="mx-1 bg-white px-1 rounded">lead.created</code>,
                  <code className="mx-1 bg-white px-1 rounded">lead.status_changed</code>,
                  <code className="mx-1 bg-white px-1 rounded">quote.created</code>,
                  <code className="mx-1 bg-white px-1 rounded">quote.sent</code>,
                  <code className="mx-1 bg-white px-1 rounded">quote.accepted</code>,
                  <code className="mx-1 bg-white px-1 rounded">order.created</code>,
                  <code className="mx-1 bg-white px-1 rounded">order.status_changed</code>,
                  <code className="mx-1 bg-white px-1 rounded">inventory.low_stock</code>.
                  Recipes that need a variant ("payment received", "cancellation", "X days after quote") use those same events plus a one-step Zapier Filter or Delay - the recipe copy tells you which. Nothing's mocked.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {RECIPES.map((r) => {
                  const Icon = r.icon;
                  return (
                    <div key={r.title} className="border border-slate-200 rounded-xl p-4 hover:border-orange-300 hover:shadow-md transition-all">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-100 to-pink-100 flex items-center justify-center flex-shrink-0">
                          <Icon className="w-4 h-4 text-orange-600" />
                        </div>
                        <Badge variant="outline" className="text-[10px]">{r.badge}</Badge>
                      </div>
                      <h4 className="font-semibold text-sm text-slate-900">{r.title}</h4>
                      <p className="text-xs text-slate-600 mt-1 leading-snug">{r.description}</p>
                      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
                        <code className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">{r.trigger}</code>
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                        <span className="text-slate-600 truncate ml-2">{r.action.split(" - ")[0]}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        <Link href="https://zapier.com/apps/webhook/integrations" target="_blank" rel="noopener" className="flex-1">
                          <Button size="sm" variant="outline" className="w-full gap-1.5 text-xs">
                            <ExternalLink className="w-3 h-3" /> Open Zapier
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setNewSub({ label: r.title, event_type: r.trigger, target_url: "" });
                            const el = document.getElementById("sub_url");
                            el?.scrollIntoView({ behavior: "smooth", block: "center" });
                            setTimeout(() => (el as HTMLInputElement)?.focus(), 350);
                          }}
                          className="gap-1 text-xs"
                        >
                          <Link2 className="w-3 h-3" /> Use
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

/**
 * Wave 70.1 - Sage Business Cloud settings card.
 *
 * Two-state card:
 *   Not connected: shows the OAuth "Connect Sage" CTA + a primer on
 *                  what works once connected.
 *   Connected:     shows the four defaults the sync endpoints need
 *                  (ledger account, tax rate, bank account, payment
 *                  method) + a "prices include tax" toggle. Save
 *                  writes to accounting_integrations.metadata. The
 *                  picker lists are pulled live from the Sage tenant
 *                  on mount so the ids are always current.
 *
 * Without this panel the sync endpoints return 412 with a "configure
 * it on /admin/integrations" pointer. With it, an admin can finish
 * the wave 70.1 setup in 30 seconds and the auto-invoice + auto-
 * payment flows light up.
 */
interface SageOption { id: string; label: string }
interface SageOptions {
  ledger_accounts: SageOption[];
  tax_rates: SageOption[];
  bank_accounts: SageOption[];
  payment_methods: SageOption[];
}
interface SageMetadata {
  default_ledger_account_id?: string;
  default_tax_rate_id?: string;
  default_bank_account_id?: string;
  default_payment_method_id?: string;
  prices_include_tax?: boolean;
}

function SageCard({ companyId }: { companyId: string | null | undefined }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [options, setOptions] = useState<SageOptions>({ ledger_accounts: [], tax_rates: [], bank_accounts: [], payment_methods: [] });
  const [metadata, setMetadata] = useState<SageMetadata>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch("/api/accounting/sage/settings", { credentials: "include" });
        const data = await r.json();
        if (cancelled) return;
        setConnected(!!data.connected);
        setTokenError(data.tokenError || null);
        setOptions(data.options || { ledger_accounts: [], tax_rates: [], bank_accounts: [], payment_methods: [] });
        setMetadata(data.metadata || {});
      } catch (e: any) {
        if (!cancelled) toast({ title: "Couldn't load Sage settings", description: e?.message, variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, toast]);

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/accounting/sage/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(metadata),
      });
      const data = await r.json();
      if (!r.ok) {
        toast({ title: "Couldn't save Sage settings", description: data.error || "Server error", variant: "destructive" });
        return;
      }
      toast({ title: "Sage settings saved", description: "Invoice + payment sync will use these defaults." });
    } catch (e: any) {
      toast({ title: "Couldn't save Sage settings", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const allFourSet = !!(metadata.default_ledger_account_id && metadata.default_tax_rate_id && metadata.default_bank_account_id);

  return (
    <Card className="border-0 shadow-lg mb-6 bg-gradient-to-br from-blue-50 to-cyan-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 flex-wrap">
          <Receipt className="w-5 h-5 text-blue-600" />
          Sage Business Cloud (Pastel)
          <Badge variant="outline" className="text-[10px] bg-blue-100 text-blue-700 border-blue-200">Native OAuth</Badge>
          {connected && allFourSet && (
            <Badge variant="outline" className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-300">Sync ready</Badge>
          )}
          {connected && !allFourSet && (
            <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-800 border-amber-300">Needs defaults</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Sage is the SA market default - SARS-aware, ZAR currency, comma-decimal money. Pick the four defaults below and CateringMS pushes invoices + payments straight in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="py-6 text-center text-slate-500"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
        ) : !connected ? (
          <>
            <div className="bg-white rounded-lg p-3 border border-blue-100 text-xs space-y-1">
              <p className="font-semibold text-slate-900">Once connected you'll be able to</p>
              <ul className="list-disc list-inside text-slate-700 space-y-0.5">
                <li>Push CateringMS invoices to Sage as sales invoices (idempotent on external_id).</li>
                <li>Push CateringMS payments to Sage as customer receipts allocated to the matching invoice.</li>
                <li>Auto-match Sage contacts by email; create them if absent.</li>
                <li>Tokens auto-refresh so you don't reconnect every hour.</li>
              </ul>
              {tokenError && (
                <p className="text-rose-700 mt-2"><AlertTriangle className="w-3 h-3 inline mr-1" />{tokenError}</p>
              )}
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-xs text-blue-900 flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold mb-1">Connect Sage Business Cloud</p>
                <p>Sign in once with your Sage account. CateringMS stores the OAuth tokens; pick your defaults below the moment you're back.</p>
              </div>
              <a
                href={`/api/accounting/sage/authorize?companyId=${encodeURIComponent(companyId || "")}`}
                className="inline-flex items-center gap-2 shrink-0 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-3 py-2"
              >
                Connect Sage
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </>
        ) : (
          <>
            <div className="bg-white rounded-lg p-4 border border-blue-100 space-y-3">
              <p className="text-xs text-slate-600">
                The four defaults below tell Sage which accounts to slot CateringMS invoices + payments into. Pick once; every future sync uses them. Pulled live from your Sage tenant.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <Label htmlFor="sage_ledger">Default sales ledger account <span className="text-rose-600">*</span></Label>
                  <select
                    id="sage_ledger"
                    value={metadata.default_ledger_account_id || ""}
                    onChange={(e) => setMetadata({ ...metadata, default_ledger_account_id: e.target.value })}
                    className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
                  >
                    <option value="">Pick a sales account</option>
                    {options.ledger_accounts.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="sage_tax">Default tax rate <span className="text-rose-600">*</span></Label>
                  <select
                    id="sage_tax"
                    value={metadata.default_tax_rate_id || ""}
                    onChange={(e) => setMetadata({ ...metadata, default_tax_rate_id: e.target.value })}
                    className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
                  >
                    <option value="">Pick a tax rate (VAT 15% etc)</option>
                    {options.tax_rates.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="sage_bank">Default bank account (for payments) <span className="text-rose-600">*</span></Label>
                  <select
                    id="sage_bank"
                    value={metadata.default_bank_account_id || ""}
                    onChange={(e) => setMetadata({ ...metadata, default_bank_account_id: e.target.value })}
                    className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
                  >
                    <option value="">Pick a bank account</option>
                    {options.bank_accounts.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="sage_method">Default payment method</Label>
                  <select
                    id="sage_method"
                    value={metadata.default_payment_method_id || ""}
                    onChange={(e) => setMetadata({ ...metadata, default_payment_method_id: e.target.value })}
                    className="w-full h-10 rounded-md border border-slate-200 px-3 text-sm bg-white"
                  >
                    <option value="">Optional, Sage picks default</option>
                    {options.payment_methods.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700 mt-2">
                <input
                  type="checkbox"
                  checked={metadata.prices_include_tax === true}
                  onChange={(e) => setMetadata({ ...metadata, prices_include_tax: e.target.checked })}
                  className="rounded border-slate-300"
                />
                Prices on my CateringMS invoices already include tax (tick if your line prices are VAT-inclusive)
              </label>
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <a
                  href={`/api/accounting/sage/authorize?companyId=${encodeURIComponent(companyId || "")}`}
                  className="text-xs text-slate-500 hover:underline"
                >
                  Reconnect Sage
                </a>
                <Button onClick={save} disabled={saving || !allFourSet} className="gap-1.5">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {saving ? "Saving" : "Save defaults"}
                </Button>
              </div>
              {!allFourSet && (
                <p className="text-[11px] text-amber-700 -mt-1">
                  Sales account, tax rate and bank account are required before the sync endpoints can push anything.
                </p>
              )}
              {options.ledger_accounts.length === 0 && (
                <p className="text-[11px] text-rose-700">
                  No ledger accounts returned from Sage - the token may have lost the right scope. Try "Reconnect Sage".
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProtectedIntegrationsPage() {
  // INT-B (task #222, 2026-05-25): admit OWNER. Pre-INT-B the
  // page hardcoded SUPER_ADMIN + COMPANY_ADMIN + ADMIN, so the
  // OWNER persona was 403'd off their own integrations page even
  // though OWNER is in FULL_COMPANY_ACCESS_ROLES. Same regression
  // pattern as the rest of /admin.
  return (
    <ProtectedRoute allowedRoles={[
      UserRole.SUPER_ADMIN,
      UserRole.OWNER,
      UserRole.COMPANY_ADMIN,
      UserRole.ADMIN,
    ]}>
      <IntegrationsPage />
    </ProtectedRoute>
  );
}
