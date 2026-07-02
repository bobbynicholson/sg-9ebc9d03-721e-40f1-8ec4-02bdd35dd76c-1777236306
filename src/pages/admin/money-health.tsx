/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/money-health - operator health panel.
 *
 * Two reliability surfaces in one place:
 *   1. Money reconciliation - orders whose order/invoice/payment figures
 *      disagree, so drift is caught before a client notices.
 *   2. Email queue health - queued / failed / stale counts with a one-click
 *      "Send pending now" so a stuck email queue is never silent.
 */
import { useEffect, useState, useCallback } from "react";
import Head from "next/head";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader,
  PageWorkbench,
} from "@/components/portal/ui";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { formatZAR } from "@/lib/formatters";
import { Activity, AlertTriangle, CheckCircle2, Loader2, Mail, RefreshCw, Send, Banknote } from "lucide-react";

function MoneyHealthPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [draining, setDraining] = useState(false);
  const [money, setMoney] = useState<any | null>(null);
  const [email, setEmail] = useState<any | null>(null);
  // Audit fix: track per-endpoint failures. Previously both fetches
  // swallowed errors into null, and a null money payload rendered the
  // green "every order reconciles" state - a failed scan looked
  // identical to a clean one on the page whose whole job is catching
  // silent drift.
  const [moneyError, setMoneyError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, e] = await Promise.all([
        fetch("/api/admin/money-reconciliation")
          .then(async (r) => {
            const j = await r.json().catch(() => null);
            if (!j?.ok) throw new Error(j?.error || `Scan failed (HTTP ${r.status})`);
            return { data: j, error: null as string | null };
          })
          .catch((err: any) => ({ data: null, error: err?.message || "Reconciliation scan failed" })),
        fetch("/api/admin/email-health")
          .then(async (r) => {
            const j = await r.json().catch(() => null);
            if (!j?.ok) throw new Error(j?.error || `Health check failed (HTTP ${r.status})`);
            return { data: j.health, error: null as string | null };
          })
          .catch((err: any) => ({ data: null, error: err?.message || "Email health check failed" })),
      ]);
      setMoney(m.data);
      setMoneyError(m.error);
      setEmail(e.data);
      setEmailError(e.error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const drain = async () => {
    setDraining(true);
    try {
      const response = await fetch("/api/admin/email-health", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body?.ok) {
        toast({ title: "Queue processed", description: `${body.drained?.sent || 0} sent, ${body.drained?.failed || 0} failed.` });
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

  // Display source of truth for money: formatZAR. The API returns
  // rand figures (r2-rounded), never cents.
  const fmtR = (n: number) => formatZAR(Number(n || 0));
  const issues = (money?.issues || []) as any[];
  const errorCount = issues.filter((i) => i.severity === "error").length;

  return (
    <>
      <NoIndexMeta />
      <Head><title>Money & email health - CateringMS</title></Head>
      <AdminNav />
      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          {/* Command-centre hero: dark band washed in the tenant's
              brand colours. Meta chips carry the two live health
              signals; both stay semantic (emerald = clean, rose /
              amber = drift or backlog). */}
          <PortalHeader
            variant="hero"
            title="Money & email health"
            subtitle="Catch money drift before a client does, and keep the email queue moving."
            icon={Activity}
            meta={
              <>
                {money && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <span className={`h-1.5 w-1.5 rounded-full ${issues.length === 0 ? "bg-emerald-400" : "bg-rose-400"}`} />
                    {issues.length === 0
                      ? `${money.scanned} orders reconcile`
                      : `${money.affectedOrders} order${money.affectedOrders === 1 ? "" : "s"} drifting`}
                  </span>
                )}
                {email && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <span className={`h-1.5 w-1.5 rounded-full ${email.queued === 0 && email.failed === 0 ? "bg-emerald-400" : "bg-amber-400"}`} />
                    {email.queued} queued, {email.failed} failed
                  </span>
                )}
              </>
            }
            actions={
              <Button variant="outline" onClick={load} disabled={loading} className="gap-2">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
              </Button>
            }
          />
          <PageWorkbench />

          {/* Email queue health */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="w-4 h-4" /> Email queue
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading && !email ? (
                <div className="py-4 text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
              ) : email ? (
                <div className="flex flex-wrap items-center gap-4">
                  <div><p className="text-xs text-slate-500">Queued</p><p className={`text-xl font-bold ${email.stale ? "text-amber-600" : "text-slate-900 dark:text-white"}`}>{email.queued}</p></div>
                  <div><p className="text-xs text-slate-500">Failed</p><p className={`text-xl font-bold ${email.failed > 0 ? "text-rose-600" : "text-slate-900 dark:text-white"}`}>{email.failed}</p></div>
                  <div><p className="text-xs text-slate-500">Sent (24h)</p><p className="text-xl font-bold text-brand-primary">{email.sentLast24h}</p></div>
                  <div><p className="text-xs text-slate-500">Oldest waiting</p><p className="text-xl font-bold text-slate-900 dark:text-white">{email.oldestQueuedMinutes != null ? `${email.oldestQueuedMinutes}m` : "-"}</p></div>
                  <div className="ml-auto flex items-center gap-2">
                    {email.stale && (
                      <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 gap-1"><AlertTriangle className="w-3 h-3" /> Queue stale - worker may be down</Badge>
                    )}
                    {email.queued > 0 && (
                      <Button onClick={drain} disabled={draining} className="gap-2 bg-brand-primary hover:bg-brand-primary/90">
                        {draining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send pending now
                      </Button>
                    )}
                    {email.queued === 0 && email.failed === 0 && (
                      <span className="text-sm text-brand-primary inline-flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> All clear</span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                  <p className="flex-1 text-sm text-rose-900">{emailError || "Couldn't load email health."}</p>
                  <Button variant="outline" size="sm" onClick={load} disabled={loading}>Retry</Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Money reconciliation */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Banknote className="w-4 h-4" /> Money reconciliation
                {money && (
                  issues.length === 0
                    ? <Badge variant="outline" className="bg-brand-primary/10 text-brand-primary border-brand-primary/20 gap-1"><CheckCircle2 className="w-3 h-3" /> {money.scanned} orders reconcile</Badge>
                    : <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 gap-1"><AlertTriangle className="w-3 h-3" /> {money.affectedOrders} order{money.affectedOrders === 1 ? "" : "s"} need a look</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
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
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-brand-primary" />
                  <p className="text-sm">Every order's order / invoice / payment figures agree. {errorCount === 0 ? "No drift." : ""}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {issues.map((i, idx) => (
                    <div key={idx} className="flex items-start justify-between gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <a href={`/admin/orders?orderId=${i.orderId}`} className="font-semibold text-slate-900 dark:text-white hover:underline">{i.orderNumber || i.orderId.slice(0, 8)}</a>
                          {i.clientName && <span className="text-xs text-slate-500">{i.clientName}</span>}
                          <Badge variant="outline" className={`text-[10px] ${i.severity === "error" ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-amber-50 text-amber-800 border-amber-200"}`}>{i.kind.replace(/_/g, " ")}</Badge>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{i.detail}</p>
                      </div>
                      <div className="text-right text-xs text-slate-500 whitespace-nowrap">
                        <p>Order {fmtR(i.orderTotal)}</p>
                        <p>Invoice {fmtR(i.invoiceTotal)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
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
