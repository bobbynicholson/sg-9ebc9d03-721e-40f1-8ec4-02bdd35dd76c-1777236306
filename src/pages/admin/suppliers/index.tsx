/**
 * Suppliers hub - list of every supplier on file with rolling spend
 * totals (30d / 90d / 365d), product counts, and a one-click compose
 * email action that uses the same Gmail / Outlook / default-mail
 * fallback chain as /admin/clients.
 *
 * SUP-B (suppliers audit, 2026-05-24):
 *   - Rand values hidden from SALES_ADMIN / REGION_ADMIN (finance-vis).
 *   - Realtime channel on suppliers (auto-refresh on insert/update).
 *   - Search + activeOnly persist to URL query string.
 *   - Mobile card fallback under sm.
 *   - Reliance + stale chips so the operator sees who matters at a
 *     glance + who's gone cold.
 *   - WhatsApp click-to-chat link next to phone.
 *   - Delete confirm shows referencing-row counts before soft-delete.
 *   - payment_terms admin form coerces to numeric (column is int).
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Building2, Search, Plus, Pencil, Trash2, Mail, Phone, TrendingUp, Package,
  Calendar, Loader2, Filter, ArrowRight, MessageCircle, Star, AlertTriangle,
} from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types/app";
import { useToast } from "@/hooks/use-toast";
import { supplierService, type SupplierWithStats } from "@/services/supplierService";
import { useTenantHref } from "@/lib/tenantUrl";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";

const fmtR = (v: number | null | undefined) =>
  v == null ? "-" : `R ${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const relativeTime = (iso: string | null) => {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days}d ago`;
  const hours = Math.floor(ms / 3_600_000);
  return hours >= 1 ? `${hours}h ago` : "just now";
};

// SUP-B: international format the phone for wa.me. Strips spaces /
// dashes / parens and converts a leading 0 to ZA's +27 (most common
// case for this tenant base). Leaves +XX prefixes alone.
const waLink = (phone: string | null | undefined): string | null => {
  if (!phone) return null;
  const cleaned = String(phone).replace(/[\s()-]/g, "");
  if (!cleaned) return null;
  if (cleaned.startsWith("+")) return `https://wa.me/${cleaned.slice(1)}`;
  if (cleaned.startsWith("0")) return `https://wa.me/27${cleaned.slice(1)}`;
  return `https://wa.me/${cleaned}`;
};

function SuppliersList() {
  const { profile } = useAuth() as { profile: { company_id: string; role?: string; active_role?: string } | null };
  const companyId = profile?.company_id;
  const { toast } = useToast();
  const { withSlug } = useTenantHref();
  const router = useRouter();

  // SUP-B: finance-vis gate. Sales / region admin can see contact info
  // + product count but not rand spend.
  const financeRole = String(profile?.active_role || profile?.role || "").toLowerCase();
  const canSeeFinance =
    financeRole === "owner" || financeRole === "company_admin" ||
    financeRole === "admin" || financeRole === "super_admin";

  const [suppliers, setSuppliers] = useState<SupplierWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [editing, setEditing] = useState<SupplierWithStats | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<SupplierWithStats | null>(null);
  const [deleteRefCounts, setDeleteRefCounts] = useState<{
    equipment_owned: number; equipment_preferred_hire: number; open_hire_orders: number;
    open_payables: number; linked_items: number; preferred_items: number;
  } | null>(null);

  // SUP-B: hydrate filters from URL on mount.
  useEffect(() => {
    if (!router.isReady) return;
    const q = typeof router.query.q === "string" ? router.query.q : "";
    const activeParam = typeof router.query.active === "string" ? router.query.active : null;
    setSearch(q);
    if (activeParam === "all") setActiveOnly(false);
    else if (activeParam === "1") setActiveOnly(true);
  }, [router.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // SUP-B: push state back to URL (shallow, no scroll) so refresh/back
  // restores the same view.
  useEffect(() => {
    if (!router.isReady) return;
    const next: Record<string, string> = { ...router.query as Record<string, string> };
    if (search) next.q = search; else delete next.q;
    next.active = activeOnly ? "1" : "all";
    router.replace({ pathname: router.pathname, query: next }, undefined, { shallow: true, scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, activeOnly]);

  const reload = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const data = await supplierService.listForCompany(companyId);
      setSuppliers(data);
    } catch (e: unknown) {
      captureException(e, { tags: { surface: "admin/suppliers", area: "load", tenant: companyId } });
      toast({
        title: "Could not load suppliers",
        description: e instanceof Error ? e.message : "",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  // SUP-B: realtime. Add a supplier on phone, see it on desktop.
  // Debounced 1500ms so a flurry of inserts (CSV import later) doesn't
  // hammer the page.
  useEffect(() => {
    if (!companyId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { reload(); }, 1500);
    };
    const channel = supabase
      .channel(`admin-suppliers:${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "suppliers", filter: `company_id=eq.${companyId}` }, bump)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // SUP-B: when the delete dialog opens, fetch reference counts so the
  // operator sees what's about to lose its FK link.
  useEffect(() => {
    if (!confirmDelete) { setDeleteRefCounts(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const counts = await supplierService.countReferences(confirmDelete.id);
        if (!cancelled) setDeleteRefCounts(counts);
      } catch (e: unknown) {
        captureException(e, { tags: { surface: "admin/suppliers", area: "count-refs" } });
      }
    })();
    return () => { cancelled = true; };
  }, [confirmDelete]);

  const visible = useMemo(() => {
    const q = search.toLowerCase();
    return suppliers.filter((s) => {
      if (activeOnly && s.is_active === false) return false;
      if (!q) return true;
      const hay = [
        s.supplier_name, s.email || "", s.phone || "", s.contact_person || "",
        ...(s.supplier_categories || []),
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [suppliers, search, activeOnly]);

  const totals = useMemo(() => {
    const total30 = suppliers.reduce((s, x) => s + Number(x.spend_30d || 0), 0);
    const total90 = suppliers.reduce((s, x) => s + Number(x.spend_90d || 0), 0);
    const total365 = suppliers.reduce((s, x) => s + Number(x.spend_365d || 0), 0);
    const active = suppliers.filter((s) => s.is_active !== false).length;
    const stale = suppliers.filter((s) => {
      if (s.is_active === false) return false;
      if (!s.last_purchase_at) return s.product_count > 0;
      return (Date.now() - new Date(s.last_purchase_at).getTime()) / 86_400_000 > 90;
    }).length;
    return { total30, total90, total365, active, all: suppliers.length, stale };
  }, [suppliers]);

  // SUP-B: row-level chips. Reliance = number of inventory items
  // preferring this supplier (cached via product_count); Stale = no
  // purchase in 90d but still active.
  const rowFlags = (s: SupplierWithStats) => {
    const days = s.last_purchase_at
      ? Math.floor((Date.now() - new Date(s.last_purchase_at).getTime()) / 86_400_000)
      : null;
    const stale = s.is_active !== false && (days == null ? s.product_count > 0 : days > 90);
    const reliance = s.product_count;
    return { stale, reliance, daysSinceBuy: days };
  };

  return (
    <>
      <NoIndexMeta />
      <Head><title>Suppliers - CateringMS Admin</title></Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80">
        <div className="px-3 sm:px-4 md:px-6 pt-20 lg:pt-6 pb-6 max-w-screen-2xl">

          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg flex-shrink-0">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                  Suppliers
                </h1>
                <p className="text-sm sm:text-base text-slate-600 mt-1">
                  Every supplier you buy from, what they sell you, and what you've spent.
                </p>
              </div>
            </div>
            <Button
              onClick={() => setAdding(true)}
              className="bg-gradient-to-r from-amber-600 to-orange-600 text-white"
            >
              <Plus className="w-4 h-4 mr-1.5" /> Add supplier
            </Button>
          </div>

          {/* Top stat tiles. Rand tiles are gated behind finance-vis. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <StatTile label="Active suppliers" value={`${totals.active} / ${totals.all}`} icon={Building2} />
            <StatTile
              label="Stale (no buy in 90d)"
              value={`${totals.stale}`}
              icon={AlertTriangle}
              accent={totals.stale > 0 ? "rose" : "slate"}
            />
            {canSeeFinance ? (
              <>
                <StatTile label="Spend last 90d" value={fmtR(totals.total90)} icon={TrendingUp} accent="emerald" />
                <StatTile label="Spend last 365d" value={fmtR(totals.total365)} icon={Calendar} />
              </>
            ) : (
              <>
                <StatTile label="Last 90d" value="hidden" icon={TrendingUp} muted />
                <StatTile label="Last 365d" value="hidden" icon={Calendar} muted />
              </>
            )}
          </div>

          {/* Filters */}
          <Card className="border-0 shadow-sm mb-4">
            <CardContent className="py-3 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[260px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search by name, email, contact, category..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <label className="text-sm flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={activeOnly}
                  onChange={(e) => setActiveOnly(e.target.checked)}
                />
                Active only
              </label>
              <span className="text-xs text-slate-500 ml-auto flex items-center gap-1">
                <Filter className="w-3 h-3" />
                {visible.length} of {suppliers.length}
              </span>
            </CardContent>
          </Card>

          {/* Suppliers table (desktop) + card list (mobile) */}
          <Card className="border-0 shadow-lg">
            <CardContent className="p-0">
              {loading ? (
                <div className="py-16 text-center text-slate-500">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  Loading suppliers...
                </div>
              ) : visible.length === 0 ? (
                <EmptyState
                  inCard
                  icon={Building2}
                  title={suppliers.length === 0 ? "No suppliers yet" : "No suppliers match this view"}
                  description={
                    suppliers.length === 0
                      ? "Add your first supplier to start tracking purchases and spend."
                      : "Try clearing the search or filter."
                  }
                  cta={
                    suppliers.length === 0
                      ? { label: "Add supplier", onClick: () => setAdding(true) }
                      : undefined
                  }
                />
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200 bg-slate-50">
                        <tr>
                          <th className="text-left py-3 pl-4 pr-2">Supplier</th>
                          <th className="text-left py-3 px-2">Contact</th>
                          <th className="text-right py-3 px-2">Products</th>
                          {canSeeFinance && <th className="text-right py-3 px-2">90d spend</th>}
                          {canSeeFinance && <th className="text-right py-3 px-2">365d spend</th>}
                          <th className="text-left py-3 px-2">Last buy</th>
                          <th className="text-right py-3 pr-4">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((s) => {
                          const flags = rowFlags(s);
                          const wa = waLink(s.phone);
                          return (
                            <tr key={s.id} className={`border-b border-slate-100 hover:bg-slate-50 ${s.is_active === false ? "opacity-60" : ""}`}>
                              <td className="py-3 pl-4 pr-2">
                                <Link href={withSlug(`/admin/suppliers/${s.id}`)} className="block group">
                                  <div className="font-semibold text-slate-900 group-hover:text-amber-600 inline-flex items-center gap-1.5 flex-wrap">
                                    {s.supplier_name}
                                    <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    {flags.reliance >= 3 && (
                                      <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 inline-flex items-center gap-1">
                                        <Star className="w-2.5 h-2.5" /> {flags.reliance} items
                                      </Badge>
                                    )}
                                    {flags.stale && (
                                      <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 border-rose-200">
                                        Stale{flags.daysSinceBuy != null ? ` ${flags.daysSinceBuy}d` : ""}
                                      </Badge>
                                    )}
                                  </div>
                                  {(s.supplier_categories || []).length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {(s.supplier_categories || []).slice(0, 3).map((c) => (
                                        <Badge key={c} variant="outline" className="text-[10px] bg-slate-50 text-slate-600 border-slate-200">
                                          {c}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}
                                  {s.is_active === false && (
                                    <Badge variant="outline" className="mt-1 text-[10px] bg-rose-50 text-rose-700 border-rose-200">Inactive</Badge>
                                  )}
                                </Link>
                              </td>
                              <td className="py-3 px-2 text-xs text-slate-600">
                                {s.contact_person && <div className="text-slate-900">{s.contact_person}</div>}
                                {s.email && (
                                  <div className="flex items-center gap-1">
                                    <Mail className="w-3 h-3" /> {s.email}
                                  </div>
                                )}
                                {s.phone && (
                                  <div className="flex items-center gap-2">
                                    <span className="flex items-center gap-1">
                                      <Phone className="w-3 h-3" /> {s.phone}
                                    </span>
                                    {wa && (
                                      <a
                                        href={wa}
                                        target="_blank"
                                        rel="noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="inline-flex items-center text-emerald-600 hover:text-emerald-700"
                                        title="Open WhatsApp"
                                      >
                                        <MessageCircle className="w-3.5 h-3.5" />
                                      </a>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-2 text-right tabular-nums">
                                {s.product_count > 0 ? (
                                  <span className="inline-flex items-center gap-1 text-slate-700">
                                    <Package className="w-3 h-3 text-slate-400" />
                                    {s.product_count}
                                  </span>
                                ) : <span className="text-slate-400">-</span>}
                              </td>
                              {canSeeFinance && (
                                <td className="py-3 px-2 text-right tabular-nums">{s.spend_90d > 0 ? fmtR(s.spend_90d) : "-"}</td>
                              )}
                              {canSeeFinance && (
                                <td className="py-3 px-2 text-right tabular-nums font-semibold">{s.spend_365d > 0 ? fmtR(s.spend_365d) : "-"}</td>
                              )}
                              <td className="py-3 px-2 text-xs text-slate-500">{relativeTime(s.last_purchase_at)}</td>
                              <td className="py-3 pr-4 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={() => setEditing(s)}
                                    aria-label={`Edit ${s.supplier_name}`}
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-rose-600 hover:bg-rose-50"
                                    onClick={() => setConfirmDelete(s)}
                                    aria-label={`Delete ${s.supplier_name}`}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* SUP-B: Mobile card fallback. */}
                  <div className="sm:hidden divide-y divide-slate-100">
                    {visible.map((s) => {
                      const flags = rowFlags(s);
                      const wa = waLink(s.phone);
                      return (
                        <div key={s.id} className={`p-4 ${s.is_active === false ? "opacity-60" : ""}`}>
                          <div className="flex items-start justify-between gap-2">
                            <Link href={withSlug(`/admin/suppliers/${s.id}`)} className="flex-1 min-w-0">
                              <div className="font-semibold text-slate-900 flex flex-wrap items-center gap-1.5">
                                {s.supplier_name}
                                {flags.reliance >= 3 && (
                                  <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 inline-flex items-center gap-1">
                                    <Star className="w-2.5 h-2.5" /> {flags.reliance}
                                  </Badge>
                                )}
                                {flags.stale && (
                                  <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 border-rose-200">
                                    Stale
                                  </Badge>
                                )}
                                {s.is_active === false && (
                                  <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 border-rose-200">Inactive</Badge>
                                )}
                              </div>
                              {s.contact_person && <div className="text-xs text-slate-900 mt-0.5">{s.contact_person}</div>}
                              <div className="text-xs text-slate-600 mt-1 space-y-0.5">
                                {s.email && <div className="flex items-center gap-1"><Mail className="w-3 h-3" /> {s.email}</div>}
                                {s.phone && (
                                  <div className="flex items-center gap-2">
                                    <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {s.phone}</span>
                                    {wa && (
                                      <a href={wa} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-emerald-600">
                                        <MessageCircle className="w-3.5 h-3.5" />
                                      </a>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 mt-2">
                                <span>{s.product_count} item{s.product_count === 1 ? "" : "s"}</span>
                                {canSeeFinance && s.spend_365d > 0 && (
                                  <>
                                    <span>·</span>
                                    <span className="font-medium text-slate-700">{fmtR(s.spend_365d)} / 365d</span>
                                  </>
                                )}
                                <span>·</span>
                                <span>last buy {relativeTime(s.last_purchase_at)}</span>
                              </div>
                            </Link>
                            <div className="flex items-center gap-1">
                              <Button variant="outline" size="sm" className="h-9 w-9 p-0" onClick={() => setEditing(s)} aria-label="Edit">
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button variant="outline" size="sm" className="h-9 w-9 p-0 text-rose-600" onClick={() => setConfirmDelete(s)} aria-label="Delete">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <SupplierFormDialog
        open={adding || !!editing}
        editing={editing}
        companyId={companyId!}
        onClose={() => { setAdding(false); setEditing(null); }}
        onSaved={() => { setAdding(false); setEditing(null); reload(); }}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this supplier?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  <strong>{confirmDelete?.supplier_name}</strong> will be hidden. Receipts and
                  stock-in transactions stay on file for accounting.
                </p>
                {deleteRefCounts && (
                  deleteRefCounts.equipment_owned > 0 ||
                  deleteRefCounts.equipment_preferred_hire > 0 ||
                  deleteRefCounts.open_hire_orders > 0 ||
                  deleteRefCounts.open_payables > 0 ||
                  deleteRefCounts.linked_items > 0
                ) ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs space-y-1">
                    <div className="font-semibold text-amber-900">Currently linked to:</div>
                    {deleteRefCounts.equipment_owned > 0 && (
                      <div>· {deleteRefCounts.equipment_owned} equipment item{deleteRefCounts.equipment_owned === 1 ? "" : "s"} (supplier of record)</div>
                    )}
                    {deleteRefCounts.equipment_preferred_hire > 0 && (
                      <div>· {deleteRefCounts.equipment_preferred_hire} equipment item{deleteRefCounts.equipment_preferred_hire === 1 ? "" : "s"} (preferred for hire)</div>
                    )}
                    {deleteRefCounts.open_hire_orders > 0 && (
                      <div className="text-amber-900 font-medium">· {deleteRefCounts.open_hire_orders} open hire order{deleteRefCounts.open_hire_orders === 1 ? "" : "s"}</div>
                    )}
                    {deleteRefCounts.open_payables > 0 && (
                      <div className="text-amber-900 font-medium">· {deleteRefCounts.open_payables} pending payable{deleteRefCounts.open_payables === 1 ? "" : "s"}</div>
                    )}
                    {deleteRefCounts.linked_items > 0 && (
                      <div>· {deleteRefCounts.linked_items} inventory item link{deleteRefCounts.linked_items === 1 ? "" : "s"} ({deleteRefCounts.preferred_items} preferred)</div>
                    )}
                    <div className="text-amber-700 pt-1">
                      Existing links keep their data but the supplier won't appear in pickers. Re-link to another supplier first if you don't want the gap.
                    </div>
                  </div>
                ) : deleteRefCounts ? (
                  <p className="text-xs text-slate-500">No equipment, hire orders, payables, or inventory items currently reference this supplier.</p>
                ) : (
                  <p className="text-xs text-slate-400">Checking references...</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={async () => {
                const s = confirmDelete;
                if (!s) return;
                try {
                  await supplierService.softDelete(s.id);
                  toast({ title: "Supplier deleted" });
                  setConfirmDelete(null);
                  reload();
                } catch (e: unknown) {
                  captureException(e, { tags: { surface: "admin/suppliers", area: "delete" } });
                  toast({ title: "Couldn't delete", description: e instanceof Error ? e.message : "", variant: "destructive" });
                }
              }}
            >
              Delete anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function StatTile({
  label, value, icon: Icon, accent = "slate", muted = false,
}: { label: string; value: string; icon: typeof TrendingUp; accent?: "slate" | "emerald" | "rose"; muted?: boolean }) {
  const accentClass = muted
    ? "text-slate-400"
    : accent === "emerald" ? "text-emerald-600"
    : accent === "rose"    ? "text-rose-600"
    : "text-slate-700";
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="py-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
          <Icon className={`w-4 h-4 ${accentClass}`} />
        </div>
        <p className={`text-xl font-bold ${accentClass}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function SupplierFormDialog({
  open, editing, companyId, onClose, onSaved,
}: {
  open: boolean;
  editing: SupplierWithStats | null;
  companyId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    supplier_name: "", email: "", phone: "", contact_person: "",
    payment_terms: "", payment_method: "eft",
    preferred_contact_method: "email",
    website: "",
    address_line1: "", address_line2: "", city: "", postal_code: "",
    notes: "",
    supplier_categories_text: "",
  });

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        supplier_name: editing.supplier_name || "",
        email: editing.email || "",
        phone: editing.phone || "",
        contact_person: editing.contact_person || "",
        payment_terms: editing.payment_terms != null ? String(editing.payment_terms) : "",
        payment_method: (editing.payment_method as string) || "eft",
        preferred_contact_method: (editing.preferred_contact_method as string) || "email",
        website: (editing.website as string) || "",
        address_line1: editing.address_line1 || "",
        address_line2: editing.address_line2 || "",
        city: editing.city || "",
        postal_code: editing.postal_code || "",
        notes: editing.notes || "",
        supplier_categories_text: ((editing.supplier_categories as string[]) || []).join(", "),
      });
    } else {
      setForm({
        supplier_name: "", email: "", phone: "", contact_person: "",
        payment_terms: "", payment_method: "eft",
        preferred_contact_method: "email", website: "",
        address_line1: "", address_line2: "", city: "", postal_code: "",
        notes: "", supplier_categories_text: "",
      });
    }
  }, [open, editing]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.supplier_name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const categories = form.supplier_categories_text
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      // SUP-B: payment_terms column is int (days). Coerce; ignore text
      // like "COD" / "Net-30 EOM" - those belong in Notes until the
      // deferred schema split adds a payment_terms_note field.
      const parsedTerms = (() => {
        const raw = form.payment_terms.trim();
        if (!raw) return null;
        const n = parseInt(raw, 10);
        return Number.isFinite(n) && n >= 0 ? n : null;
      })();
      const payload = {
        supplier_name: form.supplier_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        contact_person: form.contact_person.trim() || null,
        payment_terms: parsedTerms,
        payment_method: form.payment_method || null,
        preferred_contact_method: form.preferred_contact_method,
        website: form.website.trim() || null,
        address_line1: form.address_line1.trim() || null,
        address_line2: form.address_line2.trim() || null,
        city: form.city.trim() || null,
        postal_code: form.postal_code.trim() || null,
        notes: form.notes.trim() || null,
        supplier_categories: categories,
      };
      if (editing) {
        await supplierService.update(editing.id, payload as Partial<typeof editing>);
      } else {
        await supplierService.create({ companyId, ...payload });
      }
      toast({ title: editing ? "Supplier updated" : "Supplier added" });
      onSaved();
    } catch (e: unknown) {
      captureException(e, { tags: { surface: "admin/suppliers", area: "save" } });
      toast({ title: "Couldn't save", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit supplier" : "Add supplier"}</DialogTitle>
          <DialogDescription>
            Capture the contact, payment + delivery info. Categories help group suppliers
            on the list (e.g. Meat, Dry goods, Equipment).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Supplier name</label>
            <Input value={form.supplier_name} onChange={(e) => set("supplier_name", e.target.value)} className="mt-1" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Contact person</label>
              <Input value={form.contact_person} onChange={(e) => set("contact_person", e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Email</label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Phone</label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Website</label>
              <Input value={form.website} onChange={(e) => set("website", e.target.value)} className="mt-1" placeholder="https://" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Preferred contact method</label>
              <select
                value={form.preferred_contact_method}
                onChange={(e) => set("preferred_contact_method", e.target.value)}
                className="mt-1 w-full text-sm rounded-md border border-slate-200 px-3 py-2 bg-white"
              >
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="in_person">In person</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Payment method</label>
              <select
                value={form.payment_method}
                onChange={(e) => set("payment_method", e.target.value)}
                className="mt-1 w-full text-sm rounded-md border border-slate-200 px-3 py-2 bg-white"
              >
                <option value="eft">EFT</option>
                <option value="card">Card</option>
                <option value="cash">Cash</option>
                <option value="account">On account</option>
                <option value="mixed">Mixed</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Payment terms (days)</label>
              <Input
                type="number"
                min={0}
                value={form.payment_terms}
                onChange={(e) => set("payment_terms", e.target.value)}
                className="mt-1"
                placeholder="e.g. 30"
              />
              <p className="text-[10px] text-slate-500 mt-0.5">
                Number of days. Use Notes for COD / Net-30 EOM / other wording.
              </p>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Categories (comma-separated)</label>
              <Input value={form.supplier_categories_text} onChange={(e) => set("supplier_categories_text", e.target.value)} className="mt-1" placeholder="e.g. Meat, Dry goods" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input value={form.address_line1} onChange={(e) => set("address_line1", e.target.value)} placeholder="Address line 1" />
            <Input value={form.address_line2} onChange={(e) => set("address_line2", e.target.value)} placeholder="Address line 2" />
            <Input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="City" />
            <Input value={form.postal_code} onChange={(e) => set("postal_code", e.target.value)} placeholder="Postal code" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Notes</label>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} className="mt-1" placeholder="Account number, delivery rhythm, anything worth remembering..." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-gradient-to-r from-amber-600 to-orange-600 text-white">
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            {editing ? "Save changes" : "Add supplier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SuppliersPage() {
  return (
    // SUP-A (suppliers audit, SUP-2): admit sales_admin (supplier
    // contact for client advisories) + region_admin (regional view).
    // SUP-B: rand columns gated inside the page via canSeeFinance.
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SALES_ADMIN, UserRole.REGION_ADMIN]}>
      <SuppliersList />
    </ProtectedRoute>
  );
}
