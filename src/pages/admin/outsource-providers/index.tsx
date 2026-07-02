/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/outsource-providers - Wave 67 Phase B.
 *
 * Registry hub for the company's external per-event service providers
 * (on-site chefs, florists, photographers, sound, security, etc).
 *
 * Why separate from /admin/suppliers:
 *   - Suppliers = "we BUY GOODS from them" (ingredients, hire
 *     equipment). Inventory + procurement lens.
 *   - Outsource providers = "they FULFIL A SERVICE for an order".
 *     Per-event assignment, accept/decline flow, cost line, comms.
 *
 * Page shape mirrors /admin/suppliers so the operator's mental model
 * transfers (list of cards, search, status filter, add/edit dialog).
 * Phase C wires fulfilment to menu items. Phase D ships the per-order
 * assignment + magic-link accept flow.
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { CatalogueOperationsStrip } from "@/components/admin/CatalogueOperationsStrip";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useTenantHref } from "@/lib/tenantUrl";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import {
  outsourceProviderService,
  COMMON_ROLES,
  RATE_TYPE_OPTIONS,
  CONTACT_CHANNEL_OPTIONS,
  type OutsourceProvider,
  type OutsourceProviderWithStats,
  type OutsourceRateType,
  type OutsourceContactChannel,
} from "@/services/outsourceProviderService";
import {
  HardHat,
  Plus,
  Search,
  Pencil,
  Trash2,
  Mail,
  Phone,
  MessageCircle,
  ExternalLink,
  Star,
  Loader2,
  Send,
  CheckCircle2,
  AlertTriangle,
  Calendar,
} from "lucide-react";
import {
  PageWorkbench, PortalCard, PortalHeader, PortalShell, StatTile,
} from "@/components/portal/ui";

interface FormState {
  provider_name: string;
  contact_person: string;
  email: string;
  phone: string;
  whatsapp_number: string;
  provider_roles: string[];
  specialty: string;
  default_rate_type: OutsourceRateType;
  default_rate: string;
  payment_terms_days: string;
  preferred_contact_channel: OutsourceContactChannel;
  notes: string;
  // OUT-C additions
  region_id: string;
  linked_supplier_id: string;
  rating: string;
  vat_number: string;
  insurance_provider: string;
  insurance_policy_number: string;
  insurance_expiry: string;
  certification_notes: string;
}

function emptyForm(): FormState {
  return {
    provider_name: "",
    contact_person: "",
    email: "",
    phone: "",
    whatsapp_number: "",
    provider_roles: [],
    specialty: "",
    default_rate_type: "per_event",
    default_rate: "",
    payment_terms_days: "",
    preferred_contact_channel: "whatsapp",
    notes: "",
    region_id: "",
    linked_supplier_id: "",
    rating: "",
    vat_number: "",
    insurance_provider: "",
    insurance_policy_number: "",
    insurance_expiry: "",
    certification_notes: "",
  };
}

function ProvidersList() {
  const { profile, company: tenantCompany } = useAuth() as {
    profile: { company_id?: string; role?: string; active_role?: string } | null;
    company: { company_name?: string } | null;
  };
  const companyId = profile?.company_id;
  const { toast } = useToast();

  // OUT-B: finance-vis gate. SALES_ADMIN + REGION_ADMIN are admitted
  // for legitimate contact-lookup reasons but shouldn't see rates +
  // payment terms. Same rule as suppliers / hire-in.
  const financeRole = String(profile?.active_role || profile?.role || "").toLowerCase();
  const canSeeFinance =
    financeRole === "owner" || financeRole === "company_admin" ||
    financeRole === "admin" || financeRole === "super_admin";
  // OUT-B: dry-run cron tester is tighter than canSeeFinance because
  // its preview surfaces provider emails. Owner / company admin /
  // super admin only.
  const canRunCronDryRun =
    financeRole === "owner" || financeRole === "company_admin" ||
    financeRole === "super_admin";

  const router = useRouter();
  const { withSlug } = useTenantHref();
  const [providers, setProviders] = useState<OutsourceProviderWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  // Surfaced load failure - a toast alone vanishes and the page then
  // reads as "no providers yet". Rendered as a recovery card + Retry.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  // OUT-D: region filter + URL state.
  const [regionFilter, setRegionFilter] = useState<string>("all");
  // CSV import dialog.
  const [importOpen, setImportOpen] = useState(false);

  const [editing, setEditing] = useState<OutsourceProvider | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OutsourceProvider | null>(null);
  const [deleteOpenAssignments, setDeleteOpenAssignments] = useState<number | null>(null);
  // OUT-C: regions + suppliers for the form dropdowns.
  const [regions, setRegions] = useState<Array<{ id: string; name: string }>>([]);
  const [supplierOptions, setSupplierOptions] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      const [regRes, supRes] = await Promise.all([
        supabase.from("regions").select("id, name").eq("company_id", companyId).order("name"),
        supabase.from("suppliers").select("id, supplier_name").eq("company_id", companyId).is("deleted_at", null).order("supplier_name"),
      ]);
      if (cancelled) return;
      // Dropdown data is best-effort (the page still works without a
      // region filter) but failures shouldn't stay invisible.
      if (regRes.error) captureException(regRes.error, { tags: { surface: "admin/outsource-providers", area: "regions-load" } });
      if (supRes.error) captureException(supRes.error, { tags: { surface: "admin/outsource-providers", area: "suppliers-load" } });
      setRegions(((regRes.data || []) as Array<{ id: string; name: string }>));
      setSupplierOptions(((supRes.data || []) as Array<{ id: string; supplier_name: string }>)
        .map((s) => ({ id: s.id, name: s.supplier_name })));
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  const load = async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    try {
      const rows = await outsourceProviderService.listForCompany(companyId);
      setProviders(rows);
      setLoadError(null);
    } catch (e: any) {
      captureException(e, { tags: { surface: "admin/outsource-providers", area: "load", tenant: companyId } });
      setLoadError(e?.message || "Could not load providers.");
      toast({ title: "Could not load providers", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [companyId]);

  // OUT-D: realtime channel. Add a provider on a phone, see it on
  // desktop ~2s later. Debounced 1500ms so CSV imports don't thrash.
  useEffect(() => {
    if (!companyId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { load(); }, 1500);
    };
    const channel = supabase
      .channel(`outsource-providers:${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "outsource_providers", filter: `company_id=eq.${companyId}` }, bump)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // OUT-D: URL state hydration on mount.
  useEffect(() => {
    if (!router.isReady) return;
    const q = typeof router.query.q === "string" ? router.query.q : "";
    const role = typeof router.query.role === "string" ? router.query.role : "all";
    const region = typeof router.query.region === "string" ? router.query.region : "all";
    const active = typeof router.query.active === "string" ? router.query.active : null;
    setSearch(q);
    setRoleFilter(role);
    setRegionFilter(region);
    if (active === "all") setActiveOnly(false);
    else if (active === "1") setActiveOnly(true);
  }, [router.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Push state back to URL.
  useEffect(() => {
    if (!router.isReady) return;
    const next: Record<string, string> = { ...router.query as Record<string, string> };
    if (search) next.q = search; else delete next.q;
    if (roleFilter && roleFilter !== "all") next.role = roleFilter; else delete next.role;
    if (regionFilter && regionFilter !== "all") next.region = regionFilter; else delete next.region;
    next.active = activeOnly ? "1" : "all";
    router.replace({ pathname: router.pathname, query: next }, undefined, { shallow: true, scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, roleFilter, regionFilter, activeOnly]);

  // Available roles for the filter = COMMON_ROLES + any custom role
  // already in use by an existing provider.
  const availableRoles = useMemo(() => {
    const set = new Set<string>(COMMON_ROLES.map((r) => r.value));
    for (const p of providers) for (const r of p.provider_roles || []) set.add(r);
    return Array.from(set).sort();
  }, [providers]);

  // Page-level aggregates for the hero chips + stat tile row. Real
  // numbers off the loaded list, never hardcoded.
  const totals = useMemo(() => {
    const active = providers.filter((p) => p.is_active).length;
    const bookings = providers.reduce((s, p) => s + Number(p.assignment_count || 0), 0);
    const accepted = providers.reduce((s, p) => s + Number(p.accepted_count || 0), 0);
    const cancelled = providers.reduce((s, p) => s + Number(p.cancelled_count || 0), 0);
    const responded = accepted + cancelled;
    const acceptRate = responded > 0 ? Math.round((accepted / responded) * 100) : null;
    const roles = new Set<string>();
    for (const p of providers) for (const r of p.provider_roles || []) roles.add(r);
    return { active, all: providers.length, bookings, acceptRate, rolesCovered: roles.size };
  }, [providers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return providers.filter((p) => {
      if (activeOnly && !p.is_active) return false;
      if (roleFilter !== "all" && !(p.provider_roles || []).includes(roleFilter)) return false;
      // OUT-D: region filter. "all" includes any-region providers
      // (null region_id) AND region-scoped ones. A specific region
      // value matches that region only.
      if (regionFilter !== "all") {
        const pRegion = (p as typeof p & { region_id?: string | null }).region_id;
        if (pRegion !== regionFilter) return false;
      }
      if (!q) return true;
      return (
        p.provider_name.toLowerCase().includes(q) ||
        (p.contact_person || "").toLowerCase().includes(q) ||
        (p.email || "").toLowerCase().includes(q) ||
        (p.specialty || "").toLowerCase().includes(q) ||
        (p.provider_roles || []).some((r) => r.toLowerCase().includes(q))
      );
    });
  }, [providers, search, activeOnly, roleFilter, regionFilter]);

  const openAdd = () => {
    setForm(emptyForm());
    setEditing(null);
    setAdding(true);
  };

  const openEdit = (p: OutsourceProvider) => {
    // OUT-C: cast widens to include the new columns regenerated into
    // the supabase types after the 20260524180000 migration.
    const pp = p as OutsourceProvider & {
      region_id?: string | null;
      rating?: number | null;
      vat_number?: string | null;
      insurance_provider?: string | null;
      insurance_policy_number?: string | null;
      insurance_expiry?: string | null;
      certification_notes?: string | null;
    };
    setForm({
      provider_name: p.provider_name,
      contact_person: p.contact_person || "",
      email: p.email || "",
      phone: p.phone || "",
      whatsapp_number: p.whatsapp_number || "",
      provider_roles: p.provider_roles || [],
      specialty: p.specialty || "",
      default_rate_type: p.default_rate_type,
      default_rate: p.default_rate != null ? String(p.default_rate) : "",
      payment_terms_days: p.payment_terms_days != null ? String(p.payment_terms_days) : "",
      preferred_contact_channel: p.preferred_contact_channel,
      notes: p.notes || "",
      region_id: pp.region_id || "",
      linked_supplier_id: p.linked_supplier_id || "",
      rating: pp.rating != null ? String(pp.rating) : "",
      vat_number: pp.vat_number || "",
      insurance_provider: pp.insurance_provider || "",
      insurance_policy_number: pp.insurance_policy_number || "",
      insurance_expiry: pp.insurance_expiry || "",
      certification_notes: pp.certification_notes || "",
    });
    setEditing(p);
    setAdding(true);
  };

  const closeDialog = () => {
    setAdding(false);
    setEditing(null);
    setForm(emptyForm());
  };

  const toggleRole = (value: string) => {
    setForm((prev) => {
      const has = prev.provider_roles.includes(value);
      return {
        ...prev,
        provider_roles: has
          ? prev.provider_roles.filter((r) => r !== value)
          : [...prev.provider_roles, value],
      };
    });
  };

  const handleSave = async () => {
    if (!companyId) return;
    if (!form.provider_name.trim()) {
      toast({ title: "Provider name required", variant: "destructive" });
      return;
    }
    if (!form.email.trim() && !form.phone.trim() && !form.whatsapp_number.trim()) {
      toast({
        title: "Need at least one contact channel",
        description: "Add an email, phone, or WhatsApp number so we can reach them.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const ratingParsed = (() => {
        const raw = form.rating.trim();
        if (!raw) return null;
        const n = Number(raw);
        return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
      })();
      const payload = {
        provider_name: form.provider_name.trim(),
        contact_person: form.contact_person.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        whatsapp_number: form.whatsapp_number.trim() || null,
        provider_roles: form.provider_roles,
        specialty: form.specialty.trim() || null,
        default_rate_type: form.default_rate_type,
        default_rate: form.default_rate.trim() ? Number(form.default_rate) || null : null,
        payment_terms_days: form.payment_terms_days.trim()
          ? parseInt(form.payment_terms_days, 10) || null
          : null,
        preferred_contact_channel: form.preferred_contact_channel,
        notes: form.notes.trim() || null,
        // OUT-C deferred batch
        region_id: form.region_id || null,
        linked_supplier_id: form.linked_supplier_id || null,
        rating: ratingParsed,
        vat_number: form.vat_number.trim() || null,
        insurance_provider: form.insurance_provider.trim() || null,
        insurance_policy_number: form.insurance_policy_number.trim() || null,
        insurance_expiry: form.insurance_expiry || null,
        certification_notes: form.certification_notes.trim() || null,
      };

      if (editing) {
        await outsourceProviderService.update(editing.id, payload as Partial<OutsourceProvider>);
        toast({ title: "Provider updated", description: form.provider_name.trim() });
      } else {
        const created = await outsourceProviderService.create({
          companyId,
          ...payload,
        });
        if (!created) throw new Error("Could not create provider");
        toast({ title: "Provider added", description: form.provider_name.trim() });
      }
      closeDialog();
      void load();
    } catch (e: any) {
      toast({
        title: editing ? "Could not update" : "Could not create",
        description: e?.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (p: OutsourceProvider) => {
    try {
      await outsourceProviderService.update(p.id, { is_active: !p.is_active });
      toast({ title: !p.is_active ? "Activated" : "Deactivated", description: p.provider_name });
      void load();
    } catch (e: any) {
      toast({ title: "Could not update", description: e?.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    // OUT-B FK guard: block if open assignments still point at this
    // provider. They'd be orphaned from a list view that hides
    // inactives. Operator can cancel / reassign them first.
    if (deleteOpenAssignments && deleteOpenAssignments > 0) {
      toast({
        title: "Open assignments block delete",
        description: `${deleteOpenAssignments} requested / accepted / on-site assignment${deleteOpenAssignments === 1 ? "" : "s"} reference this provider. Cancel or reassign first.`,
        variant: "destructive",
      });
      return;
    }
    try {
      await outsourceProviderService.softDelete(deleteTarget.id);
      toast({ title: "Provider removed", description: deleteTarget.provider_name });
      setDeleteTarget(null);
      void load();
    } catch (e: unknown) {
      toast({
        title: "Could not delete",
        description: e instanceof Error ? e.message : "",
        variant: "destructive",
      });
    }
  };

  // OUT-B: fetch open-assignment count when the delete dialog opens so
  // the operator sees what's about to be orphaned.
  useEffect(() => {
    if (!deleteTarget) { setDeleteOpenAssignments(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const n = await outsourceProviderService.countOpenAssignments(deleteTarget.id);
        if (!cancelled) setDeleteOpenAssignments(n);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [deleteTarget]);

  const roleLabel = (value: string) =>
    COMMON_ROLES.find((r) => r.value === value)?.label || value.replace(/_/g, " ");

  // OUT-D: templated WhatsApp enquiry pre-fill. Operators told Bobby
  // they wanted the wa.me link to start a chat with sensible context
  // rather than an empty thread. Mirrors HIR-B's hire-in email shape.
  const tenantName = tenantCompany?.company_name || "us";
  const waTemplateFor = (p: OutsourceProviderWithStats) => {
    const num = (p.whatsapp_number || "").replace(/[^\d]/g, "");
    if (!num) return null;
    const first = (p.contact_person || p.provider_name).split(" ")[0];
    const roles = (p.provider_roles || []).map(roleLabel).join(", ");
    const text = [
      `Hi ${first}, this is ${tenantName}.`,
      roles
        ? `We've got an upcoming event and would like to check your availability for ${roles.toLowerCase()}.`
        : "We've got an upcoming event and would like to check your availability.",
      "Are you free in the next two weeks? Happy to share the details.",
    ].join("\n\n");
    return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
  };

  return (
    <>
      <NoIndexMeta />
      <Head><title>Outsource providers - CateringMS</title></Head>
      <AdminNav />
      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            variant="hero"
            title="Outsource providers"
            icon={HardHat}
            subtitle="Per-event service providers: on-site chefs, florists, photographers, sound, security."
            meta={
              !loading && !loadError ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {totals.active} active of {totals.all}
                  </span>
                  {totals.bookings > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                      {totals.bookings} booking{totals.bookings === 1 ? "" : "s"} on file
                    </span>
                  )}
                  {totals.acceptRate != null && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                      {totals.acceptRate}% accept rate
                    </span>
                  )}
                </>
              ) : undefined
            }
            actions={
              <>
              <Button variant="outline" onClick={() => setImportOpen(true)} title="Import providers from CSV">
                Import CSV
              </Button>
              <Button onClick={openAdd} className="bg-brand-primary hover:opacity-90">
                <Plus className="w-4 h-4 mr-2" />
                Add provider
              </Button>
              </>
            }
          />
          <PageWorkbench />
          <CatalogueOperationsStrip active="outsource" />

          {/* OUT-B: cron dry-run tester. Demoted from always-on
              yellow banner to a collapsed disclosure. Only owner /
              company admin / super admin see it; plain admin no
              longer triggers a query that returns other providers'
              emails. */}
          {canRunCronDryRun && <CronDryRunPanel />}

          {/* Stat tiles: real aggregates from the loaded list. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatTile
              label="Active providers"
              value={`${totals.active} / ${totals.all}`}
              hint="Active of all on file"
              icon={HardHat}
            />
            <StatTile
              label="Bookings on file"
              value={`${totals.bookings}`}
              hint="Assignments across all providers"
              icon={Calendar}
            />
            <StatTile
              label="Accept rate"
              value={totals.acceptRate == null ? "-" : `${totals.acceptRate}%`}
              hint="Accepted vs cancelled requests"
              icon={CheckCircle2}
            />
            <StatTile
              label="Roles covered"
              value={`${totals.rolesCovered}`}
              hint="Distinct service roles you can book"
              icon={Star}
            />
          </div>

          {/* Toolbar: search + filters in one card */}
          <PortalCard className="mb-6" padded={false}>
            <div className="p-3 flex flex-col sm:flex-row gap-2 sm:p-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, contact, specialty, role..."
                  className="pl-9 bg-white"
                />
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-full sm:w-44 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  {availableRoles.map((r) => (
                    <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {regions.length > 0 && (
                <Select value={regionFilter} onValueChange={setRegionFilter}>
                  <SelectTrigger className="w-full sm:w-44 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All regions</SelectItem>
                    {regions.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 px-3 py-2 bg-white border border-slate-200 rounded-md cursor-pointer">
                <input
                  type="checkbox"
                  checked={activeOnly}
                  onChange={(e) => setActiveOnly(e.target.checked)}
                  className="accent-brand-primary"
                />
                Active only
              </label>
            </div>
          </PortalCard>

          {/* Surfaced load failure with a retry path - never a silent
              empty list. */}
          {loadError && !loading && (
            <Alert variant="destructive" className="mb-6 bg-white dark:bg-slate-900/95">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Couldn't load providers</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>{loadError}</span>
                <Button onClick={() => void load()} size="sm" variant="outline">
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* List */}
          {loading ? (
            // Skeleton keeps the shell + rail mounted while loading.
            <Card>
              <CardContent className="p-4 space-y-3" aria-busy="true" aria-label="Loading providers">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4 animate-pulse">
                    <div className="h-4 w-40 rounded bg-slate-200 dark:bg-slate-800" />
                    <div className="h-4 flex-1 rounded bg-slate-100 dark:bg-slate-800/60" />
                    <div className="h-4 w-24 rounded bg-slate-100 dark:bg-slate-800/60" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : loadError ? null : providers.length === 0 ? (
            <Card className="border-2 border-dashed">
              <CardContent className="p-12 text-center">
                <HardHat className="w-14 h-14 mx-auto text-slate-300 mb-3" />
                <h3 className="text-lg font-semibold text-slate-900 mb-1">
                  No outsource providers yet
                </h3>
                <p className="text-sm text-slate-600 max-w-md mx-auto">
                  Add the chefs, florists, sound engineers and other external parties you work with on
                  specific orders. They become assignable from the order modal with a built-in
                  accept/decline magic link.
                </p>
                <Button onClick={openAdd} className="mt-4 bg-brand-primary hover:opacity-90">
                  <Plus className="w-4 h-4 mr-2" />
                  Add your first provider
                </Button>
              </CardContent>
            </Card>
          ) : filtered.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-slate-500">
              No providers match the current filter.
            </CardContent></Card>
          ) : (
            <div className="space-y-2">
              {filtered.map((p) => {
                const rateLabel = RATE_TYPE_OPTIONS.find((r) => r.value === p.default_rate_type)?.label || p.default_rate_type;
                const rateDisplay = p.default_rate != null
                  ? `${p.default_currency} ${Number(p.default_rate).toLocaleString("en-ZA", { maximumFractionDigits: 2 })} ${rateLabel.toLowerCase()}`
                  : `${rateLabel}`;
                return (
                  <Card key={p.id} className={`${p.is_active ? "" : "opacity-60"} hover:shadow-sm transition`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* withSlug was missing here - every other
                                internal link carries ?company_slug; this
                                one dropped it and lost tenant context. */}
                            <Link
                              href={withSlug(`/admin/outsource-providers/${p.id}`)}
                              className="text-lg font-semibold text-slate-900 hover:text-brand-primary hover:underline"
                            >
                              {p.provider_name}
                            </Link>
                            {!p.is_active && (
                              <Badge className="bg-slate-200 text-slate-700 text-[10px]">Inactive</Badge>
                            )}
                            {p.rating != null && (
                              <span className="inline-flex items-center gap-0.5 text-xs text-amber-700">
                                <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                                {Number(p.rating).toFixed(1)}
                              </span>
                            )}
                            {/* Role chips are decorative category chrome -
                                brand tint, not the off-palette blue. */}
                            {(p.provider_roles || []).map((r) => (
                              <Badge key={r} variant="outline" className="text-[10px] bg-brand-primary/10 text-brand-primary border-brand-primary/20">
                                {roleLabel(r)}
                              </Badge>
                            ))}
                          </div>
                          {p.contact_person && (
                            <p className="text-xs text-slate-600 mt-0.5">Contact: {p.contact_person}</p>
                          )}
                          {p.specialty && (
                            <p className="text-xs text-slate-600 mt-0.5">{p.specialty}</p>
                          )}
                          {/* Contact strip */}
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {p.email && (
                              <a
                                href={`mailto:${p.email}`}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded-md px-2 py-1 hover:bg-slate-50"
                              >
                                <Mail className="w-3 h-3" />
                                {p.email}
                              </a>
                            )}
                            {p.whatsapp_number && (
                              <a
                                href={waTemplateFor(p) || `https://wa.me/${p.whatsapp_number.replace(/[^\d]/g, "")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Opens WhatsApp with a templated enquiry pre-filled"
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-primary bg-brand-primary/10 border border-brand-primary/20 rounded-md px-2 py-1 hover:bg-brand-primary/15"
                              >
                                <MessageCircle className="w-3 h-3" />
                                {p.whatsapp_number}
                              </a>
                            )}
                            {p.phone && (
                              <a
                                href={`tel:${p.phone.replace(/[^+\d]/g, "")}`}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded-md px-2 py-1 hover:bg-slate-50"
                              >
                                <Phone className="w-3 h-3" />
                                {p.phone}
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          {canSeeFinance && (
                            <>
                              <p className="text-sm font-semibold text-slate-900 tabular-nums">{rateDisplay}</p>
                              {p.payment_terms_days != null && (
                                <p className="text-[11px] text-slate-500">Net {p.payment_terms_days}d</p>
                              )}
                            </>
                          )}
                          <p className="text-[11px] text-slate-500 mt-1">
                            Prefers {p.preferred_contact_channel}
                          </p>
                          {/* OUT-D: reliability + last-booked pills.
                              Data already on OutsourceProviderWithStats
                              (assignment_count, accepted_count,
                              cancelled_count, last_assignment_at).
                              Surface them inline so the operator sees
                              who's solid at a glance. */}
                          {p.assignment_count > 0 && (() => {
                            const responded = p.accepted_count + p.cancelled_count;
                            const acceptRate = responded > 0
                              ? Math.round((p.accepted_count / responded) * 100)
                              : null;
                            const daysSinceLast = p.last_assignment_at
                              ? Math.floor((Date.now() - new Date(p.last_assignment_at).getTime()) / 86_400_000)
                              : null;
                            return (
                              <div className="text-[11px] text-slate-500 mt-0.5 space-y-0.5">
                                <p>{p.assignment_count} booking{p.assignment_count === 1 ? "" : "s"} on file</p>
                                {/* Status colour stays semantic: emerald good, amber mid, rose poor. */}
                                {acceptRate != null && (
                                  <p className={acceptRate >= 80 ? "text-emerald-600" : acceptRate >= 50 ? "text-amber-700" : "text-rose-700"}>
                                    {acceptRate}% accept
                                  </p>
                                )}
                                {daysSinceLast != null && (
                                  <p>last booked {daysSinceLast === 0 ? "today" : `${daysSinceLast}d ago`}</p>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleToggleActive(p)}
                            title={p.is_active ? "Deactivate" : "Activate"}
                          >
                            {p.is_active ? "Active" : "Inactive"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEdit(p)}
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteTarget(p)}
                            title="Remove"
                            className="text-rose-600 hover:text-rose-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Suppliers cross-link so admins find the right home for what they're entering */}
          <p className="text-[11px] text-slate-500 mt-6">
            Looking for goods suppliers (ingredients, equipment)?{" "}
            <Link href={withSlug("/admin/suppliers")} className="underline hover:text-slate-900">
              Open suppliers <ExternalLink className="w-2.5 h-2.5 inline-block" />
            </Link>
            .
          </p>
        </PortalShell>
      </div>

      {/* Add / Edit dialog */}
      <Dialog open={adding} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit provider" : "Add outsource provider"}</DialogTitle>
            <DialogDescription>
              These details drive the request comms + cost lines when this provider is assigned to an order.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="op-name">Provider name</Label>
                <Input
                  id="op-name"
                  value={form.provider_name}
                  onChange={(e) => setForm({ ...form, provider_name: e.target.value })}
                  placeholder="Joe's On-Site Catering"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="op-contact">Contact person</Label>
                <Input
                  id="op-contact"
                  value={form.contact_person}
                  onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
                  placeholder="Joe Bloggs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="op-specialty">Specialty</Label>
                <Input
                  id="op-specialty"
                  value={form.specialty}
                  onChange={(e) => setForm({ ...form, specialty: e.target.value })}
                  placeholder="Spit braai, fine dining"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Roles this provider can fulfil</Label>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_ROLES.map((r) => {
                  const active = form.provider_roles.includes(r.value);
                  return (
                    <button
                      type="button"
                      key={r.value}
                      onClick={() => toggleRole(r.value)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition ${
                        active
                          ? "bg-brand-primary text-white border-brand-primary"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-500">
                Multi-select. Same provider can be both a florist and an on-site chef if they offer both.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="op-email">Email</Label>
                <Input
                  id="op-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="joe@example.co.za"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="op-phone">Phone</Label>
                <Input
                  id="op-phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+27 82 ..."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="op-wa">WhatsApp</Label>
                <Input
                  id="op-wa"
                  value={form.whatsapp_number}
                  onChange={(e) => setForm({ ...form, whatsapp_number: e.target.value })}
                  placeholder="+27 82 ... (if different)"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Preferred contact</Label>
                <Select
                  value={form.preferred_contact_channel}
                  onValueChange={(v) => setForm({ ...form, preferred_contact_channel: v as OutsourceContactChannel })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONTACT_CHANNEL_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="op-region">Region <span className="text-xs text-slate-400">(optional)</span></Label>
                <Select
                  value={form.region_id || "_none"}
                  onValueChange={(v) => setForm({ ...form, region_id: v === "_none" ? "" : v })}
                >
                  <SelectTrigger id="op-region"><SelectValue placeholder="Any region" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Any region</SelectItem>
                    {regions.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Default rate type</Label>
                <Select
                  value={form.default_rate_type}
                  onValueChange={(v) => setForm({ ...form, default_rate_type: v as OutsourceRateType })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RATE_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="op-rate">Default rate (R)</Label>
                <Input
                  id="op-rate"
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.default_rate}
                  onChange={(e) => setForm({ ...form, default_rate: e.target.value })}
                  placeholder="1500"
                  disabled={form.default_rate_type === "quoted"}
                />
                {form.default_rate_type === "quoted" && (
                  <p className="text-[10px] text-slate-500">Cost negotiated per booking.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="op-terms">Payment terms (days)</Label>
                <Input
                  id="op-terms"
                  type="number"
                  min={0}
                  value={form.payment_terms_days}
                  onChange={(e) => setForm({ ...form, payment_terms_days: e.target.value })}
                  placeholder="Net days for their invoice"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="op-notes">Notes <span className="text-xs text-slate-400">(optional)</span></Label>
              <Textarea
                id="op-notes"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Prefers Sundays off, has own transport, vegan-friendly..."
              />
            </div>

            {/* OUT-C: compliance + commercial. Folded into a collapsed
                disclosure so the day-1 form stays light, but the data
                is available for SARS-readiness and public-liability
                tracking when the operator wants it. */}
            <details className="rounded-md border border-slate-200 bg-slate-50/60 p-3">
              <summary className="text-xs font-semibold uppercase tracking-wide text-slate-700 cursor-pointer">
                Compliance, rating + linked supplier
              </summary>
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="op-rating">Rating (1-5)</Label>
                    <Input
                      id="op-rating"
                      type="number"
                      min={1}
                      max={5}
                      step={0.5}
                      value={form.rating}
                      onChange={(e) => setForm({ ...form, rating: e.target.value })}
                      placeholder="e.g. 4.5"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="op-supplier">Linked supplier <span className="text-xs text-slate-400">(optional)</span></Label>
                    <Select
                      value={form.linked_supplier_id || "_none"}
                      onValueChange={(v) => setForm({ ...form, linked_supplier_id: v === "_none" ? "" : v })}
                    >
                      <SelectTrigger id="op-supplier"><SelectValue placeholder="Not linked" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">Not linked</SelectItem>
                        {supplierOptions.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-slate-500">e.g. the florist who also sells you vases.</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="op-vat">VAT number <span className="text-xs text-slate-400">(SARS-readiness)</span></Label>
                  <Input
                    id="op-vat"
                    value={form.vat_number}
                    onChange={(e) => setForm({ ...form, vat_number: e.target.value })}
                    placeholder="e.g. 4123456789"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="op-ins-prov">Insurance provider</Label>
                    <Input
                      id="op-ins-prov"
                      value={form.insurance_provider}
                      onChange={(e) => setForm({ ...form, insurance_provider: e.target.value })}
                      placeholder="e.g. Santam Public Liability"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="op-ins-num">Policy number</Label>
                    <Input
                      id="op-ins-num"
                      value={form.insurance_policy_number}
                      onChange={(e) => setForm({ ...form, insurance_policy_number: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="op-ins-exp">Insurance expiry</Label>
                  <Input
                    id="op-ins-exp"
                    type="date"
                    value={form.insurance_expiry}
                    onChange={(e) => setForm({ ...form, insurance_expiry: e.target.value })}
                  />
                  <p className="text-[10px] text-slate-500">
                    Detail page chip turns amber within 30 days, rose when expired.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="op-cert">Certifications <span className="text-xs text-slate-400">(free text)</span></Label>
                  <Textarea
                    id="op-cert"
                    rows={2}
                    value={form.certification_notes}
                    onChange={(e) => setForm({ ...form, certification_notes: e.target.value })}
                    placeholder="FAS food handling, First Aid Level 2, valid until..."
                  />
                </div>
              </div>
            </details>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-brand-primary hover:opacity-90">
              {saving ? "Saving..." : editing ? "Save changes" : "Add provider"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportProvidersDialog
        open={importOpen}
        companyId={companyId || ""}
        onClose={() => setImportOpen(false)}
        onImported={() => { setImportOpen(false); void load(); }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleteTarget?.provider_name}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Soft-deletes the provider. Past assignments stay on file for the audit trail. If they
                  come back into rotation later, re-add them and the history reconnects via name.
                </p>
                {deleteOpenAssignments == null ? (
                  <p className="text-xs text-slate-400">Checking open assignments...</p>
                ) : deleteOpenAssignments > 0 ? (
                  <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs text-rose-900">
                    <div className="font-semibold">Blocked: {deleteOpenAssignments} open assignment{deleteOpenAssignments === 1 ? "" : "s"}</div>
                    <div className="mt-0.5 text-rose-700">
                      This provider is still booked for in-flight events. Cancel or reassign those first
                      from the order modal, then remove.
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No open assignments reference this provider.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteOpenAssignments == null || deleteOpenAssignments > 0}
              className="bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:pointer-events-none"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Wave 70.4 - E2E test panel for the two outsource-comms crons.
 *
 * Hits both crons with ?dryRun=1 and renders who would have been
 * emailed in the next firing window (24-36h ahead for pre-event,
 * 24-72h behind for post-event thanks). No emails go out; no
 * email_automation_log rows get written; cron auth bypassed in
 * favour of SSR owner/admin gating.
 *
 * Lets ops sanity-check the window logic + dedup on prod data
 * without committing to a real send. If the candidate set comes
 * back empty when it shouldn't (or non-empty when it shouldn't),
 * we catch it here before Vercel's cron fires the real thing
 * at the top of the hour.
 */
interface DryRunResult {
  ok?: boolean;
  dryRun?: boolean;
  windowStart?: string;
  windowEnd?: string;
  candidates?: number;
  sent?: number;
  skipped?: number;
  errors?: string[];
  preview?: Array<{ assignment_id: string; provider_email: string; order_id: string; subject: string }>;
  error?: string;
}

function CronDryRunPanel() {
  const { toast } = useToast();
  const [pre, setPre] = useState<DryRunResult | null>(null);
  const [post, setPost] = useState<DryRunResult | null>(null);
  const [busy, setBusy] = useState<"pre" | "post" | null>(null);
  // OUT-B: collapsed by default - the previous yellow banner
  // dominated the page and made admins assume there was a bug.
  const [open, setOpen] = useState(false);

  const run = async (kind: "pre" | "post") => {
    setBusy(kind);
    const path = kind === "pre"
      ? "/api/cron/outsource-pre-event-reminder?dryRun=1"
      : "/api/cron/outsource-post-event-thanks?dryRun=1";
    try {
      const r = await fetch(path, { credentials: "include" });
      const data = (await r.json()) as DryRunResult;
      if (kind === "pre") setPre(data);
      else setPost(data);
      if (!r.ok) {
        toast({ title: "Dry-run failed", description: data.error || `HTTP ${r.status}`, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Dry-run failed", description: e?.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const renderResult = (r: DryRunResult | null) => {
    if (!r) return null;
    if (r.error) {
      return <p className="text-xs text-rose-700"><AlertTriangle className="w-3 h-3 inline mr-1" />{r.error}</p>;
    }
    return (
      <div className="text-xs text-slate-700 space-y-1">
        <p>
          Window: <span className="font-mono">{r.windowStart?.slice(0, 16)}</span> &rarr; <span className="font-mono">{r.windowEnd?.slice(0, 16)}</span>
        </p>
        <p>
          Candidates in window: <span className="font-semibold">{r.candidates ?? 0}</span>. Would email: <span className="font-semibold text-brand-primary">{r.sent ?? 0}</span>. Skipped (dedup / no email): <span className="font-semibold text-slate-500">{r.skipped ?? 0}</span>.
        </p>
        {r.preview && r.preview.length > 0 && (
          <div className="mt-2 max-h-40 overflow-y-auto border border-slate-200 rounded-md bg-white">
            <table className="w-full text-[11px]">
              <thead className="text-slate-500 bg-slate-50">
                <tr>
                  <th className="text-left px-2 py-1">Provider email</th>
                  <th className="text-left px-2 py-1">Subject</th>
                </tr>
              </thead>
              <tbody>
                {r.preview.map((p) => (
                  <tr key={p.assignment_id} className="border-t border-slate-100">
                    <td className="px-2 py-1 font-mono">{p.provider_email}</td>
                    <td className="px-2 py-1 truncate max-w-md" title={p.subject}>{p.subject}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {r.errors && r.errors.length > 0 && (
          <p className="text-rose-700 text-[11px]"><AlertTriangle className="w-3 h-3 inline mr-1" />{r.errors.length} error(s): {r.errors.slice(0, 2).join("; ")}</p>
        )}
      </div>
    );
  };

  if (!open) {
    return (
      <div className="mb-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1.5"
        >
          <Send className="w-3 h-3" />
          Test outsource crons (dry-run, no emails sent)
        </button>
      </div>
    );
  }

  return (
    <Card className="mb-4 border-slate-200 bg-slate-50">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 inline-flex items-center gap-1.5">
              <Send className="w-4 h-4 text-slate-700" />
              Cron dry-run (no emails sent)
            </p>
            <p className="text-xs text-slate-600 mt-0.5">
              Preview who the pre-event reminder + post-event thanks crons would email on their next firing. Tenant-scoped.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            Hide
          </button>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => run("pre")} disabled={busy !== null} className="gap-1.5 bg-white">
              {busy === "pre" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Test pre-event (24-36h ahead)
            </Button>
            <Button size="sm" variant="outline" onClick={() => run("post")} disabled={busy !== null} className="gap-1.5 bg-white">
              {busy === "post" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Test post-event (24-72h behind)
            </Button>
          </div>
        </div>
        {pre && (
          <div className="rounded-md bg-white border border-amber-200 p-3">
            <p className="text-xs font-semibold text-slate-900 mb-1">Pre-event reminder</p>
            {renderResult(pre)}
          </div>
        )}
        {post && (
          <div className="rounded-md bg-white border border-amber-200 p-3">
            <p className="text-xs font-semibold text-slate-900 mb-1">Post-event thanks + invoice nudge</p>
            {renderResult(post)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────
// OUT-D: ImportProvidersDialog
// ──────────────────────────────────────────────────────────────────
// Bulk import outsource providers from CSV. Custom splitCsvLine,
// preview + inline validation, downloadable UTF-8 BOM template.
// Mirrors the suppliers CSV import (SUP-C).

function splitCsvLineOP(line: string): string[] {
  const out: string[] = [];
  let cur = ""; let inQ = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 1; }
        else { inQ = false; }
      } else cur += ch;
    } else {
      if (ch === ',') { out.push(cur); cur = ""; }
      else if (ch === '"') inQ = true;
      else cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

type ParsedProviderRow = {
  provider_name: string;
  contact_person: string;
  email: string;
  phone: string;
  whatsapp_number: string;
  roles_text: string;
  specialty: string;
  default_rate_type: OutsourceRateType;
  default_rate: number | null;
  payment_terms_days: number | null;
  _error?: string;
};

function ImportProvidersDialog({
  open, companyId, onClose, onImported,
}: { open: boolean; companyId: string; onClose: () => void; onImported: () => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<ParsedProviderRow[]>([]);
  const [filename, setFilename] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!open) { setRows([]); setFilename(""); } }, [open]);

  const onFile = (file: File) => {
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length === 0) { setRows([]); return; }
      const first = splitCsvLineOP(lines[0]).map((c) => c.toLowerCase());
      const hasHeader = first.some((c) => ["provider", "provider name", "name"].includes(c));
      const dataLines = hasHeader ? lines.slice(1) : lines;
      const parsed: ParsedProviderRow[] = dataLines.map((ln) => {
        const cols = splitCsvLineOP(ln);
        const [
          name = "", contact = "", email = "", phone = "", whatsapp = "",
          rolesText = "", specialty = "", rateType = "per_event", rate = "", terms = "",
        ] = cols;
        const rt = (RATE_TYPE_OPTIONS.find((o) => o.value === rateType.trim().toLowerCase())?.value || "per_event") as OutsourceRateType;
        const rateNum = rate.trim() ? Number(rate) : null;
        const termsNum = terms.trim() ? Number.parseInt(terms, 10) : null;
        const row: ParsedProviderRow = {
          provider_name: name.trim(),
          contact_person: contact.trim(),
          email: email.trim(),
          phone: phone.trim(),
          whatsapp_number: whatsapp.trim(),
          roles_text: rolesText.trim(),
          specialty: specialty.trim(),
          default_rate_type: rt,
          default_rate: Number.isFinite(rateNum as number) ? rateNum : null,
          payment_terms_days: Number.isFinite(termsNum as number) ? termsNum : null,
        };
        if (!row.provider_name) row._error = "Missing name";
        else if (!row.email && !row.phone && !row.whatsapp_number) row._error = "No contact channel";
        return row;
      });
      setRows(parsed);
    };
    reader.readAsText(file, "utf-8");
  };

  const runImport = async () => {
    if (!companyId || rows.length === 0) return;
    const validRows = rows.filter((r) => !r._error);
    if (validRows.length === 0) {
      toast({ title: "Nothing to import", description: "Every row has an error.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const result = await outsourceProviderService.bulkCreate({
        companyId,
        rows: validRows.map((r) => ({
          provider_name: r.provider_name,
          contact_person: r.contact_person || null,
          email: r.email || null,
          phone: r.phone || null,
          whatsapp_number: r.whatsapp_number || null,
          provider_roles: r.roles_text ? r.roles_text.split(";").map((s) => s.trim()).filter(Boolean) : [],
          specialty: r.specialty || null,
          default_rate_type: r.default_rate_type,
          default_rate: r.default_rate,
          payment_terms_days: r.payment_terms_days,
        })),
      });
      toast({
        title: `Imported ${result.inserted}`,
        description: `${result.skipped} duplicate${result.skipped === 1 ? "" : "s"} skipped, ${result.errors.length} error${result.errors.length === 1 ? "" : "s"}.`,
      });
      onImported();
    } catch (e: unknown) {
      captureException(e, { tags: { surface: "admin/outsource-providers", area: "csv-import" } });
      toast({ title: "Import failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const downloadTemplate = () => {
    const headers = "Provider name,Contact person,Email,Phone,WhatsApp,Roles (semi-colon),Specialty,Rate type,Default rate,Payment terms (days)";
    const sample = `MH Catering,Henry Helmuth,henry@example.com,,0827638960,onsite_chef;sound,Spit braai,per_event,1400,1
Sunset Florals,Linda,linda@example.co.za,0214441234,,florist,Boho weddings,quoted,,30`;
    const blob = new Blob(["﻿" + headers + "\r\n" + sample], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "outsource-providers-template.csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const errorCount = rows.filter((r) => r._error).length;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import providers from CSV</DialogTitle>
          <DialogDescription>
            Columns: name, contact person, email, phone, WhatsApp, roles
            (semi-colon-separated), specialty, rate type, default rate,
            payment terms days. Header row optional. Existing provider
            names are skipped (case-insensitive). Each row needs at
            least one contact channel.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
              className="text-sm"
            />
            <Button variant="outline" size="sm" onClick={downloadTemplate}>Download template</Button>
            {filename && <span className="text-xs text-slate-500">{filename}</span>}
          </div>
          {rows.length > 0 && (
            <>
              <div className="text-xs text-slate-600">
                {rows.length} row{rows.length === 1 ? "" : "s"} parsed
                {errorCount > 0 && <span className="text-rose-600 ml-2">· {errorCount} with errors</span>}
              </div>
              <div className="max-h-64 overflow-y-auto rounded-md border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]">
                    <tr>
                      <th className="text-left px-2 py-1.5">Name</th>
                      <th className="text-left px-2 py-1.5">Contact</th>
                      <th className="text-left px-2 py-1.5">Email</th>
                      <th className="text-left px-2 py-1.5">Roles</th>
                      <th className="text-right px-2 py-1.5">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 50).map((r, i) => (
                      <tr key={i} className={r._error ? "bg-rose-50" : "border-t border-slate-100"}>
                        <td className="px-2 py-1.5 font-medium text-slate-900">
                          {r.provider_name || <span className="text-rose-600">(blank)</span>}
                          {r._error && <span className="block text-[10px] text-rose-600">{r._error}</span>}
                        </td>
                        <td className="px-2 py-1.5 text-slate-600">{r.contact_person}</td>
                        <td className="px-2 py-1.5 text-slate-600">{r.email}</td>
                        <td className="px-2 py-1.5 text-slate-600">{r.roles_text}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">{r.default_rate ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 50 && (
                  <div className="px-2 py-1 text-[10px] text-slate-500 bg-slate-50 border-t">
                    + {rows.length - 50} more rows
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            onClick={runImport}
            disabled={rows.length === 0 || busy}
            className="bg-brand-primary hover:opacity-90"
          >
            {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            Import {rows.filter((r) => !r._error).length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ProtectedOutsourceProvidersPage() {
  return (
    // OUT-A (outsource-providers audit, OUT-2): admit sales_admin
    // (advise on per-event chef / florist / photographer) + region.
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.OWNER, UserRole.ADMIN, UserRole.SALES_ADMIN, UserRole.REGION_ADMIN]}>
      <ProvidersList />
    </ProtectedRoute>
  );
}
