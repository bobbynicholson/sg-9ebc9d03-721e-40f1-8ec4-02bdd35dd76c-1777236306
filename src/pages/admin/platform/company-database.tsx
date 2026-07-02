import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { useAuth } from "@/contexts/AuthContext";
import { PlatformNav } from "@/components/admin/PlatformNav";
import { PortalShell, PortalHeader, PortalCard, PortalCardHeader, StatTile,
  PageWorkbench,
} from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Building2, Search, Users, Calendar, MapPin, Edit, Trash2, Eye, CheckCircle, RefreshCw, X } from "lucide-react";
import { companyService } from "@/services/companyService";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useSortable, type ColumnDef } from "@/lib/useSortable";
import { SortHeader } from "@/components/ui/sort-header";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { AddEditCompanyDialog } from "@/components/admin/company-database/AddEditCompanyDialog";
import { CompanyDetailsModal } from "@/components/admin/company-database/CompanyDetailsModal";
import { CompanyStatusBadge } from "@/components/admin/company-database/CompanyStatusBadge";
import type { Company } from "@/components/admin/company-database/types";

// Company + CompanyFormData types now live in
// @/components/admin/company-database/types so the dialog sub-components
// can share the same shape without circular imports (P2-13 split).

// Super-admin gate. Standard ProtectedRoute wrapper replaces the old
// bespoke inline role check + Access Denied card, so denial handling is
// consistent with every other platform page.
export default function ProtectedCompanyDatabasePage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
      <CompanyDatabasePage />
    </ProtectedRoute>
  );
}

function CompanyDatabasePage() {
  const { profile, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  // Silent-failure audit: a failed load used to toast once and then show
  // an empty "No companies found" table. Persist the error instead.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deletingCompanyId, setDeletingCompanyId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  // Deep-link target row. Subscription management's "View company"
  // button (and any future caller) lands us here with ?company=<id>.
  // We scroll the row into view, pulse an amber ring, and surface a
  // filter pill so the operator can drop the focus and see the rest.
  const [focusedCompanyId, setFocusedCompanyId] = useState<string | null>(null);
  
  // Add/Edit company modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);
  const [formData, setFormData] = useState({
    company_name: "",
    company_slug: "",
    email: "",
    phone: "",
    address_line1: "",
    address_line2: "",
    city: "",
    state: "",
    postal_code: "",
    country: "South Africa",
    billing_currency: "ZAR",
    admin_name: "",
    admin_email: "",
    admin_password: "", // generated server-side, returned once
  });

  // Company details modal
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [companyUsers, setCompanyUsers] = useState<any[]>([]);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  useEffect(() => {
    // ProtectedRoute already guarantees super_admin; just wait for the
    // profile to hydrate before fetching.
    if (profile) {
      loadCompanies();
    }
  }, [profile]);

  // Honour ?company=<id> from subscription-management's "View company"
  // CTA. Wait until the rows are loaded, then scroll the matching
  // TableRow into view and flash an amber ring for a few seconds.
  useEffect(() => {
    if (!router.isReady) return;
    const target = router.query.company;
    if (!target || typeof target !== "string") return;
    if (loading || companies.length === 0) return;
    if (!companies.some((c) => c.id === target)) return;

    setFocusedCompanyId(target);

    const t = setTimeout(() => {
      const el = typeof document !== "undefined"
        ? document.getElementById(`company-row-${target}`)
        : null;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);

    const clearT = setTimeout(() => setFocusedCompanyId(null), 4000);

    return () => {
      clearTimeout(t);
      clearTimeout(clearT);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.company, loading, companies]);

  const clearCompanyFilter = () => {
    setFocusedCompanyId(null);
    const { company: _drop, ...rest } = router.query;
    router.replace(
      { pathname: router.pathname, query: rest },
      undefined,
      { shallow: true },
    );
  };

  const focusedCompany = focusedCompanyId
    ? companies.find((c) => c.id === focusedCompanyId)
    : null;

  // Status filter applied first; the fuzzy hook ranks the remainder.
  // Super-admin tool, so no company_id scoping (sees every tenant).
  const statusFilteredCompanies = useMemo(() => {
    return statusFilter === "all"
      ? companies
      : companies.filter((c: any) => c.subscription_status === statusFilter);
  }, [companies, statusFilter]);

  const fuzzyCompanies = useFuzzyItems(
    statusFilteredCompanies,
    searchTerm,
    [
      { key: "company_name" as any, weight: 3 },
      { key: "company_slug" as any, weight: 2 },
      { key: "email" as any, weight: 2 },
    ],
    { limit: 0 },
  );

  // Layered column sort. Defaults to newest signups first so the
  // platform owner sees fresh tenants without scrolling.
  const companySortColumns: ColumnDef<any>[] = useMemo(() => [
    { key: "company",  accessor: (c) => c.company_name,                                  type: "string" },
    { key: "owner",    accessor: (c) => c.owner_name || c.email || "",                   type: "string" },
    { key: "location", accessor: (c) => `${c.country || ""} ${c.city || ""}`,            type: "string" },
    { key: "status",   accessor: (c) => (c.subscription_status || "").toLowerCase(),     type: "string" },
    // Rows store the enhanced counts as total_users / total_orders (see
    // loadCompanies), so the accessors must read those keys or the
    // Users / Orders sort is inert.
    { key: "users",    accessor: (c) => Number(c.total_users || 0),                      type: "number" },
    { key: "orders",   accessor: (c) => Number(c.total_orders || 0),                     type: "number" },
    { key: "created",  accessor: (c) => c.created_at,                                    type: "date"   },
  ], []);
  const sortedCompanies = useSortable<any>(fuzzyCompanies, companySortColumns, { defaultKey: "created", defaultDir: "desc" });
  const filteredCompanies = sortedCompanies.rows;

  // Shared by the hero meta chips and the Active stat tile so the two
  // surfaces can never disagree.
  const activeCompanyCount = useMemo(
    () => companies.filter((c) => c.subscription_status === "active").length,
    [companies],
  );

  const loadCompanies = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const { data: companiesData, error } = await supabase
        .from("companies")
        .select(`
          *,
          profiles!companies_owner_id_fkey(full_name)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Enhance with per-tenant user/order counts. Two grouped queries
      // across every company id instead of the old per-company head
      // counts (which fired 2N requests and hammered PostgREST).
      const companyIds = (companiesData || []).map((c: any) => c.id);
      const userCounts = new Map<string, number>();
      const orderCounts = new Map<string, number>();
      if (companyIds.length > 0) {
        const [profilesRes, ordersRes] = await Promise.all([
          supabase.from("profiles").select("company_id").in("company_id", companyIds),
          supabase.from("orders").select("company_id").in("company_id", companyIds),
        ]);
        if (profilesRes.error) throw profilesRes.error;
        if (ordersRes.error) throw ordersRes.error;
        (profilesRes.data || []).forEach((row: any) => {
          if (row.company_id) userCounts.set(row.company_id, (userCounts.get(row.company_id) || 0) + 1);
        });
        (ordersRes.data || []).forEach((row: any) => {
          if (row.company_id) orderCounts.set(row.company_id, (orderCounts.get(row.company_id) || 0) + 1);
        });
      }

      const enhanced = (companiesData || []).map((company: any) => ({
        ...company,
        // companies stores the tenant slug in `slug`; the UI shape
        // (and the add/edit form) call it company_slug. Normalise
        // here so /{slug} chips and the edit dialog show the truth.
        company_slug: company.company_slug || company.slug || "",
        owner_name: company.profiles?.full_name || "Unknown",
        total_users: userCounts.get(company.id) || 0,
        total_orders: orderCounts.get(company.id) || 0,
      }));

      setCompanies(enhanced);
    } catch (error: any) {
      console.error("Error loading companies:", error);
      // Persistent banner (see loadError Alert below); a toast alone
      // vanished and left a misleading empty table behind it.
      setLoadError(dbErrorMessage(error, { entity: "company", fallback: "Couldn't load the company database. Please try again." }));
    } finally {
      setLoading(false);
    }
  };

  // (filterCompanies replaced by useMemo + useFuzzyItems above.)

  const handleAddCompany = async () => {
    try {
      if (!formData.company_name || !formData.admin_email) {
        toast({
          title: "Missing Information",
          description: "Company name and admin email are required",
          variant: "destructive",
        });
        return;
      }

      // Generate slug if not provided
      const slug =
        formData.company_slug ||
        formData.company_name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "");

      // Create company and admin user
      const result = await companyService.createCompanyWithAdmin({
        company_name: formData.company_name,
        company_slug: slug,
        email: formData.email,
        phone: formData.phone,
        address_line1: formData.address_line1,
        address_line2: formData.address_line2,
        city: formData.city,
        state: formData.state,
        postal_code: formData.postal_code,
        country: formData.country,
        billing_currency: formData.billing_currency,
        admin_name: formData.admin_name || "Admin",
        admin_email: formData.admin_email,
        admin_password: formData.admin_password,
      });

      if (result.success) {
        toast({
          title: "Success",
          description: `Company "${formData.company_name}" created successfully!`,
        });

        setIsAddModalOpen(false);
        resetForm();
        loadCompanies();
      } else {
        throw new Error(result.error || "Failed to create company");
      }
    } catch (error: any) {
      console.error("Error creating company:", error);
      toast({
        title: "Error",
        description: dbErrorMessage(error, { entity: "company" }),
        variant: "destructive",
      });
    }
  };

  const handleUpdateCompany = async () => {
    try {
      if (!editingCompany) return;

      const { error } = await supabase
        .from("companies")
        .update({
          company_name: formData.company_name,
          email: formData.email,
          phone: formData.phone,
          address_line1: formData.address_line1,
          address_line2: formData.address_line2,
          city: formData.city,
          state_province: formData.state,
          postal_code: formData.postal_code,
          country: formData.country,
          billing_currency: formData.billing_currency,
        } as any)
        .eq("id", editingCompany.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Company updated successfully!",
      });

      setIsAddModalOpen(false);
      setEditingCompany(null);
      resetForm();
      loadCompanies();
    } catch (error: any) {
      console.error("Error updating company:", error);
      toast({
        title: "Error",
        description: "Failed to update company",
        variant: "destructive",
      });
    }
  };

  const handleDeleteCompany = async (companyId: string, companyName: string) => {
    if (deletingCompanyId) return;

    if (!confirm(`Delete "${companyName}" and all company data? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeletingCompanyId(companyId);
      const response = await fetch("/api/admin/platform/delete-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result?.error || "Failed to delete company");
      }

      const authFailures = Array.isArray(result?.authDeleteFailures)
        ? result.authDeleteFailures.length
        : 0;

      toast({
        title: "Company deleted",
        description: authFailures > 0
          ? `"${companyName}" was deleted, but ${authFailures} auth account${authFailures === 1 ? "" : "s"} need manual cleanup.`
          : `"${companyName}" and its related data were deleted.`,
      });

      setCompanies((prev) => prev.filter((company) => company.id !== companyId));
      await loadCompanies();
    } catch (error: any) {
      console.error("Error deleting company:", error);
      toast({
        title: "Couldn't delete company",
        description: error?.message || "Failed to delete company",
        variant: "destructive",
      });
    } finally {
      setDeletingCompanyId(null);
    }
  };

  const handleViewCompany = async (company: Company) => {
    try {
      setSelectedCompany(company);
      
      // Load company users
      const { data: users, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setCompanyUsers(users || []);
      setIsDetailsModalOpen(true);
    } catch (error: any) {
      console.error("Error loading company details:", error);
      toast({
        title: "Error",
        description: "Failed to load company details",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      company_name: "",
      company_slug: "",
      email: "",
      phone: "",
      address_line1: "",
      address_line2: "",
      city: "",
      state: "",
      postal_code: "",
      country: "South Africa",
      billing_currency: "ZAR",
      admin_name: "",
      admin_email: "",
      admin_password: "", // generated server-side, returned once
    });
  };

  const openEditModal = (company: Company) => {
    setEditingCompany(company);
    setFormData({
      company_name: company.company_name,
      company_slug: company.company_slug,
      email: company.email,
      phone: company.phone,
      address_line1: company.address_line1,
      address_line2: "",
      city: company.city,
      state: "",
      postal_code: "",
      country: company.country,
      billing_currency: "ZAR",
      admin_name: "",
      admin_email: "",
      admin_password: "", // generated server-side, returned once
    });
    setIsAddModalOpen(true);
  };

  // getStatusBadge moved to CompanyStatusBadge component (P2-13 split).

  // Wait for the auth context before judging the role - rendering the
  // denial while profile is still null flashed "Access Denied" at real
  // super admins on every hard load. A null profile means hydration is
  // still settling (middleware already bounces signed-out visitors), so
  // treat it as loading too, not as a role failure.
  if (authLoading || !profile) {
    return (
      <div className="admin-page-shell">
        <PlatformNav />
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <div className="flex items-center justify-center py-24">
            <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        </PortalShell>
      </div>
    );
  }

  return (
    <div className="admin-page-shell">
      <Head>
        <title>Company database - CateringMS</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <PlatformNav />

      <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
        <PortalHeader
          variant="hero"
          title="Company Management"
          subtitle="Add and manage catering companies on the platform"
          icon={Building2}
          meta={
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                {companies.length} {companies.length === 1 ? "company" : "companies"}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {activeCompanyCount} active
              </span>
            </>
          }
        />
        <PageWorkbench />

        {/* Load-failure banner: without it a failed fetch rendered an
            empty "No companies found" table that looked legitimate. */}
        {loadError && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>{loadError}</span>
              <Button variant="outline" size="sm" onClick={loadCompanies}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <StatTile
            label="Total Companies"
            value={companies.length}
            hint="Every tenant; deleted excluded"
            icon={Building2}
          />
          <StatTile
            label="Active"
            value={<span className="text-brand-primary dark:text-brand-primary">{activeCompanyCount}</span>}
            hint="On a paid subscription now"
            icon={CheckCircle}
          />
          <StatTile
            label="On Trial"
            value={<span className="text-orange-600 dark:text-orange-500">{companies.filter((c) => c.subscription_status === "trial").length}</span>}
            hint="Inside free trial window"
            icon={Calendar}
          />
          <StatTile
            label="Total Users"
            value={<span className="text-slate-700 dark:text-slate-300">{companies.reduce((sum, c) => sum + (c.total_users || 0), 0)}</span>}
            hint="Across every tenant"
            icon={Users}
          />
        </div>

        {/* Toolbar: search + status filter + add-company in one place. */}
        <PortalCard className="mb-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <Input
                placeholder="Search companies..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="past_due">Past Due</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>

            <AddEditCompanyDialog
              open={isAddModalOpen}
              onOpenChange={setIsAddModalOpen}
              editingCompany={editingCompany}
              formData={formData}
              setFormData={setFormData}
              onTriggerNew={() => { resetForm(); setEditingCompany(null); }}
              onCancel={() => {
                setIsAddModalOpen(false);
                setEditingCompany(null);
                resetForm();
              }}
              onSave={editingCompany ? handleUpdateCompany : handleAddCompany}
            />
          </div>
        </PortalCard>

        {/* Deep-link focus pill. Visible whenever ?company=<id> arrives
            from another platform tool (e.g. subscription-management). */}
        {focusedCompany && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
            <span className="font-medium">
              Filtered to {focusedCompany.company_name}
            </span>
            <button
              type="button"
              onClick={clearCompanyFilter}
              className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900/50"
              title="Clear focus and show every company"
            >
              <X className="h-3 w-3" />
              Clear
            </button>
          </div>
        )}

        {/* Companies Table */}
        <PortalCard>
          <PortalCardHeader
            title={
              <span className="flex items-center gap-2">
                Companies ({filteredCompanies.length})
                <InfoTooltip content="The filtered list of tenants based on the search and status filters above.\n\nEach row covers the owner, current status, user and order counts, and signup date." />
              </span>
            }
          />
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <SortHeader sortKey="company" activeKey={sortedCompanies.sortKey} activeDir={sortedCompanies.sortDir} onToggle={sortedCompanies.toggle}>Company</SortHeader>
                    </TableHead>
                    <TableHead>
                      <SortHeader sortKey="owner" activeKey={sortedCompanies.sortKey} activeDir={sortedCompanies.sortDir} onToggle={sortedCompanies.toggle}>Owner</SortHeader>
                    </TableHead>
                    <TableHead>
                      <SortHeader sortKey="location" activeKey={sortedCompanies.sortKey} activeDir={sortedCompanies.sortDir} onToggle={sortedCompanies.toggle}>Location</SortHeader>
                    </TableHead>
                    <TableHead>
                      <SortHeader sortKey="status" activeKey={sortedCompanies.sortKey} activeDir={sortedCompanies.sortDir} onToggle={sortedCompanies.toggle}>Status</SortHeader>
                    </TableHead>
                    <TableHead>
                      <SortHeader sortKey="users" activeKey={sortedCompanies.sortKey} activeDir={sortedCompanies.sortDir} onToggle={sortedCompanies.toggle}>Users</SortHeader>
                    </TableHead>
                    <TableHead>
                      <SortHeader sortKey="orders" activeKey={sortedCompanies.sortKey} activeDir={sortedCompanies.sortDir} onToggle={sortedCompanies.toggle}>Orders</SortHeader>
                    </TableHead>
                    <TableHead>
                      <SortHeader sortKey="created" activeKey={sortedCompanies.sortKey} activeDir={sortedCompanies.sortDir} onToggle={sortedCompanies.toggle}>Created</SortHeader>
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-slate-500 dark:text-slate-400">
                        Loading companies...
                      </TableCell>
                    </TableRow>
                  ) : filteredCompanies.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-slate-500 dark:text-slate-400">
                        No companies found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredCompanies.map((company) => (
                      <TableRow
                        key={company.id}
                        id={`company-row-${company.id}`}
                        className={
                          focusedCompanyId === company.id
                            ? "ring-2 ring-amber-400 ring-offset-1 transition-shadow"
                            : "hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                        }
                      >
                        <TableCell>
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-white">
                              {company.company_name}
                            </p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                              /{company.company_slug}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm text-slate-700 dark:text-slate-300">{company.owner_name}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{company.email}</p>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-400">
                            <MapPin className="w-3 h-3" />
                            {company.city}, {company.country}
                          </div>
                        </TableCell>
                        <TableCell>
                          <CompanyStatusBadge status={company.subscription_status} />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm text-slate-700 dark:text-slate-300">
                            <Users className="w-3 h-3" />
                            {company.total_users}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-slate-700 dark:text-slate-300">{company.total_orders}</TableCell>
                        <TableCell className="text-sm text-slate-600 dark:text-slate-400">
                          {new Date(company.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2 justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleViewCompany(company)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEditModal(company)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={deletingCompanyId === company.id}
                              onClick={() =>
                                handleDeleteCompany(company.id, company.company_name)
                              }
                              title="Delete company and company data"
                            >
                              <Trash2 className="w-4 h-4 text-rose-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
        </PortalCard>

        {/* Company Details Modal */}
        <CompanyDetailsModal
          open={isDetailsModalOpen}
          onOpenChange={setIsDetailsModalOpen}
          selectedCompany={selectedCompany}
          companyUsers={companyUsers}
        />
      </PortalShell>
    </div>
  );
}
