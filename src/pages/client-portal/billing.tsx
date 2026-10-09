import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download, Clock, CheckCircle, AlertCircle, Search, Filter, CreditCard, Receipt, Calendar, ArrowUpDown, Wallet } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ClientNav } from "@/components/navigation/ClientNav";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PortalShell, PortalHeader, PortalCard, PortalCardHeader, PortalOverview,
  PageWorkbench,
} from "@/components/portal/ui";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types/app";
import { supabase } from "@/integrations/supabase/client";
import { useTenantClientIds } from "@/hooks/useTenantClientIds";
import { useToast } from "@/hooks/use-toast";
import { InvoiceDetailModal } from "@/components/billing/InvoiceDetailModal";
import { PaymentModal } from "@/components/billing/PaymentModal";
import { ReceiptDialog } from "@/components/client-portal/ReceiptDialog";
import { ChatBot } from "@/components/ChatBot";
import { getOrderPaymentSummary } from "@/lib/paymentStatus";
import { getInitialInvoicePaymentAmount, resolveInvoiceFirstPaymentAmount } from "@/lib/invoiceClientView";
import { formatClock } from "@/lib/portalTime";

interface Invoice {
  id: string;
  invoice_number: string;
  order_id: string;
  order_number: string;
  invoice_date: string;
  due_date: string;
  amount: number;
  pay_now_amount: number;
  currency: string;
  status: "pending" | "partial" | "paid" | "overdue" | "failed";
  paid_amount: number;
  balance_due: number;
  payment_method?: string;
  paid_at?: string;
  event_date: string;
  event_time?: string | null;
  event_location: string;
  /** Set when the invoice has at least one completed payment, regardless
   *  of whether the balance is fully cleared. Drives the row-level
   *  "Download receipt" affordance. */
  has_completed_payment: boolean;
  /** Most recent EFT claim that still needs review or was declined. */
  eft_claim?: {
    status: "pending" | "rejected";
    amount: number;
    created_at: string;
  } | null;
  /** Line-item breakdown (catering lines + any damage charge), the full
   *  total, and the public token so the detail modal can itemise what the
   *  amount is for and link to the public pay page. */
  items?: Array<{ description?: string; quantity?: number; unitPrice?: number; total?: number }>;
  total?: number;
  subtotal?: number;
  tax_amount?: number;
  public_token?: string | null;
}

// Wave 23: tenant-aware currency symbol. The billing list renders
// {currency}{amount} so we ship a SYMBOL not a code - "£5,000" reads
// right; "GBP5,000" doesn't. Falls back to "R" on bad / unknown codes
// so a misconfigured tenant still renders something readable.
function currencySymbolFor(code: string): string {
  switch ((code || "").toUpperCase()) {
    case "GBP": return "£";
    case "USD": return "$";
    case "EUR": return "€";
    case "AUD": return "A$";
    case "NZD": return "NZ$";
    case "CAD": return "C$";
    case "ZAR":
    default:    return "R";
  }
}

function ClientBillingPageInner() {
  const { user, company } = useAuth() as any;
  const router = useRouter();
  // CLI-B (client deep audit, CLI-10): unified tenant-scoped client-id
  // lookup. Same hook drives /billing here so future pages added under
  // /client-portal/ inherit the canonical resolver instead of
  // re-deriving the query (which is how the original
  // billing-misses-pre-signup-orders bug landed - email fallback
  // diverged across surfaces).
  const { clientIds: hookClientIds, loading: clientIdsLoading } = useTenantClientIds(
    user?.id ?? null,
    company?.id ?? null,
  );
  const clientIdsKey = hookClientIds.join(",");
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"date" | "amount" | "status">("date");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [deepLinkedInvoiceId, setDeepLinkedInvoiceId] = useState<string | null>(null);
  const [showInvoiceDetail, setShowInvoiceDetail] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  // Receipt dialog state. Lives at the page level (not the row) so the
  // dialog stays mounted across row reorders + the PaymentModal success
  // hand-off can target the same instance.
  const [receiptInvoiceId, setReceiptInvoiceId] = useState<string | null>(null);
  const appliedDeepLinkRef = useRef<string | null>(null);
  const [paymentReturn, setPaymentReturn] = useState<{ invoiceId: string; status: string } | null>(null);
  const returnBlocksPayment = (id: string) => paymentReturn?.invoiceId === id
    && ["checking", "pending", "refreshing"].includes(paymentReturn.status);

  useEffect(() => {
    if (user && !clientIdsLoading) {
      loadInvoices();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, company?.id, clientIdsLoading, hookClientIds.length]);

  // Client persona follow-up (client.md 5.5): realtime listeners
  // on invoices + payments so the billing page reflects new
  // statuses (admin captured a payment, gateway IPN landed) without
  // a manual refresh. Per-tenant channel name + company_id filter
  // matches the docs/perf-and-ops.md realtime pattern.
  useEffect(() => {
    if (!user || !company?.id) return;
    const tenantCompanyId = company.id;
    const channel = supabase
      .channel(`client-billing-${user.id}-${tenantCompanyId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "invoices",
          filter: `company_id=eq.${tenantCompanyId}`,
        },
        () => { loadInvoices(); },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "payments",
          filter: `company_id=eq.${tenantCompanyId}`,
        },
        () => { loadInvoices(); },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, company?.id]);

  useEffect(() => {
    if (!router.isReady || loading || invoices.length === 0) return;
    const invoiceId =
      (typeof router.query.invoice_id === "string" && router.query.invoice_id) ||
      (typeof router.query.invoiceId === "string" && router.query.invoiceId) ||
      (typeof router.query.invoice === "string" && router.query.invoice) ||
      "";
    const orderId = typeof router.query.orderId === "string" ? router.query.orderId : "";
    const paid = router.query.paid != null;
    const cancelled = router.query.cancelled != null;
    if (!invoiceId && !orderId && !paid && !cancelled) return;
    const key = `${invoiceId}|${orderId}|${paid ? "paid" : ""}|${cancelled ? "cancelled" : ""}`;
    if (appliedDeepLinkRef.current === key) return;
    appliedDeepLinkRef.current = key;

    const target = invoiceId
      ? invoices.find((inv) => inv.id === invoiceId || inv.invoice_number === invoiceId)
      : orderId
        ? invoices.find((inv) => inv.order_id === orderId)
        : null;

    if (target) {
      setDeepLinkedInvoiceId(target.id);
      setStatusFilter("all");
      setSelectedInvoice(target);
      setShowInvoiceDetail(true);
      window.requestAnimationFrame(() => {
        document.getElementById(`invoice-${target.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }

    if (paid) {
      toast({
        title: "Checking payment status",
        description: "The provider must confirm the payment before it is marked as received.",
      });
    } else if (cancelled) {
      toast({
        title: "Checkout closed",
        description: "No confirmed payment is showing yet. If you completed payment, wait for the provider update before trying again.",
      });
    }
  }, [router.isReady, router.query, loading, invoices, toast]);

  // Status filter + sort happen first; the fuzzy hook ranks the rest.
  const statusSortedInvoices = useMemo(() => {
    const filtered = statusFilter === "all"
      ? [...invoices]
      : invoices.filter((inv) => inv.status === statusFilter);
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "date":
          return new Date(b.due_date).getTime() - new Date(a.due_date).getTime();
        case "amount":
          return b.amount - a.amount;
        case "status":
          const statusOrder = { overdue: 0, partial: 1, pending: 2, paid: 3, failed: 4 } as const;
          return (statusOrder as any)[a.status] - (statusOrder as any)[b.status];
        default:
          return 0;
      }
    });
    return filtered;
  }, [invoices, statusFilter, sortBy]);

  const filteredInvoices = useFuzzyItems(
    statusSortedInvoices,
    searchQuery,
    [
      { key: "invoice_number" as any, weight: 3 },
      { key: "order_number" as any, weight: 2 },
      { key: "event_location" as any, weight: 2 },
    ],
    { limit: 0 },
  );

  const loadInvoices = async () => {
    try {
      setLoading(true);

      // Tenant scope: a user might be a client of multiple catering
      // companies. The portal renders one tenant at a time - the slug
      // in the URL resolves company.id, and we only ever load invoices
      // under that company.
      const tenantCompanyId: string | null = company?.id ?? null;
      if (!tenantCompanyId || !user?.id) {
        setInvoices([]);
        return;
      }

      // CLI-B: source of truth is useTenantClientIds. Invoices have a
      // NOT NULL client_id and no client_email column so we cannot
      // OR-fallback on email here - the magic-link relink in
      // client-provision-profile.ts is what guarantees clients.user_id
      // is populated for any orphan rows the caterer added before the
      // user signed up. Don't show stale data while the hook resolves.
      if (clientIdsLoading) {
        return;
      }
      const clientIds = hookClientIds;
      if (clientIds.length === 0) {
        setInvoices([]);
        return;
      }

      // Read from the canonical invoices table - the same one admin
      // creates from / the auto-completion trigger populates. Embeds
      // the order via the FK so we get order_number, event_date and
      // venue_* without a second round-trip. Drafts and written-off
      // are hidden from the client surface (caterer-internal states).
      const { data: rows, error } = await supabase
        .from("invoices")
        .select(
          "id, invoice_number, order_id, invoice_date, due_date, total_amount, amount_paid, balance_due, status, paid_at, invoice_data, public_token, currency, orders:order_id ( order_number, event_date, event_time, venue_name, venue_address, deposit_amount, deposit_percentage, currency )",
        )
        .eq("company_id", tenantCompanyId)
        .in("client_id", clientIds)
        .is("deleted_at", null)
        .not("status", "in", "(draft,written_off)")
        .order("invoice_date", { ascending: false });

      if (error) throw error;

      // Pull the set of invoice ids that have at least one completed
      // payment. We do this in a single follow-up query rather than
      // an embed because PostgREST doesn't expose a clean "has any
      // child where status=X" predicate, and amount_paid is a stale
      // aggregate on partially_paid invoices that can drift if a
      // refund races the balance update. Receipt visibility is a UI
      // concern, so a dedicated lookup keeps the truth crisp.
      const invoiceIds = ((rows as any[]) || []).map((r) => r.id);
      const paidInvoiceIds = new Set<string>();
      const eftClaimsByInvoice = new Map<string, Invoice["eft_claim"]>();
      if (invoiceIds.length > 0) {
        const { data: payRows } = await supabase
          .from("payments")
          .select("invoice_id, amount, payment_status, payment_method, created_at")
          .in("invoice_id", invoiceIds)
          .in("payment_status", ["completed", "pending", "failed"])
          .order("created_at", { ascending: false });
        for (const p of (payRows as any[]) || []) {
          if (!p?.invoice_id) continue;
          if (p?.invoice_id && p.payment_status === "completed") paidInvoiceIds.add(p.invoice_id as string);
          if (p?.payment_method !== "eft" || !["pending", "failed"].includes(String(p.payment_status))) continue;
          if (!eftClaimsByInvoice.has(p.invoice_id)) {
            eftClaimsByInvoice.set(p.invoice_id, {
              status: p.payment_status === "pending" ? "pending" : "rejected",
              amount: Number(p.amount || 0),
              created_at: String(p.created_at || ""),
            });
          }
        }
      }

      // Map invoice workflow state to the same money-based labels used by
      // the order and public payment views. A partial payment stays distinct
      // from both an unpaid invoice and a fully paid invoice.
      const todayMS = Date.now();
      const mapped: Invoice[] = ((rows as any[]) || []).map((r) => {
        const totalAmount = Number(r.total_amount || 0);
        const balanceDue = Number(r.balance_due ?? totalAmount);
        const dueMS = r.due_date ? new Date(r.due_date).getTime() : null;

        const payment = getOrderPaymentSummary({
          totalAmount,
          amountPaid: r.amount_paid,
          balanceAmount: r.balance_due,
          paymentStatus: r.status,
        });
        let status: Invoice["status"] = payment.state === "paid"
          ? "paid"
          : payment.state === "partial"
            ? "partial"
            : "pending";
        if (status !== "paid" && dueMS != null && dueMS < todayMS && balanceDue > 0) {
          status = "overdue";
        }

        // Display amount: balance_due when something is still owed,
        // total_amount once the invoice is paid in full. Keeps the
        // Outstanding stat correct and the per-row figure honest.
        const displayAmount = status === "paid" ? totalAmount : payment.balanceDue;
        const orderEmbed = (r as any).orders || {};

        return {
          id: r.id,
          invoice_number: r.invoice_number,
          order_id: r.order_id,
          order_number: orderEmbed.order_number || "",
          invoice_date: r.invoice_date,
          due_date: r.due_date,
          amount: displayAmount,
          pay_now_amount: r.order_id ? getInitialInvoicePaymentAmount({
            totalAmount, balanceDue: payment.balanceDue, amountPaid: payment.amountPaid,
            depositPercent: orderEmbed.deposit_percentage ?? 50,
            firstPaymentAmount: resolveInvoiceFirstPaymentAmount({
              totalAmount, orderDepositAmount: orderEmbed.deposit_amount,
              snapshotFirstPaymentAmount: r.invoice_data?.initialPaymentAmount,
              orderDepositPercent: orderEmbed.deposit_percentage, defaultDepositPercent: 50,
            }),
            eventDate: orderEmbed.event_date || r.invoice_data?.eventDate, dueDate: r.due_date,
          }) : payment.balanceDue,
          paid_amount: payment.amountPaid,
          balance_due: payment.balanceDue,
          // Wave 23 audit: hardcoded "R" rendered "R5,000" for UK / US / EU
          // tenants on the billing list. Preserve invoice/order overrides
          // before falling back to the company currency.
          currency: currencySymbolFor(r.currency || orderEmbed.currency || (company as any)?.currency || "ZAR"),
          status,
          paid_at: r.paid_at || undefined,
          event_date: orderEmbed.event_date || r.invoice_date,
          event_time: orderEmbed.event_time || r.invoice_data?.eventTime || r.invoice_data?.event_time || null,
          event_location:
            orderEmbed.venue_name || orderEmbed.venue_address || "",
          has_completed_payment:
            paidInvoiceIds.has(r.id) || Number(r.amount_paid || 0) > 0,
          eft_claim: eftClaimsByInvoice.get(r.id) || null,
          items: Array.isArray(r.invoice_data?.items) ? r.invoice_data.items : undefined,
          total: totalAmount,
          subtotal: Number(r.invoice_data?.subtotal ?? totalAmount),
          tax_amount: Number(r.invoice_data?.taxAmount ?? 0),
          public_token: r.public_token || null,
        };
      });

      setInvoices(mapped);
      setSelectedInvoice((current) => current ? mapped.find((invoice) => invoice.id === current.id) || null : null);
      return true;
    } catch (error) {
      console.error("Error loading invoices:", error);
      toast({
        title: "Error",
        description: "Failed to load invoices",
        variant: "destructive",
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!router.isReady || !user?.id || clientIdsLoading) return;
    const attemptId = typeof router.query.payment_attempt_id === "string"
      ? router.query.payment_attempt_id
      : "";
    const invoiceId = typeof router.query.invoice_id === "string"
      ? router.query.invoice_id
      : "";
    if (!attemptId || !invoiceId) { setPaymentReturn(null); return; }
    let cancelled = false;
    setPaymentReturn({ invoiceId, status: "checking" });
    (async () => {
      let finalStatus = "pending";
      for (let check = 0; check < 120 && !cancelled; check += 1) {
        try {
          const response = await fetch("/api/payments/confirm-return", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            body: JSON.stringify({ invoice_id: invoiceId, payment_attempt_id: attemptId }),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(result?.error || "Payment status unavailable");
          finalStatus = ["succeeded", "failed", "expired"].includes(result?.status) ? result.status : "pending";
          if (cancelled) return;
          if (["succeeded", "failed", "expired"].includes(finalStatus)) break;
        } catch {
          finalStatus = "pending";
        }
        if (!cancelled) setPaymentReturn({ invoiceId, status: "pending" });
        if (check < 119) await new Promise((resolve) => setTimeout(resolve, check < 12 ? 2500 : 10000));
      }
      if (cancelled) return;
      if (finalStatus === "succeeded") setPaymentReturn({ invoiceId, status: "refreshing" });
      const refreshed = await loadInvoices();
      if (cancelled) return;
      setPaymentReturn({ invoiceId, status: finalStatus === "succeeded" && !refreshed ? "refreshing" : finalStatus });
      if (finalStatus === "succeeded") {
        toast({ title: "Payment received", description: refreshed
          ? "The provider confirmed your payment and your invoice has been updated."
          : "The provider confirmed your payment. Reload billing to refresh the balance before paying again." });
      } else if (finalStatus === "failed") {
        toast({ title: "Payment was not completed", description: "The provider reported a failed or cancelled payment. You can try again from the invoice.", variant: "destructive" });
      } else if (finalStatus === "expired") {
        toast({ title: "Checkout expired", description: "The provider did not confirm payment before the checkout expired. Start a new checkout from the invoice.", variant: "destructive" });
      } else {
        toast({ title: "Payment is still processing", description: "The provider has not confirmed this payment yet. Check the invoice again before starting another payment." });
      }
    })();
    return () => { cancelled = true; };
    // Restart safely after auth/client ownership has finished hydrating.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.payment_attempt_id, router.query.invoice_id, user?.id, company?.id, clientIdsLoading, clientIdsKey]);

  // (filterAndSortInvoices replaced by the useMemo + useFuzzyItems above.)

  const getStatusBadge = (status: Invoice["status"]) => {
    const variants = {
      pending: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20",
      partial: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/20",
      paid: "bg-brand-primary/10 text-brand-primary border-brand-primary/20 dark:bg-brand-primary/10 dark:text-brand-primary dark:border-brand-primary/20",
      overdue: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20",
      failed: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    };
    const icons = {
      pending: Clock,
      partial: CheckCircle,
      paid: CheckCircle,
      overdue: AlertCircle,
      failed: AlertCircle,
    };
    const Icon = icons[status];
    return (
      <Badge className={`${variants[status]} border`}>
        <Icon className="w-3 h-3 mr-1" />
        {status === "partial" ? "Partially paid" : status === "pending" ? "Awaiting Payment" : status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const handleViewInvoice = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setShowInvoiceDetail(true);
  };

  const handlePayInvoice = (invoice: Invoice) => {
    if (returnBlocksPayment(invoice.id)) return;
    setSelectedInvoice(invoice);
    setShowPaymentModal(true);
  };

  const totalOutstanding = invoices
    .filter((inv) => inv.status === "pending" || inv.status === "partial" || inv.status === "overdue")
    .reduce((sum, inv) => sum + inv.balance_due, 0);

  const totalPaid = invoices
    .reduce((sum, inv) => sum + inv.paid_amount, 0);

  const overdueCount = invoices.filter((inv) => inv.status === "overdue").length;

  return (
    <>
      <Head>
        <title>Billing - CateringMS</title>
      </Head>
      <NoIndexMeta />

      <ClientNav />

      <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            title="Billing & invoices"
            subtitle="Pay balances, check due dates, open invoice details, and download receipts for completed payments."
            icon={Receipt}
            variant="hero"
          />
          <PageWorkbench />

          {paymentReturn && (
            <Alert className="mb-4" role="status">
              <AlertDescription>
                {paymentReturn.status === "succeeded" ? "Payment received. Your paid amount and remaining balance have been refreshed."
                  : paymentReturn.status === "failed" ? "This checkout did not complete. You can retry from the invoice."
                  : paymentReturn.status === "expired" ? "This checkout expired. You can start a new payment from the invoice."
                  : paymentReturn.status === "refreshing" ? "Payment was confirmed. Refresh this page to load your updated balance before paying again."
                  : "Waiting for the provider to confirm this payment. Another checkout is blocked while it is processing."}
              </AlertDescription>
            </Alert>
          )}

          {/* Tenant identity strip --
              SARS rule: VAT-registered businesses must show their VAT
              registration number on every invoice the client sees. We
              keep this terse - company name + VAT line - because it's
              a header, not a letterhead. Hidden entirely when the
              tenant isn't VAT-registered or the number isn't on file. */}
          {company?.company_name && (
            <PortalCard padded={false} className="mb-4 md:mb-6">
              <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {company.company_name}
                </p>
                {company?.vat_registered && company?.vat_number && (
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    VAT Reg No:{" "}
                    <span className="font-mono">{company.vat_number}</span>
                  </p>
                )}
              </div>
            </PortalCard>
          )}

          <PortalOverview
            eyebrow="Billing"
            title={totalOutstanding > 0 ? "There is a balance to settle" : "Invoices and receipts are in one place"}
            description="Open an invoice for the full breakdown, pay any pending balance, or download receipts once a payment has completed."
            items={[
              { label: "Invoices", value: invoices.length, helper: `${filteredInvoices.length} after filters`, icon: Receipt, tone: invoices.length > 0 ? "brand" : "neutral" },
              { label: "Outstanding", value: `${currencySymbolFor((company as any)?.currency || "ZAR")}${totalOutstanding.toLocaleString()}`, helper: "Pending + overdue", icon: Wallet, tone: overdueCount > 0 ? "danger" : totalOutstanding > 0 ? "warning" : "success" },
              { label: "Paid", value: `${currencySymbolFor((company as any)?.currency || "ZAR")}${totalPaid.toLocaleString()}`, helper: "Completed invoices", icon: CheckCircle, tone: "success" },
              { label: "Overdue", value: overdueCount, helper: "Needs attention", icon: AlertCircle, tone: overdueCount > 0 ? "danger" : "success" },
            ]}
          />

          {loading ? (
            // Skeleton over the page shape: a stat-tile row + a few
            // invoice rows so the layout doesn't jump when data lands.
            <div className="space-y-6 md:space-y-8" aria-busy="true" aria-label="Loading invoices">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-24 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm animate-pulse" />
                ))}
              </div>
              <div className="space-y-3">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="h-28 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm animate-pulse" />
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Filters and Search */}
              <PortalCard id="invoice-list" data-chat-section="client.billing.invoices" data-chat-section-label="Client invoice list" className="mb-6 scroll-mt-20">
                <PortalCardHeader
                  title={`Invoices (${filteredInvoices.length})`}
                  action={
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-1 sm:flex-none">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                        <Input
                          placeholder="Search invoice, order, or venue..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-9 w-full sm:w-64"
                        />
                      </div>
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-full sm:w-40">
                          <Filter className="w-4 h-4 mr-2" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All statuses</SelectItem>
                          <SelectItem value="pending">Awaiting payment</SelectItem>
                          <SelectItem value="partial">Partially paid</SelectItem>
                          <SelectItem value="paid">Paid</SelectItem>
                          <SelectItem value="overdue">Overdue</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={sortBy} onValueChange={(val) => setSortBy(val as any)}>
                        <SelectTrigger className="w-full sm:w-40">
                          <ArrowUpDown className="w-4 h-4 mr-2" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="date">Due date</SelectItem>
                          <SelectItem value="amount">Amount</SelectItem>
                          <SelectItem value="status">Status</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  }
                />
                {filteredInvoices.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="w-12 h-12 mx-auto mb-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-slate-400 dark:text-slate-500" />
                    </div>
                    <p className="text-slate-900 dark:text-white font-semibold mb-1.5">No invoices found</p>
                    <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                      {searchQuery || statusFilter !== "all"
                        ? "Try adjusting your filters."
                        : "Invoices will appear here once the team issues them."}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredInvoices.map((invoice) => {
                      const isDeepLinked = deepLinkedInvoiceId === invoice.id;
                      return (
                      <div
                        id={`invoice-${invoice.id}`}
                        key={invoice.id}
                        className={`p-4 border rounded-xl transition-colors ${
                          isDeepLinked
                            ? "border-brand-primary/50 bg-brand-primary/5 ring-2 ring-brand-primary/20 dark:border-brand-primary/50 dark:bg-brand-primary/10 dark:ring-brand-primary/30"
                            : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-brand-primary/40 dark:hover:border-brand-primary/40"
                        }`}
                      >
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold text-lg text-slate-900 dark:text-white">
                                {invoice.invoice_number}
                              </h3>
                              {getStatusBadge(invoice.status)}
                            </div>
                            {invoice.eft_claim && (
                              <p className={`mb-2 text-xs font-medium ${invoice.eft_claim.status === "pending" ? "text-amber-700 dark:text-amber-300" : "text-rose-700 dark:text-rose-300"}`}>
                                {invoice.eft_claim.status === "pending"
                                  ? `EFT proof received for ${invoice.currency}${invoice.eft_claim.amount.toFixed(2)} — awaiting company verification.`
                                  : "The last EFT claim was declined. Contact the company or submit a new transfer confirmation."}
                              </p>
                            )}
                            <div className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
                              <div className="flex items-center gap-2">
                                <Receipt className="w-4 h-4" />
                                <span>Order: {invoice.order_number}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                {/* Wave 40.3: consistent en-ZA "15 May 2026"
                                    formatting matching the rest of the
                                    portal. Was bare toLocaleDateString()
                                    which renders differently per browser
                                    locale. */}
                                <span>
                                  Event: {new Date(invoice.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                                  {invoice.event_time ? ` at ${formatClock(invoice.event_time)}` : ""}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                <span>
                                  Due: {new Date(invoice.due_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <div className="text-right">
                              <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
                                {invoice.currency}{invoice.amount.toLocaleString()}
                              </p>
                              {invoice.paid_at && (
                                <p className="text-xs text-brand-primary dark:text-brand-primary">
                                  Paid: {new Date(invoice.paid_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2 justify-end">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleViewInvoice(invoice)}
                              >
                                <FileText className="w-4 h-4 mr-2" />
                                View
                              </Button>
                              {invoice.has_completed_payment && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setReceiptInvoiceId(invoice.id)}
                                >
                                  <Download className="w-4 h-4 mr-2" />
                                  Receipt
                                </Button>
                              )}
                              {invoice.eft_claim?.status === "pending" ? (
                                <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">EFT under review</span>
                              ) : (invoice.status === "pending" || invoice.status === "partial" || invoice.status === "overdue") && (
                                <Button
                                  size="sm"
                                  onClick={() => handlePayInvoice(invoice)}
                                  disabled={returnBlocksPayment(invoice.id)}
                                  className="bg-brand-primary hover:opacity-90 text-white"
                                >
                                  <CreditCard className="w-4 h-4 mr-2" />
                                  Pay Now
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </PortalCard>
            </>
          )}
        </PortalShell>
      </div>

      {selectedInvoice && (
        <>
          <InvoiceDetailModal
            invoice={selectedInvoice}
            paymentAttemptId={typeof router.query.payment_attempt_id === "string" && paymentReturn?.invoiceId === selectedInvoice.id
              ? router.query.payment_attempt_id : undefined}
            open={showInvoiceDetail}
            onClose={() => {
              setShowInvoiceDetail(false);
              setSelectedInvoice(null);
            }}
          />
          <PaymentModal
            invoice={selectedInvoice}
            publicToken={selectedInvoice.public_token || undefined}
            authenticatedCheckout
            open={showPaymentModal}
            onClose={() => {
              setShowPaymentModal(false);
              setSelectedInvoice(null);
            }}
            onPaymentSuccess={() => {
              loadInvoices();
              setShowPaymentModal(false);
              setSelectedInvoice(null);
            }}
            onShowReceipt={(id) => setReceiptInvoiceId(id)}
          />
        </>
      )}

      <ReceiptDialog
        open={!!receiptInvoiceId}
        onOpenChange={(o) => {
          if (!o) setReceiptInvoiceId(null);
        }}
        invoiceId={receiptInvoiceId}
        companyId={company?.id || null}
      />

      <ChatBot userRole="client" companyId={user?.user_metadata?.company_id} />
    </>
  );
}

export default function ClientBillingPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.CLIENT, UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN, UserRole.REGION_ADMIN, UserRole.ADMIN]}>
      <ClientBillingPageInner />
    </ProtectedRoute>
  );
}
