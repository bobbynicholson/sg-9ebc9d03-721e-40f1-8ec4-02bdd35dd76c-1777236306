/**
 * Tenant payment gateways admin page.
 *
 * Each catering company configures a payment gateway here to receive
 * payments from their event clients. Three providers - PayFast, Yoco,
 * Stripe. One can be active at a time (DB-enforced via partial unique
 * index payment_gateways_one_active_per_company).
 *
 * Reads + writes go through /api/payment-gateways. The credentials
 * blob is write-once: the configure dialog blanks credential inputs on
 * every open, the GET response never includes secrets, and the
 * payment_gateway_credentials table is RLS-locked to service_role.
 *
 * "Test connection" pings the provider with the saved credentials and
 * stamps last_verified_at on success so the operator sees when the keys
 * were last confirmed working. PayFast for SaaS subscriptions (used to
 * bill tenants for the platform itself) is a separate flow and is not
 * touched here.
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, Check, AlertCircle, Settings, Trash2, Power, Activity, Loader2 } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { PlatformNav } from "@/components/admin/PlatformNav";
import { PortalShell, PortalHeader, PortalCard, PortalCardHeader, StatTile,
  PageWorkbench,
} from "@/components/portal/ui";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  paymentGatewayService,
  type PaymentGatewayConfigDTO,
} from "@/services/paymentGatewayService";

type ProviderEntry = ReturnType<typeof paymentGatewayService.getProviderCatalogue>[number];

function statusForCard(config: PaymentGatewayConfigDTO | undefined): {
  label: string;
  tone: "muted" | "info" | "success" | "live";
} {
  if (!config) return { label: "Not configured", tone: "muted" };
  if (config.is_active && !config.is_test) return { label: "Active (live)", tone: "live" };
  if (config.is_active && config.is_test) return { label: "Active (test)", tone: "success" };
  if (!config.is_active && config.is_test) return { label: "Configured (test, inactive)", tone: "info" };
  return { label: "Configured (live, inactive)", tone: "info" };
}

function ToneBadge({ label, tone }: { label: string; tone: "muted" | "info" | "success" | "live" }) {
  const map: Record<string, string> = {
    muted: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200",
    info: "bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30",
    success: "bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
    live: "bg-rose-100 text-rose-800 border border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30",
  };
  return <span className={`text-xs font-semibold px-2 py-1 rounded-full ${map[tone]}`}>{label}</span>;
}

function PaymentGatewaysPage() {
  const { profile } = useAuth() as any;
  const role: string = profile?.active_role || profile?.role || "";
  const isSuperAdmin = role === "super_admin";
  const profileCompanyId: string | null = profile?.company_id ?? null;

  const catalogue = useMemo(() => paymentGatewayService.getProviderCatalogue(), []);
  const [configs, setConfigs] = useState<PaymentGatewayConfigDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [savedToast, setSavedToast] = useState<string | null>(null);

  // Super_admin: pick which tenant we're configuring. Tenant admins
  // ignore this - their company comes from profile.company_id.
  const [companies, setCompanies] = useState<Array<{ id: string; company_name: string }>>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const activeCompanyId = isSuperAdmin ? selectedCompanyId : profileCompanyId;

  // Configure dialog state
  const [editProvider, setEditProvider] = useState<ProviderEntry | null>(null);
  const [editIsTest, setEditIsTest] = useState(true);
  const [editSuccessUrl, setEditSuccessUrl] = useState("");
  const [editCancelUrl, setEditCancelUrl] = useState("");
  const [editNotifyUrl, setEditNotifyUrl] = useState("");
  const [editCredentials, setEditCredentials] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Build a query string with ?company_id= when super_admin has picked
  // a tenant. Returns empty string for tenant admins (server uses their
  // profile.company_id).
  const companyQuery = (extra: Record<string, string> = {}): string => {
    const params = new URLSearchParams(extra);
    if (isSuperAdmin && activeCompanyId) params.set("company_id", activeCompanyId);
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  const load = async () => {
    if (isSuperAdmin && !activeCompanyId) {
      // Don't hit the API until super_admin has picked a tenant.
      setConfigs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setPageError(null);
    try {
      const r = await fetch(`/api/payment-gateways${companyQuery()}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Could not load gateways");
      setConfigs((j.gateways || []) as PaymentGatewayConfigDTO[]);
    } catch (e: any) {
      setPageError(e?.message || "Could not load gateways");
    } finally {
      setLoading(false);
    }
  };

  // Super_admin picker source. Pulls every non-deleted company so the
  // platform user can manage gateways for any tenant. Tenant admins
  // skip this entirely.
  const loadCompanies = async () => {
    const { data, error } = await supabase
      .from("companies")
      .select("id, company_name")
      .is("deleted_at", null)
      .order("company_name", { ascending: true });
    if (error) {
      setPageError(error.message);
      return;
    }
    setCompanies((data || []) as Array<{ id: string; company_name: string }>);
  };

  useEffect(() => {
    if (!isSuperAdmin) return;
    loadCompanies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId, isSuperAdmin]);

  const activeConfig = configs.find((c) => c.is_active);
  const activeName = activeConfig
    ? catalogue.find((p) => p.provider === activeConfig.provider)?.name || activeConfig.provider
    : null;

  const openConfigure = (entry: ProviderEntry) => {
    const existing = configs.find((c) => c.provider === entry.provider);
    setEditProvider(entry);
    setEditIsTest(existing ? existing.is_test : true);
    setEditSuccessUrl(existing?.success_url || "");
    setEditCancelUrl(existing?.cancel_url || "");
    setEditNotifyUrl(existing?.notify_url || "");
    // Always start with blank credential inputs. Write-once policy;
    // operator types the full set every time they update.
    const blank: Record<string, string> = {};
    for (const f of entry.fields) blank[f.key] = "";
    setEditCredentials(blank);
    setEditError(null);
  };

  const closeDialog = () => {
    setEditProvider(null);
    setEditError(null);
    setSubmitting(false);
  };

  const handleSave = async () => {
    if (!editProvider) return;
    // Validate required fields client-side for a faster feedback loop;
    // the API also enforces.
    const missing = editProvider.fields
      .filter((f) => f.required && !(editCredentials[f.key] || "").trim())
      .map((f) => f.label);
    if (missing.length) {
      setEditError(`Missing required: ${missing.join(", ")}`);
      return;
    }

    setSubmitting(true);
    setEditError(null);
    try {
      const r = await fetch("/api/payment-gateways", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: editProvider.provider,
          is_test: editIsTest,
          success_url: editSuccessUrl.trim() || null,
          cancel_url: editCancelUrl.trim() || null,
          notify_url: editNotifyUrl.trim() || null,
          credentials: editCredentials,
          // Super_admin: include the picked tenant. Server ignores
          // for tenant admins (their company is on the profile).
          ...(isSuperAdmin && activeCompanyId ? { company_id: activeCompanyId } : {}),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      closeDialog();
      setSavedToast(`${editProvider.name} saved.`);
      setTimeout(() => setSavedToast(null), 3000);
      await load();
    } catch (e: any) {
      setEditError(e?.message || "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleActivate = async (gatewayId: string) => {
    try {
      const r = await fetch(`/api/payment-gateways/${gatewayId}/activate${companyQuery()}`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setSavedToast("Active gateway switched.");
      setTimeout(() => setSavedToast(null), 3000);
      await load();
    } catch (e: any) {
      setPageError(e?.message || "Activate failed");
    }
  };

  // Test-connection state - which gateway is being pinged right now,
  // plus the most recent result we got back per gateway.
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message?: string }>>({});

  const handleTest = async (gatewayId: string, providerName: string) => {
    setTestingId(gatewayId);
    try {
      const r = await fetch(`/api/payment-gateways/${gatewayId}/test${companyQuery()}`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setTestResults((prev) => ({
        ...prev,
        [gatewayId]: { ok: !!j.ok, message: j.message },
      }));
      if (j.ok) {
        setSavedToast(`${providerName} credentials verified.`);
        setTimeout(() => setSavedToast(null), 3000);
        await load();
      }
    } catch (e: any) {
      setTestResults((prev) => ({
        ...prev,
        [gatewayId]: { ok: false, message: e?.message || "Test failed" },
      }));
    } finally {
      setTestingId(null);
    }
  };

  // Delete confirm state - which gateway (id + provider name) is pending
  // removal, plus an in-flight flag so the confirm button can't be
  // double-clicked while the DELETE is running.
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const performDelete = async () => {
    if (!confirmDelete) return;
    const { id, name } = confirmDelete;
    setDeleting(true);
    try {
      const r = await fetch(`/api/payment-gateways/${id}${companyQuery()}`, { method: "DELETE" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
      setSavedToast(`${name} removed.`);
      setTimeout(() => setSavedToast(null), 3000);
      await load();
    } catch (e: any) {
      setPageError(e?.message || "Delete failed");
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>Payment gateways - CateringMS</title>
      </Head>

      <div className="admin-page-shell">
        {isSuperAdmin ? <PlatformNav /> : <AdminNav />}
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          {isSuperAdmin ? (
            <PortalHeader
              variant="hero"
              appearance="dark"
              title="Payment Gateways"
              icon={CreditCard}
              subtitle="Online card and EFT processing per tenant. Pick a catering company, then connect a South African gateway like PayFast or Yoco so their clients can pay quotes and invoices through the public link instead of manual EFT."
              meta={
                activeCompanyId ? (
                  <>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                      {configs.length} of {catalogue.length} configured
                    </span>
                    {activeConfig ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                        <span className={`h-1.5 w-1.5 rounded-full ${activeConfig.is_test ? "bg-amber-400" : "bg-emerald-400"}`} />
                        {activeName} {activeConfig.is_test ? "test" : "live"} mode
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                        No active gateway
                      </span>
                    )}
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                    No tenant selected
                  </span>
                )
              }
            />
          ) : (
            <PortalHeader
              variant="hero"
              title="Payment Gateways"
              icon={CreditCard}
              subtitle="Online card and EFT processing. Connect a South African gateway like PayFast or Yoco so clients can pay quotes and invoices through the public link instead of manual EFT. One gateway can be active at a time and saved credentials are never read back into the browser."
              meta={
                !loading && activeCompanyId ? (
                  <>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                      {configs.length} of {catalogue.length} configured
                    </span>
                    {activeConfig ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                        <span className={`h-1.5 w-1.5 rounded-full ${activeConfig.is_test ? "bg-amber-400" : "bg-emerald-400"}`} />
                        {activeName} {activeConfig.is_test ? "test" : "live"} mode
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                        No active gateway
                      </span>
                    )}
                  </>
                ) : undefined
              }
            />
          )}
          <PageWorkbench />

          <div className="space-y-6">
          {/* Super_admin tenant picker. Tenant admins never see this;
              their company comes from profile.company_id. */}
          {isSuperAdmin && (
            <PortalCard className="bg-slate-50 dark:bg-slate-800/50">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1">
                  <Label className="text-sm font-semibold text-slate-900 dark:text-white">
                    Managing gateways for
                  </Label>
                  <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">
                    You're signed in as super_admin. Pick the catering company whose payment gateways you want to configure.
                  </p>
                </div>
                <div className="w-full sm:w-72">
                  <Select
                    value={selectedCompanyId || ""}
                    onValueChange={(v) => setSelectedCompanyId(v || null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a tenant..." />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </PortalCard>
          )}

          {isSuperAdmin && !activeCompanyId && (
            <Alert className="border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Pick a tenant above to view and configure their payment gateways.
              </AlertDescription>
            </Alert>
          )}

          {/* At-a-glance gateway stats. Same source of truth as the cards
              below (configs from /api/payment-gateways), so the figures
              always agree. */}
          {activeCompanyId && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatTile
                label="Gateways configured"
                value={loading ? "-" : `${configs.length} of ${catalogue.length}`}
                hint="PayFast, Yoco, Stripe"
                icon={CreditCard}
              />
              <StatTile
                label="Active gateway"
                value={loading ? "-" : activeName || <span className="text-slate-500 dark:text-slate-400">None</span>}
                hint={activeConfig ? "Taking payments" : "Configure and make one active"}
                icon={Power}
              />
              <StatTile
                label="Mode"
                value={
                  loading ? "-" : activeConfig ? (
                    activeConfig.is_test
                      ? <span className="text-amber-600 dark:text-amber-500">Test</span>
                      : <span className="text-rose-600 dark:text-rose-500">Live</span>
                  ) : (
                    <span className="text-slate-500 dark:text-slate-400">-</span>
                  )
                }
                hint={activeConfig ? (activeConfig.is_test ? "Sandbox, no real money moves" : "Real payments are processing") : "No active gateway"}
                icon={Activity}
              />
              <StatTile
                label="Last verified"
                value={(() => {
                  if (loading) return "-";
                  const verified = configs
                    .map((c) => (c.last_verified_at ? new Date(c.last_verified_at).getTime() : 0))
                    .filter((t) => t > 0);
                  if (verified.length === 0) return <span className="text-slate-500 dark:text-slate-400">Never</span>;
                  return new Date(Math.max(...verified)).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
                })()}
                hint="Most recent successful connection test"
                icon={Check}
              />
            </div>
          )}

          {/* Status banner - replaces the old "stored locally" warning. */}
          {!loading && activeCompanyId && (
            <Alert
              className={
                activeConfig
                  ? activeConfig.is_test
                    ? "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10"
                    : "border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10"
                  : "border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50"
              }
            >
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {activeConfig ? (
                  <>
                    <strong>
                      {catalogue.find((p) => p.provider === activeConfig.provider)?.name || activeConfig.provider}
                    </strong>{" "}
                    is the active gateway, running in <strong>{activeConfig.is_test ? "test" : "live"}</strong> mode.
                  </>
                ) : (
                  <>
                    <strong>No gateway is active.</strong> Configure one of the providers below and click "Make active" to start taking payments.
                  </>
                )}
              </AlertDescription>
            </Alert>
          )}

          {pageError && (
            <Alert className="border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10">
              <AlertCircle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
              <AlertDescription className="text-rose-800 dark:text-rose-300">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>{pageError}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPageError(null);
                      if (isSuperAdmin) loadCompanies();
                      load();
                    }}
                  >
                    Retry
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {savedToast && (
            <Alert className="border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10">
              <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <AlertDescription className="text-emerald-800 dark:text-emerald-300">{savedToast}</AlertDescription>
            </Alert>
          )}

          {/* Skeleton while the gateway list is loading, so the provider
              cards never flash "Not configured" against stale data. */}
          {activeCompanyId && loading && (
            <div className="grid md:grid-cols-3 gap-6">
              {catalogue.map((entry) => (
                <div
                  key={entry.provider}
                  className="h-56 animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800/50"
                />
              ))}
            </div>
          )}

          {activeCompanyId && !loading && (
          <div className="grid md:grid-cols-3 gap-6">
            {catalogue.map((entry) => {
              const config = configs.find((c) => c.provider === entry.provider);
              const status = statusForCard(config);
              return (
                <PortalCard key={entry.provider} className="relative overflow-hidden hover:shadow-lg transition-shadow">
                  <PortalCardHeader
                    title={
                      <span className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-brand-primary" />
                        {entry.name}
                      </span>
                    }
                    action={<ToneBadge label={status.label} tone={status.tone} />}
                  />
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">{entry.description}</p>
                  <div className="space-y-2">
                    {config && config.credential_hints && Object.keys(config.credential_hints).length > 0 && (
                      <div className="rounded-md border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 px-3 py-2 space-y-1">
                        {entry.fields.map((f) => {
                          const hint = config.credential_hints?.[f.key];
                          if (!hint) return null;
                          return (
                            <div key={f.key} className="flex items-center justify-between gap-2 text-xs">
                              <span className="text-slate-500 dark:text-slate-400">{f.label}</span>
                              <span className="font-mono text-slate-700 dark:text-slate-300 tabular-nums">{hint === "set" ? "saved" : hint}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <Button
                      variant={config ? "outline" : "default"}
                      className="w-full"
                      onClick={() => openConfigure(entry)}
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      {config ? "Edit credentials" : "Configure"}
                    </Button>
                    {config && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => handleTest(config.id, entry.name)}
                        disabled={testingId === config.id}
                      >
                        {testingId === config.id ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Testing</>
                        ) : (
                          <><Activity className="h-4 w-4 mr-2" /> Test connection</>
                        )}
                      </Button>
                    )}
                    {config && testResults[config.id] && (
                      <p className={`text-xs ${testResults[config.id].ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"}`}>
                        {testResults[config.id].ok
                          ? "Credentials verified."
                          : `Test failed: ${testResults[config.id].message || "see logs"}`}
                      </p>
                    )}
                    {config?.last_verified_at && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Last verified {new Date(config.last_verified_at).toLocaleString("en-ZA")}
                      </p>
                    )}
                    {config && !config.is_active && (
                      <Button
                        variant="default"
                        className="w-full bg-brand-primary hover:bg-brand-primary/90"
                        onClick={() => handleActivate(config.id)}
                      >
                        <Power className="h-4 w-4 mr-2" />
                        Make active
                      </Button>
                    )}
                    {config && (
                      <Button
                        variant="ghost"
                        className="w-full text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                        onClick={() => setConfirmDelete({ id: config.id, name: entry.name })}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remove
                      </Button>
                    )}
                  </div>
                </PortalCard>
              );
            })}
          </div>
          )}

          <PortalCard>
            <PortalCardHeader
              title={
                <span className="flex items-center gap-2">
                  Before going live
                  <InfoTooltip content={"Quick checks before you accept your first real payment."} />
                </span>
              }
            />
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-brand-primary mt-0.5" />
                  <div>
                    <p className="font-medium">Sign up with the provider</p>
                    <p className="text-sm text-muted-foreground">
                      Create a merchant account with PayFast, Yoco or Stripe and grab the API credentials from their dashboard.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-brand-primary mt-0.5" />
                  <div>
                    <p className="font-medium">Test in sandbox first</p>
                    <p className="text-sm text-muted-foreground">
                      Save the sandbox credentials with "Test mode" on, run a small payment from the client portal, then switch to live credentials and toggle test mode off.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-brand-primary mt-0.5" />
                  <div>
                    <p className="font-medium">Webhook URL on the provider side</p>
                    <p className="text-sm text-muted-foreground">
                      Some providers need a callback URL pasted into their dashboard. Use the Notify URL you save here.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </PortalCard>
          </div>
        </PortalShell>
      </div>

      <Dialog open={!!editProvider} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Configure {editProvider?.name}</DialogTitle>
            <DialogDescription>
              Credentials are saved encrypted-at-rest and never read back into this dialog. Re-enter the full set when you update.
            </DialogDescription>
          </DialogHeader>

          {editProvider && (
            <div className="space-y-5 py-2">
              <div className="flex items-center justify-between rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2">
                <div>
                  <Label className="text-sm">Test mode</Label>
                  <p className="text-xs text-muted-foreground">Use sandbox credentials. No real money moves.</p>
                </div>
                <Switch checked={editIsTest} onCheckedChange={setEditIsTest} />
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold text-sm">API credentials</h4>
                {editProvider.fields.map((field) => (
                  <div key={field.key} className="space-y-1">
                    <Label htmlFor={field.key}>
                      {field.label}
                      {field.required && <span className="text-rose-500 ml-1">*</span>}
                    </Label>
                    <Input
                      id={field.key}
                      type={field.type}
                      autoComplete="off"
                      value={editCredentials[field.key] || ""}
                      onChange={(e) =>
                        setEditCredentials((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      placeholder={`Enter ${field.label.toLowerCase()}`}
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <h4 className="font-semibold text-sm">URLs (optional)</h4>
                <div className="space-y-1">
                  <Label htmlFor="success_url">Success URL</Label>
                  <Input
                    id="success_url"
                    type="url"
                    value={editSuccessUrl}
                    onChange={(e) => setEditSuccessUrl(e.target.value)}
                    placeholder="https://yourdomain.co.za/payment/success"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cancel_url">Cancel URL</Label>
                  <Input
                    id="cancel_url"
                    type="url"
                    value={editCancelUrl}
                    onChange={(e) => setEditCancelUrl(e.target.value)}
                    placeholder="https://yourdomain.co.za/payment/cancel"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="notify_url">Notify (webhook) URL</Label>
                  <Input
                    id="notify_url"
                    type="url"
                    value={editNotifyUrl}
                    onChange={(e) => setEditNotifyUrl(e.target.value)}
                    placeholder="https://yourdomain.co.za/api/payment/webhook"
                  />
                </div>
              </div>

              {editError && (
                <p className="text-sm text-rose-600 dark:text-rose-400">{editError}</p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={submitting}>
              {submitting ? "Saving..." : "Save credentials"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && !deleting && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {confirmDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the saved configuration and credentials. You'll need to re-enter the full credential set to use {confirmDelete?.name} again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700 text-white"
              disabled={deleting}
              onClick={(e) => {
                // Keep the dialog open while the DELETE is in flight; we
                // close it ourselves in performDelete's finally block.
                e.preventDefault();
                performDelete();
              }}
            >
              {deleting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Removing</>
              ) : (
                "Remove"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function ProtectedPaymentGatewaysPage() {
  // Restructure audit 2026-07-02: OWNER + ADMIN admitted. Every
  // /api/payment-gateways endpoint already allows super_admin /
  // owner / company_admin / admin (ADMIN_ROLES in the handlers), so
  // the old [SUPER_ADMIN, COMPANY_ADMIN] page gate 403'd the OWNER
  // off their own gateway setup while the API would have served them.
  return (
    <ProtectedRoute allowedRoles={[
      UserRole.SUPER_ADMIN,
      UserRole.OWNER,
      UserRole.COMPANY_ADMIN,
      UserRole.ADMIN,
    ]}>
      <PaymentGatewaysPage />
    </ProtectedRoute>
  );
}
