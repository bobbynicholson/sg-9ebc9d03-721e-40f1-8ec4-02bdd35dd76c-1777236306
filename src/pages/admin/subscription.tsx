import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/router";
import Head from "next/head";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Progress } from "@/components/ui/progress";
import { 
  CreditCard, 
  Calendar, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle,
  Download,
  ArrowUpCircle,
  ArrowDownCircle,
  RefreshCw,
  Trash2,
  Info
} from "lucide-react";
import { subscriptionService } from "@/services/subscriptionService";
import { formatZAR } from "@/lib/formatters";
import type { Database } from "@/integrations/supabase/types";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { PortalShell, PortalHeader,
  PageWorkbench,
} from "@/components/portal/ui";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import {  UserRole  } from "@/types/app";
import { useToast } from "@/hooks/use-toast";
import { useTenantHref } from "@/lib/tenantUrl";
import { getTenantSlugFromPathname } from "@/lib/tenantRoute";

type Subscription = Database["public"]["Tables"]["subscriptions"]["Row"];
type BillingHistory = Database["public"]["Tables"]["billing_history"]["Row"];

export default function ProtectedSubscriptionPage() {
  return (
    // Deliberately finance-gated: UserRole.ADMIN covers region_admin +
    // sales_admin, who must not see platform billing amounts or hold
    // the cancel-subscription / delete-account levers. Same gate as
    // /admin/wages and /admin/staff-hours.
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN]}>
      <SubscriptionPage />
    </ProtectedRoute>
  );
}

function SubscriptionPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const { withSlug } = useTenantHref();
  const routeTenantSlug = getTenantSlugFromPathname(router.asPath);
  const [redirectingToScopedPage, setRedirectingToScopedPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [billingHistory, setHistory] = useState<BillingHistory[]>([]);
  const [trialStatus, setTrialStatus] = useState<{ isInTrial: boolean; daysRemaining: number; trialEndsAt: string | null } | null>(null);
  const [usageLimits, setUsageLimits] = useState<any>(null);
  const [pendingDeletion, setPendingDeletion] = useState<any>(null);

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [cancellationType, setCancellationType] = useState<"immediate" | "end_of_period">("end_of_period");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelFeedback, setCancelFeedback] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [exportData, setExportData] = useState(false);

  // A bare subscription URL is ambiguous: platform billing belongs in the
  // platform workspace, while a company subscription must carry the tenant
  // slug so branding and data scope cannot drift apart.
  useEffect(() => {
    if (!router.isReady || !user || routeTenantSlug) return;
    const pathname = (router.asPath || "").split(/[?#]/)[0];
    if (pathname !== "/admin/subscription") return;

    const role = String(user.active_role || user.role || "").toLowerCase();
    const destination = role === UserRole.SUPER_ADMIN
      ? "/admin/platform/subscription-management"
      : withSlug("/admin/subscription");
    if (destination === "/admin/subscription") return;
    setRedirectingToScopedPage(true);
    void router.replace(destination);
  }, [router, user, routeTenantSlug, withSlug]);

  useEffect(() => {
    if (user && !redirectingToScopedPage) {
      loadSubscriptionData();
    } else {
      const timer = setTimeout(() => {
        if (!user) {
          router.push('/auth/login');
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [user, router, redirectingToScopedPage]);

  const loadSubscriptionData = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      setLoadError(null);
      // throwOnError so a DB failure surfaces as the error card below
      // instead of masquerading as the "no subscription" empty state.
      const [subData, historyData, trialData, deletionData] = await Promise.all([
        subscriptionService.getSubscription(user.id, { throwOnError: true }),
        subscriptionService.getBillingHistory(user.id, { throwOnError: true }),
        subscriptionService.checkTrialStatus(user.id),
        subscriptionService.getAccountDeletionRequest(user.id, { throwOnError: true })
      ]);

      setSubscription(subData);
      setHistory(historyData);
      setTrialStatus(trialData);
      setPendingDeletion(deletionData);

      if (subData) {
        const limits = await subscriptionService.checkUsageLimits(subData);
        setUsageLimits(limits);
      }
    } catch (error: any) {
      console.error("Error loading subscription data:", error);
      setLoadError(error?.message || "Could not load your subscription details.");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!subscription || !user) return;

    try {
      await subscriptionService.requestCancellation(
        subscription.id,
        user.id,
        cancellationType === "immediate",
        cancelReason,
        cancelFeedback
      );
      setCancelDialogOpen(false);
      await loadSubscriptionData();
      toast({
        title: "Cancellation requested",
        description: cancellationType === "immediate"
          ? "Your subscription has been cancelled."
          : "Your subscription will end at the close of the current billing period.",
      });
    } catch (error) {
      console.error("Error cancelling subscription:", error);
      toast({
        title: "Cancellation not saved",
        description: "The subscription cancellation request could not be saved. Try again.",
        variant: "destructive",
      });
    }
  };

  const handleReactivate = async () => {
    if (!subscription) return;

    try {
      await subscriptionService.reactivateSubscription(subscription.id);
      await loadSubscriptionData();
      toast({
        title: "Subscription reactivated",
        description: "Your plan will continue billing as normal.",
      });
    } catch (error) {
      console.error("Error reactivating subscription:", error);
      toast({
        title: "Subscription not reactivated",
        description: "The reactivation request could not be saved. Try again.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;

    try {
      // Phase 5 follow-up: if the user ticked "export my data", trigger
      // a download of /api/admin/export-company-data BEFORE the deletion
      // request fires. The deletion is queued (soft-delete) so doing the
      // export inline at request time means the user walks away with
      // their data in hand on the same click. Browser handles the
      // download via Content-Disposition: attachment.
      if (exportData) {
        try {
          const resp = await fetch("/api/admin/export-company-data");
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({ error: "Export request failed" }));
            throw new Error(err?.error || `HTTP ${resp.status}`);
          }
          const blob = await resp.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `cateringms-export-${new Date().toISOString().slice(0, 10)}.json`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        } catch (exportErr: any) {
          // Don't block the deletion request - export failures get
          // surfaced via a warning and the user can retry from this
          // page after the deletion request lands.
          console.warn("[subscription] data export failed:", exportErr);
          toast({
            title: "Data export failed",
            description: `${exportErr?.message || "Unknown error"}. You can retry the export before deletion is processed.`,
            variant: "destructive",
          });
        }
      }

      await subscriptionService.requestAccountDeletion(user.id, deleteReason, exportData);
      setDeleteDialogOpen(false);
      await loadSubscriptionData();
      toast({
        title: "Deletion scheduled",
        description: "Your account is scheduled for deletion in 30 days. You can cancel the request from this page at any time before then.",
      });
    } catch (error) {
      console.error("Error requesting account deletion:", error);
      toast({
        title: "Deletion request not saved",
        description: "The account deletion request could not be saved. Try again.",
        variant: "destructive",
      });
    }
  };

  const handleCancelDeletion = async () => {
    if (!pendingDeletion) return;

    try {
      // cancelAccountDeletion returns false on a DB failure instead of
      // throwing - pre-fix the success toast fired unconditionally and
      // the operator believed the deletion was cancelled when it was
      // still pending.
      const ok = await subscriptionService.cancelAccountDeletion(pendingDeletion.id);
      if (!ok) {
        toast({
          title: "Could not cancel deletion",
          description: "The deletion request is still active. Please try again.",
          variant: "destructive",
        });
        return;
      }
      await loadSubscriptionData();
      toast({
        title: "Deletion cancelled",
        description: "Your account is no longer scheduled for deletion.",
      });
    } catch (error) {
      console.error("Error cancelling deletion:", error);
      toast({
        title: "Could not cancel deletion",
        description: "The deletion request is still active. Please try again.",
        variant: "destructive",
      });
    }
  };

  // formatZAR is the display source of truth for money. Amounts on
  // subscriptions/billing_history are rand values, not cents. currency
  // can be NULL on old rows; the old inline Intl call crashed on null.
  const formatCurrency = (amount: number, currency?: string | null) =>
    formatZAR(amount, { currency: currency || "ZAR" });

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString("en-ZA", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  };

  // Status colours are semantic (good = emerald, warning = amber, bad =
  // rose), never brand tokens.
  const getStatusColor = (status: string | null | undefined) => {
    switch (status) {
      case "active": return "bg-emerald-600";
      case "trial": return "bg-blue-500";
      case "past_due": return "bg-amber-500";
      case "cancelled": return "bg-rose-500";
      case "expired": return "bg-gray-500";
      default: return "bg-gray-500";
    }
  };

  // Hero chip dot for the current status, same semantic scale.
  const statusDot = (status: string | null | undefined) => {
    switch (status) {
      case "active": return "bg-emerald-400";
      case "trial": return "bg-blue-400";
      case "past_due": return "bg-amber-400";
      case "cancelled": return "bg-rose-400";
      default: return "bg-slate-400";
    }
  };

  const getStatusText = (status: string | null | undefined) => {
    if (!status) return "Unknown";
    return status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ");
  };

  if (redirectingToScopedPage) return null;

  if (loading || !user) {
    // Loading renders INSIDE the admin chrome - the nav rail must
    // never disappear while the page fetches (pre-fix this was a bare
    // full-screen spinner with no nav and no shell).
    return (
      <>
        <NoIndexMeta />
        <Head>
          <title>Subscription - CateringMS</title>
        </Head>
        <AdminNav />
        <div className="admin-page-shell">
          <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
            <PortalHeader
              variant="hero"
              title="Subscription"
              icon={CreditCard}
              subtitle="Your CateringMS plan, usage against plan limits, billing history and account controls."
            />
            <PageWorkbench />
            <Card>
              <CardContent className="py-12 text-center text-slate-500">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-3 text-slate-400" />
                Loading subscription details...
              </CardContent>
            </Card>
          </PortalShell>
        </div>
      </>
    );
  }

  if (loadError) {
    // Load failure gets its own surface with a retry. Without this a
    // DB error rendered the "no subscription" empty state, which lies.
    return (
      <>
        <NoIndexMeta />
        <Head>
          <title>Subscription - CateringMS</title>
        </Head>
        <AdminNav />
        <div className="admin-page-shell">
          <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
            <PortalHeader
              variant="hero"
              title="Subscription"
              icon={CreditCard}
              subtitle="Your CateringMS plan, usage against plan limits, billing history and account controls."
            />
            <PageWorkbench />
            <Card className="border-l-4 border-l-rose-400 dark:border-slate-800 dark:border-l-rose-400">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-slate-950 dark:text-white">
                  <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                  Could not load your subscription
                </CardTitle>
                <CardDescription>{loadError}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" onClick={loadSubscriptionData} className="gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Retry
                </Button>
              </CardContent>
            </Card>
          </PortalShell>
        </div>
      </>
    );
  }

  if (!subscription) {
    // No subscription = trial / unpaid tenant. Render the same shell
    // as the active-subscription view so the operator keeps the
    // sidebar + chrome - without the AdminNav wrapper this page
    // landed bare (no nav, no offset, content stuck at the top
    // left). The trial banner's "View Subscription Plans" button
    // points here so the empty state has to feel like a finished
    // page, not a broken one.
    return (
      <>
        <NoIndexMeta />
        <Head>
          <title>Subscription - CateringMS</title>
        </Head>
        <AdminNav />
        <div className="admin-page-shell">
          <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">

            <PortalHeader
              variant="hero"
              title="Subscription"
              icon={CreditCard}
              subtitle={
                trialStatus?.isInTrial
                  ? "You're on the free trial. Pick a plan before it ends and the switchover is automatic."
                  : "Pick a plan to keep using CateringMS once your trial ends."
              }
              meta={
                trialStatus?.isInTrial ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <span className={`h-1.5 w-1.5 rounded-full ${trialStatus.daysRemaining <= 3 ? "bg-amber-400" : "bg-emerald-400"}`} />
                    {trialStatus.daysRemaining} trial day{trialStatus.daysRemaining === 1 ? "" : "s"} left
                  </span>
                ) : undefined
              }
            />
            <PageWorkbench />

            <Card>
              <CardHeader>
                <CardTitle>
                  {trialStatus?.isInTrial ? "No subscription yet" : "No active subscription"}
                </CardTitle>
                <CardDescription>
                  {trialStatus?.isInTrial
                    ? "You're inside the free trial. Pick a plan now and the switchover is automatic when the trial ends, no break in service."
                    : "You currently do not have an active subscription. Pick a plan to restore access."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => router.push("/pricing")} className="gap-2">
                  <ArrowUpCircle className="w-4 h-4" />
                  View pricing plans
                </Button>
              </CardContent>
            </Card>
          </PortalShell>
        </div>
      </>
    );
  }

  // Guard the zero-limit edge (unknown plan id) and clamp so an
  // over-limit tenant doesn't push the Progress bar past 100%.
  const usagePercentageClients = usageLimits && usageLimits.activeClientsLimit > 0
    ? Math.min(100, (usageLimits.currentActiveClients / usageLimits.activeClientsLimit) * 100)
    : 0;
  const usagePercentageOrders = usageLimits && usageLimits.ordersLimit > 0
    ? Math.min(100, (usageLimits.currentOrders / usageLimits.ordersLimit) * 100)
    : 0;

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Subscription management - CateringMS</title>
      </Head>

      <AdminNav />

      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">

          <PortalHeader
            variant="hero"
            title="Subscription"
            icon={CreditCard}
            subtitle="Manage your plan, billing history and account."
            meta={
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                  <span className={`h-1.5 w-1.5 rounded-full ${statusDot(subscription.status)}`} />
                  {subscription.plan_name} ({getStatusText(subscription.status)})
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                  {formatCurrency(Number(subscription.amount), subscription.currency)} / {subscription.billing_cycle === "monthly" ? "month" : "year"}
                </span>
                {subscription.next_billing_date && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    Next billing {formatDate(subscription.next_billing_date)}
                  </span>
                )}
              </>
            }
            actions={
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadSubscriptionData}
                  disabled={loading}
                  className="gap-1.5"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button
                  size="sm"
                  onClick={() => router.push("/pricing")}
                  className="gap-1.5 bg-brand-primary hover:bg-brand-primary/90"
                >
                  <ArrowUpCircle className="w-4 h-4" />
                  Change plan
                </Button>
              </>
            }
          />
          <PageWorkbench />

          {pendingDeletion && (
            <Alert className="mb-6 border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
              <AlertDescription className="text-slate-700 dark:text-slate-300">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold mb-1">Account Deletion Scheduled</p>
                    <p className="text-sm">Your account is scheduled for deletion on {formatDate(pendingDeletion.scheduled_deletion_date)}. You have time to change your mind.</p>
                  </div>
                  <Button variant="outline" onClick={handleCancelDeletion} className="shrink-0">
                    Cancel Deletion
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {subscription.cancel_at_period_end && (
            <Alert className="mb-6 border-slate-200 border-l-4 border-l-amber-400 bg-white dark:border-slate-800 dark:border-l-amber-400 dark:bg-slate-900">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <AlertDescription className="text-slate-700 dark:text-slate-300">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold mb-1">Subscription Cancelling</p>
                    <p className="text-sm">Your subscription will end on {formatDate(subscription.current_period_end)}. You will still have access until then.</p>
                  </div>
                  <Button variant="outline" onClick={handleReactivate} className="shrink-0">
                    Reactivate Subscription
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {trialStatus?.isInTrial && (
            <Alert className="mb-6 border-slate-200 border-l-4 border-l-brand-primary bg-white dark:border-slate-800 dark:border-l-brand-primary dark:bg-slate-900">
              <Info className="h-5 w-5 text-brand-primary" />
              <AlertDescription className="text-slate-700 dark:text-slate-300">
                <p className="font-semibold mb-1">Free Trial Active</p>
                <p className="text-sm">You have {trialStatus.daysRemaining} days remaining in your free trial. Your trial ends on {formatDate(trialStatus.trialEndsAt!)}.</p>
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-6 md:grid-cols-2 mb-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Current Plan
                  <InfoTooltip content={"Your current plan, how often you are billed, and whether the subscription is active."} />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-2xl font-bold text-slate-900">{subscription.plan_name}</p>
                      <p className="text-sm text-slate-600">{subscription.billing_cycle === "monthly" ? "Monthly" : "Annual"} billing</p>
                    </div>
                    <Badge className={getStatusColor(subscription.status)}>
                      {getStatusText(subscription.status)}
                    </Badge>
                  </div>
                  
                  <Separator />
                  
                  <div className="flex items-baseline justify-between">
                    <span className="text-slate-600">Amount</span>
                    <span className="text-2xl font-bold">{formatCurrency(Number(subscription.amount), subscription.currency)}</span>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Billing Cycle</span>
                    <span className="font-medium">{subscription.billing_cycle === "monthly" ? "Monthly" : "Yearly"}</span>
                  </div>
                  
                  {subscription.next_billing_date && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">Next Billing Date</span>
                      <span className="font-medium">{subscription.next_billing_date ? formatDate(subscription.next_billing_date) : 'N/A'}</span>
                    </div>
                  )}
                  
                  <div className="flex gap-2 pt-4">
                    <Button variant="outline" size="sm" onClick={() => router.push("/pricing")} className="flex-1">
                      <ArrowUpCircle className="h-4 w-4 mr-2" />
                      Upgrade
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => router.push("/pricing")} className="flex-1">
                      <ArrowDownCircle className="h-4 w-4 mr-2" />
                      Change Plan
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Usage This Quarter
                  <InfoTooltip content={"How many active clients and orders you have used this quarter, compared to your plan's cap.\n\nUseful when deciding whether to upgrade."} />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-600 flex items-center gap-1">Active Clients <InfoTooltip content={"Active clients counting toward your plan limit this quarter."} /></span>
                      <span className="text-sm font-bold">
                        {usageLimits?.currentActiveClients || 0} / {usageLimits?.activeClientsLimit || 0}
                      </span>
                    </div>
                    <Progress value={usagePercentageClients} className="h-2" />
                    {usagePercentageClients > 80 && (
                      <p className="text-xs text-amber-600 mt-1">Approaching limit - consider upgrading</p>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-600 flex items-center gap-1">Orders This Quarter <InfoTooltip content={"Orders booked so far this billing quarter, against your plan's quarterly limit."} /></span>
                      <span className="text-sm font-bold">
                        {usageLimits?.currentOrders || 0} / {usageLimits?.ordersLimit || 0}
                      </span>
                    </div>
                    <Progress value={usagePercentageOrders} className="h-2" />
                    {usagePercentageOrders > 80 && (
                      <p className="text-xs text-amber-600 mt-1">Approaching limit - consider upgrading</p>
                    )}
                  </div>

                  <Alert className="border-brand-primary/20 bg-brand-primary/5 dark:border-brand-primary/30 dark:bg-brand-primary/10">
                    <Info className="h-4 w-4 text-brand-primary" />
                    <AlertDescription className="text-sm text-slate-700 dark:text-slate-300">
                      Your plan limits are based on <strong>whichever comes first</strong>. Upgrade anytime if you need more capacity.
                    </AlertDescription>
                  </Alert>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Billing History
                <InfoTooltip content={"A record of past invoices and whether they were paid successfully."} />
              </CardTitle>
              <CardDescription>View your past invoices and payment history</CardDescription>
            </CardHeader>
            <CardContent>
              {billingHistory.length === 0 ? (
                <p className="text-center text-slate-500 py-8">No billing history yet</p>
              ) : (
                <div className="space-y-3">
                  {billingHistory.map((record) => (
                    <div key={record.id} className="flex flex-wrap items-center justify-between gap-3 p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-full ${record.status === "succeeded" ? "bg-emerald-100" : "bg-rose-100"}`}>
                          {record.status === "succeeded" ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                          ) : (
                            <XCircle className="h-5 w-5 text-rose-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{formatCurrency(Number(record.amount), record.currency)}</p>
                          <p className="text-sm text-slate-600">
                            {formatDate(record.created_at)} • {record.status === "succeeded" ? "Paid" : "Failed"}
                          </p>
                        </div>
                      </div>
                      {record.invoice_pdf_url && (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={record.invoice_pdf_url} target="_blank" rel="noopener noreferrer">
                            <Download className="h-4 w-4 mr-2" />
                            Invoice
                          </a>
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-rose-400 dark:border-slate-800 dark:border-l-rose-400">
            <CardHeader>
              <CardTitle className="text-rose-900">Danger Zone</CardTitle>
              <CardDescription>Irreversible actions for your subscription and account</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-slate-200 border-l-4 border-l-rose-300 bg-white p-4 dark:border-slate-700 dark:border-l-rose-400 dark:bg-slate-900">
                <div>
                  <p className="font-medium text-slate-900">Cancel Subscription</p>
                  <p className="text-sm text-slate-600">Stop your subscription and lose access to features</p>
                </div>
                <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="destructive" disabled={subscription.status === "cancelled"}>
                      Cancel Subscription
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Cancel Subscription</DialogTitle>
                      <DialogDescription>
                        We are sorry to see you go. Please help us improve by sharing your feedback.
                      </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>When should we cancel?</Label>
                        <RadioGroup value={cancellationType} onValueChange={(value) => setCancellationType(value as "immediate" | "end_of_period")}>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="end_of_period" id="end" />
                            <Label htmlFor="end" className="font-normal">
                              At end of billing period ({formatDate(subscription.current_period_end)})
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="immediate" id="immediate" />
                            <Label htmlFor="immediate" className="font-normal">
                              Immediately (you will lose access now)
                            </Label>
                          </div>
                        </RadioGroup>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="reason">Reason for cancelling (optional)</Label>
                        <Textarea
                          id="reason"
                          placeholder="Help us understand why you're leaving..."
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="feedback">Additional feedback (optional)</Label>
                        <Textarea
                          id="feedback"
                          placeholder="Any other thoughts or suggestions?"
                          value={cancelFeedback}
                          onChange={(e) => setCancelFeedback(e.target.value)}
                        />
                      </div>
                    </div>

                    <DialogFooter>
                      <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
                        Keep Subscription
                      </Button>
                      <Button variant="destructive" onClick={handleCancelSubscription}>
                        Confirm Cancellation
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-slate-200 border-l-4 border-l-rose-400 bg-white p-4 dark:border-slate-700 dark:border-l-rose-400 dark:bg-slate-900">
                <div>
                  <p className="font-medium text-slate-900">Delete Account</p>
                  <p className="text-sm text-slate-600">Permanently delete your account and all data (30-day grace period)</p>
                </div>
                <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="destructive">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Account
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Delete Account</DialogTitle>
                      <DialogDescription>
                        This action cannot be undone. Your account will be scheduled for deletion in 30 days. You can cancel this request anytime before then.
                      </DialogDescription>
                    </DialogHeader>
                    
                    <Alert className="border-rose-200 bg-rose-50">
                      <AlertTriangle className="h-5 w-5 border-rose-200" />
                      <AlertDescription className="border-rose-200">
                        <p className="font-semibold mb-1">Warning</p>
                        <p className="text-sm">All your data including clients, orders, inventory, and settings will be permanently deleted.</p>
                      </AlertDescription>
                    </Alert>

                    <div className="space-y-4">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="export"
                          checked={exportData}
                          onChange={(e) => setExportData(e.target.checked)}
                          className="rounded border-slate-300"
                        />
                        <Label htmlFor="export" className="font-normal">
                          Export my data before deletion (GDPR/POPIA compliance)
                        </Label>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="deleteReason">Reason for leaving (optional)</Label>
                        <Textarea
                          id="deleteReason"
                          placeholder="Help us understand why you're deleting your account..."
                          value={deleteReason}
                          onChange={(e) => setDeleteReason(e.target.value)}
                        />
                      </div>
                    </div>

                    <DialogFooter>
                      <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button variant="destructive" onClick={handleDeleteAccount}>
                        Schedule Deletion
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        </PortalShell>

        <Footer />
      </div>
    </>
  );
}
