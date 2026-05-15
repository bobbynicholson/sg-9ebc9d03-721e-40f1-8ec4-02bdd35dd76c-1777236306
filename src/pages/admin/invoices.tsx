import { useState, useEffect, useMemo, useRef } from "react";
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
} from "@/services/invoiceGenerationService";
import { InvoicePreview } from "@/components/InvoicePreview";
import { trackRecentlyViewed } from "@/components/admin/RecentlyViewedWidget";
import { InvoiceSendDialog } from "@/components/billing/InvoiceSendDialog";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { FileText, Send, Search, RefreshCw, AlertCircle, Eye, X, Download, Clock, Copy, ExternalLink, CloudUpload, Phone, MessageCircle } from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { 
  syncInvoiceToAccounting,
  getIntegrationStatus 
} from "@/services/accountingIntegrationService";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { PendingClaimsBanner } from "@/components/billing/PendingClaimsBanner";
import { InvoiceAgingCard } from "@/components/admin/InvoiceAgingCard";

export default function InvoicesPage() {
  const router = useRouter();
  const { user, activeRole, loading: authLoading } = useAuth() as any;
  const { toast } = useToast();
  
  const [invoices, setInvoices] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  // Phase 27 #1: ?invoiceId auto-opens the preview drawer once
  // invoices have loaded. Used by OverdueInvoicesWidget (Phase
  // 22 #8) deep-link so the bookkeeper lands inside the invoice
  // rather than on the list. Guards against re-opening on the
  // same id with an autoOpenedRef so a manual close stays closed.
  const autoOpenedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!router.isReady || loading) return;
    const target = typeof router.query.invoiceId === "string" ? router.query.invoiceId : null;
    if (!target || autoOpenedRef.current === target) return;
    const found = invoices.find((inv) => inv.id === target);
    if (!found) return;
    autoOpenedRef.current = target;
    void handlePreviewInvoice(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.invoiceId, invoices, loading]);
  // Phase 26 #3: "/" or Cmd-F focuses the search input.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [statusFilter, setStatusFilter] = useState("all");
  // Wave 65 -- date-range + amount-range filters. Bookkeepers running
  // monthly reconciliation need "April invoices only" or "all
  // invoices over R10k" without scrolling through everything.
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [amountMin, setAmountMin] = useState<string>("");
  const [amountMax, setAmountMax] = useState<string>("");
  // Wave 65 -- group-by-client toggle so a tenant with the same
  // client owing money on 3 invoices sees a single rolled-up row
  // by default (matches the operator's mental model: "Bobby owes
  // R8 528.50 across 3 invoices" not "row, row, row").
  const [groupByClient, setGroupByClient] = useState(false);
  // Phase 15 #2: saved-view chips on /admin/invoices. Mirrors the
  // /admin/orders + /admin/quotes pattern -- snapshot search +
  // status under a named chip. Bookkeepers running monthly close
  // typically want to flip between 'overdue', 'paid this month'
  // and 'unpaid > 30 days' without re-typing each filter.
  interface SavedInvoiceView {
    id: string;
    name: string;
    searchTerm: string;
    statusFilter: string;
  }
  const [savedInvoiceViews, setSavedInvoiceViews] = useState<SavedInvoiceView[]>([]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("cateringms.adminInvoices.savedViews.v1");
      if (raw) setSavedInvoiceViews(JSON.parse(raw) as SavedInvoiceView[]);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        "cateringms.adminInvoices.savedViews.v1",
        JSON.stringify(savedInvoiceViews),
      );
    } catch { /* storage blocked */ }
  }, [savedInvoiceViews]);
  const saveCurrentInvoiceView = () => {
    if (typeof window === "undefined") return;
    const name = window.prompt("Name this view:", "");
    if (!name || !name.trim()) return;
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    setSavedInvoiceViews((prev) => [
      ...prev.filter((v) => v.name.toLowerCase() !== name.trim().toLowerCase()),
      { id, name: name.trim(), searchTerm, statusFilter },
    ]);
  };
  const applySavedInvoiceView = (v: SavedInvoiceView) => {
    setSearchTerm(v.searchTerm);
    setStatusFilter(v.statusFilter);
  };
  const removeSavedInvoiceView = (id: string) => {
    setSavedInvoiceViews((prev) => prev.filter((v) => v.id !== id));
  };
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  // Wave 61 -- track the actual id alongside the rehydrated payload.
  // Pre-Wave-61 the Preview "Send to Client" button looked up the
  // invoice by reference equality (inv.invoice_data === selectedInvoice)
  // -- but the rehydrate path at line 476 spreads a new object, so
  // post-rehydrate the find returned undefined and the Send button
  // silently did nothing.
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  // Phase 14 #10: bulk-mark-paid. Operators reconciling EFTs can
  // tick multiple unpaid invoices and mark them all paid + record
  // a payment in one shot rather than opening each one. The set
  // holds invoice ids ticked in the current view.
  const [bulkMarkPaidIds, setBulkMarkPaidIds] = useState<Set<string>>(new Set());
  const [bulkMarkPaidBusy, setBulkMarkPaidBusy] = useState(false);
  // Phase 15 #5: tenant timezone hint chip in header. The
  // invoice + due dates render in companies.timezone; multi-region
  // tenants couldn't tell which clock the math was using.
  const [tenantTimezone, setTenantTimezone] = useState<string | null>(null);
  useEffect(() => {
    const cid = (user as any)?.company_id;
    if (!cid) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as any)
        .from("companies")
        .select("timezone")
        .eq("id", cid)
        .maybeSingle();
      if (error) {
        console.error("[admin/invoices] companies.timezone fetch failed:", error);
      }
      if (!cancelled) setTenantTimezone((data as any)?.timezone || null);
    })();
    return () => { cancelled = true; };
  }, [(user as any)?.company_id]);
  const toggleBulkMarkPaid = (id: string) => {
    setBulkMarkPaidIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearBulkMarkPaid = () => setBulkMarkPaidIds(new Set());
  const runBulkMarkPaid = async () => {
    if (bulkMarkPaidIds.size === 0) return;
    // Wave 61 -- scope selection to currently-visible-filtered rows.
    // Pre-Wave-61 the selection Set survived filter changes so a
    // bookkeeper could tick rows, change the status filter (hiding
    // some), then submit -- silently settling invoices that were no
    // longer on screen. Now: drop any id not present in
    // filteredInvoices BEFORE submitting; bail with a friendly toast
    // if everything got filtered out.
    const visibleIds = new Set(filteredInvoices.map((i: any) => i.id));
    const visibleSelected = Array.from(bulkMarkPaidIds).filter((id) => visibleIds.has(id));
    if (visibleSelected.length === 0) {
      toast({
        title: "Nothing visible to mark paid",
        description: "Your filter has hidden every selected row. Clear the filter and try again.",
        variant: "destructive",
      });
      return;
    }
    if (visibleSelected.length < bulkMarkPaidIds.size) {
      const dropped = bulkMarkPaidIds.size - visibleSelected.length;
      const proceed = window.confirm(
        `${dropped} of your selected invoice${dropped === 1 ? " is" : "s are"} hidden by the current filter and will be skipped. Mark the remaining ${visibleSelected.length} paid?`,
      );
      if (!proceed) return;
      setBulkMarkPaidIds(new Set(visibleSelected));
    }
    // Wave 30.4: copy was wrong (and the underlying RPC behaviour
    // it described was wrong too). Marking an invoice paid no longer
    // touches the order's status -- the order continues through its
    // lifecycle (kitchen prep, dispatch, delivery, completion) like
    // it should. Only the order's payment_status is updated here.
    if (typeof window !== "undefined" && !window.confirm(
      `Mark ${bulkMarkPaidIds.size} invoice${bulkMarkPaidIds.size === 1 ? "" : "s"} as paid in full? This records a manual payment on each, settles the outstanding balance and updates the order's payment status. The order stays active for kitchen prep, dispatch, and delivery -- completion happens after the event.`,
    )) return;
    setBulkMarkPaidBusy(true);
    try {
      const ids = Array.from(bulkMarkPaidIds);
      // Flow audit Leg C P0-1: route through the canonical
      // record_invoice_payment RPC server-side so the payments
      // ledger, orders.payment_status, and invoices.status all stay
      // coherent. The naked invoices.update() this used to do skipped
      // the ledger entirely and left the finance dashboard wrong.
      const resp = await fetch("/api/admin/invoices/bulk-mark-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceIds: ids }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error((json as any)?.error || `Request failed (${resp.status})`);
      }
      const { paid = 0, skipped = 0, failed = 0, errors = [] } = json as any;
      if (failed > 0) {
        const first = (errors as any[])[0];
        toast({
          title: `Marked ${paid} paid, ${failed} failed`,
          description: first ? `First error: ${first.reason}` : "Some invoices could not be marked paid",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Marked as paid",
          description: `${paid} settled${skipped > 0 ? `, ${skipped} skipped (already paid or zero balance)` : ""}.`,
        });
      }
      clearBulkMarkPaid();
      loadInvoices();
    } catch (e: any) {
      toast({
        title: "Bulk mark-paid failed",
        description: e?.message || "Try again",
        variant: "destructive",
      });
    } finally {
      setBulkMarkPaidBusy(false);
    }
  };
  // Send-dialog state. Opens the review-before-send composer rather
  // than firing /api/send-email immediately. The operator reviews,
  // edits, then clicks Send inside the dialog.
  const [sendDialogInvoice, setSendDialogInvoice] = useState<any | null>(null);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  // Client filter -- when /admin/invoices?clientId=<uuid> lands here
  // from Client Search, narrow the invoice list to invoices for that
  // client (resolved via the order's client_id) and surface a
  // clearable pill. Lives alongside the existing ?invoiceId / ?claimId
  // consumers so deep links keep working.
  const [clientFilterId, setClientFilterId] = useState<string | null>(null);
  const [clientFilterName, setClientFilterName] = useState<string | null>(null);
  // Phase 6 #10: tenant currency. Drives the totals + balance
  // displays so a UK / US tenant sees £ / $ instead of R.
  const tenantMoney = useTenantCurrency(user?.company_id ?? null);

  useEffect(() => {
    if (user?.company_id) {
      loadInvoices();
      loadOrders();
    }
  }, [user]);

  // Wave 65 -- realtime UPDATE + DELETE subscription on invoices +
  // payments. Pre-Wave-65 the page only refreshed on manual click or
  // a full page load -- so a payment captured on the client portal
  // (or another bookkeeper in another tab) left the operator's
  // screen stale, leading to duplicate chases. Mirrors the Orders
  // Wave 55 channel pattern: stable channel key per (companyId,
  // mount), subscribe to all changes that mutate the visible list.
  useEffect(() => {
    const companyId = (user as any)?.company_id;
    if (!companyId) return;
    const channel = (supabase as any)
      .channel(`admin-invoices-realtime:${companyId}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "invoices", filter: `company_id=eq.${companyId}` },
        () => loadInvoices(),
      )
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "invoices", filter: `company_id=eq.${companyId}` },
        () => loadInvoices(),
      )
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "invoices", filter: `company_id=eq.${companyId}` },
        () => loadInvoices(),
      )
      .on("postgres_changes",
        // Payments don't filter by company_id directly (they key
        // off order_id) -- subscribe to all payment changes and
        // let the reload re-run loadInvoices which already scopes
        // to this tenant. Volume is low; refresh cost is bounded.
        { event: "*", schema: "public", table: "payments" },
        () => loadInvoices(),
      )
      .subscribe();
    return () => { (supabase as any).removeChannel(channel); };
  }, [(user as any)?.company_id]);

  // Wave 65 -- URL persistence of statusFilter, searchTerm,
  // dateFrom, dateTo, amountMin, amountMax. Pre-Wave-65 reload lost
  // every filter so a bookkeeper sharing a Slack link couldn't pass
  // their current view to a colleague.
  useEffect(() => {
    if (!router.isReady) return;
    const next: Record<string, string> = {};
    if (statusFilter && statusFilter !== "all") next.status = statusFilter;
    if (searchTerm) next.q = searchTerm;
    if (dateFrom) next.from = dateFrom;
    if (dateTo) next.to = dateTo;
    if (amountMin) next.min = amountMin;
    if (amountMax) next.max = amountMax;
    // Preserve other params (invoiceId, clientId, claimId).
    const carry: Record<string, string> = {};
    for (const [k, v] of Object.entries(router.query)) {
      if (typeof v === "string" && ["invoiceId","clientId","claimId"].includes(k)) {
        carry[k] = v;
      }
    }
    const newQuery = { ...carry, ...next };
    const currentQ = router.asPath.split("?")[1] || "";
    const newQ = new URLSearchParams(newQuery as any).toString();
    if (currentQ !== newQ) {
      router.replace(
        { pathname: router.pathname, query: newQuery },
        undefined,
        { shallow: true, scroll: false },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, searchTerm, dateFrom, dateTo, amountMin, amountMax, router.isReady]);

  // Wave 65 -- hydrate filters from URL on first mount.
  useEffect(() => {
    if (!router.isReady) return;
    const qs = router.query as Record<string, string | string[] | undefined>;
    if (typeof qs.status === "string" && statusFilter === "all") setStatusFilter(qs.status);
    if (typeof qs.q === "string" && !searchTerm) setSearchTerm(qs.q);
    if (typeof qs.from === "string" && !dateFrom) setDateFrom(qs.from);
    if (typeof qs.to === "string" && !dateTo) setDateTo(qs.to);
    if (typeof qs.min === "string" && !amountMin) setAmountMin(qs.min);
    if (typeof qs.max === "string" && !amountMax) setAmountMax(qs.max);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  useEffect(() => {
    if (!router.isReady) return;
    const clientId = typeof router.query.clientId === "string" ? router.query.clientId : null;
    setClientFilterId(clientId);
  }, [router.isReady, router.query.clientId]);

  // Resolve a friendly name for the pill once the invoices have
  // loaded. Walks the joined orders -> clients chain so we don't have
  // to fire an extra query.
  useEffect(() => {
    if (!clientFilterId) {
      setClientFilterName(null);
      return;
    }
    const match = invoices.find((inv: any) => inv.orders?.client_id === clientFilterId);
    if (match) {
      setClientFilterName(match.orders?.clients?.client_name || null);
    }
  }, [clientFilterId, invoices]);

  const clearClientFilter = () => {
    setClientFilterId(null);
    setClientFilterName(null);
    if (router.isReady) {
      const { clientId: _drop, ...rest } = router.query;
      router.replace(
        { pathname: router.pathname, query: rest },
        undefined,
        { shallow: true },
      );
    }
  };

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
            client_id,
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
    setSelectedInvoiceId(invoiceId);
    setPreviewOpen(true);

    // Phase 18 #3: track this invoice preview in the recently-
    // viewed list so the dashboard widget can offer a jump back.
    try {
      const inv = invoices.find((i) => i.id === invoiceId);
      trackRecentlyViewed({
        id: invoiceId,
        type: "invoice",
        label: `${invoiceData?.invoiceNumber || inv?.invoice_number || ""} -- ${inv?.orders?.clients?.client_name || invoiceData?.clientName || "Unknown"}`,
        href: `/admin/invoices?invoiceId=${invoiceId}`,
      });
    } catch { /* non-blocking */ }
  };

  // First click of the paper-plane icon opens the review-before-send
  // composer. The operator edits To / Subject / Body and clicks Send
  // inside the dialog -- the actual /api/send-email POST happens in
  // InvoiceSendDialog. We only stamp invoices.sent_at after a
  // confirmed successful send (handled in handleInvoiceSent below).
  const handleSendInvoice = (invoiceId: string) => {
    const invoice = invoices.find((inv) => inv.id === invoiceId);
    if (!invoice || !invoice.invoice_data) return;

    if (!user?.company_id) {
      toast({
        title: "Error",
        description: "Missing company context. Please sign in again.",
        variant: "destructive",
      });
      return;
    }

    setSendDialogInvoice(invoice);
    setSendDialogOpen(true);
  };

  const handleInvoiceSent = async (invoice: any) => {
    // Wave 61 -- surface the UPDATE failure instead of swallowing.
    // Pre-Wave-61 a failed sent_at stamp logged a warning + reloaded
    // the list; the row still showed Draft so the operator hit Send
    // again, double-emailing the client. Now: if the UPDATE fails,
    // toast loudly so the operator knows the email DID go out but
    // the status didn't flip -- they can hit "Mark as sent" or retry
    // without firing a second email.
    try {
      const { error } = await supabase
        .from("invoices")
        .update({ sent_at: new Date().toISOString(), status: "sent" })
        .eq("id", invoice.id);
      if (error) {
        toast({
          title: "Email sent, but status didn't update",
          description: `${invoice.invoice_number || "Invoice"} was emailed to the client. The 'sent' status did NOT save (${error.message}). Refresh the page; do NOT click Send again or the client gets a duplicate.`,
          variant: "destructive",
        });
      }
      loadInvoices();
    } catch (e: any) {
      toast({
        title: "Email sent, but status didn't update",
        description: `${invoice.invoice_number || "Invoice"} was emailed to the client. The 'sent' status did NOT save (${e?.message || "unknown error"}). Refresh the page; do NOT click Send again or the client gets a duplicate.`,
        variant: "destructive",
      });
      loadInvoices();
    }
  };

  const handleSyncToAccounting = async (invoiceId: string) => {
    if (!user?.company_id) return;
    const invoice = invoices.find(inv => inv.id === invoiceId);
    if (!invoice || !invoice.invoice_data) return;

    // Wave 61 -- duplicate-sync guard. Pre-Wave-61 the function would
    // POST to Xero / QuickBooks every time the operator clicked the
    // sync icon, even on already-synced invoices. Two clicks = two
    // Xero invoices = two emails to the client = a real brand event.
    // Now: hard-refuse the second sync, surface a confirmation flow
    // for the rare "I really do need to push again" case (e.g.
    // accounting reset).
    if (invoice.synced_to_accounting) {
      const reSync = window.confirm(
        `${invoice.invoice_number} was already synced to accounting on ` +
        `${invoice.last_synced_at ? new Date(invoice.last_synced_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "an earlier date"}. ` +
        `Re-syncing will create a duplicate in Xero / QuickBooks. Continue anyway?`,
      );
      if (!reSync) return;
    }

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
          title: "No accounting integration",
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

  // Wave 61 -- full enum coverage. Pre-Wave-61 the map keyed off the
  // literal "outstanding" which is NOT in the invoice_status enum
  // ({draft|sent|paid|partially_paid|overdue|written_off}), so sent /
  // partially_paid / written_off rows fell through to the "Draft"
  // default -- bookkeeper saw a SENT invoice labelled DRAFT and
  // chased the wrong thing. Now: every enum value gets its own
  // badge in the Wave 56 amber/blue/slate/rose 3-tone semantic.
  const getStatusBadge = (status: string) => {
    const variants: Record<string, { color: string; label: string; help: string }> = {
      draft: {
        color: "bg-slate-100 text-slate-700 border-slate-200",
        label: "Draft",
        help: "Created but not yet sent to the client. Click the paper-plane icon to email it.",
      },
      sent: {
        color: "bg-amber-50 text-amber-800 border-amber-200",
        label: "Awaiting payment",
        help: "Sent to the client and waiting for payment.",
      },
      partially_paid: {
        color: "bg-blue-50 text-blue-800 border-blue-200",
        label: "Part paid",
        help: "Some money in, balance still owing.",
      },
      paid: {
        color: "bg-slate-100 text-slate-700 border-slate-200",
        label: "Paid",
        help: "Payment has been received in full.",
      },
      overdue: {
        color: "bg-rose-50 text-rose-800 border-rose-200",
        label: "Overdue",
        help: "The due date has passed without payment. Chase or convert to COD.",
      },
      written_off: {
        color: "bg-slate-100 text-slate-500 border-slate-300 line-through",
        label: "Written off",
        help: "Voided / written off. No longer chased.",
      },
    };

    const variant = variants[status] || variants.draft;
    return (
      <Badge className={`${variant.color} border`} title={variant.help}>
        {variant.label}
      </Badge>
    );
  };

  const statusFilteredInvoices = useMemo(() => {
    let rows: any[] = invoices;
    if (statusFilter !== "all") {
      rows = rows.filter((inv: any) => inv.status === statusFilter);
    }
    if (clientFilterId) {
      rows = rows.filter((inv: any) => inv.orders?.client_id === clientFilterId);
    }
    // Wave 65 -- date-range filter on invoice_date.
    if (dateFrom) {
      rows = rows.filter((inv: any) => {
        if (!inv.invoice_date) return false;
        return String(inv.invoice_date).slice(0, 10) >= dateFrom;
      });
    }
    if (dateTo) {
      rows = rows.filter((inv: any) => {
        if (!inv.invoice_date) return false;
        return String(inv.invoice_date).slice(0, 10) <= dateTo;
      });
    }
    // Wave 65 -- amount-range filter on total_amount.
    if (amountMin) {
      const n = Number(amountMin);
      if (Number.isFinite(n)) {
        rows = rows.filter((inv: any) => Number(inv.total_amount || 0) >= n);
      }
    }
    if (amountMax) {
      const n = Number(amountMax);
      if (Number.isFinite(n)) {
        rows = rows.filter((inv: any) => Number(inv.total_amount || 0) <= n);
      }
    }
    return rows;
  }, [invoices, statusFilter, clientFilterId, dateFrom, dateTo, amountMin, amountMax]);

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
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold mb-2">Invoices</h1>
            <p className="text-slate-600">
              Bills issued for orders. Generate, send, and track payments. EFT claims show at the top so you can confirm against your bank statement before marking them paid.
              {tenantTimezone && (
                <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-slate-500 align-middle">
                  <Clock className="w-3 h-3" />
                  Dates in <span className="font-mono">{tenantTimezone}</span>
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          {/* Phase 27 #5: manual refresh. Bookkeeping running
              reconciliation throughout the day needed a way to
              pick up new payments without a hard reload. */}
          <Button
            variant="outline"
            onClick={loadInvoices}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {/* Phase 10 #6: invoice CSV export. Lets the bookkeeping
              team pull the current filtered invoice set into Sheets
              / Excel for VAT reconciliation, age analysis or
              accountant hand-off. Respects status + client filters
              + the search box so the export always matches what
              the operator sees on screen. */}
          <Button
            variant="outline"
            onClick={() => {
              const rows = filteredInvoices as any[];
              if (!rows || rows.length === 0) {
                toast({ title: "Nothing to export", description: "Adjust filters until at least one invoice is visible." });
                return;
              }
              const headers = [
                "Invoice number", "Status", "Issued", "Due",
                "Client", "Email",
                "Subtotal", "Tax", "Total", "Amount paid", "Balance due",
                "Currency", "Paid at", "Order ID",
              ];
              const esc = (v: any) => {
                if (v == null) return "";
                const s = String(v).replace(/"/g, '""');
                return /[",\n]/.test(s) ? `"${s}"` : s;
              };
              const lines = [headers.join(",")];
              for (const inv of rows) {
                lines.push([
                  esc(inv.invoice_number),
                  esc(inv.status),
                  esc(inv.invoice_date),
                  esc(inv.due_date),
                  // Wave 61 -- corrected join. Pre-Wave-61 read
                  // `inv.client?.*` but the loadInvoices SELECT joins
                  // via `inv.orders.clients.*` -- so every export
                  // shipped with blank Client + Email columns.
                  // Bookkeepers reconciling against Xero couldn't
                  // match rows. Fallback to client_name on the
                  // invoice itself + clientName on the rendered
                  // payload to cover legacy rows.
                  esc(
                    inv.orders?.clients?.client_name
                    || inv.client_name
                    || inv.invoice_data?.clientName,
                  ),
                  esc(
                    inv.orders?.clients?.email
                    || inv.client_email
                    || inv.invoice_data?.clientEmail,
                  ),
                  esc(inv.subtotal),
                  esc(inv.tax_amount),
                  esc(inv.total_amount),
                  esc(inv.amount_paid),
                  esc(inv.balance_due),
                  esc(tenantMoney.code),
                  esc(inv.paid_at),
                  esc(inv.order_id),
                ].join(","));
              }
              const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              const stamp = new Date().toISOString().slice(0, 10);
              a.download = `invoices_${stamp}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          {/* Phase 6 #9: bulk reminder button. Sends a per-tenant
              branded reminder for every overdue invoice in one
              click; safer scope (just overdue, not all
              outstanding) so a slip-up doesn't blast every client
              who's still inside their payment terms. */}
          <Button
            variant="outline"
            onClick={async () => {
              if (!confirm("Send a payment reminder to every client whose invoice is overdue? This goes out immediately.")) return;
              try {
                const res = await fetch("/api/admin/invoices/bulk-remind", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ scope: "overdue" }),
                });
                const j = await res.json().catch(() => ({}));
                if (!res.ok || !j.ok) {
                  throw new Error(j?.error || "Bulk remind failed");
                }
                toast({
                  title: "Reminders sent",
                  description:
                    `${j.sent} sent, ${j.failed} failed, ${j.skipped} skipped (no email on file). ${j.total} total.`,
                });
                loadInvoices();
              } catch (e: any) {
                toast({
                  title: "Could not send reminders",
                  description: e?.message || "Try again",
                  variant: "destructive",
                });
              }
            }}
          >
            Send overdue reminders
          </Button>
          </div>
        </div>

        {/* Client filter pill -- shows when /admin/invoices was opened
            with ?clientId. Click X to clear back to the unfiltered
            view (also strips the param from the URL). */}
        {clientFilterId && (
          <div className="mb-4 flex items-center gap-2">
            <Badge className="bg-purple-100 text-purple-800 border border-purple-200 gap-1.5 py-1.5 px-3 text-sm">
              <FileText className="w-3.5 h-3.5" />
              Filtered to {clientFilterName || "selected client"}
              <button
                type="button"
                onClick={clearClientFilter}
                className="ml-1 rounded-full hover:bg-purple-200 p-0.5"
                aria-label="Clear client filter"
                title="Clear client filter"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </Badge>
          </div>
        )}

        {/* Pending EFT claims (clients who tapped "I've made the EFT payment") */}
        <PendingClaimsBanner onAfterAction={loadInvoices} />

        {/* Phase 10 #9: aging buckets so the bookkeeper can see at
            a glance whether the receivable is mostly current /
            mostly 90+ days. Self-hides when nothing is outstanding. */}
        <InvoiceAgingCard invoices={invoices as any[]} companyId={(user as any)?.company_id ?? null} />

        {/* Stats Cards */}
        <div className="grid md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-1.5">
                Total invoices <InfoTooltip content={"Every invoice on file for your company, across every status."} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{invoices.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-1.5">
                Outstanding <InfoTooltip content={"Total rand value of invoices that have been sent but are not yet paid in full. Includes sent / partially paid / overdue."} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Wave 61 -- shows rand value not count, and uses the
                  correct enum set. Pre-Wave-61 the filter was
                  `i.status === "outstanding"` but the enum is
                  draft|sent|paid|partially_paid|overdue|written_off
                  -- no "outstanding" value. So this tile read 0
                  forever regardless of how much was actually owed.
                  Now: sum balance_due across the live unpaid set,
                  and surface the count as a subtext. */}
              {(() => {
                const live = invoices.filter((i: any) =>
                  ["sent", "partially_paid", "overdue"].includes(i.status)
                  && Number(i.balance_due ?? 0) > 0,
                );
                const total = live.reduce((s: number, i: any) => s + Number(i.balance_due || 0), 0);
                return (
                  <>
                    <div className="text-2xl font-bold text-amber-700">
                      {tenantMoney.format(total)}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                      {live.length} unpaid
                    </div>
                  </>
                );
              })()}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-1.5">
                Collected <InfoTooltip content={"Total value across invoices the client has settled in full. Money actually in the bank."} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-700">
                {tenantMoney.format(invoices.filter(i => i.status === "paid").reduce((sum, inv) => sum + (inv.total_amount || 0), 0))}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                {invoices.filter(i => i.status === "paid").length} paid
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-1.5">
                Total invoiced <InfoTooltip content={"Total value across every invoice, no matter the status.\n\nThis is what you have billed, not what has been paid. See the Collected tile for paid value."} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {tenantMoney.format(invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Uninvoiced Orders */}
        {orders.length > 0 && (
          <Card className="mb-8 border-yellow-200 bg-yellow-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-700" />
                Uninvoiced orders ({orders.length})
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
                  ref={searchRef}
                  placeholder="Search by invoice number or client email... (press /)"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-10"
                />
                {/* Phase 24 #10: clear-search affordance, matching
                    orders, quotes and contacts. */}
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    title="Clear search"
                    aria-label="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border rounded-md"
              >
                {/* Wave 61 -- options now match the actual enum:
                    {draft|sent|paid|partially_paid|overdue|written_off}.
                    Pre-Wave-61 the dropdown offered "outstanding"
                    which matched zero rows, while sent + partially_paid
                    + written_off had no filter route in. */}
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="sent">Awaiting payment</option>
                <option value="partially_paid">Part paid</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                <option value="written_off">Written off</option>
              </select>
            </div>

            {/* Wave 65 -- date-range, amount-range, and group-by-client
                filters. Bookkeepers reconciling monthly need
                "April invoices" or "everything over R10k" without
                scrolling. Group-by-client rolls up a tenant's
                multiple invoices into a single row -- matches the
                operator's mental model: "Bobby owes R8 528.50 across
                3 invoices". */}
            <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2 items-center text-xs">
              <label className="flex flex-col gap-0.5">
                <span className="text-slate-500">Issued from</span>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="px-2 py-1 border rounded text-sm"
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-slate-500">Issued to</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="px-2 py-1 border rounded text-sm"
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-slate-500">Min amount</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  placeholder="0"
                  value={amountMin}
                  onChange={(e) => setAmountMin(e.target.value)}
                  className="px-2 py-1 border rounded text-sm"
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-slate-500">Max amount</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  placeholder="No limit"
                  value={amountMax}
                  onChange={(e) => setAmountMax(e.target.value)}
                  className="px-2 py-1 border rounded text-sm"
                />
              </label>
              <label className="flex items-end gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={groupByClient}
                  onChange={(e) => setGroupByClient(e.target.checked)}
                  className="h-4 w-4 accent-blue-600"
                />
                <span className="text-slate-700">Group by client</span>
              </label>
            </div>
            {/* Phase 15 #2: saved-view chips. Bookkeepers running
                monthly close want to flip between 'overdue', 'paid
                this month' and 'unpaid > 30 days' fast. */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {savedInvoiceViews.map((v) => (
                <span key={v.id} className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 text-purple-700 text-xs">
                  <button
                    type="button"
                    onClick={() => applySavedInvoiceView(v)}
                    className="px-2.5 py-0.5 hover:underline"
                    title={`Apply: ${v.statusFilter}${v.searchTerm ? ` + '${v.searchTerm}'` : ""}`}
                  >
                    {v.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSavedInvoiceView(v.id)}
                    className="pr-1.5 text-purple-500 hover:text-purple-800"
                    title="Remove this view"
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={saveCurrentInvoiceView}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 text-slate-500 text-xs px-2.5 py-0.5 hover:border-purple-300 hover:text-purple-700"
                title="Save the current search + status as a named view"
              >
                + Save view
              </button>
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
                {/* Wave 65 -- name the active filters + one-click clear,
                    parity with Orders Wave 55. Pre-Wave-65 the empty
                    state said "No invoices found" with no hint which
                    filter was hiding rows. */}
                <p className="text-slate-600 font-medium">No invoices match these filters</p>
                {(() => {
                  const active: string[] = [];
                  if (searchTerm) active.push(`search "${searchTerm}"`);
                  if (statusFilter !== "all") active.push(`status: ${statusFilter.replace(/_/g, " ")}`);
                  if (dateFrom || dateTo) active.push(`date: ${dateFrom || "any"} to ${dateTo || "any"}`);
                  if (amountMin || amountMax) active.push(`amount: ${amountMin || "0"} to ${amountMax || "any"}`);
                  if (clientFilterId) active.push("specific client");
                  if (active.length === 0) {
                    return <p className="text-sm text-slate-500 mt-1">No invoices in this view yet.</p>;
                  }
                  return (
                    <>
                      <p className="text-sm text-slate-500 mt-1">Filtered by {active.join(", ")}.</p>
                      <button
                        type="button"
                        onClick={() => {
                          setSearchTerm("");
                          setStatusFilter("all");
                          setDateFrom("");
                          setDateTo("");
                          setAmountMin("");
                          setAmountMax("");
                          if (clientFilterId) clearClientFilter();
                        }}
                        className="mt-3 text-xs font-semibold text-blue-700 hover:text-blue-900 underline"
                      >
                        Clear all filters
                      </button>
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="space-y-3">
                {/* Phase 14 #10: bulk mark-paid toolbar. Sticky
                    above the list when at least one invoice is
                    ticked. */}
                {bulkMarkPaidIds.size > 0 && (
                  <div className="sticky top-2 z-10 bg-white border border-green-200 rounded-lg shadow-sm p-3 flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium text-green-900">
                      {bulkMarkPaidIds.size} invoice{bulkMarkPaidIds.size === 1 ? "" : "s"} selected
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={runBulkMarkPaid}
                        disabled={bulkMarkPaidBusy}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {bulkMarkPaidBusy ? "Marking..." : "Mark all paid"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={clearBulkMarkPaid} disabled={bulkMarkPaidBusy}>
                        Clear
                      </Button>
                    </div>
                  </div>
                )}
                {/* Wave 65 -- group-by-client view. When toggled,
                    collapses invoices belonging to the same client
                    into a single rolled-up row showing total
                    outstanding, count, and latest invoice date.
                    Click the chip to filter to that client and
                    expand into per-invoice rows. Top debtors
                    surface naturally because the rolled list is
                    sortable by outstanding desc. */}
                {groupByClient && (() => {
                  type Group = { clientId: string; clientName: string; clientEmail: string; invoices: any[]; outstanding: number; total: number };
                  const groups = new Map<string, Group>();
                  for (const inv of filteredInvoices as any[]) {
                    const cid = inv.orders?.client_id || inv.orders?.clients?.id || inv.orders?.clients?.client_name || "unknown";
                    const existing = groups.get(cid) || {
                      clientId: cid,
                      clientName: inv.orders?.clients?.client_name || "Unknown client",
                      clientEmail: inv.orders?.clients?.email || "",
                      invoices: [],
                      outstanding: 0,
                      total: 0,
                    };
                    existing.invoices.push(inv);
                    existing.outstanding += Number(inv.balance_due || 0);
                    existing.total += Number(inv.total_amount || 0);
                    groups.set(cid, existing);
                  }
                  const sorted = Array.from(groups.values()).sort((a, b) => b.outstanding - a.outstanding);
                  return sorted.map((g) => (
                    <div
                      key={g.clientId}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                      onClick={() => {
                        // Set the client filter to expand into per-invoice rows.
                        setGroupByClient(false);
                        if (g.clientId !== "unknown") {
                          router.push(
                            { pathname: router.pathname, query: { ...router.query, clientId: g.clientId } },
                            undefined,
                            { shallow: true, scroll: false },
                          );
                        }
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-900 truncate">{g.clientName}</div>
                        <div className="text-xs text-slate-500 truncate">{g.clientEmail}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {g.invoices.length} invoice{g.invoices.length === 1 ? "" : "s"}
                        </div>
                      </div>
                      <div className="text-right tabular-nums flex-shrink-0">
                        <div className="text-xs text-slate-500">Outstanding</div>
                        <div className="text-lg font-bold text-amber-700">{tenantMoney.format(g.outstanding)}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Total: {tenantMoney.format(g.total)}
                        </div>
                      </div>
                    </div>
                  ));
                })()}
                {!groupByClient && filteredInvoices.map(invoice => (
                  <div
                    key={invoice.id}
                    className={`flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition-colors ${
                      bulkMarkPaidIds.has(invoice.id) ? "ring-2 ring-green-300 bg-green-50/30" : ""
                    }`}
                  >
                    {/* Phase 14 #10: row checkbox. Only renders for
                        invoices that aren't already paid -- a paid
                        row has nothing to bulk-action. */}
                    {/* Wave 30.6: invoice_status enum is
                        {draft|sent|paid|partially_paid|overdue|written_off}.
                        'cancelled' never matches a real row -- the
                        actual void value is 'written_off'. Kept the
                        legacy literal for back-compat just in case
                        any historical row carried it before the enum
                        was tightened. */}
                    {invoice.status !== "paid" && invoice.status !== "cancelled" && invoice.status !== "written_off" && (
                      <input
                        type="checkbox"
                        className="mr-3 h-4 w-4 cursor-pointer accent-green-600 shrink-0"
                        checked={bulkMarkPaidIds.has(invoice.id)}
                        onChange={() => toggleBulkMarkPaid(invoice.id)}
                        title="Tick to include in bulk mark-paid"
                        aria-label={`Select invoice ${invoice.invoice_number}`}
                      />
                    )}
                    <div className="flex-1 grid grid-cols-4 gap-4">
                      <div>
                        <div className="font-medium flex items-center gap-1.5">
                          {/* Phase 21 #2: row-level click-to-copy
                              for the invoice number. Bookkeeping
                              pastes refs into payment-reference
                              fields, reconciliation notes and
                              chase emails constantly. */}
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              const num = String(invoice.invoice_number || "");
                              if (!num) return;
                              try {
                                await navigator.clipboard.writeText(num);
                                toast({ title: "Copied", description: `${num} on clipboard.` });
                              } catch {
                                toast({ title: "Copy failed", description: "Browser blocked clipboard access.", variant: "destructive" });
                              }
                            }}
                            className="inline-flex items-center gap-1 font-mono hover:underline"
                            title="Copy invoice number"
                          >
                            <Copy className="w-3 h-3 opacity-60" />
                            {invoice.invoice_number}
                          </button>
                          {/* Phase 16 #6: notes-present indicator.
                              When invoices.notes is non-empty (the
                              bookkeeper jotted context on the row),
                              surface a small chip so the next person
                              opening the row reads it first. Title
                              attribute previews the note on hover. */}
                          {invoice.notes && String(invoice.notes).trim() && (
                            <span
                              className="text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200"
                              title={String(invoice.notes).slice(0, 200)}
                            >
                              Note
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-slate-600">
                          {/* Wave 61 -- null guard. Pre-Wave-61
                              new Date(null) returned Unix epoch and
                              the row rendered "01 Jan 1970" for any
                              imported invoice with no invoice_date. */}
                          {invoice.invoice_date
                            ? format(new Date(invoice.invoice_date), "dd MMM yyyy")
                            : "No date"}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate" title={invoice.orders?.clients?.client_name || "Unknown client"}>
                          {invoice.orders?.clients?.client_name || "Unknown client"}
                        </div>
                        {/* Wave 62 -- contact strip. Click-to-call,
                            click-to-WhatsApp, click-to-email so the
                            bookkeeper can chase money without copy-
                            pasting numbers into another app. */}
                        <div className="flex items-center gap-1.5 mt-0.5 text-xs">
                          {invoice.orders?.clients?.email && (
                            <a
                              href={`mailto:${invoice.orders.clients.email}?subject=${encodeURIComponent(`Invoice ${invoice.invoice_number || ""}`)}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-slate-600 hover:text-slate-900 truncate"
                              title={`Email ${invoice.orders.clients.email}`}
                            >
                              {invoice.orders.clients.email}
                            </a>
                          )}
                          {invoice.orders?.clients?.phone && (
                            <>
                              <a
                                href={`tel:${String(invoice.orders.clients.phone).replace(/[^+\d]/g, "")}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-slate-700 inline-flex items-center gap-0.5"
                                title={`Call ${invoice.orders.clients.phone}`}
                              >
                                <Phone className="w-3 h-3" />
                              </a>
                              <a
                                href={`https://wa.me/${String(invoice.orders.clients.phone).replace(/[^\d]/g, "")}?text=${encodeURIComponent(`Hi ${(invoice.orders.clients.client_name || "there").split(" ")[0]}, regarding invoice ${invoice.invoice_number || ""}`)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-green-700 inline-flex items-center gap-0.5"
                                title="WhatsApp the client"
                              >
                                <MessageCircle className="w-3 h-3" />
                              </a>
                            </>
                          )}
                        </div>
                        {/* Wave 62 -- per-row link to the parent order.
                            Pre-Wave-62 the bookkeeper had to memorise
                            the order number then navigate to /admin/orders. */}
                        {invoice.order_id && (
                          <a
                            href={`/admin/orders?orderId=${invoice.order_id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-0.5 text-[11px] text-blue-700 hover:text-blue-900 mt-0.5"
                            title="Open the order this invoice belongs to"
                          >
                            <ExternalLink className="w-2.5 h-2.5" />
                            Open order
                          </a>
                        )}
                      </div>
                      <div>
                        <div className="font-medium">{tenantMoney.format(invoice.total_amount || 0)}</div>
                        {invoice.balance_due > 0 && (
                          <div className="text-sm text-yellow-700">
                            Balance: {tenantMoney.format(invoice.balance_due)}
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
                      {/* Wave 62 -- CloudUpload icon disambiguates
                          from the page-level Refresh button (also
                          RefreshCw). Pre-Wave-62 the same icon
                          meant "reload list" at page-level and
                          "sync to Xero" at row-level -- new operators
                          would click the row icon expecting a row
                          reload and silently push to Xero instead. */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSyncToAccounting(invoice.id)}
                        title={invoice.synced_to_accounting
                          ? `Already synced to accounting${invoice.last_synced_at ? ` on ${format(new Date(invoice.last_synced_at), "dd MMM yyyy")}` : ""}. Click to push again (will create a duplicate).`
                          : "Push this invoice to your linked accounting tool (Xero / QuickBooks)"}
                        aria-label="Sync invoice to accounting"
                        className={invoice.synced_to_accounting ? "text-slate-400" : ""}
                      >
                        <CloudUpload className="h-4 w-4" />
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
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              Invoice Preview
              {selectedInvoice?.invoiceNumber && (
                <button
                  type="button"
                  onClick={async () => {
                    // Phase 20 #9: click-to-copy invoice number,
                    // same pattern as the order drawer. Bookkeeping
                    // pastes invoice numbers into the bank's payment
                    // reference field and reconciliation notes.
                    const num = String(selectedInvoice.invoiceNumber);
                    try {
                      await navigator.clipboard.writeText(num);
                      toast({ title: "Copied", description: `${num} on clipboard.` });
                    } catch {
                      toast({ title: "Copy failed", description: "Browser blocked clipboard access.", variant: "destructive" });
                    }
                  }}
                  className="inline-flex items-center gap-1 text-sm font-mono font-semibold text-slate-600 bg-slate-100 border border-slate-200 rounded px-2 py-0.5 hover:bg-slate-200 hover:text-slate-900 transition"
                  title="Copy invoice number"
                >
                  <Copy className="w-3 h-3" />
                  {selectedInvoice.invoiceNumber}
                </button>
              )}
            </DialogTitle>
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
                  // Wave 61 -- look up by id (set in handlePreviewInvoice).
                  // Pre-Wave-61 used reference equality on a rehydrated
                  // object -- find returned undefined, button did nothing.
                  if (selectedInvoiceId) handleSendInvoice(selectedInvoiceId);
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

      {/* Review-before-send composer. Opens on the paper-plane click;
          actual /api/send-email POST happens inside the dialog. On
          success we close + stamp invoices.sent_at. */}
      <InvoiceSendDialog
        open={sendDialogOpen}
        onOpenChange={(o) => {
          setSendDialogOpen(o);
          if (!o) setSendDialogInvoice(null);
        }}
        companyId={user?.company_id || ""}
        invoice={sendDialogInvoice}
        onSent={handleInvoiceSent}
      />
    </div>
  );
}