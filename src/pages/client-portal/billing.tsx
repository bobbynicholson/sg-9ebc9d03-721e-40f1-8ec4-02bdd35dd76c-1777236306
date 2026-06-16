import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import Head from "next/head";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download, Clock, CheckCircle, AlertCircle, Search, Filter, CreditCard, Receipt, Calendar, ArrowUpDown, Wallet } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ClientNav } from "@/components/navigation/ClientNav";
import { PortalShell, PortalHeader, PortalCard, PortalCardHeader, StatTile } from "@/components/portal/ui";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useTenantClientIds } from "@/hooks/useTenantClientIds";
import { useToast } from "@/hooks/use-toast";
import { InvoiceDetailModal } from "@/components/billing/InvoiceDetailModal";
import { PaymentModal } from "@/components/billing/PaymentModal";
import { ReceiptDialog } from "@/components/client-portal/ReceiptDialog";
import { ChatBot } from "@/components/ChatBot";

interface Invoice {
  id: string;
  invoice_number: string;
  order_id: string;
  order_number: string;
  invoice_date: string;
  due_date: string;
  amount: number;
  currency: string;
  status: "pending" | "paid" | "overdue" | "failed";
  payment_method?: string;
  paid_at?: string;
  event_date: string;
  event_location: string;
  /** Set when the invoice has at least one completed payment, regardless
   *  of whether the balance is fully cleared. Drives the row-level
   *  "Download receipt" affordance. */
  has_completed_payment: boolean;
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

export default function ClientBillingPage() {
  const { user, company } = useAuth() as any;
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
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"date" | "amount" | "status">("date");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showInvoiceDetail, setShowInvoiceDetail] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  // Receipt dialog state. Lives at the page level (not the row) so the
  // dialog stays mounted across row reorders + the PaymentModal success
  // hand-off can target the same instance.
  const [receiptInvoiceId, setReceiptInvoiceId] = useState<string | null>(null);

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
      .channel(`client-billing-${user.id}-${tenantCompanyId}`)
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
          const statusOrder = { overdue: 0, pending: 1, paid: 2, failed: 3 } as const;
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
          "id, invoice_number, order_id, invoice_date, due_date, total_amount, amount_paid, balance_due, status, paid_at, orders:order_id ( order_number, event_date, venue_name, venue_address )",
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
      if (invoiceIds.length > 0) {
        const { data: payRows } = await supabase
          .from("payments")
          .select("invoice_id")
          .in("invoice_id", invoiceIds)
          .eq("payment_status", "completed");
        for (const p of (payRows as any[]) || []) {
          if (p?.invoice_id) paidInvoiceIds.add(p.invoice_id as string);
        }
      }

      // Map the canonical invoice_status enum to the portal's four-bucket
      // display state. partially_paid still rolls up as "pending" because
      // the client experience is the same - something is still owed.
      // Overdue is reinforced client-side too, so an admin who forgot to
      // transition a sent invoice past its due_date still surfaces red.
      const todayMS = Date.now();
      const mapped: Invoice[] = ((rows as any[]) || []).map((r) => {
        const totalAmount = Number(r.total_amount || 0);
        const balanceDue = Number(r.balance_due ?? totalAmount);
        const dueMS = r.due_date ? new Date(r.due_date).getTime() : null;

        let status: Invoice["status"];
        switch (r.status) {
          case "paid":
            status = "paid";
            break;
          case "overdue":
            status = "overdue";
            break;
          case "partially_paid":
          case "sent":
          default:
            status = "pending";
            break;
        }
        if (status === "pending" && dueMS != null && dueMS < todayMS && balanceDue > 0) {
          status = "overdue";
        }

        // Display amount: balance_due when something is still owed,
        // total_amount once the invoice is paid in full. Keeps the
        // Outstanding stat correct and the per-row figure honest.
        const displayAmount = status === "paid" ? totalAmount : balanceDue;
        const orderEmbed = (r as any).orders || {};

        return {
          id: r.id,
          invoice_number: r.invoice_number,
          order_id: r.order_id,
          order_number: orderEmbed.order_number || "",
          invoice_date: r.invoice_date,
          due_date: r.due_date,
          amount: displayAmount,
          // Wave 23 audit: hardcoded "R" rendered "R5,000" for UK / US / EU
          // tenants on the billing list. Resolve from the loaded company
          // currency with currency-symbol fallback.
          currency: currencySymbolFor((company as any)?.currency || "ZAR"),
          status,
          paid_at: r.paid_at || undefined,
          event_date: orderEmbed.event_date || r.invoice_date,
          event_location:
            orderEmbed.venue_name || orderEmbed.venue_address || "",
          has_completed_payment:
            paidInvoiceIds.has(r.id) || (Number(r.amount_paid || 0) > 0 && r.status === "paid"),
        };
      });

      setInvoices(mapped);
    } catch (error) {
      console.error("Error loading invoices:", error);
      toast({
        title: "Error",
        description: "Failed to load invoices",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // (filterAndSortInvoices replaced by the useMemo + useFuzzyItems above.)

  const getStatusBadge = (status: Invoice["status"]) => {
    const variants = {
      pending: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/20",
      paid: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20",
      overdue: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/20",
      failed: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    };
    const icons = {
      pending: Clock,
      paid: CheckCircle,
      overdue: AlertCircle,
      failed: AlertCircle,
    };
    const Icon = icons[status];
    return (
      <Badge className={`${variants[status]} border`}>
        <Icon className="w-3 h-3 mr-1" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    );
  };

  const handleViewInvoice = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setShowInvoiceDetail(true);
  };

  const handlePayInvoice = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setShowPaymentModal(true);
  };

  const totalOutstanding = invoices
    .filter((inv) => inv.status === "pending" || inv.status === "overdue")
    .reduce((sum, inv) => sum + inv.amount, 0);

  const totalPaid = invoices
    .filter((inv) => inv.status === "paid")
    .reduce((sum, inv) => sum + inv.amount, 0);

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
            subtitle="Pay outstanding invoices, view payment history, and download receipts."
            icon={Receipt}
          />

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
              {/* Stats */}
              <div className="mb-6 md:mb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatTile
                  label="Total paid"
                  value={`${currencySymbolFor((company as any)?.currency || "ZAR")}${totalPaid.toLocaleString()}`}
                  icon={CheckCircle}
                />
                <StatTile
                  label="Outstanding"
                  value={`${currencySymbolFor((company as any)?.currency || "ZAR")}${totalOutstanding.toLocaleString()}`}
                  icon={Wallet}
                />
                <StatTile
                  label="Overdue"
                  value={`${overdueCount} ${overdueCount === 1 ? "invoice" : "invoices"}`}
                  icon={AlertCircle}
                />
              </div>

              {/* Filters and Search */}
              <PortalCard className="mb-6">
                <PortalCardHeader
                  title="All invoices"
                  action={
                    <div className="flex flex-col sm:flex-row gap-2">
                      <div className="relative flex-1 sm:flex-none">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                        <Input
                          placeholder="Search invoices..."
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
                          <SelectItem value="all">All Status</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="paid">Paid</SelectItem>
                          <SelectItem value="overdue">Overdue</SelectItem>
                          <SelectItem value="failed">Failed</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={sortBy} onValueChange={(val) => setSortBy(val as any)}>
                        <SelectTrigger className="w-full sm:w-40">
                          <ArrowUpDown className="w-4 h-4 mr-2" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="date">Sort by Date</SelectItem>
                          <SelectItem value="amount">Sort by Amount</SelectItem>
                          <SelectItem value="status">Sort by Status</SelectItem>
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
                        : "Invoices will appear here when you place an order."}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredInvoices.map((invoice) => (
                      <div
                        key={invoice.id}
                        className="p-4 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 hover:border-brand-primary/40 dark:hover:border-brand-primary/40 transition-colors"
                      >
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold text-lg text-slate-900 dark:text-white">
                                {invoice.invoice_number}
                              </h3>
                              {getStatusBadge(invoice.status)}
                            </div>
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
                                <span>Event: {new Date(invoice.event_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}</span>
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
                                <p className="text-xs text-emerald-600 dark:text-emerald-400">
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
                              {(invoice.status === "pending" || invoice.status === "overdue") && (
                                <Button
                                  size="sm"
                                  onClick={() => handlePayInvoice(invoice)}
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
                    ))}
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
            open={showInvoiceDetail}
            onClose={() => {
              setShowInvoiceDetail(false);
              setSelectedInvoice(null);
            }}
          />
          <PaymentModal
            invoice={selectedInvoice}
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