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
import {
  Zap, Key, Webhook, Copy, Check, Trash2, Plus, ExternalLink, ArrowRight,
  Sparkles, Activity, AlertTriangle, Loader2, FileSpreadsheet, Bell, Hash,
  MessageSquare, ChefHat, Mail, Link2, Send, Receipt, BookOpen,
} from "lucide-react";
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
    if (typeof window === "undefined") return "https://cateringms.com";
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
        toast({ title: "Test failed", description: data.error || "Endpoint didn't accept the test.", variant: "destructive" });
      }
    } catch (e: any) {
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

      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-3 sm:px-4 md:px-6 py-6 max-w-screen-2xl">

          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center shadow-lg flex-shrink-0">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-orange-600 to-pink-600 bg-clip-text text-transparent">
                  Integrations & Zapier
                </h1>
                <p className="text-sm sm:text-base text-slate-600 mt-1">
                  Connect CateringMS to Google Sheets, Slack, WhatsApp, Mailchimp -- anywhere Zapier reaches.
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
                  <p className="text-[11px] text-slate-500">Idempotent on xero_quote_id -- safe to re-deliver.</p>
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
                  <li>Fire test on each from your Zap editor and from the recipe card here -- both should turn green.</li>
                </ol>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-800">
                <p className="font-semibold mb-1">One-click native Xero connect (coming soon)</p>
                <p>We're building a "Sign in with Xero" OAuth flow that skips Zapier entirely. Until then the Zapier path above works end-to-end -- no Xero developer account needed on your side.</p>
              </div>
            </CardContent>
          </Card>

          {/* Outbound webhooks */}
          <Card className="border-0 shadow-lg mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Webhook className="w-5 h-5 text-orange-600" />
                Outbound webhooks
                <InfoTooltip content="When something happens in CateringMS we POST a JSON payload to the URL you paste here. Use Zapier 'Webhooks - Catch Hook' as the receiver to trigger any of 5,000+ Zapier actions." />
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
                <InfoTooltip content="Use these to push data INTO CateringMS from Zapier (or anywhere). Example: a Facebook Lead Ad form fires Zapier, which calls our /api/integrations/leads endpoint with the API key as a Bearer token, and a new lead lands in your pipeline." />
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
                        <Sparkles className="w-4 h-4" /> New API key -- copy it now
                      </p>
                      <p className="text-xs text-emerald-700 mb-2">
                        We only show this once. Store it somewhere safe -- if you lose it, revoke and create a new one.
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

export default function ProtectedIntegrationsPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <IntegrationsPage />
    </ProtectedRoute>
  );
}
