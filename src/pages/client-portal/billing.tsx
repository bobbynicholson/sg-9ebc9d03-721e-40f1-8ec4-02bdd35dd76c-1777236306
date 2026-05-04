import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import Head from "next/head";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  FileText, 
  Download, 
  DollarSign, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  Search,
  Filter,
  CreditCard,
  Receipt,
  Calendar,
  ArrowUpDown
} from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ClientNav } from "@/components/navigation/ClientNav";
import { Footer } from "@/components/Footer";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { InvoiceDetailModal } from "@/components/billing/InvoiceDetailModal";
import { PaymentModal } from "@/components/billing/PaymentModal";
import { ChatBot } from "@/components/ChatBot";
import { DynamicNav } from "@/components/DynamicNav";
import { UserRole } from "@/types/app";

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
}

export default function ClientBillingPage() {
  const { user, company } = useAuth() as any;
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"date" | "amount" | "status">("date");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showInvoiceDetail, setShowInvoiceDetail] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  useEffect(() => {
    if (user) {
      loadInvoices();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, company?.id]);

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

      // Tenant scope: a user might be a client of multiple companies.
      // We render only the URL-resolved tenant's billing here.
      const tenantCompanyId: string | null = company?.id ?? null;
      let ordersQuery = supabase
        .from("orders")
        .select(`*, payment_schedules(*)`)
        .order("created_at", { ascending: false });
      if (tenantCompanyId) ordersQuery = ordersQuery.eq("company_id", tenantCompanyId);

      if (user?.id && tenantCompanyId) {
        // Multiple historical clients rows per (user, company) are
        // possible. Collect every id rather than maybeSingle().
        const { data: clientRows } = await supabase
          .from("clients")
          .select("id")
          .eq("user_id", user.id)
          .eq("company_id", tenantCompanyId);
        const clientIds = ((clientRows as any[]) || []).map((r) => r.id);
        if (clientIds.length > 0 && user.email) {
          ordersQuery = ordersQuery.or(
            `client_id.in.(${clientIds.join(",")}),client_email.ilike.${user.email}`,
          );
        } else if (clientIds.length > 0) {
          ordersQuery = ordersQuery.in("client_id", clientIds);
        } else if (user.email) {
          ordersQuery = ordersQuery.ilike("client_email", user.email);
        }
      }

      const { data: orders, error } = await ordersQuery;
      if (error) throw error;

      // Transform orders into invoice records
      const invoiceData: Invoice[] = [];
      
      orders?.forEach((order: any) => {
        // payment_schedules is an array on a left join; pick the first row.
        const scheduleRaw = order.payment_schedules;
        const schedule = Array.isArray(scheduleRaw) ? scheduleRaw[0] : scheduleRaw;
        if (!schedule) return;

        // Create deposit invoice if not paid
        if (!schedule.deposit_paid) {
          invoiceData.push({
            id: `${order.id}-deposit`,
            invoice_number: `INV-${order.order_number}-DEP`,
            order_id: order.id,
            order_number: order.order_number,
            invoice_date: order.created_at,
            due_date: order.created_at,
            amount: schedule.deposit_amount,
            currency: schedule.currency || "R",
            status: "pending",
            event_date: order.event_date,
            event_location: order.event_location,
          });
        } else {
          // Paid deposit invoice
          invoiceData.push({
            id: `${order.id}-deposit`,
            invoice_number: `INV-${order.order_number}-DEP`,
            order_id: order.id,
            order_number: order.order_number,
            invoice_date: order.created_at,
            due_date: order.created_at,
            amount: schedule.deposit_amount,
            currency: schedule.currency || "R",
            status: "paid",
            paid_at: schedule.deposit_paid_at,
            event_date: order.event_date,
            event_location: order.event_location,
          });
        }

        // Create balance invoice
        const balanceDueDate = new Date(schedule.balance_due_date);
        const today = new Date();
        let balanceStatus: Invoice["status"] = "pending";

        if (schedule.balance_paid) {
          balanceStatus = "paid";
        } else if (balanceDueDate < today) {
          balanceStatus = "overdue";
        }

        invoiceData.push({
          id: `${order.id}-balance`,
          invoice_number: `INV-${order.order_number}-BAL`,
          order_id: order.id,
          order_number: order.order_number,
          invoice_date: order.created_at,
          due_date: schedule.balance_due_date,
          amount: schedule.balance_amount,
          currency: schedule.currency || "R",
          status: balanceStatus,
          paid_at: schedule.balance_paid_at,
          event_date: order.event_date,
          event_location: order.event_location,
        });
      });

      setInvoices(invoiceData);
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
      pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
      paid: "bg-green-100 text-green-800 border-green-200",
      overdue: "bg-red-100 text-red-800 border-red-200",
      failed: "bg-slate-100 text-slate-800 border-slate-200",
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

      <DynamicNav userRole={UserRole.CLIENT} />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 lg:pl-64 xl:pl-72 pt-16 lg:pt-0">
        <div className="px-4 sm:px-6 md:px-8 lg:px-10 py-6 md:py-8 lg:py-12">
          {/* Header */}
          <div className="mb-6 md:mb-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg">
                <Receipt className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Billing & Invoices</h1>
                <p className="text-slate-600">Manage your payments and invoices</p>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="border-0 shadow-lg bg-gradient-to-br from-green-50 to-emerald-50">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Total Paid</p>
                      <p className="text-2xl font-bold text-green-600">
                        R{totalPaid.toLocaleString()}
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                      <CheckCircle className="w-6 h-6 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg bg-gradient-to-br from-yellow-50 to-amber-50">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Outstanding</p>
                      <p className="text-2xl font-bold text-amber-600">
                        R{totalOutstanding.toLocaleString()}
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-amber-100 flex items-center justify-center">
                      <Clock className="w-6 h-6 text-amber-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg bg-gradient-to-br from-red-50 to-rose-50">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-600">Overdue</p>
                      <p className="text-2xl font-bold text-red-600">
                        {overdueCount} {overdueCount === 1 ? "invoice" : "invoices"}
                      </p>
                    </div>
                    <div className="w-12 h-12 rounded-lg bg-red-100 flex items-center justify-center">
                      <AlertCircle className="w-6 h-6 text-red-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Filters and Search */}
          <Card className="border-0 shadow-lg mb-6">
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <CardTitle>All Invoices</CardTitle>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1 sm:flex-none">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
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
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-12 text-slate-600">Loading invoices...</div>
              ) : filteredInvoices.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                  <p className="text-slate-600 font-medium mb-2">No invoices found</p>
                  <p className="text-sm text-slate-500">
                    {searchQuery || statusFilter !== "all"
                      ? "Try adjusting your filters"
                      : "Invoices will appear here when you place orders"}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredInvoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="p-4 border-2 border-slate-200 rounded-lg hover:border-blue-300 transition-colors"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-lg text-slate-900">
                              {invoice.invoice_number}
                            </h3>
                            {getStatusBadge(invoice.status)}
                          </div>
                          <div className="space-y-1 text-sm text-slate-600">
                            <div className="flex items-center gap-2">
                              <Receipt className="w-4 h-4" />
                              <span>Order: {invoice.order_number}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4" />
                              <span>Event: {new Date(invoice.event_date).toLocaleDateString()}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              <span>
                                Due: {new Date(invoice.due_date).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <div className="text-right">
                            <p className="text-2xl font-bold text-slate-900">
                              {invoice.currency}{invoice.amount.toLocaleString()}
                            </p>
                            {invoice.paid_at && (
                              <p className="text-xs text-green-600">
                                Paid: {new Date(invoice.paid_at).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleViewInvoice(invoice)}
                            >
                              <FileText className="w-4 h-4 mr-2" />
                              View
                            </Button>
                            {(invoice.status === "pending" || invoice.status === "overdue") && (
                              <Button
                                size="sm"
                                onClick={() => handlePayInvoice(invoice)}
                                className="bg-gradient-to-r from-green-500 to-emerald-600"
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
            </CardContent>
          </Card>
        </div>

        <Footer />
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
          />
        </>
      )}

      <ChatBot userRole="client" companyId={user?.user_metadata?.company_id} />
    </>
  );
}