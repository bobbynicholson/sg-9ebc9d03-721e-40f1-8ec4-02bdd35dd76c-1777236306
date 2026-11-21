/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/money-health - operator health panel.
 *
 * Two reliability surfaces in one place:
 *   1. Money reconciliation - orders whose order/invoice/payment figures
 *      disagree, so drift is caught before a client notices.
 *   2. Email queue health - queued / held / failed / stale counts with
 *      explicit paths to send due mail or review held messages.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import Head from "next/head";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader,
  PageWorkbench, PortalCard, PortalCardHeader, StatTile,
} from "@/components/portal/ui";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useTenantHref } from "@/lib/tenantUrl";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { Activity, AlertTriangle, CheckCircle2, ClipboardCheck, Loader2, Mail, MailX, Send, Banknote, ChevronDown, Eye, ExternalLink, Clock3, MessageCircle, RefreshCw } from "lucide-react";

type MoneyIssue = {
  orderId: string;
  orderNumber: string | null;
  clientName: string | null;
  status: string | null;
  kind: string;
  severity: "warning" | "error";
  detail: string;
  orderTotal: number;
  invoiceTotal: number;
  outstanding: number;
  moneyView: {
    orderPaid: number;
    ledgerPaid: number;
    orderBalance: number | null;
    invoicePaid: number;
    invoiceBalance: number;
  };
};

type MoneyHealth = {
  scanned: number;
  affectedOrders: number;
  truncated: boolean;
  issues: MoneyIssue[];
};

type EmailHealth = {
  queued: number;
  awaitingApproval: number;
  inProgress: number;
  failed: number;
  sentLast24h: number;
  oldestQueuedMinutes: number | null;
  stale: boolean;
  staleInProgress: boolean;
};

type CronHealth = {
  checkedAt: string;
  tasks: Array<{ taskKey: string; status: string; nextRunAt: string | null }>;
};

type WhatsAppHealth = {
  connected: boolean;
  displayNumber: string | null;
  webhookVerifiedAt: string | null;
  webhookAccountSubscribedAt: string | null;
};

type WhatsAppActivityHealth = {
  totals?: { waiting?: number; failed?: number; delivered?: number; read?: number };
};

const ISSUE_LABELS: Record<string, string> = {
  order_vs_invoice_total: "Order / invoice total",
  order_vs_invoice_balance: "Outstanding balance",
  order_vs_payment_ledger: "Payment ledger",
  invoice_internal: "Invoice balance",
  paid_flag_mismatch: "Payment status",
  overpaid: "Overpayment",
};

function MoneyHealthPage() {
  const { toast } = useToast();
  const { user } = useAuth() as any;
  const tenantCurrency = useTenantCurrency(user?.company_id ?? null);
  // Tenant-slug wrapper so the per-issue "open order" links keep the
  // company slug in the URL (a bare /admin/orders link drops it).
  const { withSlug } = useTenantHref();
  const [loading, setLoading] = useState(true);
  const [draining, setDraining] = useState(false);
  const [money, setMoney] = useState<MoneyHealth | null>(null);
  const [email, setEmail] = useState<EmailHealth | null>(null);
  const [cron, setCron] = useState<CronHealth | null>(null);
  const [cronError, setCronError] = useState<string | null>(null);
  const [whatsApp, setWhatsApp] = useState<WhatsAppHealth | null>(null);
  const [whatsAppActivity, setWhatsAppActivity] = useState<WhatsAppActivityHealth | null>(null);
  const [whatsAppError, setWhatsAppError] = useState<string | null>(null);
  const [whatsAppActivityError, setWhatsAppActivityError] = useState<string | null>(null);
  const [expandedIssues, setExpandedIssues] = useState<Record<string, boolean>>({});
  const loadSequence = useRef(0);
  // Audit fix: track per-endpoint failures. Previously both fetches
  // swallowed errors into null, and a null money payload rendered the
  // green "every order reconciles" state - a failed scan looked
  // identical to a clean one on the page whose whole job is catching
  // silent drift.
  const [moneyError, setMoneyError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const loadSystemHealth = useCallback(async () => {
    const companyId = user?.company_id ? String(user.company_id) : null;
    const getJson = async (url: string) => {
      const response = await fetch(url, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.ok === false) throw new Error(body?.error || `Request failed (HTTP ${response.status})`);
      return body;
    };
    const [cronResult, whatsAppResult, activityResult] = await Promise.allSettled([
      getJson("/api/admin/cron-task-status"),
      getJson(`/api/admin/whatsapp/settings${companyId ? `?companyId=${encodeURIComponent(companyId)}` : ""}`),
      getJson("/api/admin/whatsapp/activity?days=7&page=1"),
    ]);
    if (cronResult.status === "fulfilled") {
      setCron(cronResult.value as CronHealth);
      setCronError(null);
    } else {
      setCron(null);
      setCronError(cronResult.reason instanceof Error ? cronResult.reason.message : "Could not load scheduled task health.");
    }
    if (whatsAppResult.status === "fulfilled") {
      setWhatsApp(whatsAppResult.value as WhatsAppHealth);
      setWhatsAppError(null);
    } else {
      setWhatsApp(null);
      setWhatsAppError(whatsAppResult.reason instanceof Error ? whatsAppResult.reason.message : "Could not load WhatsApp status.");
    }
    if (activityResult.status === "fulfilled") {
      setWhatsAppActivity(activityResult.value as WhatsAppActivityHealth);
      setWhatsAppActivityError(null);
    } else {
      setWhatsAppActivity(null);
      setWhatsAppActivityError(activityResult.reason instanceof Error ? activityResult.reason.message : "Could not load WhatsApp message activity.");
    }
  }, [user?.company_id]);

  useEffect(() => {
    void loadSystemHealth();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadSystemHealth();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [loadSystemHealth]);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    try {
      const [m, e] = await Promise.all([
        fetch("/api/admin/money-reconciliation", { cache: "no-store" })
          .then(async (r) => {
            const j = await r.json().catch(() => null);
            if (!j?.ok) throw new Error(j?.error || `Scan failed (HTTP ${r.status})`);
            return { data: j as MoneyHealth, error: null as string | null };
          })
          .catch((err: any) => ({ data: null, error: err?.message || "Reconciliation scan failed" })),
        fetch("/api/admin/email-health", { cache: "no-store" })
          .then(async (r) => {
            const j = await r.json().catch(() => null);
            if (!j?.ok) throw new Error(j?.error || `Health check failed (HTTP ${r.status})`);
            return { data: j.health as EmailHealth, error: null as string | null };
          })
          .catch((err: any) => ({ data: null, error: err?.message || "Email health check failed" })),
      ]);
      if (sequence !== loadSequence.current) return;
      setMoney(m.data);
      setMoneyError(m.error);
      setEmail(e.data);
      setEmailError(e.error);
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { loadSequence.current += 1; };
  }, [load]);

  const drain = async () => {
    setDraining(true);
    try {
      const response = await fetch("/api/admin/email-health", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body?.ok) {
        toast({ title: "Queue processed", description: `${body.drained?.sent || 0} sent, ${body.drained?.failed || 0} failed, ${body.drained?.recovered || 0} stalled claims recovered.` });
        setEmail(body.health);
        setEmailError(null);
      } else {
        toast({
          title: "Could not send",
          description: body?.error || `Email worker returned HTTP ${response.status}`,
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({
        title: "Could not send",
        description: e?.message || "Network error while processing the email queue.",
        variant: "destructive",
      });
    } finally {
      setDraining(false);
    }
  };

  const fmtMoney = (n: number) => tenantCurrency.format(Number(n || 0));
  const issues = money?.issues || [];
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const scanLabel = money?.truncated
    ? `Latest ${money.scanned} orders scanned`
    : `${money?.scanned ?? 0} orders checked`;
  const emailNeedsAttention = !!email && (
    email.queued > 0 || email.awaitingApproval > 0 || email.failed > 0 ||
    email.stale || email.staleInProgress
  );
  const cronAttentionTasks = (cron?.tasks || []).filter((task) =>
    ["failed", "stuck", "overdue", "never_run"].includes(task.status),
  );
  const whatsappWaiting = Number(whatsAppActivity?.totals?.waiting || 0);
  const whatsappFailed = Number(whatsAppActivity?.totals?.failed || 0);
  const whatsappWebhookReady = !!(whatsApp?.webhookVerifiedAt && whatsApp?.webhookAccountSubscribedAt);
  const toggleIssue = (key: string) => setExpandedIssues((current) => ({ ...current, [key]: !current[key] }));
  const detailMoney = (amount: number | null) => amount == null ? "Not recorded" : fmtMoney(amount);

  return (
    <>
      <NoIndexMeta />
      <Head><title>System health - CateringMS</title></Head>
      <AdminNav />
      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          {/* Command-centre hero: dark band washed in the tenant's
              brand colours. Meta chips carry the two live health
              signals; both stay semantic (emerald = clean, rose /
              amber = drift or backlog). */}
          <PortalHeader
            variant="hero"
            title="System health"
            subtitle="Review payment and email health, scheduled tasks, and WhatsApp delivery from one place."
            icon={Activity}
            meta={
              <>
                {money && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white">
                    <span className={`h-1.5 w-1.5 rounded-full ${issues.length === 0 ? "bg-emerald-400" : "bg-rose-400"}`} />
                    {issues.length === 0
                      ? scanLabel
                      : `${money.affectedOrders} order${money.affectedOrders === 1 ? "" : "s"} drifting`}
                  </span>
                )}
                {email && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white">
                    <span className={`h-1.5 w-1.5 rounded-full ${emailNeedsAttention ? "bg-amber-400" : "bg-emerald-400"}`} />
                    {email.queued} queued · {email.awaitingApproval} held · {email.failed} failed
                  </span>
                )}
              </>
            }
          />
          <PageWorkbench />

          {/* Live health aggregates. Tiles read straight off the two
              feeds; while the first load is in flight we render
              skeleton blocks INSIDE the shell so the rail never
              disappears. A failed feed renders a dash, never a
              healthy-looking 0. */}
          {loading && !money && !email ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-xl border border-slate-200/90 bg-white/70 dark:border-slate-800 dark:bg-slate-900/60" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatTile
                label="Orders scanned"
                value={money ? money.scanned : "-"}
                hint={money ? (money.truncated ? "Latest records only — refine the scan before calling all books clean" : "Order, invoice and payment figures compared") : "Scan did not run"}
                icon={ClipboardCheck}
                compact
              />
              <StatTile
                label="Drift issues"
                value={money ? issues.length : "-"}
                hint={
                  money
                    ? issues.length === 0
                      ? "Everything reconciles"
                      : `${errorCount} error${errorCount === 1 ? "" : "s"}, ${issues.length - errorCount} warning${issues.length - errorCount === 1 ? "" : "s"}`
                    : "Scan did not run"
                }
                icon={AlertTriangle}
                compact
              />
              <StatTile
                label="Emails waiting"
                value={email ? email.queued + email.awaitingApproval : "-"}
                hint={
                  email
                    ? `${email.queued} due · ${email.awaitingApproval} held for review`
                    : "Health check failed"
                }
                icon={Mail}
                compact
              />
              <StatTile
                label="Failed emails"
                value={email ? email.failed : "-"}
                hint={email ? `${email.sentLast24h} sent in the last 24 hours` : "Health check failed"}
                icon={MailX}
                compact
              />
            </div>
          )}

          <section aria-labelledby="system-health-title" className="mb-6">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="system-health-title" className="text-lg font-semibold text-slate-900 dark:text-white">System health</h2>
                <p className="mt-1 text-sm text-slate-500">Scheduled jobs and WhatsApp connection status.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => void loadSystemHealth()} className="h-9 gap-2">
                <RefreshCw className="h-4 w-4" /> Refresh status
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <PortalCard className="min-w-0">
                <PortalCardHeader
                  title={<><Clock3 className="h-4 w-4" /> Scheduled tasks</>}
                  action={cronError ? <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">Unavailable</Badge> : cron ? (
                    <Badge variant="outline" className={cronAttentionTasks.length ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-700"}>
                      {cronAttentionTasks.length ? `${cronAttentionTasks.length} need attention` : "Healthy"}
                    </Badge>
                  ) : <Badge variant="outline">Loading</Badge>}
                />
                <div className="space-y-3">
                  {cronError ? (
                    <p role="status" className="text-sm text-rose-700">{cronError}</p>
                  ) : !cron ? (
                    <p className="text-sm text-slate-500">Loading scheduled task status…</p>
                  ) : (
                    <>
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        {cron.tasks.length} scheduled tasks monitored
                        {cronAttentionTasks.length > 0 && ` · ${cronAttentionTasks.length} failed, overdue, stuck or not yet run`}
                        {cronAttentionTasks.length === 0 && " · no missed or failed runs detected"}
                      </p>
                      {cronAttentionTasks.length > 0 && (
                        <ul className="space-y-1.5">
                          {cronAttentionTasks.slice(0, 3).map((task) => (
                            <li key={task.taskKey} className="flex min-w-0 items-center justify-between gap-3 rounded-md bg-amber-50/70 px-3 py-2 text-xs">
                              <span className="min-w-0 truncate font-medium text-slate-800">{task.taskKey.replace(/[-_]/g, " ")}</span>
                              <span className="shrink-0 capitalize text-amber-800">{task.status.replace(/_/g, " ")}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="text-xs text-slate-500">Checked {new Date(cron.checkedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                    </>
                  )}
                  <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <Button asChild size="sm" className="h-9 gap-1.5 bg-brand-primary hover:bg-brand-primary/90">
                      <Link href={withSlug("/admin/cron-tasks")}>Open scheduled tasks <ExternalLink className="h-3.5 w-3.5" /></Link>
                    </Button>
                  </div>
                </div>
              </PortalCard>

              <PortalCard className="min-w-0">
                <PortalCardHeader
                  title={<><MessageCircle className="h-4 w-4" /> WhatsApp</>}
                  action={whatsAppError ? <Badge variant="outline" className="border-rose-200 bg-rose-50 text-rose-700">Status unavailable</Badge> : !whatsApp ? <Badge variant="outline">Loading</Badge> : (
                    <Badge variant="outline" className={whatsApp.connected && whatsappWebhookReady ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}>
                      {whatsApp.connected ? (whatsappWebhookReady ? "Connected · webhook ready" : "Connected · setup incomplete") : "Not connected"}
                    </Badge>
                  )}
                />
                <div className="space-y-3">
                  {whatsAppError ? (
                    <p role="status" className="text-sm text-rose-700">{whatsAppError}</p>
                  ) : !whatsApp ? (
                    <p className="text-sm text-slate-500">Loading WhatsApp connection and message activity…</p>
                  ) : (
                    <>
                      <p className="text-sm text-slate-700 dark:text-slate-300">
                        {whatsApp.connected
                          ? `Business number ${whatsApp.displayNumber || "connected"}. Webhook ${whatsApp.webhookVerifiedAt ? "verified" : "needs verification"}; Meta subscription ${whatsApp.webhookAccountSubscribedAt ? "active" : "needs setup"}.`
                          : "WhatsApp Business is not connected. Automatic WhatsApp messages cannot be delivered."}
                      </p>
                      {whatsAppActivity?.totals && (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {[
                            ["Waiting", whatsappWaiting],
                            ["Failed · 7d", whatsappFailed],
                            ["Delivered · 7d", Number(whatsAppActivity.totals.delivered || 0)],
                            ["Read · 7d", Number(whatsAppActivity.totals.read || 0)],
                          ].map(([label, value]) => (
                            <div key={String(label)} className="rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800">
                              <p className="text-xs text-slate-500">{label}</p>
                              <p className={`mt-1 text-base font-semibold tabular-nums ${label === "Failed · 7d" && Number(value) > 0 ? "text-rose-600" : "text-slate-900 dark:text-white"}`}>{value}</p>
                            </div>
                          ))}
                        </div>
                      )}
                      {whatsAppActivityError && <p role="status" className="text-xs text-amber-800">Message counts unavailable: {whatsAppActivityError}</p>}
                    </>
                  )}
                  <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <Button asChild size="sm" className="h-9 gap-1.5 bg-brand-primary hover:bg-brand-primary/90">
                      <Link href={withSlug("/admin/whatsapp")}>Manage WhatsApp <ExternalLink className="h-3.5 w-3.5" /></Link>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="h-9 gap-1.5">
                      <Link href={withSlug("/admin/whatsapp/activity")}>View activity <ExternalLink className="h-3.5 w-3.5" /></Link>
                    </Button>
                  </div>
                </div>
              </PortalCard>
            </div>
          </section>

          {/* Email queue health */}
          <PortalCard className="mb-6">
            <PortalCardHeader title={<><Mail className="w-4 h-4" /> Email queue</>} />
            <div>
              {loading && !email ? (
                <div className="py-4 text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
              ) : email ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                    <div className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800 sm:p-3"><p className="text-xs text-slate-500">Queued</p><p className={`mt-1 text-base font-semibold tabular-nums sm:text-lg ${email.stale ? "text-amber-600" : "text-slate-900 dark:text-white"}`}>{email.queued}</p></div>
                    <div className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800 sm:p-3"><p className="text-xs text-slate-500">Held for review</p><p className="mt-1 text-base font-semibold tabular-nums text-amber-700 sm:text-lg">{email.awaitingApproval}</p></div>
                    <div className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800 sm:p-3"><p className="text-xs text-slate-500">In progress</p><p className={`mt-1 text-base font-semibold tabular-nums sm:text-lg ${email.staleInProgress ? "text-amber-600" : "text-slate-900 dark:text-white"}`}>{email.inProgress}</p></div>
                    <div className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800 sm:p-3"><p className="text-xs text-slate-500">Failed</p><p className={`mt-1 text-base font-semibold tabular-nums sm:text-lg ${email.failed > 0 ? "text-rose-600" : "text-slate-900 dark:text-white"}`}>{email.failed}</p></div>
                    <div className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800 sm:p-3"><p className="text-xs text-slate-500">Sent · 24h</p><p className="mt-1 text-base font-semibold tabular-nums text-brand-primary sm:text-lg">{email.sentLast24h}</p></div>
                    <div className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800 sm:p-3"><p className="text-xs text-slate-500">Oldest queued</p><p className="mt-1 text-base font-semibold tabular-nums text-slate-900 dark:text-white sm:text-lg">{email.oldestQueuedMinutes != null ? `${email.oldestQueuedMinutes}m` : "—"}</p></div>
                  </div>
                  <div className="flex flex-col gap-3 border-t border-slate-200 pt-3 dark:border-slate-800 sm:flex-row sm:flex-wrap sm:items-center">
                    <div className="flex flex-wrap items-center gap-2">
                    {email.stale && (
                      <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-xs text-amber-800"><AlertTriangle className="w-3 h-3" /> Queue may be stalled</Badge>
                    )}
                    {email.staleInProgress && (
                      <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-xs text-amber-800"><AlertTriangle className="w-3 h-3" /> Stalled send can be recovered</Badge>
                    )}
                    </div>
                    <div className="flex flex-col gap-2 sm:ml-auto sm:flex-row sm:flex-wrap sm:items-center">
                    {(email.queued > 0 || email.staleInProgress) && (
                      <Button onClick={drain} disabled={draining || loading} className="h-9 gap-2 bg-brand-primary text-sm hover:bg-brand-primary/90">
                        {draining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send due emails now
                      </Button>
                    )}
                    {email.awaitingApproval > 0 && (
                      <Link href={withSlug("/admin/email-settings")} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 text-sm font-medium text-amber-900 hover:bg-amber-100">
                        <Mail className="h-4 w-4" /> Review held emails ({email.awaitingApproval}) <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    )}
                    {email.failed > 0 && (
                      <Link href={withSlug("/admin/email-templates?tab=sent-log")} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 text-sm font-medium text-rose-800 hover:bg-rose-100">
                        <MailX className="h-4 w-4" /> Review failures ({email.failed}) <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    )}
                    {email.queued === 0 && email.awaitingApproval === 0 && email.inProgress === 0 && email.failed === 0 && !email.staleInProgress && (
                      <span className="text-sm text-emerald-600 inline-flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> All clear</span>
                    )}
                    </div>
                  </div>
                  <p className="text-xs leading-5 text-slate-500">The send action processes due emails only. Held emails stay paused until an admin reviews them.</p>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                  <p className="flex-1 text-sm text-rose-900">{emailError || "Couldn't load email health."}</p>
                  <Button variant="outline" size="sm" onClick={load} disabled={loading}>Retry</Button>
                </div>
              )}
            </div>
          </PortalCard>

          {/* Money reconciliation */}
          <PortalCard className="mb-6">
            <PortalCardHeader
              title={<><Banknote className="w-4 h-4" /> Money reconciliation</>}
              action={money ? (
                issues.length === 0
                  ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1"><CheckCircle2 className="w-3 h-3" /> {scanLabel}</Badge>
                  : <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 gap-1"><AlertTriangle className="w-3 h-3" /> {money.affectedOrders} order{money.affectedOrders === 1 ? "" : "s"} need a look</Badge>
              ) : undefined}
            />
            <div>
              {loading && !money ? (
                <div className="py-4 text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Scanning {/* */}orders...</div>
              ) : !money ? (
                // Audit fix: a failed scan used to fall through to the
                // green "everything reconciles" branch below. Never
                // report clean books off a scan that didn't run.
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                  <p className="flex-1 text-sm text-rose-900">{moneyError || "Couldn't run the reconciliation scan."}</p>
                  <Button variant="outline" size="sm" onClick={load} disabled={loading}>Retry</Button>
                </div>
              ) : issues.length === 0 ? (
                <div className="py-8 text-center text-slate-500">
                  <CheckCircle2 className="mx-auto mb-2 h-9 w-9 text-emerald-500" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{money.truncated ? `No drift found in the latest ${money.scanned} orders scanned.` : `All ${money.scanned} scanned orders reconcile.`}</p>
                  <p className="mt-1 text-xs">Order totals, invoice balances, and settled payment records were compared.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="mb-3 text-xs text-slate-500">{money.affectedOrders} affected orders · {issues.length} checks to review{money.truncated ? ` · latest ${money.scanned} orders only` : ""}</p>
                  {issues.map((i, idx) => (
                    <div key={`${i.orderId}:${i.kind}:${idx}`} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link href={withSlug(`/admin/orders?orderId=${i.orderId}`)} className="font-semibold text-slate-900 hover:underline dark:text-white">{i.orderNumber || i.orderId.slice(0, 8)}</Link>
                          {i.clientName && <span className="max-w-[16rem] truncate text-xs text-slate-500">{i.clientName}</span>}
                          <Badge variant="outline" className={`text-xs ${i.severity === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{ISSUE_LABELS[i.kind] || i.kind.replace(/_/g, " ")}</Badge>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400">{i.detail}</p>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                        <div className="flex gap-3 text-xs tabular-nums text-slate-600 dark:text-slate-300 sm:text-right">
                          <span>Order <strong className="font-semibold">{fmtMoney(i.orderTotal)}</strong></span>
                          <span>Invoice <strong className="font-semibold">{fmtMoney(i.invoiceTotal)}</strong></span>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => toggleIssue(`${i.orderId}:${i.kind}:${idx}`)} aria-expanded={!!expandedIssues[`${i.orderId}:${i.kind}:${idx}`]} className="h-8 gap-1.5 px-2.5 text-xs">
                          <Eye className="h-3.5 w-3.5" /> View money <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expandedIssues[`${i.orderId}:${i.kind}:${idx}`] ? "rotate-180" : ""}`} />
                        </Button>
                      </div>
                    </div>
                    {expandedIssues[`${i.orderId}:${i.kind}:${idx}`] && (
                      <div className="mt-3 rounded-md bg-slate-50 p-3 dark:bg-slate-900/70">
                        <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">Money breakdown</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3 xl:grid-cols-6">
                          <div><p className="text-slate-500">Order total</p><p className="mt-0.5 font-semibold tabular-nums">{fmtMoney(i.orderTotal)}</p></div>
                          <div><p className="text-slate-500">Invoice total</p><p className="mt-0.5 font-semibold tabular-nums">{fmtMoney(i.invoiceTotal)}</p></div>
                          <div><p className="text-slate-500">Order paid</p><p className="mt-0.5 font-semibold tabular-nums">{fmtMoney(i.moneyView.orderPaid)}</p></div>
                          <div><p className="text-slate-500">Settled payment ledger</p><p className="mt-0.5 font-semibold tabular-nums">{fmtMoney(i.moneyView.ledgerPaid)}</p></div>
                          <div><p className="text-slate-500">Order balance</p><p className="mt-0.5 font-semibold tabular-nums">{detailMoney(i.moneyView.orderBalance)}</p></div>
                          <div><p className="text-slate-500">Invoice paid / due</p><p className="mt-0.5 font-semibold tabular-nums">{fmtMoney(i.moneyView.invoicePaid)} / {fmtMoney(i.moneyView.invoiceBalance)}</p></div>
                        </div>
                        <Link href={withSlug(`/admin/orders?orderId=${i.orderId}`)} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-primary hover:underline">Open order <ExternalLink className="h-3 w-3" /></Link>
                      </div>
                    )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </PortalCard>
        </PortalShell>
        <Footer />
      </div>
    </>
  );
}

export default function ProtectedMoneyHealthPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN]}>
      <MoneyHealthPage />
    </ProtectedRoute>
  );
}
