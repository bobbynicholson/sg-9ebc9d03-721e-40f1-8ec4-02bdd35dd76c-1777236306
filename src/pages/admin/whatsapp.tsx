/**
 * /admin/whatsapp - connect the company's WhatsApp Business account and decide,
 * message by message, what is Automatic and what stays Manual. Manual messages
 * never send by themselves; the WhatsApp buttons across the app keep working.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { Bot, CheckCircle2, ChevronDown, Copy, ExternalLink, Eye, EyeOff, Hand, Lock, MessageCircle, RefreshCw, RotateCw, Send, ShieldCheck } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { WhatsAppTabs } from "@/components/admin/whatsapp/WhatsAppTabs";
import { PortalHeader, PortalShell, StatTile } from "@/components/portal/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  BulkSection,
  ConsentSection,
  RepliesLink,
  RulesSection,
  type MetaTemplate,
} from "@/components/admin/whatsapp/WhatsAppSections";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useTenantHref } from "@/lib/tenantUrl";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { getTemplateDefinition, renderTemplate } from "@/lib/messageTemplates/registry";
import {
  WHATSAPP_AUTOMATIONS,
  WHATSAPP_GROUPS,
  WHATSAPP_MANUAL_ONLY,
  WHATSAPP_SEND_FROM,
  automationPreview,
  automationVariables,
  wordingProblem,
  type WhatsAppAutomationKey,
  type WhatsAppAutomationSettings,
} from "@/lib/whatsapp/automations";
import type { WhatsAppRules } from "@/lib/whatsapp/rules";
import { cn } from "@/lib/utils";
import { UserRole } from "@/types/app";

interface WhatsAppState {
  connected: boolean;
  displayNumber: string | null;
  phoneNumberId: string | null;
  canConnect: boolean;
  automations: WhatsAppAutomationSettings;
  rules: WhatsAppRules;
  attention: string | null;
  webhookUrl: string;
  webhookVerifyToken: string | null;
  verifyTokenAvailable: boolean;
  webhookVerifiedAt: string | null;
}

type Filter = "all" | "automatic" | "manual";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All messages" },
  { value: "automatic", label: "Automatic" },
  { value: "manual", label: "Manual" },
];

function manualPreview(key: string, companyName: string): string {
  const definition = getTemplateDefinition(key);
  if (!definition) return "";
  const sample: Record<string, string> = {};
  for (const variable of definition.variables) sample[variable.name] = variable.example;
  return renderTemplate(definition.defaultBody, {
    ...sample, first_name: "Sam", from_name: companyName, company_name: companyName, shift_date: "12 December",
  });
}

function ChatPreview({ companyName, text }: { companyName: string; text: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
      <div className="flex items-center gap-2 bg-brand-primary px-3 py-2 text-white">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-xs font-semibold">
          {companyName.trim().charAt(0).toUpperCase() || "C"}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{companyName}</p>
          <p className="text-[10px] opacity-80">Business account</p>
        </div>
      </div>
      <div className="bg-slate-100 p-3 dark:bg-slate-800">
        <div className="max-w-[88%] rounded-lg rounded-tl-none bg-white px-3 py-2 shadow-sm dark:bg-slate-900">
          <p className="whitespace-pre-wrap break-words text-sm text-slate-800 dark:text-slate-100">{text}</p>
          <p className="pt-1 text-right text-[10px] text-slate-400">09:00</p>
        </div>
      </div>
    </div>
  );
}

function messageDestinations(messageKey: string) {
  const destination = WHATSAPP_SEND_FROM[messageKey];
  return destination ? [destination, ...(destination.also || [])] : [];
}

function destinationActionLabel(label: string) {
  if (label.startsWith("Choose ")) return label;
  return label.startsWith("Open ") ? label : `Open ${label}`;
}

/** Sends straight away from the person's own WhatsApp, for any message. */
function DirectSend({ messageKey, text, sendFromHref }: { messageKey: string; text: string; sendFromHref: (path: string) => string }) {
  const [phone, setPhone] = useState("");
  const [body, setBody] = useState(text);
  useEffect(() => setBody(text), [text]);
  const destinations = messageDestinations(messageKey);
  const fieldPrefix = `wa-direct-${messageKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <div>
        <div>
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Send from the matching record</p>
          <p className="text-xs text-slate-500">Choose the matching record first. Its WhatsApp action will fill in the recipient and send options.</p>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {destinations.map((destination) => (
            <Button key={destination.href} asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
              <Link href={sendFromHref(destination.href)}>
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                {destinationActionLabel(destination.label)}
              </Link>
            </Button>
          ))}
        </div>
      </div>
      <div className="border-t border-slate-100 pt-2 dark:border-slate-800">
        <p className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-300">Or prepare a message in your own WhatsApp</p>
      <Label htmlFor={`${fieldPrefix}-phone`} className="text-xs">Mobile number</Label>
      <Input id={`${fieldPrefix}-phone`} type="tel" placeholder="082 000 0000" value={phone} onChange={(event) => setPhone(event.target.value)} />
      <Label htmlFor={`${fieldPrefix}-text`} className="text-xs">Message (replace the sample details)</Label>
      <Textarea id={`${fieldPrefix}-text`} rows={3} value={body} onChange={(event) => setBody(event.target.value)} />
      {phone.trim() && body.trim() ? (
        <Button asChild size="sm" className="gap-1.5">
          <a href={buildWhatsAppUrl(phone, body)} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-3.5 w-3.5" /> Open in WhatsApp</a>
        </Button>
      ) : (
        <Button type="button" size="sm" className="gap-1.5" disabled title="Enter a mobile number and message first">
          <MessageCircle className="h-3.5 w-3.5" /> Open in WhatsApp
        </Button>
      )}
      </div>
    </div>
  );
}

function ModeBadge({ mode }: { mode: "automatic" | "manual" | "locked" }) {
  if (mode === "automatic") return <Badge className="bg-brand-primary text-white hover:bg-brand-primary">Automatic</Badge>;
  if (mode === "locked") return <Badge variant="outline" title="Editable draft opens your own WhatsApp for you to review and send.">Manual only</Badge>;
  return <Badge variant="secondary" title="Send manually from the matching record. Approved templates use your business number.">Manual</Badge>;
}

function WhatsAppPage() {
  const { toast } = useToast();
  const { user, company } = useAuth();
  const { withSlug } = useTenantHref();
  const [state, setState] = useState<WhatsAppState | null>(null);
  const [draft, setDraft] = useState<WhatsAppAutomationSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [connection, setConnection] = useState({ phoneNumberId: "", businessAccountId: "", accessToken: "", appSecret: "" });
  const [showVerifyToken, setShowVerifyToken] = useState(false);
  const [verifyToken, setVerifyToken] = useState<string | null>(null);
  const [rules, setRules] = useState<WhatsAppRules | null>(null);
  const [templates, setTemplates] = useState<MetaTemplate[]>([]);
  const [templatesStatus, setTemplatesStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<string[]>(() => [...WHATSAPP_GROUPS]);
  const detailRef = useRef<HTMLDivElement>(null);

  const companyName = (company as { company_name?: string } | null)?.company_name || "Your company";

  const url = useMemo(() => {
    const companyId = user?.company_id;
    return `/api/admin/whatsapp/settings${companyId ? `?companyId=${encodeURIComponent(companyId)}` : ""}`;
  }, [user?.company_id]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const response = await fetch(url);
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || "Could not load WhatsApp settings.");
      setShowVerifyToken(false);
      setVerifyToken(null);
      setState(json);
      setDraft(json.automations);
      setRules(json.rules);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load WhatsApp settings.");
    }
  }, [url]);

  useEffect(() => { void load(); }, [load]);

  const post = async (name: string, body: Record<string, unknown>, success: string) => {
    setBusy(name);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || "That didn't work. Try again.");
      toast({ title: success });
      return true;
    } catch (e) {
      toast({ title: "WhatsApp", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const connect = async () => {
    if (await post("connect", { action: "connect", ...connection }, "WhatsApp connected")) {
      setConnection({ phoneNumberId: "", businessAccountId: "", accessToken: "", appSecret: "" });
      await load();
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Disconnect WhatsApp? Your details are removed and every message goes back to Manual.")) return;
    if (await post("disconnect", { action: "disconnect" }, "WhatsApp disconnected")) await load();
  };

  const rotateVerifyToken = async () => {
    if (!window.confirm("Replace the verify token? You will need to paste the new token into Meta and verify the callback again.")) return;
    if (await post("rotate_verify_token", { action: "rotate_verify_token" }, "Verify token replaced")) {
      setShowVerifyToken(false);
      await load();
    }
  };

  const save = async () => {
    if (await post("save", { action: "save", automations: draft, rules }, "WhatsApp settings saved")) await load();
  };

  const loadTemplates = useCallback(async (quiet = false) => {
    setTemplatesStatus("loading");
    setTemplatesError(null);
    try {
      const response = await fetch(`/api/admin/whatsapp/templates${url.includes("?") ? url.slice(url.indexOf("?")) : ""}`);
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || "Could not load your templates.");
      setTemplates(json.templates || []);
      setTemplatesStatus("loaded");
      if (!quiet) toast({ title: "Templates loaded from Meta" });
    } catch (e) {
      setTemplatesStatus("error");
      setTemplatesError(e instanceof Error ? e.message : "Could not load your templates.");
    }
  }, [url, toast]);

  const isConnected = !!state?.connected;
  useEffect(() => {
    if (isConnected && templatesStatus === "idle") void loadTemplates(true);
  }, [isConnected, templatesStatus, loadTemplates]);

  const submitTemplate = async () => {
    if (!automation || !setting) return;
    setBusy("submit");
    try {
      const response = await fetch(`/api/admin/whatsapp/templates${url.includes("?") ? url.slice(url.indexOf("?")) : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: automation.key, name: setting.templateName || undefined, wording: setting.wording || automation.wording, language: setting.language }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json?.error || "Meta refused the template.");
      toast({ title: "Submitted to Meta", description: "Approval usually takes a few minutes. Choose Check status to see it." });
      await load();
    } catch (e) {
      toast({ title: "WhatsApp", description: e instanceof Error ? e.message : "Try again.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const selectMessage = (key: string) => {
    setSelected(key);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      window.requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  const copyWording = async (wording: string) => {
    try {
      await navigator.clipboard.writeText(wording);
      toast({ title: "Wording copied" });
    } catch {
      toast({ title: "Couldn't copy", description: "Select the wording and copy it yourself.", variant: "destructive" });
    }
  };

  const copySetupValue = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copied` });
    } catch {
      toast({ title: `Couldn't copy ${label.toLowerCase()}`, description: "Select the value and copy it manually.", variant: "destructive" });
    }
  };

  const fetchVerifyToken = async (): Promise<string> => {
    const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}revealToken=1`, { cache: "no-store" });
    const json = await response.json();
    if (!response.ok || !json.webhookVerifyToken) throw new Error(json?.error || "Could not load the verify token.");
    return json.webhookVerifyToken;
  };

  const toggleVerifyToken = async () => {
    if (showVerifyToken) {
      setShowVerifyToken(false);
      setVerifyToken(null);
      return;
    }
    setBusy("show_verify_token");
    try {
      setVerifyToken(await fetchVerifyToken());
      setShowVerifyToken(true);
    } catch (error) {
      toast({ title: "Couldn't show verify token", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const copyVerifyToken = async () => {
    setBusy("copy_verify_token");
    try {
      await navigator.clipboard.writeText(await fetchVerifyToken());
      toast({ title: "Verify token copied" });
    } catch (error) {
      toast({ title: "Couldn't copy verify token", description: error instanceof Error ? error.message : "Show the token and copy it manually.", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const changed = !!state && !!draft && JSON.stringify(state.automations) !== JSON.stringify(draft);
  const automaticCount = draft ? Object.values(draft).filter((item) => item.enabled).length : 0;
  const manualCount = WHATSAPP_AUTOMATIONS.length + WHATSAPP_MANUAL_ONLY.length - automaticCount;
  const totalMessageCount = WHATSAPP_AUTOMATIONS.length + WHATSAPP_MANUAL_ONLY.length;

  const automation = WHATSAPP_AUTOMATIONS.find((item) => item.key === selected) || null;
  const manualOnly = WHATSAPP_MANUAL_ONLY.find((item) => item.key === selected) || null;
  const setting = automation && draft ? draft[automation.key] : null;
  const patchSelected = (patch: Partial<WhatsAppAutomationSettings[WhatsAppAutomationKey]>) => {
    if (automation && draft) setDraft({ ...draft, [automation.key]: { ...draft[automation.key], ...patch } });
  };
  const hasTemplate = !!setting?.templateName.trim();
  const metaTemplate = setting ? templates.find((item) => item.name === setting.templateName.trim()) : null;
  const rulesChanged = !!state && !!rules && JSON.stringify(state.rules) !== JSON.stringify(rules);
  const wordingError = automation && setting ? wordingProblem(automation, setting.wording) : null;
  const anyWordingError = !!draft && WHATSAPP_AUTOMATIONS.some((item) => wordingProblem(item, draft[item.key].wording));
  const automaticBlocked = !state?.connected
    ? "Connect WhatsApp above to use Automatic."
    : !hasTemplate
      ? "Add the Meta template name below to use Automatic."
      : null;
  const metaStatusFor = (key: string) => {
    const setting = draft?.[key as WhatsAppAutomationKey];
    if (!setting?.templateName) return { label: "Meta name not set", className: "text-slate-400" };
    if (templatesStatus === "loading") return { label: "Checking Meta...", className: "text-slate-400" };
    if (templatesStatus === "error") return { label: "Meta status unavailable", className: "text-rose-700" };
    if (templatesStatus !== "loaded") return { label: "Meta status not checked", className: "text-slate-400" };
    const template = templates.find((item) => item.name === setting.templateName && item.language === setting.language);
    if (!template) return { label: "Not found in Meta", className: "text-rose-700" };
    const status = String(template.status || "unknown").toUpperCase();
    return {
      label: `Meta · ${status.toLowerCase().replaceAll("_", " ")}`,
      className: status === "APPROVED" ? "text-emerald-700" : status === "IN_REVIEW" || status === "PENDING" ? "text-amber-700" : "text-rose-700",
    };
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Head><title>WhatsApp - CateringMS</title></Head>
      <NoIndexMeta />
      <AdminNav />
      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            variant="hero"
            icon={MessageCircle}
            title="WhatsApp"
            subtitle={state?.connected
              ? "Finish Meta webhook setup to receive replies, then choose which messages send automatically."
              : "Connect your WhatsApp Business account, then choose which messages are Automatic and which stay Manual."}
          />
          <WhatsAppTabs active="setup" />

          {loadError && (
            <Card className="mb-5 border-rose-200">
              <CardContent className="flex items-center justify-between gap-3 py-4">
                <p className="text-sm text-rose-700">{loadError}</p>
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => void load()}>
                  <RefreshCw className="h-3.5 w-3.5" /> Try loading again
                </Button>
              </CardContent>
            </Card>
          )}

          {!state && !loadError && <p className="py-10 text-center text-sm text-slate-500">Loading WhatsApp settings...</p>}

          {state && draft && (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatTile
                  label="WhatsApp account"
                  icon={MessageCircle}
                  value={state.connected ? "Connected" : "Not connected"}
                  hint={state.connected ? state.displayNumber || "Ready to send" : "Nothing is being sent"}
                />
                <StatTile label="Message options" icon={Send} value={totalMessageCount} hint={`${WHATSAPP_AUTOMATIONS.length} business templates · ${WHATSAPP_MANUAL_ONLY.length} manual only`} />
                <StatTile label="Automatic" icon={Bot} value={automaticCount} hint="Send by themselves" />
                <StatTile label="Manual" icon={Hand} value={manualCount} hint="Only sent when you choose" />
              </div>

              {state.attention && (
                <Card className="border-rose-200">
                  <CardContent className="py-4 text-sm text-rose-700">{state.attention}</CardContent>
                </Card>
              )}

              <Card collapsible defaultOpen collapseLabel="WhatsApp Business account" className="w-full">
                <CardHeader>
                  <CardTitle className="text-base">WhatsApp Business account</CardTitle>
                  <CardDescription className="text-xs">
                    {state.connected
                      ? `Number connected${state.displayNumber ? ` · ${state.displayNumber}` : ""}`
                      : "Not connected. Open this to enter your details from Meta."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 py-5">
                  {state.connected && (
                    <>
                      <div className={cn(
                        "flex flex-wrap items-start gap-3 rounded-lg p-4",
                        state.webhookVerifiedAt
                          ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
                          : "bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100",
                      )}>
                        {state.webhookVerifiedAt ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /> : <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">{state.webhookVerifiedAt ? "Callback verified by Meta" : "Finish receiving replies from Meta"}</p>
                          <p className="mt-1 text-sm leading-relaxed opacity-90">
                            {state.webhookVerifiedAt
                              ? "The callback was verified. Subscribe to messages and this WhatsApp account in Meta, then send a test reply."
                              : "Your number is connected. Copy the callback details below into Meta to receive replies and delivery updates here."}
                          </p>
                        </div>
                        <Button type="button" variant="outline" size="sm" className="shrink-0 bg-white/80 dark:bg-transparent" onClick={() => void load()}>
                          <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Refresh status
                        </Button>
                      </div>

                      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(16rem,0.85fr)]">
                        <div className="min-w-0 space-y-4">
                          <div>
                            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Values to enter in Meta</h3>
                            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Copy each value into the matching field under Configure Webhooks.</p>
                            {/localhost|127\.0\.0\.1/i.test(state.webhookUrl) && (
                              <p className="mt-2 text-sm font-medium text-amber-800 dark:text-amber-200">Open this page on the live CateringMS site before copying the callback URL. Meta cannot reach localhost.</p>
                            )}
                          </div>
                          <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
                            <div className="space-y-2 p-4">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm font-medium text-slate-800 dark:text-slate-100">Callback URL</span>
                                <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" disabled={/localhost|127\.0\.0\.1/i.test(state.webhookUrl)} onClick={() => void copySetupValue(state.webhookUrl, "Callback URL")}>
                                  <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy
                                </Button>
                              </div>
                              <p className="break-all rounded-md bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-100">{state.webhookUrl}</p>
                            </div>
                            <div className="space-y-2 p-4">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-sm font-medium text-slate-800 dark:text-slate-100">Verify token</span>
                                <div className="flex items-center gap-1">
                                  <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5" disabled={!state.verifyTokenAvailable || busy === "show_verify_token"} onClick={() => void toggleVerifyToken()} aria-label={showVerifyToken ? "Hide verify token" : "Show verify token"}>
                                    {showVerifyToken ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
                                    {showVerifyToken ? "Hide" : "Show"}
                                  </Button>
                                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" disabled={!state.verifyTokenAvailable || busy === "copy_verify_token"} onClick={() => void copyVerifyToken()}>
                                    <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy
                                  </Button>
                                </div>
                              </div>
                              <p className="break-all rounded-md bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800 dark:bg-slate-800 dark:text-slate-100" aria-label={showVerifyToken ? "Verify token" : "Verify token hidden"}>
                                {showVerifyToken ? verifyToken || "Unavailable" : "••••••••••••••••••••••••"}
                              </p>
                              <p className="text-xs text-slate-600 dark:text-slate-300">Keep this token private. If it was shared, replace it before verifying in Meta.</p>
                            </div>
                          </div>
                          <Button type="button" variant="ghost" size="sm" className="gap-1.5 px-0 text-slate-700 hover:bg-transparent dark:text-slate-300" disabled={busy === "rotate_verify_token"} onClick={() => void rotateVerifyToken()}>
                            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" /> {busy === "rotate_verify_token" ? "Replacing token..." : "Replace verify token"}
                          </Button>
                        </div>

                        <div className="min-w-0 border-t border-slate-200 pt-5 dark:border-slate-700 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Finish setup in Meta</h3>
                          <ol className="mt-4 space-y-4">
                            {[
                              ["Open your Meta app", "Go to WhatsApp → Configuration → Configure Webhooks."],
                              ["Verify the callback", "Paste the Callback URL and Verify token, then choose Verify and save."],
                              ["Subscribe to messages", "Subscribe the messages field, then use Subscribe webhooks for this WhatsApp account."],
                              ["Test a reply", "Publish the Meta app for live events, then message the business number from another phone."],
                            ].map(([title, description], index) => (
                              <li key={title} className="flex gap-3">
                                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold tabular-nums text-slate-700 dark:bg-slate-800 dark:text-slate-200">{index + 1}</span>
                                <div>
                                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</p>
                                  <p className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{description}</p>
                                </div>
                              </li>
                            ))}
                          </ol>
                          <Button asChild variant="outline" size="sm" className="mt-5 gap-1.5">
                            <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer">Open Meta apps <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>
                          </Button>
                          <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">A verified callback confirms the URL. Live replies also need the messages subscription and a published Meta app.</p>
                        </div>
                      </div>
                      <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
                        <Button type="button" variant="outline" size="sm" disabled={busy === "disconnect"} onClick={() => void disconnect()}>
                        {busy === "disconnect" ? "Disconnecting..." : "Disconnect WhatsApp"}
                        </Button>
                      </div>
                    </>
                  )}
                  {!state.connected && (
                    <p className="text-xs text-slate-500">
                      Find these details in Meta, under your WhatsApp app. Use a permanent access token so the connection doesn't expire.
                    </p>
                  )}

                  {!state.connected && (
                    <>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <Label htmlFor="wa-phone-id" className="text-xs">Phone number ID</Label>
                          <Input id="wa-phone-id" inputMode="numeric" value={connection.phoneNumberId}
                            onChange={(event) => setConnection({ ...connection, phoneNumberId: event.target.value })} />
                        </div>
                        <div>
                          <Label htmlFor="wa-business-id" className="text-xs">WhatsApp Business account ID</Label>
                          <Input id="wa-business-id" inputMode="numeric" value={connection.businessAccountId}
                            onChange={(event) => setConnection({ ...connection, businessAccountId: event.target.value })} />
                        </div>
                        <div>
                          <Label htmlFor="wa-token" className="text-xs">Access token</Label>
                          <Input id="wa-token" type="password" autoComplete="off" value={connection.accessToken}
                            onChange={(event) => setConnection({ ...connection, accessToken: event.target.value })} />
                        </div>
                        <div>
                          <Label htmlFor="wa-secret" className="text-xs">App secret</Label>
                          <Input id="wa-secret" type="password" autoComplete="off" value={connection.appSecret}
                            onChange={(event) => setConnection({ ...connection, appSecret: event.target.value })} />
                        </div>
                      </div>
                      {!state.canConnect && (
                        <p className="text-xs text-amber-700">WhatsApp can't be connected from here. Connect it on the live site.</p>
                      )}
                      <Button
                        type="button"
                        disabled={busy === "connect" || !state.canConnect || !connection.phoneNumberId || !connection.businessAccountId || !connection.accessToken || !connection.appSecret}
                        title={!state.canConnect ? "Connect WhatsApp on the live site" : "Fill in all four details to connect"}
                        onClick={() => void connect()}
                      >
                        {busy === "connect" ? "Checking with Meta..." : "Connect WhatsApp"}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>

              <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
                <Card>
                  <CardContent className="py-5">
                    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">WhatsApp message library</p>
                        <p className="mt-0.5 text-xs text-slate-500">All {totalMessageCount} messages are listed below with a direct link to the right page.</p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="secondary">{WHATSAPP_AUTOMATIONS.length} business templates</Badge>
                        <Badge variant="outline">{WHATSAPP_MANUAL_ONLY.length} manual-only messages</Badge>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pb-3" role="group" aria-label="Filter messages">
                      {FILTERS.map((item) => (
                        (() => {
                          const count = item.value === "all" ? totalMessageCount : item.value === "automatic" ? automaticCount : manualCount;
                          return <button
                            key={item.value}
                            type="button"
                            aria-pressed={filter === item.value}
                            onClick={() => setFilter(item.value)}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                              filter === item.value
                                ? "border-brand-primary bg-brand-primary text-white"
                                : "border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800",
                            )}
                          >
                            {item.label}<span className={cn("tabular-nums", filter === item.value ? "text-white/80" : "text-slate-400")}>{count}</span>
                          </button>;
                        })()
                      ))}
                    </div>

                    {WHATSAPP_GROUPS.map((group) => {
                      const rows = [
                        ...WHATSAPP_AUTOMATIONS.filter((item) => item.group === group).map((item) => ({
                          key: item.key as string,
                          label: item.label,
                          when: item.when,
                          recommended: item.recommended,
                          mode: (draft[item.key].enabled ? "automatic" : "manual") as "automatic" | "manual" | "locked",
                          metaStatus: metaStatusFor(item.key),
                        })),
                        ...WHATSAPP_MANUAL_ONLY.filter((item) => item.group === group).map((item) => ({
                          key: item.key,
                          label: item.label,
                          when: item.when,
                          recommended: false,
                          mode: "locked" as const,
                          metaStatus: null,
                        })),
                      ].filter((row) => filter === "all" || (filter === "automatic" ? row.mode === "automatic" : row.mode !== "automatic"));
                      if (rows.length === 0) return null;
                      // Choosing a filter asks to see those messages, so it opens the groups.
                      const groupOpen = filter !== "all" || openGroups.includes(group);
                      const automaticInGroup = rows.filter((row) => row.mode === "automatic").length;
                      return (
                        <div key={group} className="border-t border-slate-100 dark:border-slate-800">
                          <button
                            type="button"
                            aria-expanded={groupOpen}
                            disabled={filter !== "all"}
                            onClick={() => setOpenGroups((current) => (
                              current.includes(group) ? current.filter((item) => item !== group) : [...current, group]
                            ))}
                            className="flex w-full items-center justify-between gap-3 py-3 text-left"
                          >
                            <span className="text-sm font-semibold text-slate-900 dark:text-white">{group}</span>
                            <span className="flex items-center gap-2 text-xs text-slate-500">
                              {rows.length} message{rows.length === 1 ? "" : "s"}{automaticInGroup > 0 ? ` | ${automaticInGroup} automatic` : ""}
                              <ChevronDown className={cn("h-4 w-4 transition-transform", groupOpen && "rotate-180")} />
                            </span>
                          </button>
                          {groupOpen && group === "Enquiries" && (
                            <p className="pb-1.5 text-[11px] text-amber-700">These go to people who haven't booked yet, so use them sparingly.</p>
                          )}
                          {groupOpen && <div className="space-y-1 pb-3">
                            {rows.map((row) => {
                              const destinations = messageDestinations(row.key);
                              return (
                              <div key={row.key} className="flex flex-wrap items-center gap-1.5 rounded-lg">
                              <button
                                type="button"
                                aria-current={selected === row.key}
                                onClick={() => selectMessage(row.key)}
                                className={cn(
                                  "flex min-w-[12rem] flex-1 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                                  selected === row.key
                                    ? "border-brand-primary bg-brand-primary/10"
                                    : "border-transparent hover:bg-slate-100 dark:hover:bg-slate-800",
                                )}
                              >
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">
                                    {row.label}{row.recommended ? " ★" : ""}
                                  </span>
                                      <span className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                                        <span className="truncate">{row.when}</span>
                                        {row.metaStatus && <span className={`shrink-0 font-medium ${row.metaStatus.className}`}>{row.metaStatus.label}</span>}
                                      </span>
                                </span>
                                <ModeBadge mode={row.mode} />
                              </button>
                              {destinations.map((destination) => (
                                <Link
                                  key={destination.href}
                                  href={withSlug(destination.href)}
                                  title={`${destinationActionLabel(destination.label)} to send ${row.label}`}
                                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-700 transition-colors hover:border-brand-primary/40 hover:text-brand-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                >
                                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                                  {destinationActionLabel(destination.label)}
                                </Link>
                              ))}
                              </div>
                              );
                            })}
                          </div>}
                        </div>
                      );
                    })}
                    <p className="text-[11px] text-slate-500">★ Recommended to start with.</p>
                  </CardContent>
                </Card>

                <div ref={detailRef} className="scroll-mt-4 lg:sticky lg:top-4">
                  <Card>
                    <CardContent className="space-y-4 py-5">
                      {!selected && (
                        <p className="py-8 text-center text-sm text-slate-500">
                          Choose a message on the left to see its preview and settings.
                        </p>
                      )}
                      {manualOnly && (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-base font-semibold text-slate-900 dark:text-white">{manualOnly.label}</p>
                              <p className="text-xs text-slate-500">{manualOnly.when}</p>
                            </div>
                            <ModeBadge mode="locked" />
                          </div>
                          <div>
                            <p className="pb-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">Preview with sample details</p>
                            <ChatPreview companyName={companyName} text={manualPreview(manualOnly.key, companyName)} />
                          </div>
                          <p className="flex items-start gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>This message can't be automatic. {manualOnly.reason}</span>
                          </p>
                          <DirectSend messageKey={manualOnly.key} text={manualPreview(manualOnly.key, companyName)} sendFromHref={withSlug} />
                        </>
                      )}

                      {automation && setting && (
                        <>
                          <div>
                            <p className="text-base font-semibold text-slate-900 dark:text-white">{automation.label}</p>
                            <p className="text-xs text-slate-500">{automation.when}</p>
                          </div>

                          <div>
                            <p className="pb-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">How this message sends</p>
                            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={`How ${automation.label} sends`}>
                              <button
                                type="button"
                                role="radio"
                                aria-checked={setting.enabled}
                                disabled={!!automaticBlocked}
                                title={automaticBlocked || undefined}
                                onClick={() => patchSelected({ enabled: true })}
                                className={cn(
                                  "rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                                  setting.enabled ? "border-brand-primary bg-brand-primary/10" : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800",
                                )}
                              >
                                <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white"><Bot className="h-4 w-4" /> Automatic</span>
                                <span className="block pt-0.5 text-xs text-slate-500">Sends by itself</span>
                              </button>
                              <button
                                type="button"
                                role="radio"
                                aria-checked={!setting.enabled}
                                onClick={() => patchSelected({ enabled: false })}
                                className={cn(
                                  "rounded-lg border p-3 text-left transition-colors",
                                  !setting.enabled ? "border-brand-primary bg-brand-primary/10" : "border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800",
                                )}
                              >
                                <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white"><Hand className="h-4 w-4" /> Manual</span>
                                <span className="block pt-0.5 text-xs text-slate-500">Only when you send it</span>
                              </button>
                            </div>
                            {automaticBlocked && <p className="pt-1.5 text-xs text-amber-700">{automaticBlocked}</p>}
                          </div>

                          <div>
                            <p className="pb-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">Preview with sample details</p>
                            <ChatPreview companyName={companyName} text={automationPreview(automation, companyName, setting.wording)} />
                          </div>

                          <DirectSend messageKey={automation.key} text={automationPreview(automation, companyName, setting.wording)} sendFromHref={withSlug} />

                          <div className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                            <div>
                              <div className="flex items-center justify-between gap-2 pb-1.5">
                                <Label htmlFor="wa-wording" className="text-xs font-semibold text-slate-700 dark:text-slate-300">Edit the wording</Label>
                                <div className="flex gap-1">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs"
                                    disabled={!setting.wording}
                                    title={setting.wording ? undefined : "You're already using the suggested wording"}
                                    onClick={() => patchSelected({ wording: "" })}
                                  >
                                    Use suggested wording
                                  </Button>
                                  <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => void copyWording(setting.wording || automation.wording)}>
                                    <Copy className="h-3.5 w-3.5" /> Copy wording
                                  </Button>
                                </div>
                              </div>
                              <Textarea
                                id="wa-wording"
                                rows={3}
                                className="font-mono text-xs"
                                value={setting.wording || automation.wording}
                                onChange={(event) => patchSelected({ wording: event.target.value === automation.wording ? "" : event.target.value })}
                              />
                              {wordingError ? (
                                <p className="pt-1 text-xs text-rose-700">{wordingError}</p>
                              ) : (
                                <p className="pt-1 text-xs text-slate-500">
                                  The preview updates as you type. Clients only get this wording once the same text is approved in Meta, so after a change, submit it to Meta and enter the approved template name below.
                                </p>
                              )}
                              <p className="pb-1 pt-3 text-xs font-semibold text-slate-700 dark:text-slate-300">What each number is filled with</p>
                              <table className="w-full text-xs">
                                <tbody>
                                  {automationVariables(automation, companyName).map((variable) => (
                                    <tr key={variable.token} className="border-t border-slate-100 dark:border-slate-800">
                                      <td className="w-12 py-1.5 font-mono text-slate-500">{variable.token}</td>
                                      <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-300">{variable.label}</td>
                                      <td className="break-all py-1.5 text-right text-slate-500">{variable.example}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={!state.connected || busy === "submit" || !!wordingError}
                                title={!state.connected ? "Connect WhatsApp to submit" : wordingError ? "Fix the wording to submit" : undefined}
                                onClick={() => void submitTemplate()}
                              >
                                {busy === "submit" ? "Submitting..." : "Submit wording to Meta"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={!state.connected || templatesStatus === "loading"}
                                title={state.connected ? undefined : "Connect WhatsApp to check status"}
                                onClick={() => void loadTemplates()}
                              >
                                {templatesStatus === "loading" ? "Checking..." : "Check status with Meta"}
                              </Button>
                              {metaTemplate && (
                                <Badge variant={metaTemplate.status === "REJECTED" ? "destructive" : "secondary"}>Meta: {metaTemplate.status.toLowerCase()}</Badge>
                              )}
                            </div>
                            <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
                              <div>
                                <Label htmlFor="wa-template" className="text-xs">Meta template name</Label>
                                <datalist id="wa-template-options">
                                  {templates.filter((item) => item.status === "APPROVED").map((item) => <option key={`${item.name}-${item.language}`} value={item.name} />)}
                                </datalist>
                                <Input
                                  id="wa-template"
                                  list="wa-template-options"
                                  value={setting.templateName}
                                  placeholder="for_example_quote_sent"
                                  disabled={!state.connected}
                                  onChange={(event) => patchSelected({ templateName: event.target.value })}
                                />
                              </div>
                              <div>
                                <Label htmlFor="wa-language" className="text-xs">Language code</Label>
                                <Input
                                  id="wa-language"
                                  value={setting.language}
                                  disabled={!state.connected}
                                  onChange={(event) => patchSelected({ language: event.target.value })}
                                />
                              </div>
                            </div>
                            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                              <div>
                                <Label htmlFor="wa-test-phone" className="text-xs">Test number</Label>
                                <Input id="wa-test-phone" type="tel" placeholder="082 000 0000" value={testPhone}
                                  onChange={(event) => setTestPhone(event.target.value)} />
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                className="gap-1.5"
                                disabled={!state.connected || !state.automations[automation.key].templateName || !testPhone.trim() || busy === "test"}
                                title={!state.connected ? "Connect WhatsApp to send a test" : !state.automations[automation.key].templateName ? "Save the Meta template name to send a test" : !testPhone.trim() ? "Enter a test number" : undefined}
                                onClick={() => void post("test", { action: "test", key: automation.key, phone: testPhone }, "Test WhatsApp sent")}
                              >
                                <Send className="h-3.5 w-3.5" />
                                {busy === "test" ? "Sending..." : "Send test WhatsApp"}
                              </Button>
                            </div>
                          </div>
                        </>
                      )}

                      {selected && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                        <p className={cn("text-xs", changed ? "text-amber-700" : "text-slate-500")}>
                          {changed ? "You have unsaved changes." : "All changes saved."}
                        </p>
                        <Button
                          type="button"
                          className="gap-1.5"
                          disabled={!changed || busy === "save" || anyWordingError}
                          title={anyWordingError ? "Fix the wording to save" : changed ? undefined : "Change a message to save it"}
                          onClick={() => void save()}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          {busy === "save" ? "Saving..." : "Save WhatsApp messages"}
                        </Button>
                      </div>}
                    </CardContent>
                  </Card>
                </div>
              </div>

              <RepliesLink query={url.includes("?") ? url.slice(url.indexOf("?")) : ""} href={withSlug("/admin/whatsapp/replies")} />
              {rules && (
                <RulesSection
                  rules={rules}
                  connected={state.connected}
                  changed={rulesChanged}
                  saving={busy === "save"}
                  onChange={(patch) => setRules({ ...rules, ...patch })}
                  onSave={() => void save()}
                />
              )}
              <ConsentSection query={url.includes("?") ? url.slice(url.indexOf("?")) : ""} />
              <BulkSection
                query={url.includes("?") ? url.slice(url.indexOf("?")) : ""}
                connected={state.connected}
                templates={templates}
                templatesStatus={templatesStatus}
                templatesError={templatesError}
                onLoadTemplates={() => void loadTemplates(templatesStatus === "idle")}
              />
            </div>
          )}
        </PortalShell>
        <Footer />
      </div>
    </div>
  );
}

export default function ProtectedWhatsAppPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.COMPANY_ADMIN, UserRole.OWNER, UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
      <WhatsAppPage />
    </ProtectedRoute>
  );
}
