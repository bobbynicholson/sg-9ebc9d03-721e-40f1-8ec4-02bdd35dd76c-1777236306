import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { useRouter } from "next/router";
import { AdminNav } from "@/components/admin/AdminNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  generateInvoiceData,
  createInvoiceRecord,
  sendInvoiceEmail,
} from "@/services/invoiceGenerationService";
import { InvoicePreview } from "@/components/InvoicePreview";
import {
  FileText,
  Send,
  Download,
  Search,
  Filter,
  Plus,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Clock,
  Eye,
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { 
  syncInvoiceToAccounting,
  getIntegrationStatus 
} from "@/services/accountingIntegrationService";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { PendingClaimsBanner } from "@/components/billing/PendingClaimsBanner";

export default function InvoicesPage() {
  const router = useRouter();
  const { user, activeRole, loading: authLoading } = useAuth() as any;
  const { toast } = useToast();
  
  const [invoices, setInvoices] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [generatingInvoice, setGeneratingInvoice] = useState(false);

  useEffect(() => {
    if (user?.company_id) {
      loadInvoices();
      loadOrders();
    }
  }, [user]);

  const loadInvoices = async () => {
    if (!user?.company_id) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select(`
          *,
          orders (
            order_number,
            event_date,
            clients (
              client_name,
              email
            )
          )
        `)
        .eq("company_id", user.company_id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setInvoices(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadOrders = async () => {
    if (!user?.company_id) return;

    // Pull orders + the company's invoices in parallel. We can't rely
    // on the `invoices` state here -- this function is bound to the
    // first render and would close over the empty initial value, so
    // newly-created drafts wouldn't show as already-invoiced and the
    // user could click Generate Invoice twice and trip the
    // uniq_invoices_active_order_id constraint.
    const [ordersRes, invoicesRes] = await Promise.all([
      supabase
        .from("orders")
        .select(`
          *,
          clients (
            client_name,
            email
          )
        `)
        .eq("company_id", user.company_id)
        .is("deleted_at", null)
        .in("status", ["confirmed", "completed"])
        .order("event_date", { ascending: false }),
      supabase
        .from("invoices")
        .select("order_id, status")
        .eq("company_id", user.company_id),
    ]);

    if (!ordersRes.error) {
      // Any existing invoice counts -- a draft is still an active
      // invoice for that order. The DB's uniq_invoices_active_order_id
      // is the source of truth; this filter just keeps the list clean
      // and stops the user from clicking Generate Invoice on something
      // that would hit the constraint.
      const invoicedOrderIds = new Set(
        ((invoicesRes.data || []) as any[])
          .map(inv => inv.order_id)
          .filter(Boolean),
      );
      const uninvoicedOrders = (ordersRes.data || []).filter(
        order => !invoicedOrderIds.has(order.id)
      );
      setOrders(uninvoicedOrders);
    }
  };

  const handleGenerateInvoice = async (orderId: string) => {
    if (!user?.company_id) return;

    setGeneratingInvoice(true);
    try {
      // Defensive pre-check. The DB has uniq_invoices_active_order_id
      // which throws a raw constraint error if a non-cancelled invoice
      // already exists. We filter the uninvoiced list on load but a
      // double-click or stale list still gets through. Surface a clean
      // message instead of the Postgres error.
      const { data: existing } = await supabase
        .from("invoices")
        .select("id, invoice_number, status")
        .eq("order_id", orderId)
        .limit(1)
        .maybeSingle();
      if (existing) {
        toast({
          title: "Invoice already exists",
          description: `${(existing as any).invoice_number} is already on this order. Refreshing the list.`,
        });
        await loadInvoices();
        await loadOrders();
        return;
      }

      // 1. Generate invoice data
      const { success: dataSuccess, data: invoiceData, error: dataError } =
        await generateInvoiceData(orderId, user.company_id);

      if (!dataSuccess || !invoiceData) {
        throw new Error(dataError || "Failed to generate invoice");
      }

      // 2. Create invoice record
      const { success: recordSuccess, invoiceId, error: recordError } =
        await createInvoiceRecord(invoiceData, orderId, user.company_id);

      if (!recordSuccess) {
        // Friendlier message for the unique-constraint case in case the
        // pre-check raced.
        const msg = recordError || "Failed to save invoice";
        if (/uniq_invoices_active_order_id/i.test(msg)) {
          throw new Error("This order already has an active invoice.");
        }
        throw new Error(msg);
      }

      toast({
        title: "Success",
        description: "Invoice generated successfully",
      });

      // 3. Reload invoices
      await loadInvoices();
      await loadOrders();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setGeneratingInvoice(false);
    }
  };

  const handlePreviewInvoice = async (invoiceId: string) => {
    const invoice = invoices.find(inv => inv.id === invoiceId);
    if (!invoice) return;

    // Older invoices were created with an empty items array because
    // the generator read orders.menu_items (a column that doesn't
    // exist) instead of pulling from order_items. Re-hydrate the
    // items + totals on demand so preview always shows the real
    // line breakdown without a separate backfill migration.
    let invoiceData = invoice.invoice_data || {};
    const itemsMissing =
      !Array.isArray(invoiceData.items) || invoiceData.items.length === 0;
    if (itemsMissing && invoice.order_id && user?.company_id) {
      try {
        const { success, data } = await generateInvoiceData(
          invoice.order_id,
          user.company_id,
        );
        if (success && data) {
          // Keep the existing invoice_number / dates so the preview
          // still matches the saved invoice; only refresh the parts
          // that depend on order_items.
          invoiceData = {
            ...data,
            invoiceNumber: invoice.invoice_number || data.invoiceNumber,
            invoiceDate: invoice.invoice_date || data.invoiceDate,
            dueDate: invoice.due_date || data.dueDate,
          };
        }
      } catch (err) {
        console.warn(
          "[invoices] preview rehydrate failed, falling back to stored invoice_data:",
          err,
        );
      }
    }

    setSelectedInvoice(invoiceData);
    setPreviewOpen(true);
  };

  const handleSendInvoice = async (invoiceId: string) => {
    const invoice = invoices.find(inv => inv.id === invoiceId);
    if (!invoice || !invoice.invoice_data) return;

    if (!user?.company_id) {
      toast({
        title: "Error",
        description: "Missing company context -- please sign in again.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { success, error } = await sendInvoiceEmail(
        invoice.invoice_data,
        invoice.invoice_data.clientEmail,
        { invoiceId: invoice.id, companyId: user.company_id },
      );

      if (!success) {
        throw new Error(error || "Failed to send email");
      }

      // Update invoice status
      await supabase
        .from("invoices")
        .update({ sent_at: new Date().toISOString() })
        .eq("id", invoiceId);

      toast({
        title: "Success",
        description: `Invoice sent to ${invoice.invoice_data.clientEmail}`,
      });

      loadInvoices();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleSyncToAccounting = async (invoiceId: string) => {
    if (!user?.company_id) return;
    const invoice = invoices.find(inv => inv.id === invoiceId);
    if (!invoice || !invoice.invoice_data) return;

    try {
      setGeneratingInvoice(true);
      const xeroStatus = await getIntegrationStatus(user.company_id, "xero");
      const qbStatus = await getIntegrationStatus(user.company_id, "quickbooks");

      let provider: "xero" | "quickbooks" | null = null;
      
      if (xeroStatus.connected) {
        provider = "xero";
      } else if (qbStatus.connected) {
        provider = "quickbooks";
      }

      if (!provider) {
        toast({
          title: "No Accounting Integration",
          description: "Please connect Xero or QuickBooks in Settings → Integrations",
          variant: "destructive",
        });
        return;
      }

      const invoiceData = {
        invoiceNumber: invoice.invoice_number,
        invoiceDate: invoice.invoice_date,
        dueDate: invoice.due_date,
        clientName: invoice.invoice_data.clientName,
        clientEmail: invoice.invoice_data.clientEmail,
        items: invoice.invoice_data.items,
        subtotal: invoice.subtotal,
        taxAmount: invoice.tax_amount || invoice.invoice_data.taxAmount || 0,
        total: invoice.total_amount,
        status: invoice.status === "paid" ? "paid" : "sent" as "paid" | "sent" | "draft",
      };

      const result = await syncInvoiceToAccounting(user.company_id, provider, invoiceData);

      if (!result.success) {
        toast({
          title: "Sync Failed",
          description: result.error || "Failed to sync invoice to accounting system",
          variant: "destructive",
        });
        return;
      }

      await supabase
        .from("invoices")
        .update({
          external_id: result.externalId,
          external_invoice_number: result.externalInvoiceNumber,
          synced_to_accounting: true,
          last_synced_at: new Date().toISOString(),
          sync_error: null,
        })
        .eq("id", invoice.id);

      toast({
        title: "✅ Synced Successfully",
        description: `Invoice synced to ${provider === "xero" ? "Xero" : "QuickBooks"}`,
      });

      loadInvoices();
    } catch (error: any) {
      toast({
        title: "Sync Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setGeneratingInvoice(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { color: string; label: string; help: string }> = {
      draft: {
        color: "bg-slate-100 text-slate-700",
        label: "Draft",
        help: "Created but not yet sent to the client. Click the paper-plane icon to email it.",
      },
      outstanding: {
        color: "bg-yellow-100 text-yellow-700",
        label: "Outstanding",
        help: "Sent to the client and waiting for payment.",
      },
      paid: {
        color: "bg-green-100 text-green-700",
        label: "Paid",
        help: "Payment has been received in full.",
      },
      overdue: {
        color: "bg-red-100 text-red-700",
        label: "Overdue",
        help: "The due date has passed without payment.",
      },
    };

    const variant = variants[status] || variants.draft;
    return (
      <Badge className={variant.color} title={variant.help}>
        {variant.label}
      </Badge>
    );
  };

  const statusFilteredInvoices = useMemo(() => {
    return statusFilter === "all"
      ? invoices
      : invoices.filter((inv: any) => inv.status === statusFilter);
  }, [invoices, statusFilter]);

  const filteredInvoices = useFuzzyItems(
    statusFilteredInvoices,
    searchTerm,
    [
      { key: "invoice_number" as any, weight: 3 },
      { key: ((inv: any) => inv.orders?.clients?.email || "") as any, weight: 2, label: "client_email" },
      { key: ((inv: any) => inv.orders?.clients?.full_name || inv.orders?.client_name || "") as any, weight: 2, label: "client_name" },
    ],
    { limit: 0 },
  );

  // Don't gate-check until auth has finished hydrating, otherwise a
  // brief !user window flashes the Access Denied screen before the
  // session resolves -- and if the user lands on it before useAuth
  // emits the authenticated state, they're stuck looking at the
  // denial even though they are an admin.
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen text-slate-500 text-sm">
        Loading invoices...
      </div>
    );
  }

  // Multi-branch roles can also reach invoices; finance pages stay
  // gated separately via canAccessFinance for the dashboard view.
  const allowedRoles = ["admin", "super_admin", "company_admin", "region_admin", "sales_admin", "owner"];
  if (!user || !allowedRoles.includes(activeRole as string)) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
          <p>You need admin access to view invoices.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 lg:pl-72 xl:pl-80">
      <AdminNav />

      <div className="py-8 px-4 max-w-full">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Invoices</h1>
          <p className="text-slate-600">
            Generate, manage, and send invoices to clients
          </p>
        </div>

        {/* Pending EFT claims (clients who tapped "I've made the EFT payment") */}
        <PendingClaimsBanner onAfterAction={loadInvoices} />

        {/* Stats Cards */}
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-1.5">
                Total Invoices <InfoTooltip content={"Every invoice on file for your company, across every status."} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{invoices.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-1.5">
                Outstanding <InfoTooltip content={"Invoices that have been sent but are not yet paid in full."} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                {invoices.filter(i => i.status === "outstanding").length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-1.5">
                Paid <InfoTooltip content={"Invoices the client has settled in full."} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {invoices.filter(i => i.status === "paid").length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-1.5">
                Total Revenue <InfoTooltip content={"Total value invoiced across every invoice, no matter the status.\n\nThis is what you have billed, not what has been paid."} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                R {invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0).toFixed(2)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Uninvoiced Orders */}
        {orders.length > 0 && (
          <Card className="mb-8 border-yellow-200 bg-yellow-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-600" />
                Uninvoiced Orders ({orders.length})
                <InfoTooltip content={"Confirmed or completed orders that still need an invoice generated."} />
              </CardTitle>
              <CardDescription>
                These confirmed/completed orders don't have invoices yet
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {orders.slice(0, 5).map(order => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between p-3 bg-white rounded border"
                  >
                    <div className="flex-1">
                      <div className="font-medium">
                        {order.clients?.client_name || "Unknown client"}
                      </div>
                      <div className="text-sm text-slate-600">
                        Order #{order.order_number} • {order.event_date ? format(new Date(order.event_date), "dd MMM yyyy") : "No date"}
                      </div>
                    </div>
                    <Button
                      onClick={() => handleGenerateInvoice(order.id)}
                      disabled={generatingInvoice}
                      size="sm"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Generate Invoice
                    </Button>
                  </div>
                ))}
                {orders.length > 5 && (
                  <div className="text-center text-sm text-slate-600 pt-2">
                    + {orders.length - 5} more orders need invoices
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search by invoice number or client email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border rounded-md"
              >
                <option value="all">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="outstanding">Outstanding</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Invoices List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5">Invoice History <InfoTooltip content={"Every invoice for your company, newest first, narrowed by your search and status filters."} /></CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12">
                <RefreshCw className="h-8 w-8 mx-auto animate-spin text-slate-400" />
                <p className="text-slate-600 mt-2">Loading invoices...</p>
              </div>
            ) : filteredInvoices.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 mx-auto text-slate-300 mb-3" />
                <p className="text-slate-600">No invoices found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredInvoices.map(invoice => (
                  <div
                    key={invoice.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex-1 grid grid-cols-4 gap-4">
                      <div>
                        <div className="font-medium">{invoice.invoice_number}</div>
                        <div className="text-sm text-slate-600">
                          {format(new Date(invoice.invoice_date), "dd MMM yyyy")}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm">
                          {invoice.orders?.clients?.client_name || "Unknown client"}
                        </div>
                        <div className="text-xs text-slate-600">
                          {invoice.orders?.clients?.email}
                        </div>
                      </div>
                      <div>
                        <div className="font-medium">R {invoice.total_amount?.toFixed(2)}</div>
                        {invoice.balance_due > 0 && (
                          <div className="text-sm text-yellow-600">
                            Balance: R {invoice.balance_due.toFixed(2)}
                          </div>
                        )}
                      </div>
                      <div>
                        {getStatusBadge(invoice.status)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePreviewInvoice(invoice.id)}
                        title="Preview the invoice exactly as your client will see it"
                        aria-label="Preview invoice"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSendInvoice(invoice.id)}
                        title="Email this invoice to the client (PDF attached)"
                        aria-label="Send invoice to client"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSyncToAccounting(invoice.id)}
                        title="Push this invoice to your linked accounting tool (Xero / QuickBooks)"
                        aria-label="Sync invoice to accounting"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Invoice Preview</DialogTitle>
            <DialogDescription>
              Review the invoice before sending to client
            </DialogDescription>
          </DialogHeader>
          {selectedInvoice && (
            <div className="mt-4">
              <InvoicePreview {...selectedInvoice} />
              <div className="flex justify-end gap-2 mt-6 pt-6 border-t">
                <Button variant="outline" onClick={() => setPreviewOpen(false)}>
                  Close
                </Button>
                <Button onClick={() => {
                  const invoice = invoices.find(inv => inv.invoice_data === selectedInvoice);
                  if (invoice) handleSendInvoice(invoice.id);
                  setPreviewOpen(false);
                }}>
                  <Send className="h-4 w-4 mr-2" />
                  Send to Client
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}