/**
 * /admin/outstanding-balances
 *
 * Finance view of every client who still owes money: invoices with a
 * remaining balance_due > 0 that aren't fully paid / written off. The
 * common case is "deposit paid, 50% balance still due before the event",
 * but it covers any partially-paid or unpaid invoice.
 *
 * One row per outstanding invoice (client, order, event date, due date,
 * total, paid-to-date, balance still owed). Filter by client/order/invoice
 * text + a due-date range + an "overdue only" toggle. CSV export mirrors
 * the refunds / invoices exports for the bookkeeping team.
 *
 * Money rule (no inconsistency): paid + balance == total on every row,
 * read straight off invoices.amount_paid / balance_due / total_amount -
 * the same authoritative figures the pay page uses.
 *
 * Finance-gated (owner + admin roles), company-scoped.
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { useTenantHref } from "@/lib/tenantUrl";
import { supabase } from "@/integrations/supabase/client";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader,
  PageWorkbench,
} from "@/components/portal/ui";
import { UserRole } from "@/types/app";
import { toLocalISO, toZonedISO } from "@/lib/localDate";
import { formatLocalDate } from "@/lib/localFormat";
import { staffOrderHref } from "@/lib/orderUrls";
import { captureException } from "@/lib/observability";
import {
  Wallet, Search, Download, AlertTriangle, User as UserIcon,
  ExternalLink, Loader2, X, RefreshCw, AlertCircle,
} from "lucide-react";

// Statuses that are NOT outstanding - exclude them even if a stale
// balance_due slipped through. balance_due > 0 is the real gate; this is
// belt-and-braces against bad rows. Drafts are excluded too: a draft has
// not been issued, so the client doesn't owe it yet - including drafts
// made this page's Total outstanding disagree with the Outstanding tile
// on /admin/invoices (which counts sent / partially_paid / overdue only).
const SETTLED_STATUSES = new Set(["paid", "written_off", "voided", "void", "cancelled", "refunded", "draft"]);

// Money rule: sum and compare in integer cents so float drift can never
// make Paid + Balance disagree with Total across surfaces.
const toCents = (v: unknown) => Math.round(Number(v || 0) * 100);

interface BalanceRow {
  invoiceId: string;
  invoiceNumber: string | null;
  publicToken: string | null;
  status: string;
  total: number;
  paid: number;
  balance: number;
  dueDate: string | null;
  invoiceDate: string | null;
  orderId: string | null;
  orderNumber: string | null;
  clientName: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  eventDate: string | null;
}

export default function OutstandingBalancesRoute() {
  return (
    <ProtectedRoute allowedRoles={[
      UserRole.SUPER_ADMIN, UserRole.OWNER, UserRole.COMPANY_ADMIN,
    ]}>
      <OutstandingBalancesPage />
    </ProtectedRoute>
  );
}

function OutstandingBalancesPage() {
  const { user } = useAuth() as any;
  const companyId = user?.company_id || null;
  const { withSlug } = useTenantHref();
  const tenantCurrency = useTenantCurrency(companyId);
  // Same formatter as /admin/invoices so the two receivable surfaces
  // render identical figures (the old page-local Intl formatter used a
  // different separator style from the rest of the money UI).
  const fmt = tenantCurrency.format;

  const [rows, setRows] = useState<BalanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Load failure is fatal for this page: with rows = [] the empty state
  // reads "Every invoice is fully paid - nice", which is a lie if the
  // query died. Surface the failure with a Retry instead.
  const [loadError, setLoadError] = useState<string | null>(null);
  // Non-fatal: the balances loaded but the linked-order context (client
  // name / email / event date) didn't. Rows render with placeholders.
  const [contextWarning, setContextWarning] = useState(false);
  const [search, setSearch] = useState("");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  // Tenant wall-clock for the overdue cutoff: a JHB tenant's "today"
  // shouldn't shift because the bookkeeper is travelling.
  const [tenantTimezone, setTenantTimezone] = useState<string | null>(null);
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as any)
        .from("companies")
        .select("timezone")
        .eq("id", companyId)
        .maybeSingle();
      if (error) {
        captureException(error, {
          level: "warning",
          tags: { companyId, route: "/admin/outstanding-balances", step: "companies_timezone" },
        });
      }
      if (!cancelled) setTenantTimezone((data as any)?.timezone || null);
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  const load = useMemo(() => async () => {
    if (!companyId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const { data: invs, error } = await (supabase as any)
        .from("invoices")
        .select("id, invoice_number, public_token, status, total_amount, amount_paid, balance_due, due_date, invoice_date, created_at, order_id, client_id")
        .eq("company_id", companyId)
        .gt("balance_due", 0)
        .is("deleted_at", null)
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;

      const invoices = ((invs || []) as any[]).filter((i) => !SETTLED_STATUSES.has(String(i.status || "").toLowerCase()));

      // Resolve client + event context from the linked order (orders carry
      // client_name / client_email / client_phone / event_date; invoices
      // don't). One batched read, mirrors the refunds page pattern.
      const orderIds = Array.from(new Set(invoices.map((i) => i.order_id).filter(Boolean)));
      const orderById = new Map<string, any>();
      let ordersFailed = false;
      if (orderIds.length > 0) {
        const { data: orders, error: ordersErr } = await (supabase as any)
          .from("orders")
          .select("id, order_number, client_name, client_email, client_phone, event_date")
          .in("id", orderIds);
        if (ordersErr) {
          // Balances are still correct without the order join - keep the
          // rows, flag the missing context instead of failing silently.
          ordersFailed = true;
          captureException(ordersErr, {
            level: "warning",
            tags: { route: "/admin/outstanding-balances", step: "orders_context", companyId },
          });
        }
        for (const o of (orders || []) as any[]) orderById.set(o.id, o);
      }
      setContextWarning(ordersFailed);

      const built: BalanceRow[] = invoices.map((i) => {
        const o = i.order_id ? orderById.get(i.order_id) : null;
        return {
          invoiceId: i.id,
          invoiceNumber: i.invoice_number ?? null,
          publicToken: i.public_token ?? null,
          status: String(i.status || ""),
          total: Number(i.total_amount) || 0,
          paid: Number(i.amount_paid) || 0,
          balance: Number(i.balance_due) || 0,
          // Normalise to the bare calendar day so the string compares
          // against todayIso below can't be skewed by a time suffix.
          dueDate: i.due_date ? String(i.due_date).slice(0, 10) : null,
          invoiceDate: i.invoice_date ?? i.created_at ?? null,
          orderId: i.order_id ?? null,
          orderNumber: o?.order_number ?? null,
          clientName: o?.client_name ?? null,
          clientEmail: o?.client_email ?? null,
          clientPhone: o?.client_phone ?? null,
          eventDate: o?.event_date ?? null,
        };
      });
      setRows(built);
    } catch (e: any) {
      captureException(e, { tags: { route: "/admin/outstanding-balances", step: "load", companyId } });
      setLoadError(e?.message || "The outstanding balances query failed.");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  // Realtime: a payment landing flips balance_due, so refresh live when
  // invoices change for this company. Needs invoices in the
  // supabase_realtime publication (migration 20260621130000); harmless if
  // not - the list still loads + a manual refresh works.
  useEffect(() => {
    if (!companyId) return;
    const channel = (supabase as any)
      .channel(`outstanding-balances:${companyId}:${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices", filter: `company_id=eq.${companyId}` }, () => load())
      .subscribe();
    return () => { (supabase as any).removeChannel(channel); };
  }, [companyId, load]);

  // Tenant-timezone "today" (falls back to browser local until the
  // companies.timezone read resolves).
  const todayIso = useMemo(() => toZonedISO(new Date(), tenantTimezone), [tenantTimezone]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const hay = `${r.clientName || ""} ${r.orderNumber || ""} ${r.invoiceNumber || ""} ${r.clientEmail || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (dueFrom && (!r.dueDate || r.dueDate < dueFrom)) return false;
      if (dueTo && (!r.dueDate || r.dueDate > dueTo)) return false;
      if (overdueOnly && !(r.dueDate && r.dueDate < todayIso)) return false;
      return true;
    });
  }, [rows, search, dueFrom, dueTo, overdueOnly, todayIso]);

  const summary = useMemo(() => {
    // Sum in integer cents; convert back to rands only for display.
    const totalOwed = filtered.reduce((s, r) => s + toCents(r.balance), 0) / 100;
    const overdue = filtered.filter((r) => r.dueDate && r.dueDate < todayIso);
    const overdueOwed = overdue.reduce((s, r) => s + toCents(r.balance), 0) / 100;
    return { count: filtered.length, totalOwed, overdueCount: overdue.length, overdueOwed };
  }, [filtered, todayIso]);

  const clearFilters = () => { setSearch(""); setDueFrom(""); setDueTo(""); setOverdueOnly(false); };
  const hasFilters = !!(search || dueFrom || dueTo || overdueOnly);

  const exportCsv = () => {
    if (filtered.length === 0) return;
    const headers = ["Client", "Email", "Phone", "Order", "Invoice", "Event date", "Due date", "Total", "Paid", "Balance", "Status"];
    const esc = (v: any) => {
      if (v == null) return "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const lines = [headers.join(",")];
    for (const r of filtered) {
      lines.push([
        esc(r.clientName), esc(r.clientEmail), esc(r.clientPhone), esc(r.orderNumber),
        esc(r.invoiceNumber), esc(r.eventDate), esc(r.dueDate),
        esc(r.total.toFixed(2)), esc(r.paid.toFixed(2)), esc(r.balance.toFixed(2)), esc(r.status),
      ].join(","));
    }
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `outstanding_balances_${toLocalISO(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Head>
        <title>Outstanding balances - CateringMS</title>
        <NoIndexMeta />
      </Head>
      <AdminNav />
      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            variant="hero"
            title="Outstanding balances"
            icon={Wallet}
            subtitle="Every invoice a client still owes money on, with paid plus balance always equal to the invoice total."
            meta={
              !loading && !loadError ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {fmt(summary.totalOwed)} owed
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    {summary.count} invoice{summary.count === 1 ? "" : "s"} in view
                  </span>
                  {summary.overdueCount > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                      {summary.overdueCount} overdue
                    </span>
                  )}
                </>
              ) : undefined
            }
            actions={
              <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0} className="gap-2">
                <Download className="w-4 h-4" />
                Export CSV
              </Button>
            }
          />
          <PageWorkbench />

          {/* Fatal load failure: without this the empty state below would
              claim every invoice is paid. */}
          {loadError && !loading && (
            <Card className="mb-4 border-rose-200">
              <CardContent className="py-4 px-5 flex flex-wrap items-center gap-3">
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                <div className="flex-1 min-w-[200px]">
                  <p className="text-sm font-semibold text-rose-900">Couldn't load outstanding balances</p>
                  <p className="text-xs text-slate-600 mt-0.5">{loadError}</p>
                </div>
                <Button size="sm" variant="outline" onClick={load} className="gap-1.5">
                  <RefreshCw className="w-4 h-4" /> Retry
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Soft failure: balances are right, order context is missing. */}
          {contextWarning && !loading && !loadError && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 flex items-center gap-2 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              Client and event details could not be loaded for some rows. The amounts are correct; refresh to retry the lookup.
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <Card>
              <CardContent className="py-4 px-5">
                <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Total outstanding</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{fmt(summary.totalOwed)}</p>
                <p className="text-xs text-slate-500 mt-0.5">{summary.count} invoice{summary.count === 1 ? "" : "s"}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 px-5">
                <p className="text-[11px] uppercase tracking-wide text-rose-600 font-semibold">Overdue</p>
                <p className="text-2xl font-bold text-rose-700 tabular-nums">{fmt(summary.overdueOwed)}</p>
                <p className="text-xs text-slate-500 mt-0.5">{summary.overdueCount} past due date</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-4 px-5">
                <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Clients owing</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                  {new Set(filtered.map((r) => r.clientName || r.invoiceId)).size}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">distinct clients in view</p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="mb-4">
            <CardContent className="py-3 px-4 flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <label className="text-[11px] text-slate-500 font-medium">Search</label>
                <div className="relative mt-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Client, order, invoice or email" className="pl-8" />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-slate-500 font-medium">Due from</label>
                <Input type="date" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="text-[11px] text-slate-500 font-medium">Due to</label>
                <Input type="date" value={dueTo} onChange={(e) => setDueTo(e.target.value)} className="mt-1" />
              </div>
              <Button
                variant={overdueOnly ? "default" : "outline"}
                onClick={() => setOverdueOnly((v) => !v)}
                className={`gap-1.5 ${overdueOnly ? "bg-rose-600 hover:bg-rose-700" : ""}`}
              >
                <AlertTriangle className="w-4 h-4" />
                Overdue only
              </Button>
              {hasFilters && (
                <Button variant="ghost" onClick={clearFilters} className="gap-1.5 text-slate-500">
                  <X className="w-4 h-4" /> Clear
                </Button>
              )}
            </CardContent>
          </Card>

          {/* List */}
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-16 text-slate-500">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading outstanding balances...
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <Wallet className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  {/* When the load failed we can't claim everything is
                      paid - the recovery card above owns that state. */}
                  <p className="font-medium text-slate-700 dark:text-slate-300">
                    {loadError ? "Balances unavailable" : rows.length === 0 ? "No outstanding balances" : "Nothing matches your filters"}
                  </p>
                  <p className="text-sm mt-1">
                    {loadError ? "Use Retry above to reload the list." : rows.length === 0 ? "Every invoice is fully paid - nice." : "Adjust the search or date range."}
                  </p>
                  {hasFilters && !loadError && rows.length > 0 && (
                    <Button variant="ghost" onClick={clearFilters} className="mt-2 gap-1.5 text-slate-500">
                      <X className="w-4 h-4" /> Clear filters
                    </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200 dark:border-slate-800">
                        <th className="py-2.5 px-4 font-semibold">Client</th>
                        <th className="py-2.5 px-3 font-semibold">Order / Invoice</th>
                        <th className="py-2.5 px-3 font-semibold">Event</th>
                        <th className="py-2.5 px-3 font-semibold">Due</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Total</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Paid</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Balance</th>
                        <th className="py-2.5 px-3 font-semibold"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r) => {
                        const overdue = !!(r.dueDate && r.dueDate < todayIso);
                        // Ledger invariant, checked in integer cents. A
                        // mismatch means the invoice row itself is bad
                        // (paid + balance != total) - flag it rather than
                        // presenting broken arithmetic as fact.
                        const mismatch = toCents(r.paid) + toCents(r.balance) !== toCents(r.total);
                        return (
                          <tr key={r.invoiceId} className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-900/40">
                            <td className="py-2.5 px-4">
                              <div className="flex items-center gap-2">
                                <UserIcon className="w-4 h-4 text-slate-400 shrink-0" />
                                <div className="min-w-0">
                                  <p className="font-medium text-slate-900 dark:text-white truncate">{r.clientName || "Client"}</p>
                                  {r.clientEmail && <p className="text-[11px] text-slate-500 truncate">{r.clientEmail}</p>}
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              {r.orderId ? (
                                <Link href={withSlug(staffOrderHref(r.orderId, "admin"))} className="text-blue-600 hover:underline inline-flex items-center gap-1">
                                  {r.orderNumber || "Order"} <ExternalLink className="w-3 h-3" />
                                </Link>
                              ) : <span className="text-slate-400">-</span>}
                              <p className="text-[11px] text-slate-500">{r.invoiceNumber || ""}</p>
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{formatLocalDate(r.eventDate, "-")}</td>
                            <td className="py-2.5 px-3">
                              <span className={overdue ? "text-rose-600 font-semibold" : "text-slate-600 dark:text-slate-300"}>
                                {formatLocalDate(r.dueDate, "-")}
                              </span>
                              {overdue && <Badge className="ml-1.5 bg-rose-100 text-rose-700 border border-rose-200 text-[10px]">overdue</Badge>}
                            </td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-slate-700 dark:text-slate-300">{fmt(r.total)}</td>
                            <td className="py-2.5 px-3 text-right tabular-nums text-brand-primary">{fmt(r.paid)}</td>
                            <td className="py-2.5 px-3 text-right tabular-nums font-bold text-slate-900 dark:text-white">
                              {fmt(r.balance)}
                              {mismatch && (
                                <Badge
                                  className="ml-1.5 bg-amber-100 text-amber-800 border border-amber-300 text-[10px] align-middle"
                                  title={`Paid ${fmt(r.paid)} + balance ${fmt(r.balance)} does not equal total ${fmt(r.total)}. Open the invoice and check its payment ledger.`}
                                >
                                  check totals
                                </Badge>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {r.publicToken && (
                                <Link href={`/pay/i/${r.publicToken}`} target="_blank" className="text-blue-600 hover:underline text-xs inline-flex items-center gap-1">
                                  Pay link <ExternalLink className="w-3 h-3" />
                                </Link>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </PortalShell>
      </div>
    </>
  );
}
