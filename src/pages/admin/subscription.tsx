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
import type { Database } from "@/integrations/supabase/types";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import {  UserRole  } from "@/types/app";

type Subscription = Database["public"]["Tables"]["subscriptions"]["Row"];
type BillingHistory = Database["public"]["Tables"]["billing_history"]["Row"];

export default function ProtectedSubscriptionPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.COMPANY_ADMIN]}>
      <SubscriptionPage />
    </ProtectedRoute>
  );
}

function SubscriptionPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    if (user) {
      loadSubscriptionData();
    } else {
      const timer = setTimeout(() => {
        if (!user) {
          router.push('/auth/login');
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [user, router]);

  const loadSubscriptionData = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const [subData, historyData, trialData, deletionData] = await Promise.all([
        subscriptionService.getSubscription(user.id),
        subscriptionService.getBillingHistory(user.id),
        subscriptionService.checkTrialStatus(user.id),
        subscriptionService.getAccountDeletionRequest(user.id)
      ]);

      setSubscription(subData);
      setHistory(historyData);
      setTrialStatus(trialData);
      setPendingDeletion(deletionData);

      if (subData) {
        const limits = await subscriptionService.checkUsageLimits(subData);
        setUsageLimits(limits);
      }
    } catch (error) {
      console.error("Error loading subscription data:", error);
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
    } catch (error) {
      console.error("Error cancelling subscription:", error);
      alert("Failed to cancel subscription. Please try again.");
    }
  };

  const handleReactivate = async () => {
    if (!subscription) return;

    try {
      await subscriptionService.reactivateSubscription(subscription.id);
      await loadSubscriptionData();
    } catch (error) {
      console.error("Error reactivating subscription:", error);
      alert("Failed to reactivate subscription. Please try again.");
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
          alert(`Data export failed: ${exportErr?.message || "Unknown error"}. You can retry the export from this page before the deletion processes.`);
        }
      }

      await subscriptionService.requestAccountDeletion(user.id, deleteReason, exportData);
      setDeleteDialogOpen(false);
      await loadSubscriptionData();
    } catch (error) {
      console.error("Error requesting account deletion:", error);
      alert("Failed to request account deletion. Please try again.");
    }
  };

  const handleCancelDeletion = async () => {
    if (!pendingDeletion) return;

    try {
      await subscriptionService.cancelAccountDeletion(pendingDeletion.id);
      await loadSubscriptionData();
    } catch (error) {
      console.error("Error cancelling deletion:", error);
    }
  };

  const formatCurrency = (amount: number, currency: string = "ZAR") => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: currency
    }).format(amount);
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString("en-ZA", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  };

  const getStatusColor = (status: string | null | undefined) => {
    switch (status) {
      case "active": return "bg-green-500";
      case "trial": return "bg-blue-500";
      case "past_due": return "bg-yellow-500";
      case "cancelled": return "bg-red-500";
      case "expired": return "bg-gray-500";
      default: return "bg-gray-500";
    }
  };

  const getStatusText = (status: string | null | undefined) => {
    if (!status) return "Unknown";
    return status.charAt(0).toUpperCase() + status.slice(1).replace("_", " ");
  };

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <NoIndexMeta />
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-purple-600" />
          <p className="text-slate-600">Loading subscription details...</p>
        </div>
      </div>
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
        <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80 pt-20 lg:pt-0">
          <div className="px-4 py-8 max-w-screen-xl">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center shadow-lg flex-shrink-0">
                <CreditCard className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Subscription</h1>
                <p className="text-slate-600">
                  {trialStatus?.isInTrial
                    ? `You're on the free trial. ${trialStatus.daysRemaining} day${trialStatus.daysRemaining === 1 ? "" : "s"} left.`
                    : "Pick a plan to keep using CateringMS once your trial ends."}
                </p>
              </div>
            </div>

            <Card className="border-0 shadow-sm">
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
          </div>
        </div>
      </>
    );
  }

  const usagePercentageClients = usageLimits ? (usageLimits.currentActiveClients / usageLimits.activeClientsLimit) * 100 : 0;
  const usagePercentageOrders = usageLimits ? (usageLimits.currentOrders / usageLimits.ordersLimit) * 100 : 0;

  return (
    <>
      <NoIndexMeta />
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>Subscription management - CateringMS</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80">
        <div className="px-4 py-8 max-w-6xl mx-auto">
          {pendingDeletion && (
            <Alert className="mb-6 border-red-200 bg-red-50">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <AlertDescription className="text-red-900">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold mb-1">Account Deletion Scheduled</p>
                    <p className="text-sm">Your account is scheduled for deletion on {formatDate(pendingDeletion.scheduled_deletion_date)}. You have time to change your mind.</p>
                  </div>
                  <Button variant="outline" onClick={handleCancelDeletion}>
                    Cancel Deletion
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {subscription.cancel_at_period_end && (
            <Alert className="mb-6 border-yellow-200 bg-yellow-50">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <AlertDescription className="text-yellow-900">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold mb-1">Subscription Cancelling</p>
                    <p className="text-sm">Your subscription will end on {formatDate(subscription.current_period_end)}. You will still have access until then.</p>
                  </div>
                  <Button variant="outline" onClick={handleReactivate}>
                    Reactivate Subscription
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {trialStatus?.isInTrial && (
            <Alert className="mb-6 border-blue-200 bg-blue-50">
              <Info className="h-5 w-5 text-blue-600" />
              <AlertDescription className="text-blue-900">
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
                      <p className="text-xs text-yellow-600 mt-1">Approaching limit - consider upgrading</p>
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
                      <p className="text-xs text-yellow-600 mt-1">Approaching limit - consider upgrading</p>
                    )}
                  </div>

                  <Alert className="bg-blue-50 border-blue-200">
                    <Info className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-sm text-blue-900">
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
                    <div key={record.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-full ${record.status === "succeeded" ? "bg-green-100" : "bg-red-100"}`}>
                          {record.status === "succeeded" ? (
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-600" />
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
                        <Button variant="ghost" size="sm">
                          <Download className="h-4 w-4 mr-2" />
                          Invoice
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="text-red-900">Danger Zone</CardTitle>
              <CardDescription>Irreversible actions for your subscription and account</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border border-red-200 rounded-lg bg-red-50">
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

              <div className="flex items-center justify-between p-4 border border-red-300 rounded-lg bg-red-100">
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
                    
                    <Alert className="border-red-200 bg-red-50">
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                      <AlertDescription className="text-red-900">
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
        </div>
      </div>
    </>
  );
}