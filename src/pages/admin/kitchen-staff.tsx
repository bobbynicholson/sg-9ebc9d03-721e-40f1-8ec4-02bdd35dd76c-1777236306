import { UserRole } from "@/types/app";
import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/router";
import { useSortable, type ColumnDef } from "@/lib/useSortable";
import { SortMenu } from "@/components/ui/sort-menu";
import { toLocalISO } from "@/lib/localDate";
import Head from "next/head";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ChefHat, UserPlus, Pencil, Archive, ArchiveRestore, Search, Phone, Mail,
  Banknote, Clock, AlertTriangle, ExternalLink, Download, X, RefreshCw,
  Users, Tag, MessageCircle, CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { formatZAR } from "@/lib/formatters";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader,
  PageWorkbench, PortalCard, StatTile,
} from "@/components/portal/ui";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useTenantHref } from "@/lib/tenantUrl";
import { useRegionFilter } from "@/contexts/RegionFilterContext";
import {
  kitchenStaffService,
  effectiveOvertimeRate,
  type KitchenStaffMember,
} from "@/services/kitchenStaffService";

const ROLE_TITLES = ["Chef", "Sous Chef", "Prep", "Cook", "Cold Prep", "Pack", "Plate", "Waiter", "Cleaner", "Shopper", "Driver Helper", "Other"];

const ALL_DEPARTMENTS = [
  { id: "kitchen",  label: "Kitchen"  },
  { id: "cleaning", label: "Cleaning" },
  { id: "shopping", label: "Shopping" },
  { id: "service",  label: "Service"  },
  { id: "office",   label: "Office"   },
] as const;

interface DraftStaff {
  full_name: string;
  role_title: string;
  phone: string;
  email: string;
  pay_type: "hourly" | "monthly" | "shift";
  hourly_rate: string;          // text inputs, parsed on submit
  overtime_rate: string;
  monthly_salary: string;
  shift_rate: string;
  standard_hours_per_day: string;
  departments: string[];
  id_number: string;
  start_date: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  notes: string;
  // STA-C: per-branch region. Empty string = unscoped (visible
  // everywhere); a uuid scopes the staff member to that region.
  region_id: string;
}

const EMPTY_DRAFT: DraftStaff = {
  full_name: "",
  role_title: "Chef",
  phone: "",
  email: "",
  pay_type: "hourly",
  hourly_rate: "",
  overtime_rate: "",
  monthly_salary: "",
  shift_rate: "",
  standard_hours_per_day: "9",
  departments: ["kitchen"],
  id_number: "",
  start_date: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  notes: "",
  region_id: "",
};

// STA-C: shape of the activity rollup the page renders per row.
interface StaffActivity {
  last_clocked_at: string | null;
  hours_this_month_min: number;
  unpaid_session_count: number;
}

function KitchenStaffPage() {
  const { user, profile } = useAuth();
  // Wave 27.3: tenant-slug wrapper for internal navigations.
  const { withSlug } = useTenantHref();
  const { toast } = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  // Silent-failure audit: the load-failure toast disappears; keep the
  // failure on screen with a Retry so an empty list can't read as
  // "no staff yet".
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [staff, setStaff] = useState<KitchenStaffMember[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  // Phase 26 #9: "/" or Cmd-F focuses the search input.
  // Phase 29 #5: "n" opens the Add staff dialog.
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.target instanceof HTMLTextAreaElement) return;
      // Command-centre audit (2026-07-02): widen the typing guards.
      // "n" pressed while focus sat on a select or inside an open
      // dialog used to yank the Add-staff dialog over whatever the
      // operator was doing (e.g. mid-archive confirmation).
      if (e.target instanceof HTMLSelectElement) return;
      if (e.target instanceof HTMLElement && e.target.isContentEditable) return;
      if (typeof document !== "undefined" && document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return;
      if (e.key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        openAdd();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Department filter - 'all' shows the company-wide hub view, picking
  // a department narrows to people whose departments[] includes it.
  // Seeded from `?department=` so deep-links from the per-team admin
  // pages (e.g. Cleaning team page -> "Cleaning staff" tile) land on
  // the right filter without an extra click.
  const [filterDept, setFilterDept] = useState<"all" | string>("all");
  useEffect(() => {
    if (!router.isReady) return;
    const dept = String(router.query.department || "").toLowerCase();
    if (dept && dept !== "all") setFilterDept(dept);
  }, [router.isReady, router.query.department]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<KitchenStaffMember | null>(null);
  const [draft, setDraft] = useState<DraftStaff>(EMPTY_DRAFT);
  const [error, setError] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<KitchenStaffMember | null>(null);
  const [inviteRole, setInviteRole] = useState<string>("kitchen_staff");
  const [inviting, setInviting] = useState(false);
  // STA-B intel: bulk-set-rates dialog. When the page loads with N
  // staff missing rates, the red banner offers a one-click "Bulk
  // set rates" flow - this dialog lists each rateless staff with
  // an inline hourly rate input and one Save fires them all.
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkRates, setBulkRates] = useState<Record<string, string>>({});
  const [bulkSaving, setBulkSaving] = useState(false);
  // Service-tab quick assignment: existing staff can be added to the
  // service roster without opening and re-saving the full staff form.
  const [serviceStaffId, setServiceStaffId] = useState("");
  const [addingServiceStaff, setAddingServiceStaff] = useState(false);

  const companyId = profile?.company_id;
  // STA-C: region scope from the global filter. When active we
  // narrow listStaffWithRates by region; the option list also
  // powers the per-staff Region select in the dialog.
  const { regionFilterId, options: regionOptions } = useRegionFilter();
  const [activity, setActivity] = useState<Map<string, StaffActivity>>(new Map());

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [list, rollup] = await Promise.all([
        kitchenStaffService.listStaffWithRates(companyId, {
          includeArchived: true,
          region_id: regionFilterId || null,
        }),
        kitchenStaffService.getStaffActivityRollup(companyId),
      ]);
      setStaff(list);
      setActivity(rollup);
    } catch (e: unknown) {
      setLoadError(dbErrorMessage(e, { entity: "staff member" }));
      toast({ title: "Could not load staff", description: dbErrorMessage(e, { entity: "staff member" }), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [companyId, regionFilterId]);

  // STA-B: realtime subscription. Pre-STA-B the list only refreshed
  // on mount or a manual Refresh click. A manager archiving someone
  // on the tablet would leave this surface stale. Debounced to
  // absorb the burst that follows a bulk-rate-save.
  useEffect(() => {
    if (!companyId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Random suffix so a second tab never collides on the channel
    // name (recurring realtime bug class).
    const channelSuffix = Math.random().toString(36).slice(2, 10);
    const channel = supabase
      .channel(`kitchen-staff:${companyId}:${channelSuffix}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "kitchen_staff_members", filter: `company_id=eq.${companyId}` },
        () => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => { void load(); }, 800);
        },
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // STA-B: bulk-rate handlers. Seed the input grid from current
  // rate values (which will be blank for rateless staff) so the
  // dialog opens with one input per row already focusable.
  const openBulkRates = () => {
    const active = staff.filter(s => s.is_active && !s.deleted_at && isStaffRateless(s));
    const seed: Record<string, string> = {};
    for (const s of active) seed[s.id] = "";
    setBulkRates(seed);
    setBulkOpen(true);
  };
  const handleBulkSave = async () => {
    const entries = Object.entries(bulkRates).filter(([, v]) => v.trim() !== "");
    if (entries.length === 0) {
      toast({ title: "Nothing to save", description: "Enter at least one rate first.", variant: "destructive" });
      return;
    }
    // Validate before firing - one bad input shouldn't save the rest.
    for (const [, raw] of entries) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        toast({ title: "Bad rate", description: `"${raw}" is not a positive number`, variant: "destructive" });
        return;
      }
    }
    setBulkSaving(true);
    let ok = 0;
    let failed = 0;
    for (const [staffId, raw] of entries) {
      const s = staff.find(x => x.id === staffId);
      if (!s) { failed += 1; continue; }
      const pt = s.pay_type || "hourly";
      const n = Number(raw);
      // Write the value into the right column for this person's
      // pay type. Monthly staff get monthly_salary, per-shift get
      // shift_rate, hourly get hourly_rate. The bulk dialog only
      // shows rateless rows so we never overwrite an existing rate.
      const payload: Record<string, unknown> = {
        id: staffId,
        company_id: s.company_id,
        full_name: s.full_name,
      };
      if (pt === "monthly") payload.monthly_salary = n;
      else if (pt === "shift") payload.shift_rate = n;
      else payload.hourly_rate = n;
      try {
        await kitchenStaffService.upsertStaff(payload as Parameters<typeof kitchenStaffService.upsertStaff>[0]);
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    setBulkSaving(false);
    toast({
      title: `${ok} rate${ok === 1 ? "" : "s"} saved${failed > 0 ? `, ${failed} failed` : ""}`,
      description: "Wage dashboard picks them up on next refresh.",
      variant: failed > 0 ? "destructive" : "default",
    });
    setBulkOpen(false);
    void load();
  };

  // Filtered view - search + archived toggle + department filter
  const visibleRaw = useMemo(() => {
    const term = search.trim().toLowerCase();
    return staff
      .filter(s => showArchived ? true : s.is_active && !s.deleted_at)
      .filter(s => filterDept === "all"
        ? true
        : Array.isArray(s.departments) && s.departments.includes(filterDept))
      .filter(s => !term
        || s.full_name.toLowerCase().includes(term)
        || (s.role_title || "").toLowerCase().includes(term)
        || (s.phone || "").toLowerCase().includes(term)
      );
  }, [staff, search, showArchived, filterDept]);

  // Column-style sort exposed via the SortMenu so the team can flip
  // by name, role, rate or status from a single dropdown.
  const staffSortColumns: ColumnDef<KitchenStaffMember>[] = useMemo(() => [
    { key: "name",   accessor: (s) => s.full_name,                                   type: "string" },
    { key: "role",   accessor: (s) => s.role_title || "",                            type: "string" },
    { key: "rate",   accessor: (s) => Number(s.hourly_rate ?? -1),                   type: "number" },
    { key: "status", accessor: (s) => (s.is_active && !s.deleted_at) ? "active" : "archived", type: "string" },
  ], []);
  const staffSort = useSortable<KitchenStaffMember>(visibleRaw, staffSortColumns, { defaultKey: "name", defaultDir: "asc" });
  const visible = staffSort.rows;

  // Headline stats: how many on the books, how many missing rates (a real
  // gap because the wage dashboard can't compute earnings without them).
  //
  // STA-B (staff audit, 2026-05-23): the missingRate count is now
  // pay-type aware. Pre-STA-B `s.hourly_rate == null` flagged
  // monthly-salaried staff (who legitimately have no hourly rate)
  // as "missing", inflating the count and making the warning meaningless.
  const isStaffRateless = (s: KitchenStaffMember): boolean => {
    const pt = s.pay_type || "hourly";
    if (pt === "hourly") return s.hourly_rate == null;
    if (pt === "monthly") return s.monthly_salary == null;
    if (pt === "shift") return s.shift_rate == null;
    return s.hourly_rate == null;
  };
  const stats = useMemo(() => {
    const active = staff.filter(s => s.is_active && !s.deleted_at);
    const missingRate = active.filter(isStaffRateless).length;
    const archived = staff.filter(s => !s.is_active || !!s.deleted_at).length;
    const ratelessNames = active.filter(isStaffRateless).map(s => s.full_name).slice(0, 5);
    // Command-centre audit (2026-07-02): portal-login split for the
    // stat row. Everyone else is clock-in only (manager clocks them).
    const portalLogins = active.filter(s => !!s.linked_profile_id).length;
    return {
      total: active.length,
      missingRate,
      archived,
      portalLogins,
      ratelessNames,
      ratelessMore: Math.max(0, active.filter(isStaffRateless).length - 5),
    };
  }, [staff]);

  const openAdd = () => {
    setEditTarget(null);
    // Starting an add flow from a department tab should carry that
    // department into the new row. Service is the important case here:
    // owners commonly open this page from the empty Service tab to add a
    // waiter/server, and defaulting to Kitchen made that easy to miss.
    const departmentDraft = filterDept !== "all" && ALL_DEPARTMENTS.some((d) => d.id === filterDept)
      ? {
          ...EMPTY_DRAFT,
          departments: [filterDept],
          role_title: filterDept === "service" ? "Waiter" : EMPTY_DRAFT.role_title,
        }
      : EMPTY_DRAFT;
    setDraft(departmentDraft);
    setError("");
    setDialogOpen(true);
  };

  // Keep every existing staff member in the Service-tab dropdown. People
  // already assigned to Service stay visible (and are marked/disabled) so
  // the dropdown is the complete roster, not a hidden filtered subset.
  const serviceStaffOptions = useMemo(
    () => staff
      .filter((s) => !s.deleted_at)
      .sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [staff],
  );

  const selectedServiceStaff = serviceStaffId
    ? staff.find((s) => s.id === serviceStaffId)
    : null;
  const selectedServiceAlreadyAssigned = !!selectedServiceStaff &&
    Array.isArray(selectedServiceStaff.departments) &&
    selectedServiceStaff.departments.includes("service");

  const addExistingStaffToService = async () => {
    if (!serviceStaffId) return;
    const target = staff.find((s) => s.id === serviceStaffId);
    if (!target) return;

    setAddingServiceStaff(true);
    try {
      const departments = Array.from(new Set([
        ...(Array.isArray(target.departments) ? target.departments : []),
        "service",
      ]));
      await kitchenStaffService.upsertStaff({
        id: target.id,
        company_id: target.company_id,
        full_name: target.full_name,
        departments,
        is_active: true,
        deleted_at: null,
      } as Parameters<typeof kitchenStaffService.upsertStaff>[0]);
      toast({
        title: "Added to Service",
        description: `${target.full_name} will now appear on the Service team roster.`,
      });
      setServiceStaffId("");
      await load();
    } catch (e: unknown) {
      toast({
        title: "Could not add to Service",
        description: dbErrorMessage(e, { entity: "staff member" }),
        variant: "destructive",
      });
    } finally {
      setAddingServiceStaff(false);
    }
  };

  const openEdit = (s: KitchenStaffMember) => {
    setEditTarget(s);
    setDraft({
      full_name: s.full_name || "",
      role_title: s.role_title || "Chef",
      phone: s.phone || "",
      email: s.email || "",
      pay_type: s.pay_type || "hourly",
      hourly_rate: s.hourly_rate != null ? String(s.hourly_rate) : "",
      overtime_rate: s.overtime_rate != null ? String(s.overtime_rate) : "",
      monthly_salary: s.monthly_salary != null ? String(s.monthly_salary) : "",
      shift_rate: s.shift_rate != null ? String(s.shift_rate) : "",
      standard_hours_per_day: String(s.standard_hours_per_day ?? 9),
      departments: Array.isArray(s.departments) && s.departments.length > 0 ? s.departments : ["kitchen"],
      id_number: s.id_number || "",
      start_date: s.start_date || "",
      emergency_contact_name: s.emergency_contact_name || "",
      emergency_contact_phone: s.emergency_contact_phone || "",
      notes: s.notes || "",
      region_id: s.region_id || "",
    });
    setError("");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!companyId) return;
    setError("");
    if (!draft.full_name.trim()) {
      setError("Full name is required");
      return;
    }
    const rate = draft.hourly_rate.trim() ? Number(draft.hourly_rate) : null;
    const otRate = draft.overtime_rate.trim() ? Number(draft.overtime_rate) : null;
    const stdHours = draft.standard_hours_per_day.trim() ? Number(draft.standard_hours_per_day) : 9;
    if (rate != null && (isNaN(rate) || rate < 0)) {
      setError("Hourly rate must be a positive number");
      return;
    }
    if (otRate != null && (isNaN(otRate) || otRate < 0)) {
      setError("Overtime rate must be a positive number");
      return;
    }
    if (isNaN(stdHours) || stdHours < 0 || stdHours > 24) {
      setError("Standard hours per day must be between 0 and 24");
      return;
    }

    const monthlySalary = draft.monthly_salary.trim() ? Number(draft.monthly_salary) : null;
    const shiftRate = draft.shift_rate.trim() ? Number(draft.shift_rate) : null;
    if (monthlySalary != null && (isNaN(monthlySalary) || monthlySalary < 0)) {
      setError("Monthly salary must be a positive number");
      return;
    }
    if (shiftRate != null && (isNaN(shiftRate) || shiftRate < 0)) {
      setError("Per-shift rate must be a positive number");
      return;
    }
    if (draft.pay_type === "monthly" && monthlySalary == null) {
      setError("Monthly salary is required when pay type is 'monthly'");
      return;
    }
    if (draft.pay_type === "shift" && shiftRate == null) {
      setError("Per-shift rate is required when pay type is 'shift'");
      return;
    }
    // STA-B: pre-STA-B the hourly path silently allowed saving with
    // a blank rate, which is why every new tenant ended up with
    // every staff row showing "Not set" and the wage dashboard
    // reading R0 for everyone. Require it now. If the operator
    // genuinely doesn't have a number yet they can pick Monthly or
    // Per shift with a placeholder, or leave the row archived.
    if (draft.pay_type === "hourly" && rate == null) {
      setError("Hourly rate is required when pay type is 'hourly'. Wage dashboard skips staff without a rate.");
      return;
    }
    const departments = draft.departments.length > 0 ? draft.departments : ["kitchen"];

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        company_id: companyId,
        full_name: draft.full_name.trim(),
        role_title: draft.role_title || null,
        phone: draft.phone.trim() || null,
        email: draft.email.trim() || null,
        pay_type: draft.pay_type,
        hourly_rate: rate,
        overtime_rate: otRate,
        monthly_salary: monthlySalary,
        shift_rate: shiftRate,
        standard_hours_per_day: stdHours,
        departments,
        id_number: draft.id_number.trim() || null,
        start_date: draft.start_date || null,
        emergency_contact_name: draft.emergency_contact_name.trim() || null,
        emergency_contact_phone: draft.emergency_contact_phone.trim() || null,
        notes: draft.notes.trim() || null,
        is_active: true,
        // STA-C: region scope. Empty string = unscoped (visible
        // across regions); a uuid pins the staff member to one
        // branch.
        region_id: draft.region_id || null,
      };
      if (editTarget) payload.id = editTarget.id;

      await kitchenStaffService.upsertStaff(payload as Parameters<typeof kitchenStaffService.upsertStaff>[0]);
      toast({
        title: editTarget ? "Staff updated" : "Staff added",
        description: draft.full_name,
      });
      setDialogOpen(false);
      load();
    } catch (e: unknown) {
      setError(dbErrorMessage(e, { entity: "staff member", fallback: "Could not save, check your inputs." }));
    } finally {
      setSaving(false);
    }
  };

  const handleSendInvite = async () => {
    if (!editTarget) return;
    if (!editTarget.email && !draft.email.trim()) {
      setError("Add an email first. The invite is sent there.");
      return;
    }
    setInviting(true);
    try {
      // If the email was changed in the draft but not yet saved, save it
      // first so the invite goes to the right address.
      if (draft.email.trim() && draft.email.trim() !== (editTarget.email || "")) {
        await kitchenStaffService.upsertStaff({
          id: editTarget.id,
          company_id: editTarget.company_id,
          full_name: editTarget.full_name,
          email: draft.email.trim(),
        } as Parameters<typeof kitchenStaffService.upsertStaff>[0]);
      }
      const res = await fetch(`/api/staff/${editTarget.id}/invite-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: inviteRole,
          redirectTo: typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Could not send invite");
      toast({
        title: "Portal invite sent",
        description: json.message || `Invite sent to ${draft.email || editTarget.email}`,
      });
      setDialogOpen(false);
      load();
    } catch (e: unknown) {
      setError(dbErrorMessage(e, { entity: "invite", fallback: "Could not send invite" }));
    } finally {
      setInviting(false);
    }
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    setSaving(true);
    try {
      await kitchenStaffService.archiveStaff(archiveTarget.id);
      toast({ title: "Staff archived", description: archiveTarget.full_name });
      setArchiveTarget(null);
      load();
    } catch (e: unknown) {
      toast({ title: "Could not archive", description: dbErrorMessage(e, { entity: "staff member" }), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async (s: KitchenStaffMember) => {
    setSaving(true);
    try {
      await kitchenStaffService.upsertStaff({
        id: s.id,
        company_id: s.company_id,
        full_name: s.full_name,
        is_active: true,
        deleted_at: null,
      } as Parameters<typeof kitchenStaffService.upsertStaff>[0]);
      toast({ title: "Restored", description: s.full_name });
      load();
    } catch (e: unknown) {
      toast({ title: "Could not restore", description: dbErrorMessage(e, { entity: "staff member" }), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    // STA-A (staff audit, STA-2): admin trio per cross-page
    // consistency. COMPANY_ADMIN was missing - same pattern as
    // ORD-6 / LDS-10 pre-fix.
    // Command-centre audit (2026-07-02): OWNER admitted. The owner
    // persona was the only baseline admin role bounced off their own
    // staff roster (every sibling admin page already admits OWNER).
    <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.COMPANY_ADMIN, UserRole.OWNER]} denyRoles={[UserRole.SUPER_ADMIN]}>
      <Head><title>Staff & rates - CateringMS</title></Head>
      <NoIndexMeta />
      <AdminNav />
      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">

          {/* STA-B: hero rebranded "Staff & rates" - the page
              covers Kitchen / Cleaning / Shopping / Service /
              Office, not just the kitchen. The Users icon
              replaces ChefHat for the same reason. */}
          <PortalHeader
            variant="hero"
            title={
              <span className="flex items-center gap-2">
                Staff &amp; rates
                <InfoTooltip content="Add the people working across kitchen, cleaning, shopping, service and office, set their rates and standard daily hours.\n\nThe department tablet boards show their tiles, one tap to clock them in, one to clock out.\n\nRates and wages stay on this and the wage dashboard. The team surfaces never see them." />
              </span>
            }
            icon={Users}
            subtitle="Your pay and clock-in roster. Add anyone you pay or clock in here (kitchen, cleaning, shopping, service, office), set pay type (hourly, monthly, or per shift) and standard hours. Note: people you invited as portal logins under Users do not appear here automatically, add them here too so their rates, hours and wages are tracked."
            meta={
              !loading && !loadError ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {stats.total} active staff
                  </span>
                  {stats.missingRate > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                      {stats.missingRate} missing a rate
                    </span>
                  )}
                  {stats.archived > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                      {stats.archived} archived
                    </span>
                  )}
                </>
              ) : undefined
            }
            actions={
            <>
              {/* Command-centre restructure (2026-07-02): the wage-
                  dashboard shortcut moved out of the old stat strip
                  into the hero actions. */}
              <Link href={withSlug("/admin/wages")}>
                <Button variant="outline">
                  <Banknote className="w-4 h-4 mr-2" />
                  Wage dashboard
                </Button>
              </Link>
              {/* Phase 28 #1: manual refresh. The roster loads once
                  on mount; a manager who has just added or
                  archived a staff member from another tab needs
                  to pick up the change. */}
              <Button
                variant="outline"
                onClick={load}
                disabled={loading}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              {/* Phase 20 #3: kitchen-staff CSV export. Owners and
                  payroll regularly need a flat roster (name +
                  contact + role + pay type + rate + departments)
                  for handover, audits, and payroll reconciliation
                  outside the app. Walks the sort + filter + search
                  applied 'visible' list. */}
              <Button
                variant="outline"
                onClick={() => {
                  if (visible.length === 0) {
                    toast({ title: "Nothing to export", description: "Adjust filters until at least one staff member is visible." });
                    return;
                  }
                  const esc = (v: any) => {
                    if (v == null) return "";
                    const s = String(v).replace(/"/g, '""');
                    return /[",\n]/.test(s) ? `"${s}"` : s;
                  };
                  const headers = [
                    "Name", "Role", "Phone", "Email", "Pay type",
                    "Hourly rate", "Overtime rate", "Monthly salary", "Shift rate",
                    "Std hours/day", "Departments", "Active", "Start date",
                  ];
                  const lines = [headers.join(",")];
                  for (const s of visible) {
                    lines.push([
                      esc(s.full_name || ""),
                      esc(s.role_title || ""),
                      esc(s.phone || ""),
                      esc(s.email || ""),
                      esc(s.pay_type || ""),
                      esc(s.hourly_rate ?? ""),
                      esc(s.overtime_rate ?? ""),
                      esc(s.monthly_salary ?? ""),
                      esc(s.shift_rate ?? ""),
                      esc(s.standard_hours_per_day ?? ""),
                      esc(Array.isArray(s.departments) ? s.departments.join("; ") : ""),
                      esc(s.is_active ? "yes" : "no"),
                      esc(s.start_date || ""),
                    ].join(","));
                  }
                  // STA-B: UTF-8 BOM so Excel-ZA renders the R
                  // symbol + non-ASCII names correctly.
                  const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `kitchen-staff-${toLocalISO(new Date())}.csv`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
              <Button onClick={openAdd} className="bg-brand-primary hover:opacity-90">
                <UserPlus className="w-4 h-4 mr-2" />
                Add staff
              </Button>
            </>
            }
          />
          <PageWorkbench />

          {/* STA-B: missing-rate banner. Pre-STA-B this was an amber
              tile that looked like every other stat; operators
              missed it and never realised the wage dashboard was
              reading R0 across the board. Now: a red banner that
              names names and offers a one-click bulk-set flow.
              Collapses to the secondary tile once < half are
              missing - by then it's a polish nag, not a page-
              defining bug. */}
          {stats.missingRate > 0 && stats.missingRate >= Math.ceil(stats.total / 2) && (
            <Alert variant="destructive" className="mb-5 border-rose-300 bg-rose-50">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <div className="font-semibold text-rose-900">
                  {stats.missingRate} of {stats.total} active staff have no rate set.
                </div>
                <p className="text-xs text-rose-800 mt-1">
                  The wage dashboard is calculating R0 for these people. Set rates so payroll, the cashflow forecast and the wage report all line up.
                </p>
                {stats.ratelessNames.length > 0 && (
                  <p className="text-xs text-rose-700 mt-1">
                    Missing: {stats.ratelessNames.join(", ")}
                    {stats.ratelessMore > 0 ? ` and ${stats.ratelessMore} more` : ""}.
                  </p>
                )}
                <div className="flex gap-2 mt-2">
                  <Button
                    size="sm"
                    className="bg-rose-600 hover:bg-rose-700 text-white"
                    onClick={openBulkRates}
                  >
                    Bulk-set rates
                  </Button>
                  <Link href={withSlug("/admin/wages")}>
                    <Button size="sm" variant="outline" className="border-rose-300 text-rose-800">
                      Open wage dashboard
                    </Button>
                  </Link>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Command-centre restructure (2026-07-02): the 3-card
              stat strip is now the standard StatTile row. The wage-
              dashboard shortcut that lived in the third card moved
              to the hero actions. A loading skeleton renders inside
              the shell so zeros never masquerade as real counts. */}
          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-xl border border-slate-200/90 bg-white/70 dark:border-slate-800 dark:bg-slate-900/60" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatTile
                label="Active staff"
                value={stats.total}
                icon={Users}
                hint="Across every department"
              />
              <StatTile
                label="Missing rate"
                value={stats.missingRate > 0
                  ? <span className="text-amber-700">{stats.missingRate}</span>
                  : stats.missingRate}
                icon={AlertTriangle}
                hint={stats.missingRate > 0
                  ? <span className="text-amber-700">Wage dashboard skips staff without rates</span>
                  : "Every active staffer has a rate"}
              />
              <StatTile
                label="Portal logins"
                value={stats.portalLogins}
                icon={ExternalLink}
                hint={`${Math.max(0, stats.total - stats.portalLogins)} clock-in only`}
              />
              <StatTile
                label="Archived"
                value={stats.archived}
                icon={Archive}
                hint="History kept on the wage dashboard"
              />
            </div>
          )}

          {/* Command-centre restructure (2026-07-02): department
              chips + search + archived toggle + sort grouped into
              ONE toolbar card instead of three loose rows. */}
          <PortalCard className="mb-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {([{ id: "all", label: "All staff" }, ...ALL_DEPARTMENTS] as const).map((d) => {
                const active = filterDept === d.id;
                const count = d.id === "all"
                  ? staff.filter((s) => s.is_active && !s.deleted_at).length
                  : staff.filter((s) =>
                      s.is_active && !s.deleted_at &&
                      Array.isArray(s.departments) &&
                      s.departments.includes(d.id),
                    ).length;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setFilterDept(d.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                      active
                        ? "bg-brand-primary/10 text-brand-primary border-brand-primary/20"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {d.label}
                    <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${active ? "bg-white/60" : "bg-slate-100 text-slate-600"}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
            {filterDept === "service" && (
              <div className="mb-3 rounded-lg border border-brand-primary/20 bg-brand-primary/5 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Label htmlFor="add-existing-service-staff" className="flex items-center gap-1 text-sm font-semibold text-slate-900">
                      Add existing staff to Service
                    </Label>
                    <select
                      id="add-existing-service-staff"
                      aria-label="Add existing staff to Service"
                      value={serviceStaffId}
                      onChange={(e) => setServiceStaffId(e.target.value)}
                      disabled={addingServiceStaff || serviceStaffOptions.length === 0}
                      className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      <option value="">
                        {serviceStaffOptions.length === 0
                          ? "No existing staff available"
                          : "Choose an existing staff member..."}
                      </option>
                      {serviceStaffOptions.map((candidate) => {
                        const alreadyAssigned = Array.isArray(candidate.departments) && candidate.departments.includes("service");
                        return (
                          <option key={candidate.id} value={candidate.id} disabled={alreadyAssigned}>
                            {candidate.full_name}
                            {candidate.role_title ? ` - ${candidate.role_title}` : ""}
                            {!candidate.is_active ? " - Inactive" : ""}
                            {alreadyAssigned ? " - Already in Service" : ""}
                          </option>
                        );
                      })}
                    </select>
                    <p className="text-xs text-slate-600">
                      This keeps their current departments and adds Service as an additional duty.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={addExistingStaffToService}
                    disabled={!serviceStaffId || selectedServiceAlreadyAssigned || addingServiceStaff}
                    className="h-9 bg-brand-primary text-white hover:opacity-90"
                  >
                    {addingServiceStaff ? "Adding..." : "Add to Service"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={openAdd}
                    className="h-9"
                  >
                    <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                    New staff
                  </Button>
                </div>
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, role or phone... (press /)"
                  className="pl-9 pr-9"
                />
                {/* Phase 25 #4: clear-search affordance. */}
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    title="Clear search"
                    aria-label="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-slate-200 bg-white">
                <Switch id="archived" checked={showArchived} onCheckedChange={setShowArchived} />
                <Label htmlFor="archived" className="text-sm text-slate-700 cursor-pointer select-none">
                  Show archived
                  {stats.archived > 0 && (
                    <span className="ml-1.5 text-xs text-slate-500">({stats.archived})</span>
                  )}
                </Label>
              </div>
              <SortMenu
                activeKey={staffSort.sortKey}
                activeDir={staffSort.sortDir}
                onPick={staffSort.setSort}
                options={[
                  { key: "name",   dir: "asc",  label: "Name (A to Z)" },
                  { key: "name",   dir: "desc", label: "Name (Z to A)" },
                  { key: "role",   dir: "asc",  label: "Role (A to Z)" },
                  { key: "rate",   dir: "desc", label: "Rate (high to low)" },
                  { key: "rate",   dir: "asc",  label: "Rate (low to high)" },
                  { key: "status", dir: "asc",  label: "Active first" },
                ]}
              />
            </div>
          </PortalCard>

          {/* Staff list */}
          <Card>
            <CardContent className="p-0">
              {loading ? (
                <div className="text-center py-12 text-slate-500 text-sm">Loading staff...</div>
              ) : loadError ? (
                <div className="text-center py-12">
                  <AlertTriangle className="w-10 h-10 text-rose-300 mx-auto mb-3" />
                  <p className="text-slate-700 font-medium">Could not load staff</p>
                  <p className="text-sm text-slate-500 mt-1">{loadError}</p>
                  <Button variant="outline" className="mt-4" onClick={load} disabled={loading}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Try again
                  </Button>
                </div>
              ) : visible.length === 0 ? (
                <div className="text-center py-12">
                  <ChefHat className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-700 font-medium">{staff.length === 0 ? "No staff yet" : "No matches"}</p>
                  <p className="text-sm text-slate-500 mt-1">
                    {staff.length === 0
                      ? "Add your first kitchen staff member to start tracking hours."
                      : "Try a different search or toggle archived staff."}
                  </p>
                  {staff.length === 0 && (
                    <Button className="mt-4" onClick={openAdd}>
                      <UserPlus className="w-4 h-4 mr-2" />Add your first staffer
                    </Button>
                  )}
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {visible.map((s) => {
                    const otRate = effectiveOvertimeRate(s);
                    const archived = !s.is_active || !!s.deleted_at;
                    // STA-B intel: per-row chips and per-row signals
                    // computed once.
                    const payType = s.pay_type || "hourly";
                    const isRateless = isStaffRateless(s);
                    const depts = Array.isArray(s.departments) ? s.departments : [];
                    // Onboarding completeness: rate + phone + email +
                    // ID + emergency contact + departments. Out of 6.
                    const completeness = [
                      !isRateless,
                      !!s.phone,
                      !!s.email,
                      !!s.id_number,
                      !!s.emergency_contact_phone,
                      depts.length > 0,
                    ].filter(Boolean).length;
                    const completePct = Math.round((completeness / 6) * 100);
                    // STA-C intel: per-row activity rollup. Last
                    // clocked + hours this month + unpaid sessions.
                    const act = activity.get(s.id);
                    return (
                      <li key={s.id} className={`p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${archived ? "opacity-60" : ""}`}>
                        <div className="w-10 h-10 rounded-full bg-brand-primary/10 flex items-center justify-center flex-shrink-0">
                          <ChefHat className="w-5 h-5 text-brand-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-slate-900 truncate">{s.full_name}</span>
                            {s.role_title && <Badge variant="outline" className="text-[10px]">{s.role_title}</Badge>}
                            {/* STA-B: pay-type chip - "Monthly" or
                                "Per shift" instead of leaving the
                                row to silently render the wrong
                                columns. Hourly stays unbadged (the
                                default + the columns are visible). */}
                            {payType === "monthly" && (
                              <Badge variant="outline" className="text-[10px] bg-brand-primary/10 text-brand-primary border-brand-primary/20">Monthly</Badge>
                            )}
                            {payType === "shift" && (
                              <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-700 border-slate-200">Per shift</Badge>
                            )}
                            {/* STA-B: department badges so the All
                                view tells the operator which team
                                each row belongs to. */}
                            {depts.length > 0 && (
                              <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-600 border-slate-200 inline-flex items-center gap-0.5">
                                <Tag className="w-2.5 h-2.5" />
                                {depts.slice(0, 2).map((d) => (ALL_DEPARTMENTS.find((x) => x.id === d)?.label || d)).join(" / ")}
                                {depts.length > 2 ? ` +${depts.length - 2}` : ""}
                              </Badge>
                            )}
                            {archived && <Badge variant="outline" className="text-[10px] bg-slate-100 text-slate-500">Archived</Badge>}
                            {s.linked_profile_id ? (
                              <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">Logs in</Badge>
                            ) : (
                              // STA-B: inverse signal. Pre-STA-B
                              // the "Logs in" pill only fired on
                              // staff with a portal login; staff
                              // without were unbadged, leaving the
                              // operator to guess the split. Now
                              // every row carries one or the other.
                              <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-500 border-slate-200">Clock-in only</Badge>
                            )}
                            {/* STA-B: rate-missing chip on the row
                                so the operator can fix it without
                                opening the dialog. */}
                            {!archived && isRateless && (
                              <Badge variant="outline" className="text-[10px] bg-rose-50 text-rose-700 border-rose-200 inline-flex items-center gap-0.5">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                Rate missing
                              </Badge>
                            )}
                            {/* STA-B: onboarding completeness chip.
                                Hidden once 100% so it doesn't add
                                noise. */}
                            {!archived && completePct < 100 && (
                              <span
                                className="text-[10px] text-slate-500 inline-flex items-center gap-0.5"
                                title={`Onboarding ${completePct}% complete. Missing: ${[
                                  isRateless ? "rate" : null,
                                  !s.phone ? "phone" : null,
                                  !s.email ? "email" : null,
                                  !s.id_number ? "ID number" : null,
                                  !s.emergency_contact_phone ? "emergency contact" : null,
                                  depts.length === 0 ? "department" : null,
                                ].filter(Boolean).join(", ") || "nothing"}.`}
                              >
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                {completePct}%
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                            {/* Phase 21 #9: click-to-copy phone +
                                email, same pattern as driver-
                                management. Kitchen leads paste
                                contact details into ops chats and
                                rostering messages constantly. */}
                            {s.phone && (
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    await navigator.clipboard.writeText(String(s.phone || ""));
                                    toast({ title: "Phone copied", description: s.phone });
                                  } catch {
                                    toast({ title: "Copy failed", description: "Browser blocked clipboard access.", variant: "destructive" });
                                  }
                                }}
                                className="inline-flex items-center gap-1 hover:underline hover:text-slate-700"
                                title="Copy phone number"
                              >
                                <Phone className="w-3 h-3" />{s.phone}
                              </button>
                            )}
                            {s.email && (
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    await navigator.clipboard.writeText(String(s.email || ""));
                                    toast({ title: "Email copied", description: s.email });
                                  } catch {
                                    toast({ title: "Copy failed", description: "Browser blocked clipboard access.", variant: "destructive" });
                                  }
                                }}
                                className="inline-flex items-center gap-1 hover:underline hover:text-slate-700"
                                title="Copy email"
                              >
                                <Mail className="w-3 h-3" />{s.email}
                              </button>
                            )}
                            {/* STA-B: deep-link quick actions next
                                to the click-to-copy buttons above.
                                Same pattern contacts page uses for
                                client rows. */}
                            {s.phone && (
                              <a
                                href={`tel:${String(s.phone).replace(/[^+\d]/g, "")}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-slate-500 hover:text-slate-800"
                                title={`Call ${s.phone}`}
                                aria-label={`Call ${s.full_name}`}
                              >
                                <Phone className="w-3 h-3" />
                              </a>
                            )}
                            {s.phone && (
                              <a
                                href={`https://wa.me/${String(s.phone).replace(/[^\d]/g, "")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-brand-primary hover:text-brand-primary"
                                title={`WhatsApp ${s.full_name}`}
                                aria-label={`WhatsApp ${s.full_name}`}
                              >
                                <MessageCircle className="w-3 h-3" />
                              </a>
                            )}
                            {s.email && (
                              <a
                                href={`mailto:${s.email}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-slate-500 hover:text-slate-800"
                                title={`Email ${s.email}`}
                                aria-label={`Email ${s.full_name}`}
                              >
                                <Mail className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                          {/* STA-C: activity rollup strip. Last
                              clocked + hours this month + unpaid
                              session count. Hidden when the staff
                              member has no recorded activity, so a
                              brand-new staff member doesn't show
                              "0h this month, never clocked" noise. */}
                          {!archived && act && (act.last_clocked_at || act.hours_this_month_min > 0 || act.unpaid_session_count > 0) && (
                            <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                              {act.last_clocked_at ? (
                                (() => {
                                  const daysSince = Math.floor((Date.now() - new Date(act.last_clocked_at).getTime()) / 86_400_000);
                                  const stale = daysSince >= 60;
                                  return (
                                    <span
                                      className={stale ? "text-amber-700" : ""}
                                      title={`Last clocked ${new Date(act.last_clocked_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}`}
                                    >
                                      <Clock className="w-3 h-3 inline mr-0.5" />
                                      Last clocked {daysSince === 0 ? "today" : daysSince === 1 ? "yesterday" : `${daysSince}d ago`}
                                      {stale ? " - ghost?" : ""}
                                    </span>
                                  );
                                })()
                              ) : null}
                              {act.hours_this_month_min > 0 && (
                                <span title="Total clocked time this calendar month">
                                  {(act.hours_this_month_min / 60).toFixed(1)}h this month
                                </span>
                              )}
                              {act.unpaid_session_count > 0 && (
                                <Link
                                  href={withSlug(`/admin/wages?staffId=${s.id}`)}
                                  className="text-rose-700 hover:underline inline-flex items-center gap-0.5"
                                  title="Open the wage dashboard scoped to this person to process their unpaid sessions."
                                >
                                  <AlertTriangle className="w-3 h-3" />
                                  {act.unpaid_session_count} unpaid session{act.unpaid_session_count === 1 ? "" : "s"}
                                </Link>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          {/* STA-B: pay-type-aware column block.
                              Pre-STA-B every row rendered the
                              hourly Standard/Overtime/Std-day
                              columns, so monthly + per-shift staff
                              showed "Not set" forever. */}
                          {payType === "hourly" && (
                            <>
                              <div className="text-right">
                                <div className="text-[10px] uppercase tracking-wider text-slate-500">Standard</div>
                                <div className="font-semibold text-slate-900 tabular-nums">
                                  {s.hourly_rate != null ? `${formatZAR(Number(s.hourly_rate))}/h` : <span className="text-rose-600">Not set</span>}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-[10px] uppercase tracking-wider text-slate-500">Overtime</div>
                                <div className="font-semibold text-slate-900 tabular-nums">
                                  {otRate != null ? `${formatZAR(otRate)}/h` : "-"}
                                </div>
                              </div>
                              <div className="text-right hidden sm:block">
                                <div className="text-[10px] uppercase tracking-wider text-slate-500 inline-flex items-center gap-0.5">
                                  Std day
                                  <InfoTooltip content="Anything above this in a single day flips to overtime. SA BCEA default is 9h." />
                                </div>
                                <div className="font-semibold text-slate-900 tabular-nums">{s.standard_hours_per_day}h</div>
                              </div>
                            </>
                          )}
                          {payType === "monthly" && (
                            <div className="text-right">
                              <div className="text-[10px] uppercase tracking-wider text-slate-500">Monthly salary</div>
                              <div className="font-semibold text-slate-900 tabular-nums">
                                {s.monthly_salary != null ? formatZAR(Number(s.monthly_salary)) : <span className="text-rose-600">Not set</span>}
                              </div>
                            </div>
                          )}
                          {payType === "shift" && (
                            <div className="text-right">
                              <div className="text-[10px] uppercase tracking-wider text-slate-500">Per shift</div>
                              <div className="font-semibold text-slate-900 tabular-nums">
                                {s.shift_rate != null ? formatZAR(Number(s.shift_rate)) : <span className="text-rose-600">Not set</span>}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEdit(s)}>
                            <Pencil className="w-3 h-3 mr-1" />Edit
                          </Button>
                          {archived ? (
                            <Button variant="outline" size="sm" onClick={() => handleRestore(s)} disabled={saving}>
                              <ArchiveRestore className="w-3 h-3 mr-1" />Restore
                            </Button>
                          ) : (
                            <Button variant="outline" size="sm" onClick={() => setArchiveTarget(s)} className="text-rose-700 border-rose-200 hover:bg-rose-50">
                              <Archive className="w-3 h-3 mr-1" />Archive
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </PortalShell>

        <Footer />
      </div>

      {/* Add / Edit dialog. The form body is long enough on a phone /
          short laptop that the Save button slid below the fold, so the
          dialog is now flex-col with max-h-[90vh]: header pinned at the
          top, body scrolls in the middle, footer pinned at the bottom.
          Save is always reachable without scrolling. */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-3 flex-shrink-0">
            <DialogTitle>{editTarget ? "Edit staff" : "Add staff"}</DialogTitle>
            <DialogDescription>
              Rates only show on this page and the wage dashboard. The kitchen tablet sees names and on-duty status, never rand values.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-3 space-y-4">

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Full name *</Label>
              <Input
                value={draft.full_name}
                onChange={(e) => setDraft({ ...draft, full_name: e.target.value })}
                placeholder="e.g. Sipho Khumalo"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>Role</Label>
              <select
                value={draft.role_title}
                onChange={(e) => setDraft({ ...draft, role_title: e.target.value })}
                className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
              >
                {ROLE_TITLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                placeholder="+27 ..."
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Email (optional)</Label>
              <Input
                type="email"
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                placeholder="staff@example.com"
              />
            </div>

            {/* STA-C: per-branch region select. Hidden when the
                tenant only has one branch (no point picking from a
                list of one). NULL means "visible in every region",
                which is the default for single-branch tenants and
                the safe fallback for unscoped staff. */}
            {regionOptions.length > 1 && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="flex items-center gap-1">
                  Branch / region
                  <InfoTooltip content="Pin this staff member to one branch so a manager viewing another branch doesn't see them. Leave on 'Visible everywhere' if they work across branches." />
                </Label>
                <select
                  value={draft.region_id}
                  onChange={(e) => setDraft({ ...draft, region_id: e.target.value })}
                  className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="">Visible everywhere</option>
                  {regionOptions.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="flex items-center gap-1">
                Departments
                <InfoTooltip content="Which duty boards this person appears on. Tick more than one if they cross over (e.g. kitchen + cleaning)." />
              </Label>
              <div className="flex flex-wrap gap-2">
                {ALL_DEPARTMENTS.map((d) => {
                  const checked = draft.departments.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setDraft((prev) => ({
                        ...prev,
                        departments: checked
                          ? prev.departments.filter((x) => x !== d.id)
                          : [...prev.departments, d.id],
                      }))}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                        checked
                          ? "bg-brand-primary/10 text-brand-primary border-brand-primary/20"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="flex items-center gap-1">
                Pay type
                <InfoTooltip content={"Hourly: paid per clocked hour, with a 1.5x overtime split after the daily threshold.\n\nMonthly: flat salary regardless of hours. Clocked time still tracked for attendance.\n\nShift: flat fee per shift completed (e.g. R200 per shift no matter how long)."} />
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {(["hourly", "monthly", "shift"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setDraft({ ...draft, pay_type: p })}
                    className={`px-3 py-2 rounded-md text-sm font-semibold border transition-all ${
                      draft.pay_type === p
                        ? "bg-brand-primary/10 text-brand-primary border-brand-primary/20"
                        : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {p === "hourly" ? "Hourly" : p === "monthly" ? "Monthly" : "Per shift"}
                  </button>
                ))}
              </div>
            </div>

            {draft.pay_type === "hourly" && (
              <>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1">
                    <Banknote className="w-3 h-3" />Hourly rate (R)
                  </Label>
                  <Input
                    type="number" step="0.01" min="0"
                    value={draft.hourly_rate}
                    onChange={(e) => setDraft({ ...draft, hourly_rate: e.target.value })}
                    placeholder="80"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1">
                    <Banknote className="w-3 h-3" />Overtime rate (R)
                    <InfoTooltip content="Optional. Leave blank for the SA default of 1.5x the hourly rate (BCEA ordinary overtime)." />
                  </Label>
                  <Input
                    type="number" step="0.01" min="0"
                    value={draft.overtime_rate}
                    onChange={(e) => setDraft({ ...draft, overtime_rate: e.target.value })}
                    placeholder="1.5x rate if blank"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />Standard hours per day
                    <InfoTooltip content="Anything worked above this in a single day is logged as overtime. SA default is 9 hours per the BCEA." />
                  </Label>
                  <Input
                    type="number" step="0.5" min="0" max="24"
                    value={draft.standard_hours_per_day}
                    onChange={(e) => setDraft({ ...draft, standard_hours_per_day: e.target.value })}
                    placeholder="9"
                  />
                </div>
              </>
            )}

            {draft.pay_type === "monthly" && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="flex items-center gap-1">
                  <Banknote className="w-3 h-3" />Monthly salary (R)
                  <InfoTooltip content="Flat amount paid per month regardless of clocked hours. Wage dashboard prorates for partial windows." />
                </Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={draft.monthly_salary}
                  onChange={(e) => setDraft({ ...draft, monthly_salary: e.target.value })}
                  placeholder="e.g. 18000"
                />
              </div>
            )}

            {draft.pay_type === "shift" && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="flex items-center gap-1">
                  <Banknote className="w-3 h-3" />Per-shift rate (R)
                  <InfoTooltip content="Flat fee paid per shift completed, regardless of length. Useful for casual / piece-work staff." />
                </Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={draft.shift_rate}
                  onChange={(e) => setDraft({ ...draft, shift_rate: e.target.value })}
                  placeholder="e.g. 250"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>SA ID / passport</Label>
              <Input
                value={draft.id_number}
                onChange={(e) => setDraft({ ...draft, id_number: e.target.value })}
                placeholder="Optional, for tax / UIF"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Start date</Label>
              <Input
                type="date"
                value={draft.start_date}
                onChange={(e) => setDraft({ ...draft, start_date: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Emergency contact name</Label>
              <Input
                value={draft.emergency_contact_name}
                onChange={(e) => setDraft({ ...draft, emergency_contact_name: e.target.value })}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Emergency contact phone</Label>
              <Input
                value={draft.emergency_contact_phone}
                onChange={(e) => setDraft({ ...draft, emergency_contact_phone: e.target.value })}
                placeholder="Optional"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Notes (optional)</Label>
              <Textarea
                rows={2}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder="Allergies, certifications, anything worth remembering"
              />
            </div>
          </div>

          {/* Portal access - only meaningful when editing an existing
              row (we need an id) and when the staff member doesn't
              already have a login linked. */}
          {editTarget && !editTarget.linked_profile_id && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 mt-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-900">Portal access</p>
                  <p className="text-xs text-slate-600">
                    Most kitchen / cleaning staff don&apos;t need a login. The manager clocks them in. Invite this person only if they need to log in themselves (e.g. sous chef, head cleaner).
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Login role</Label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-200 bg-white px-3 text-sm"
                  >
                    <option value="kitchen_manager">Kitchen manager</option>
                    <option value="kitchen_staff">Kitchen staff</option>
                    <option value="cleaning_manager">Cleaning manager</option>
                    <option value="cleaning_staff">Cleaning staff</option>
                    <option value="shopping_staff">Shopping staff</option>
                    <option value="driver">Driver</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSendInvite}
                  disabled={inviting || saving || (!editTarget.email && !draft.email.trim())}
                  className="border-brand-primary/30 text-brand-primary hover:bg-brand-primary/10"
                >
                  {inviting ? "Sending..." : "Send portal invite"}
                </Button>
              </div>
            </div>
          )}
          {editTarget && editTarget.linked_profile_id && (
            <div className="rounded-lg border border-brand-primary/20 bg-brand-primary/10 p-3 mt-3">
              <p className="text-sm font-semibold text-brand-primary">Portal access linked</p>
              <p className="text-xs text-brand-primary mt-0.5">
                This staff member has a portal login. Manage roles + permissions on{" "}
                <Link href={withSlug("/admin/users")} className="underline">Users</Link>.
              </p>
            </div>
          )}

          </div>

          <DialogFooter className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0 bg-white dark:bg-slate-900 sm:rounded-b-lg">
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-brand-primary hover:opacity-90">
              {saving ? "Saving..." : editTarget ? "Save changes" : "Add staff"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* STA-B: bulk-set rates dialog. Triggered by the red banner.
          Lists every rateless active staff member with an inline
          rate input; one Save fires every non-empty row through
          upsertStaff. The pay-type chip + role badge tell the
          operator who they're looking at so the same rate doesn't
          get pasted on a monthly-salaried row by accident. */}
      <Dialog open={bulkOpen} onOpenChange={(open) => { setBulkOpen(open); if (!open) setBulkRates({}); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk-set hourly rates</DialogTitle>
            <DialogDescription>
              One input per rateless staff member. Leave any row blank to skip it. Save fires them all in one go and the wage dashboard picks them up on next refresh.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-y-auto -mx-1 px-1 space-y-2">
            {Object.keys(bulkRates).length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-6">No rateless staff. You&apos;re done.</p>
            ) : (
              Object.keys(bulkRates).map((staffId) => {
                const s = staff.find((x) => x.id === staffId);
                if (!s) return null;
                const payType = s.pay_type || "hourly";
                return (
                  <div key={staffId} className="flex items-center gap-2 p-2 rounded-md border border-slate-200">
                    <div className="w-7 h-7 rounded-full bg-brand-primary/10 flex items-center justify-center shrink-0">
                      <ChefHat className="w-3.5 h-3.5 text-brand-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{s.full_name}</div>
                      <div className="text-[10px] text-slate-500 inline-flex items-center gap-1 flex-wrap">
                        {s.role_title && <span>{s.role_title}</span>}
                        {payType !== "hourly" && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0">
                            {payType === "monthly" ? "Monthly" : "Per shift"}
                          </Badge>
                        )}
                        {Array.isArray(s.departments) && s.departments.length > 0 && (
                          <span className="text-slate-400">
                            {s.departments.slice(0, 2).map((d) => ALL_DEPARTMENTS.find((x) => x.id === d)?.label || d).join(" / ")}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={bulkRates[staffId] || ""}
                        onChange={(e) => setBulkRates((prev) => ({ ...prev, [staffId]: e.target.value }))}
                        placeholder={payType === "hourly" ? "R/h" : payType === "monthly" ? "R/mo" : "R/shift"}
                        className="w-24 h-8 text-sm"
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={bulkSaving}>Cancel</Button>
            <Button
              onClick={handleBulkSave}
              disabled={bulkSaving || Object.values(bulkRates).every((v) => !v.trim())}
              className="bg-brand-primary hover:opacity-90"
            >
              {bulkSaving ? "Saving..." : "Save rates"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive confirmation */}
      <AlertDialog open={!!archiveTarget} onOpenChange={(open) => { if (!open) setArchiveTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {archiveTarget?.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They'll disappear from the kitchen tablet but their shift history stays on the wage dashboard. You can restore them anytime by toggling "Show archived".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleArchive} className="bg-rose-600 hover:bg-rose-700">Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ProtectedRoute>
  );
}

export default KitchenStaffPage;
