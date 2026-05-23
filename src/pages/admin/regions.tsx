/* eslint-disable @typescript-eslint/no-explicit-any */
import { UserRole } from "@/types/app";
import { useState, useEffect, useMemo } from "react";
import Head from "next/head";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toLocalISO } from "@/lib/localDate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  MapPin, Plus, Edit, Trash2, Globe, CheckCircle, XCircle, ArrowLeft,
  AlertCircle, Loader2, Truck, ChefHat, Users, Clock, Download, RefreshCw,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import Link from "next/link";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { AddressAutocomplete } from "@/components/admin/AddressAutocomplete";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { COUNTRIES, getCountry, type CountryCode } from "@/lib/regionGeography";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useTenantHref } from "@/lib/tenantUrl";

interface Region {
  id: string;
  company_id: string;
  name: string;
  code: string;
  country: CountryCode;
  province_state: string | null;
  city: string | null;
  address: string | null;
  postal_code: string | null;
  lat: number | null;
  lng: number | null;
  manager_user_id: string | null;
  phone: string | null;
  email: string | null;
  timezone: string;
  currency: string;
  operating_hours_start: string | null;
  operating_hours_end: string | null;
  delivery_radius_km: number | null;
  auto_assign_orders: boolean;
  is_active: boolean;
  notes: string | null;
  manager?: { id: string; full_name: string; email: string } | null;
  staff_count?: number;
  order_count?: number;
  mtd_order_count?: number;
  mtd_revenue?: number;
  open_quote_count?: number;
}

interface RegionFormState {
  name: string;
  code: string;
  country: CountryCode;
  province_state: string;
  city: string;
  address: string;
  postal_code: string;
  lat: number | null;
  lng: number | null;
  manager_user_id: string;
  phone: string;
  email: string;
  timezone: string;
  currency: string;
  operating_hours_start: string;
  operating_hours_end: string;
  delivery_radius_km: number;
  auto_assign_orders: boolean;
  is_active: boolean;
  notes: string;
  // Per-branch overrides. Empty string = inherit company default.
  // The form keeps these as strings to make "blank means inherit"
  // unambiguous in the UI; conversion to numbers happens at save.
  vat_rate_override: string;
  deposit_percent_override: string;
  delivery_cost_per_km_override: string;
  min_delivery_fee_override: string;
  // Notification preferences for the branch manager.
  notify_manager_on_new_lead: boolean;
  notify_manager_on_new_order: boolean;
  notify_manager_on_prep_alert: boolean;
}

const emptyForm = (): RegionFormState => {
  const za = getCountry("ZA");
  return {
    name: "",
    code: "",
    country: "ZA",
    province_state: "",
    city: "",
    address: "",
    postal_code: "",
    lat: null,
    lng: null,
    manager_user_id: "",
    phone: "",
    email: "",
    timezone: za.defaultTimezone,
    currency: za.defaultCurrency,
    operating_hours_start: "06:00",
    operating_hours_end: "22:00",
    delivery_radius_km: 50,
    auto_assign_orders: true,
    is_active: true,
    notes: "",
    vat_rate_override: "",
    deposit_percent_override: "",
    delivery_cost_per_km_override: "",
    min_delivery_fee_override: "",
    notify_manager_on_new_lead: true,
    notify_manager_on_new_order: true,
    notify_manager_on_prep_alert: true,
  };
};

export default function ProtectedRegionsPage() {
  return (
    // REG-B (REG-3): admit region_admin (their region edit + KPI)
    // + sales_admin (read-only delivery_radius + operating_hours
    // for quote feasibility). RLS narrows region_admin to their
    // regions_covered rows.
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SALES_ADMIN, UserRole.REGION_ADMIN]}>
      <RegionsPage />
    </ProtectedRoute>
  );
}

function RegionsPage() {
  const { user } = useAuth();
  // Wave 27.3: tenant-slug wrapper for internal navigations.
  const { withSlug } = useTenantHref();
  const { toast } = useToast();
  const [regions, setRegions] = useState<Region[]>([]);
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<Array<{ id: string; full_name: string; email: string; active_role: string }>>([]);
  // Phase 12 #10: company default tz + currency for the divergence
  // chip on each region card. A region with a different tz / code
  // gets a small 'differs from HQ' warning so an accidental misconfig
  // doesn't silently break BCEA windows + cron boundaries.
  const [companyDefaults, setCompanyDefaults] = useState<{ timezone: string; currency: string }>({
    timezone: "Africa/Johannesburg",
    currency: "ZAR",
  });
  useEffect(() => {
    if (!user?.company_id) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("companies")
        .select("timezone, currency")
        .eq("id", user.company_id)
        .maybeSingle();
      if (cancelled) return;
      setCompanyDefaults({
        timezone: (data as any)?.timezone || "Africa/Johannesburg",
        currency: (data as any)?.currency || "ZAR",
      });
    })();
    return () => { cancelled = true; };
  }, [user?.company_id]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Region | null>(null);
  const [form, setForm] = useState<RegionFormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user?.company_id) {
      void loadRegions();
      void loadStaff();
    }
  }, [user?.company_id]);

  // REG-B (regions audit, REG-7): realtime channel on regions scoped
  // to company_id so two ops admins editing branches in parallel see
  // each other's work without a manual Refresh. Mirrors the pattern
  // shipped on /admin/orders, /admin/leads, /admin/quotes,
  // /admin/packages, /admin/route-planning, /admin/vehicles.
  useEffect(() => {
    const companyId = user?.company_id;
    if (!companyId) return;
    const channelKey = `admin-regions-realtime:${companyId}`;
    const channel = (supabase as any)
      .channel(channelKey)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "regions", filter: `company_id=eq.${companyId}` },
        () => { void loadRegions(); },
      )
      .subscribe();
    return () => {
      (supabase as any).removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id]);

  const loadRegions = async () => {
    if (!user?.company_id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("regions")
      .select(`
        *,
        manager:profiles!regions_manager_user_id_fkey ( id, full_name, email )
      `)
      .eq("company_id", user.company_id)
      .order("name", { ascending: true });

    if (error) {
      toast({ title: "Failed to load regions", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    // Month-to-date window for the per-branch KPI strip. Local-day
    // boundaries are fine here - a branch's KPI is "events booked
    // this calendar month from the operator's perspective".
    const now = new Date();
    const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const mtdStartIso = toLocalISO(mtdStart);

    // Enrich with staff/order counts (best-effort; failures shouldn't block UI)
    const enriched = await Promise.all(
      (data || []).map(async (r: any) => {
        const [
          { count: staffCount },
          { count: orderCount },
          { count: mtdOrderCount },
          mtdRevenueRes,
          { count: openQuoteCount },
        ] = await Promise.all([
          supabase.from("profiles").select("id", { count: "exact", head: true }).eq("region_id", r.id),
          supabase.from("orders").select("id", { count: "exact", head: true }).eq("region_id", r.id),
          // REG-B (regions audit, REG-2): exclude cancelled orders from
          // the MTD counts + revenue. The pre-REG-B tooltip even admitted
          // this was wrong ("Cancelled orders are excluded only if you've
          // removed them; this counts every booked order"). Now the
          // server-side filter does the work.
          (supabase as any)
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("region_id", r.id)
            .gte("event_date", mtdStartIso)
            .not("status", "in", "(cancelled,declined)"),
          (supabase as any)
            .from("orders")
            .select("total_amount")
            .eq("region_id", r.id)
            .gte("event_date", mtdStartIso)
            .not("status", "in", "(cancelled,declined)"),
          supabase
            .from("quotes")
            .select("id", { count: "exact", head: true })
            .eq("region_id", r.id)
            .in("status", ["draft", "sent", "revised"] as any[]),
        ]);
        const mtdRevenue = (mtdRevenueRes?.data || []).reduce(
          (sum: number, row: any) => sum + Number(row?.total_amount || 0),
          0,
        );
        return {
          ...r,
          staff_count: staffCount || 0,
          order_count: orderCount || 0,
          mtd_order_count: mtdOrderCount || 0,
          mtd_revenue: mtdRevenue,
          open_quote_count: openQuoteCount || 0,
        } as Region;
      }),
    );

    setRegions(enriched);
    setLoading(false);
  };

  const loadStaff = async () => {
    if (!user?.company_id) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email, active_role")
      .eq("company_id", user.company_id)
      .order("full_name");
    setStaff((data || []) as any);
  };

  const openCreateDialog = () => {
    setEditing(null);
    setForm(emptyForm());
    setCreateOpen(true);
  };

  const openEditDialog = (region: Region) => {
    setEditing(region);
    setForm({
      name: region.name || "",
      code: region.code || "",
      country: (region.country as CountryCode) || "ZA",
      province_state: region.province_state || "",
      city: region.city || "",
      address: region.address || "",
      postal_code: region.postal_code || "",
      lat: region.lat ?? null,
      lng: region.lng ?? null,
      manager_user_id: region.manager_user_id || "",
      phone: region.phone || "",
      email: region.email || "",
      timezone: region.timezone || "Africa/Johannesburg",
      currency: region.currency || "ZAR",
      operating_hours_start: region.operating_hours_start || "06:00",
      operating_hours_end: region.operating_hours_end || "22:00",
      delivery_radius_km: Number(region.delivery_radius_km ?? 50),
      auto_assign_orders: region.auto_assign_orders ?? true,
      is_active: region.is_active ?? true,
      notes: region.notes || "",
      vat_rate_override: (region as any).vat_rate != null ? String(Number((region as any).vat_rate) * 100) : "",
      deposit_percent_override: (region as any).deposit_percent != null ? String((region as any).deposit_percent) : "",
      delivery_cost_per_km_override: (region as any).delivery_cost_per_km != null ? String((region as any).delivery_cost_per_km) : "",
      min_delivery_fee_override: (region as any).min_delivery_fee != null ? String((region as any).min_delivery_fee) : "",
      notify_manager_on_new_lead: (region as any).notify_manager_on_new_lead !== false,
      notify_manager_on_new_order: (region as any).notify_manager_on_new_order !== false,
      notify_manager_on_prep_alert: (region as any).notify_manager_on_prep_alert !== false,
    });
    setCreateOpen(true);
  };

  const onCountryChange = (country: CountryCode) => {
    const c = getCountry(country);
    setForm((f) => ({
      ...f,
      country,
      timezone: c.defaultTimezone,
      currency: c.defaultCurrency,
      province_state: "",
    }));
  };

  const handleSave = async () => {
    if (!user?.company_id) return;
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (!form.code.trim()) {
      toast({ title: "Region code is required", description: "e.g. JHB, CPT", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    // Override fields: empty string = inherit (NULL), value = override.
    // VAT is entered as % in the UI (e.g. "15") but stored as a
    // decimal (0.15) to match companies.vat_rate.
    const parseOverride = (raw: string, asPercentToDecimal = false): number | null => {
      const trimmed = raw.trim();
      if (!trimmed) return null;
      const n = Number(trimmed);
      if (!Number.isFinite(n)) return null;
      return asPercentToDecimal ? n / 100 : n;
    };

    // REG-B (REG-2): server-side validation gate. Catch a "150" VAT
    // typo or negative cost before the row persists. The DB has no
    // CHECK constraints on these columns yet so the form is the
    // last line of defence.
    const vat = parseOverride(form.vat_rate_override, true);
    if (vat != null && (vat < 0 || vat > 1)) {
      setSubmitting(false);
      toast({ title: "VAT rate out of range", description: "Enter a percentage between 0 and 100.", variant: "destructive" });
      return;
    }
    const dep = parseOverride(form.deposit_percent_override);
    if (dep != null && (dep < 0 || dep > 100)) {
      setSubmitting(false);
      toast({ title: "Deposit % out of range", description: "Enter a percentage between 0 and 100.", variant: "destructive" });
      return;
    }
    const dcpk = parseOverride(form.delivery_cost_per_km_override);
    if (dcpk != null && dcpk < 0) {
      setSubmitting(false);
      toast({ title: "Delivery cost negative", description: "Cost per km must be ≥ 0.", variant: "destructive" });
      return;
    }
    const mdf = parseOverride(form.min_delivery_fee_override);
    if (mdf != null && mdf < 0) {
      setSubmitting(false);
      toast({ title: "Min delivery fee negative", description: "Min delivery fee must be ≥ 0.", variant: "destructive" });
      return;
    }

    const payload: Record<string, any> = {
      company_id: user.company_id,
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      country: form.country,
      province_state: form.province_state || null,
      city: form.city || null,
      address: form.address || null,
      postal_code: form.postal_code || null,
      lat: form.lat,
      lng: form.lng,
      manager_user_id: form.manager_user_id && form.manager_user_id !== "__none" ? form.manager_user_id : null,
      phone: form.phone || null,
      email: form.email || null,
      timezone: form.timezone,
      currency: form.currency,
      operating_hours_start: form.operating_hours_start,
      operating_hours_end: form.operating_hours_end,
      delivery_radius_km: form.delivery_radius_km,
      auto_assign_orders: form.auto_assign_orders,
      is_active: form.is_active,
      notes: form.notes || null,
      vat_rate: vat,
      deposit_percent: dep,
      delivery_cost_per_km: dcpk,
      min_delivery_fee: mdf,
      notify_manager_on_new_lead: form.notify_manager_on_new_lead,
      notify_manager_on_new_order: form.notify_manager_on_new_order,
      notify_manager_on_prep_alert: form.notify_manager_on_prep_alert,
    };

    let error: any;
    if (editing) {
      ({ error } = await supabase.from("regions").update(payload as any).eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("regions").insert(payload as any));
    }
    setSubmitting(false);

    if (error) {
      toast({ title: editing ? "Failed to update region" : "Failed to create region", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: editing ? "Region updated" : "Region created", description: form.name });
    setCreateOpen(false);
    setEditing(null);
    setForm(emptyForm());
    void loadRegions();
  };

  // REG-B (regions audit, REG-1): the previous handleDelete called
  // supabase.from("regions").delete() and promised "Staff and orders
  // linked to it will be unassigned." Both claims were wrong:
  // - orders/quotes/leads/clients all carry region_id as NOT NULL with
  //   ON DELETE SET NULL. The DB will REFUSE the delete with a foreign-
  //   key violation, not null-and-orphan.
  // - profiles.region_id IS nullable but the page never told the
  //   operator how many staff were about to be unassigned.
  // New behaviour: pre-flight the linked data, refuse hard delete when
  // anything is linked, and offer a soft "pause" via is_active=false
  // instead. Only an empty region can be hard-deleted.
  const handleDelete = async (region: Region) => {
    // Pre-flight: how much data is linked to this region?
    const [
      { count: orderCount },
      { count: quoteCount },
      { count: leadCount },
      { count: clientCount },
      { count: staffCount },
    ] = await Promise.all([
      (supabase as any).from("orders").select("id", { count: "exact", head: true }).eq("region_id", region.id),
      (supabase as any).from("quotes").select("id", { count: "exact", head: true }).eq("region_id", region.id),
      (supabase as any).from("leads").select("id", { count: "exact", head: true }).eq("region_id", region.id),
      (supabase as any).from("clients").select("id", { count: "exact", head: true }).eq("region_id", region.id),
      (supabase as any).from("profiles").select("id", { count: "exact", head: true }).eq("region_id", region.id),
    ]);
    const linked = (orderCount || 0) + (quoteCount || 0) + (leadCount || 0) + (clientCount || 0);
    if (linked > 0) {
      const parts: string[] = [];
      if (orderCount) parts.push(`${orderCount} order${orderCount === 1 ? "" : "s"}`);
      if (quoteCount) parts.push(`${quoteCount} quote${quoteCount === 1 ? "" : "s"}`);
      if (leadCount) parts.push(`${leadCount} lead${leadCount === 1 ? "" : "s"}`);
      if (clientCount) parts.push(`${clientCount} client${clientCount === 1 ? "" : "s"}`);
      if (staffCount) parts.push(`${staffCount} staff member${staffCount === 1 ? "" : "s"}`);
      const detail = parts.join(", ");
      const proceed = confirm(
        `${region.name} has ${detail} linked to it.\n\n` +
        `Hard delete would fail (the data carries NOT NULL region_id).\n\n` +
        `Press OK to PAUSE this branch instead (no new work routes to it, history stays intact). Press Cancel to abort.`,
      );
      if (!proceed) return;
      const { error } = await supabase
        .from("regions")
        .update({ is_active: false } as any)
        .eq("id", region.id);
      if (error) {
        toast({ title: "Failed to pause region", description: error.message, variant: "destructive" });
        return;
      }
      toast({ title: "Region paused", description: `${region.name} won't accept new work. History preserved.` });
      void loadRegions();
      return;
    }

    // No linked data - safe to hard delete.
    if (!confirm(`Delete region "${region.name}"? Nothing is linked to it, this is a clean removal.`)) return;
    const { error } = await supabase.from("regions").delete().eq("id", region.id);
    if (error) {
      toast({ title: "Failed to delete region", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Region deleted", description: region.name });
    void loadRegions();
  };

  const countryConfig = useMemo(() => getCountry(form.country), [form.country]);

  const stats = useMemo(() => ({
    total: regions.length,
    active: regions.filter((r) => r.is_active).length,
    countries: new Set(regions.map((r) => r.country)).size,
    totalStaff: regions.reduce((s, r) => s + (r.staff_count || 0), 0),
    totalOrders: regions.reduce((s, r) => s + (r.order_count || 0), 0),
    mtdOrders: regions.reduce((s, r) => s + (r.mtd_order_count || 0), 0),
    mtdRevenue: regions.reduce((s, r) => s + (r.mtd_revenue || 0), 0),
    openQuotes: regions.reduce((s, r) => s + (r.open_quote_count || 0), 0),
  }), [regions]);

  const currencyFmt = useMemo(() => {
    const code = regions[0]?.currency || "ZAR";
    try {
      return new Intl.NumberFormat("en-ZA", { style: "currency", currency: code, maximumFractionDigits: 0 });
    } catch {
      return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });
    }
  }, [regions]);

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Regional Settings | CateringMS Admin</title>
      </Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80">
        <div className="px-4 py-8 max-w-screen-2xl">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
                <Globe className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-3xl lg:text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                  Branches
                </h1>
                <p className="text-slate-600 mt-1">
                  One company, multiple operating cities. Each branch has its own delivery rate, manager, kitchen, drivers, and inventory. Quotes, orders, and reporting all stay scoped to the branch the lead came in on.
                </p>
                {/* Phase 17 #6: HQ defaults chip. Each per-region
                    chip surfaces a 'differs from HQ' warning
                    (Phase 12 #10) when the value diverges; this
                    line surfaces the HQ baseline so the operator
                    can see what the diff is anchored to without
                    opening /admin/company-profile. */}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  <Clock className="w-3 h-3" />
                  HQ defaults:
                  <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono">
                    {companyDefaults.timezone}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono">
                    {companyDefaults.currency}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              {/* Phase 28 #6: manual refresh. Region stats roll up
                  from MTD orders and open quote counts; a refresh
                  re-pulls the join after a quote or order changes
                  in another tab. */}
              <Button
                variant="outline"
                onClick={() => void loadRegions()}
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              {/* Phase 21 #4: per-branch performance CSV. Multi-
                  branch operators run quarterly reviews comparing
                  regions on revenue + order count + open quote
                  load. Until now the page only surfaced the
                  numbers on screen. */}
              <Button
                variant="outline"
                onClick={() => {
                  if (regions.length === 0) {
                    toast({ title: "Nothing to export", description: "No regions on file yet." });
                    return;
                  }
                  const esc = (v: any) => {
                    if (v == null) return "";
                    const s = String(v).replace(/"/g, '""');
                    return /[",\n]/.test(s) ? `"${s}"` : s;
                  };
                  const headers = [
                    "Region", "Timezone", "Currency", "Active",
                    "Open quotes", "MTD orders", "MTD revenue",
                  ];
                  const lines = [headers.join(",")];
                  for (const r of regions as any[]) {
                    lines.push([
                      esc(r.name || ""),
                      esc(r.timezone || ""),
                      esc(r.currency || ""),
                      esc(r.is_active === false ? "no" : "yes"),
                      esc(r.open_quote_count ?? 0),
                      esc(r.mtd_order_count ?? 0),
                      esc(Number(r.mtd_revenue || 0).toFixed(2)),
                    ].join(","));
                  }
                  // REG-B (regions audit, REG-4): UTF-8 BOM so Excel-ZA
                  // opens the file as UTF-8 (not Latin-1). Same fix
                  // shipped on /admin/calendar (task #116).
                  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `regions-${toLocalISO(new Date())}.csv`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </Button>
              <Button onClick={openCreateDialog} className="bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90 gap-2">
                <Plus className="w-4 h-4" />
                Add Region
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <StatTile label="Active branches" value={stats.active} accent="text-emerald-600" tooltip={"Regions that are currently switched on and accepting work."} />
            <StatTile label="Open quotes" value={stats.openQuotes} accent="text-purple-600" tooltip={"Quotes in draft / sent / revised across every branch."} />
            {/* REG-B (regions audit, REG-3): label clarification. The
                pre-REG-B labels said "MTD orders / MTD revenue", which
                operators read as "booked this month". The underlying
                query is `event_date >= 1st of this month`, so the
                values are events HAPPENING this month - very different
                for an events caterer who books months ahead. Renamed
                to match the query so the financial dashboard and this
                page can both be right at the same time. */}
            <StatTile label="Events this month" value={stats.mtdOrders} accent="text-blue-600" tooltip={"Orders with an event_date in the current calendar month, summed across branches. Cancelled and declined orders excluded."} />
            <StatTile
              label="Revenue this month"
              value={currencyFmt.format(stats.mtdRevenue)}
              accent="text-amber-600"
              tooltip={"Sum of total_amount on orders with an event_date in the current calendar month. Cancelled and declined orders excluded. For 'booked this month' see /admin/financial."}
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
            <StatTile label="Total regions" value={stats.total} tooltip={"How many regions you have set up for your business."} />
            <StatTile label="Countries" value={stats.countries} accent="text-purple-600" tooltip={"How many different countries you operate in across your regions."} />
            <StatTile label="Linked staff" value={stats.totalStaff} accent="text-blue-600" tooltip={"Total staff members linked to any region."} />
          </div>

          {loading ? (
            <Card className="border-0 shadow">
              <CardContent className="py-16 flex items-center justify-center text-slate-500 gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading regions...
              </CardContent>
            </Card>
          ) : regions.length === 0 ? (
            <Card className="border-0 shadow">
              <CardContent className="py-16 text-center">
                <Globe className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="font-semibold text-slate-700 mb-1">No regions yet</p>
                <p className="text-sm text-slate-500 mb-4">
                  Add your first region to start running independent operations from a single account.
                </p>
                <Button onClick={openCreateDialog} className="gap-2">
                  <Plus className="w-4 h-4" /> Add Region
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {regions.map((region) => (
                <Card key={region.id} className="border-0 shadow-lg hover:shadow-xl transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <CardTitle className="text-xl">{region.name}</CardTitle>
                          <Badge variant="outline" className="font-mono text-xs">{region.code}</Badge>
                          {region.is_active ? (
                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 gap-1">
                              <CheckCircle className="w-3 h-3" />
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1">
                              <XCircle className="w-3 h-3" />
                              Paused
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="flex items-center gap-1 text-sm">
                          <MapPin className="w-3 h-3" />
                          {[region.city, region.province_state, getCountry(region.country).name]
                            .filter(Boolean)
                            .join(", ") || "Location not set"}
                        </CardDescription>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEditDialog(region)} title="Edit region">
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(region)} title="Delete region">
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                      <MiniStat icon={Truck} label="Events this month" value={region.mtd_order_count || 0} tooltip={"Orders for this branch with an event_date in the current calendar month. Cancelled and declined excluded."} />
                      <MiniStat
                        icon={Users}
                        label="Revenue this month"
                        value={currencyFmt.format(region.mtd_revenue || 0)}
                        tooltip={"Sum of total_amount on this branch's orders with an event_date in the current calendar month. Cancelled and declined orders excluded."}
                      />
                      <MiniStat icon={ChefHat} label="Open quotes" value={region.open_quote_count || 0} tooltip={"Quotes for this branch in draft, sent or revised state."} />
                      <MiniStat icon={Users} label="Staff" value={region.staff_count || 0} tooltip={"Staff members linked to this branch."} />
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-4 text-xs text-slate-500">
                      <div>All-time orders: <span className="font-semibold text-slate-700">{region.order_count || 0}</span></div>
                      <div className="flex items-center gap-1">
                        Auto-assign: <span className="font-semibold text-slate-700">{region.auto_assign_orders ? "On" : "Off"}</span>
                        <InfoTooltip content={"Reference only - dispatcher logic doesn't yet branch on this flag (planned: per-region auto-assign gate)."} />
                      </div>
                    </div>
                    <div className="text-sm text-slate-600 space-y-1.5">
                      {region.manager?.full_name ? (
                        <div><span className="font-medium text-slate-700">Manager:</span> {region.manager.full_name} ({region.manager.email})</div>
                      ) : (
                        // REG-B (regions audit, REG-5): pre-REG-B a region
                        // whose manager profile was deleted just stopped
                        // rendering the manager line silently. Operators
                        // had no signal that lead/order notifications had
                        // nobody to land on. Now we shout about it.
                        <div className="flex items-center gap-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                          <span>No manager assigned. Lead and order notifications won&apos;t reach anyone for this branch.</span>
                          <button
                            type="button"
                            onClick={() => openEditDialog(region)}
                            className="ml-auto text-amber-900 underline font-medium"
                          >
                            Pick one
                          </button>
                        </div>
                      )}
                      {(region.operating_hours_start || region.operating_hours_end) && (
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-slate-700">Hours:</span>
                          <span>{region.operating_hours_start}, {region.operating_hours_end}</span>
                          {/* REG-B (regions audit, REG-6): mark advisory
                              fields. The operating_hours columns are
                              stored + displayed but no downstream code
                              consumes them today - they don't gate cron
                              windows, kitchen prep scheduling, or the
                              public booking form. Surface that honestly
                              until the wiring lands. Same applies to
                              delivery_radius_km and auto_assign_orders
                              below. */}
                          <InfoTooltip content={"Reference only - nothing in the app enforces these hours yet (planned: gating cron windows + public booking-form time pickers)."} />
                        </div>
                      )}
                      {/* Phase 12 #10: currency + timezone chips with
                          a 'differs from HQ' warning when either
                          diverges from the company default. Catches
                          accidental misconfig before BCEA / cron
                          windows quietly produce wrong numbers. */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(() => {
                          const currencyDiff = region.currency && region.currency !== companyDefaults.currency;
                          const tzDiff = region.timezone && region.timezone !== companyDefaults.timezone;
                          return (
                            <>
                              <span className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border ${currencyDiff ? "bg-amber-50 border-amber-300 text-amber-800" : "bg-slate-50 border-slate-200 text-slate-700"}`}>
                                <span className="font-medium">Currency:</span>
                                <span className="font-mono">{region.currency || "—"}</span>
                                {currencyDiff && <span className="text-amber-700 font-semibold">≠ HQ</span>}
                              </span>
                              <span className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border ${tzDiff ? "bg-amber-50 border-amber-300 text-amber-800" : "bg-slate-50 border-slate-200 text-slate-700"}`}>
                                <span className="font-medium">Timezone:</span>
                                <span className="font-mono">{region.timezone || "—"}</span>
                                {tzDiff && <span className="text-amber-700 font-semibold">≠ HQ</span>}
                              </span>
                            </>
                          );
                        })()}
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-medium text-slate-700">Delivery radius:</span>
                        <span>{region.delivery_radius_km} km</span>
                        <InfoTooltip content={"Reference only - lead routing and quote-distance feasibility don't consult this number today (planned: out-of-radius decline / route-to-nearest)."} />
                      </div>
                      {region.notes && (
                        <div className="text-slate-500 italic mt-2">"{region.notes}"</div>
                      )}
                    </div>

                    {/* Phase 7 #10: surface per-region pricing
                        overrides as chips. Until now the only way
                        to see whether a branch was on non-default
                        VAT, deposit %, delivery cost or minimum
                        fee was to open the edit dialog. The chips
                        let an admin scanning the list immediately
                        spot which regions are diverging from the
                        company default and by how much. Anything
                        null inherits silently and gets no chip. */}
                    {(() => {
                      const r: any = region;
                      const chips: { label: string; value: string }[] = [];
                      if (r.vat_rate != null) {
                        chips.push({ label: "VAT", value: `${(Number(r.vat_rate) * 100).toFixed(1).replace(/\.0$/, "")}%` });
                      }
                      if (r.deposit_percent != null) {
                        chips.push({ label: "Deposit", value: `${Number(r.deposit_percent)}%` });
                      }
                      if (r.delivery_cost_per_km != null) {
                        chips.push({ label: "R/km", value: `R${Number(r.delivery_cost_per_km).toFixed(2)}` });
                      }
                      if (r.min_delivery_fee != null) {
                        chips.push({ label: "Min fee", value: `R${Number(r.min_delivery_fee).toFixed(2)}` });
                      }
                      if (chips.length === 0) return null;
                      return (
                        <div className="mt-3 pt-3 border-t border-slate-100">
                          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1.5 flex items-center gap-1">
                            Pricing overrides
                            <InfoTooltip content={"This branch overrides the company default for these values. Anything not shown here inherits from the company profile."} />
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {chips.map((c) => (
                              <Badge
                                key={c.label}
                                variant="outline"
                                className="bg-purple-50 border-purple-200 text-purple-800 text-xs"
                              >
                                <span className="font-normal mr-1">{c.label}:</span>
                                <span className="font-semibold tabular-nums">{c.value}</span>
                              </Badge>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="mt-12 text-sm">
            <Link href={withSlug("/admin/dashboard")} className="text-purple-600 hover:underline inline-flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" /> Back to dashboard
            </Link>
          </div>
        </div>
        <Footer />
      </div>

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) { setEditing(null); setForm(emptyForm()); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Region" : "Add New Region"}</DialogTitle>
            <DialogDescription>
              Run a fulfillment region with its own kitchen, drivers, and operating hours. Staff and orders can be assigned to a region for clean reporting.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="region-name">Region name *</Label>
                <Input id="region-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Johannesburg" />
              </div>
              <div>
                <Label htmlFor="region-code">Code *</Label>
                <Input id="region-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="JHB" maxLength={6} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Country</Label>
                <Select value={form.country} onValueChange={(v) => onCountryChange(v as CountryCode)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{countryConfig.divisionLabel}</Label>
                <Select value={form.province_state} onValueChange={(v) => setForm({ ...form, province_state: v })}>
                  <SelectTrigger><SelectValue placeholder={`Select ${countryConfig.divisionLabel.toLowerCase()}`} /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {countryConfig.divisions.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="region-address">Branch / kitchen address</Label>
              <AddressAutocomplete
                value={form.address}
                onChange={(pick) => {
                  setForm((f) => ({
                    ...f,
                    address: pick.address,
                    lat: pick.lat,
                    lng: pick.lng,
                    city: pick.components.city || f.city,
                    postal_code: pick.components.postal_code || f.postal_code,
                    province_state: pick.components.state || f.province_state,
                  }));
                }}
                placeholder="Search this branch's kitchen address"
                hint="Pick from the dropdown to lock the precise pin, drivers in this region navigate from here."
              />
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-2">
                <strong>Important:</strong> drivers assigned to this region see this address as their navigation start point.
                Without precise coords, Google Maps may reverse-geocode to a nearby road and confuse the route.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="region-city">City</Label>
                <Input id="region-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="auto-filled" />
              </div>
              <div>
                <Label htmlFor="region-postal">Postal code</Label>
                <Input id="region-postal" value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} placeholder="auto-filled" />
              </div>
              <div>
                <Label className="flex items-center gap-1.5">Coords {form.lat != null && form.lng != null && <span className="text-[10px] text-emerald-700 font-medium">(set)</span>}</Label>
                <p className="text-xs text-slate-500 mt-2 tabular-nums">
                  {form.lat != null && form.lng != null
                    ? `${Number(form.lat).toFixed(5)}, ${Number(form.lng).toFixed(5)}`
                    : "auto-filled from address"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Regional manager</Label>
                <Select value={form.manager_user_id} onValueChange={(v) => setForm({ ...form, manager_user_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select a staff member" /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value="__none">No manager</SelectItem>
                    {staff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.full_name || s.email} ({s.active_role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="region-phone">Phone</Label>
                <Input id="region-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+27 11 555 0101" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="region-email">Email</Label>
                <Input id="region-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="region@company.com" />
              </div>
              <div>
                <Label htmlFor="region-currency">Currency</Label>
                <Input id="region-currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="region-tz">Timezone</Label>
                <Input id="region-tz" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="region-open">Opens at</Label>
                <Input id="region-open" type="time" value={form.operating_hours_start} onChange={(e) => setForm({ ...form, operating_hours_start: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="region-close">Closes at</Label>
                <Input id="region-close" type="time" value={form.operating_hours_end} onChange={(e) => setForm({ ...form, operating_hours_end: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="region-radius">Delivery radius (km)</Label>
                <Input
                  id="region-radius"
                  type="number"
                  min={0}
                  value={form.delivery_radius_km}
                  onChange={(e) => setForm({ ...form, delivery_radius_km: Number(e.target.value || 0) })}
                />
              </div>
              <div className="space-y-3 pt-6">
                <div className="flex items-center justify-between">
                  <Label htmlFor="auto-assign" className="font-normal">Auto-assign orders</Label>
                  <Switch id="auto-assign" checked={form.auto_assign_orders} onCheckedChange={(v) => setForm({ ...form, auto_assign_orders: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="is-active" className="font-normal">Region is active</Label>
                  <Switch id="is-active" checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="region-notes">Notes</Label>
              <Input id="region-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Anything specific about this region" />
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4 space-y-3">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-blue-900">
                <MapPin className="w-4 h-4" /> Branch overrides
                <InfoTooltip content={"Leave any field blank to inherit the company default. Fill it in to override just for this branch.\n\nUseful when one branch trades under a different VAT registration, runs a different deposit policy, or has a different delivery cost structure than head office."} />
              </div>
              <p className="text-xs text-blue-800/80">
                Blank = inherit from your company-wide defaults. Fill in to override
                pricing or policy for this branch only.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="region-vat" className="text-xs">VAT rate (%)</Label>
                  <Input
                    id="region-vat"
                    type="number"
                    step="0.1"
                    min={0}
                    max={100}
                    placeholder="Inherit"
                    value={form.vat_rate_override}
                    onChange={(e) => setForm({ ...form, vat_rate_override: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="region-deposit" className="text-xs">Deposit (%)</Label>
                  <Input
                    id="region-deposit"
                    type="number"
                    step="1"
                    min={0}
                    max={100}
                    placeholder="Inherit"
                    value={form.deposit_percent_override}
                    onChange={(e) => setForm({ ...form, deposit_percent_override: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="region-perkm" className="text-xs">Delivery R / km</Label>
                  <Input
                    id="region-perkm"
                    type="number"
                    step="0.5"
                    min={0}
                    placeholder="Inherit"
                    value={form.delivery_cost_per_km_override}
                    onChange={(e) => setForm({ ...form, delivery_cost_per_km_override: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="region-minfee" className="text-xs">Min delivery fee (R)</Label>
                  <Input
                    id="region-minfee"
                    type="number"
                    step="1"
                    min={0}
                    placeholder="Inherit"
                    value={form.min_delivery_fee_override}
                    onChange={(e) => setForm({ ...form, min_delivery_fee_override: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-900">
                <AlertCircle className="w-4 h-4" /> Branch manager notifications
                <InfoTooltip content={"Whether the branch manager (assigned above) gets pinged when activity hits this branch.\n\nThe company owner always receives notifications regardless of these toggles. This controls only the branch manager's secondary copy."} />
              </div>
              <p className="text-xs text-emerald-800/80">
                The owner always gets the notification. These toggles control whether the
                branch manager also gets a copy.
              </p>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="notif-new-lead" className="font-normal text-sm">New lead lands in this branch</Label>
                  <Switch
                    id="notif-new-lead"
                    checked={form.notify_manager_on_new_lead}
                    onCheckedChange={(v) => setForm({ ...form, notify_manager_on_new_lead: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="notif-new-order" className="font-normal text-sm">New order confirmed for this branch</Label>
                  <Switch
                    id="notif-new-order"
                    checked={form.notify_manager_on_new_order}
                    onCheckedChange={(v) => setForm({ ...form, notify_manager_on_new_order: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="notif-prep" className="font-normal text-sm">Kitchen prep / stock shortfall alerts</Label>
                  <Switch
                    id="notif-prep"
                    checked={form.notify_manager_on_prep_alert}
                    onCheckedChange={(v) => setForm({ ...form, notify_manager_on_prep_alert: v })}
                  />
                </div>
              </div>
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                After creating a region you can assign staff and inventory to it from their respective pages.
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={handleSave} disabled={submitting} className="bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90 gap-2">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing ? "Save changes" : "Create region"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatTile({ label, value, accent = "text-slate-900", tooltip }: { label: string; value: number | string; accent?: string; tooltip?: string }) {
  return (
    <Card className="border-0 shadow">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-slate-500 mb-1 flex items-center gap-1">{label}{tooltip && <InfoTooltip content={tooltip} />}</p>
        <p className={`text-2xl font-bold ${accent}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function MiniStat({ icon: Icon, label, value, tooltip }: { icon: any; label: string; value: number | string; tooltip?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="flex items-center gap-1 text-xs text-slate-500 mb-0.5">
        <Icon className="w-3 h-3" />
        {label}
        {tooltip && <InfoTooltip content={tooltip} />}
      </div>
      <div className="font-semibold text-slate-900">{value}</div>
    </div>
  );
}
