import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { PlatformNav } from "@/components/admin/PlatformNav";
import { PortalShell, PortalHeader, PortalCard, PortalCardHeader, StatTile,
  PageWorkbench,
} from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Copy,
  Loader2,
  MailQuestion,
  MailWarning,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useSortable, type ColumnDef } from "@/lib/useSortable";
import { SortHeader } from "@/components/ui/sort-header";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { cn } from "@/lib/utils";

type User = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  company_id?: string;
  company_slug?: string;
  company_name?: string;
  email_verified: boolean;
  created_at: string;
  // Derived from auth.users.last_sign_in_at via /api/admin/users-activity.
  // null until the user first signs in (accepts their invite).
  last_sign_in_at?: string | null;
  invite_status?: "active" | "pending";
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Platform admin",
  company_admin: "Company admin",
  admin: "Admin",
  owner: "Owner",
  kitchen: "Kitchen",
  kitchen_staff: "Kitchen",
  driver: "Driver",
  shopping_staff: "Shopping",
  cleaning_staff: "Cleaning",
  sales_admin: "Sales admin",
  region_admin: "Region admin",
  client: "Client",
};

const getInviteStatus = (user: User) =>
  user.invite_status || (user.email_verified ? "active" : "pending");

const getRoleLabel = (role: string) =>
  ROLE_LABELS[role] || role.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

export default function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "pending">("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  // Set when a user was created but the invite couldn't be emailed (no
  // email sender configured) - drives the "share these details" panel.
  const [createResult, setCreateResult] = useState<
    { email: string; tempPassword?: string; loginUrl?: string; emailed?: boolean } | null
  >(null);
  const { toast } = useToast();

  const closeAddUserDialog = (open: boolean) => {
    setAddUserOpen(open);
    if (!open) {
      setCreateResult(null);
      setNewUser({ email: "", full_name: "", role: "client", company_id: "" });
    }
  };

  const copyCreateResult = async () => {
    if (!createResult) return;
    const text =
      `Email: ${createResult.email}\n` +
      (createResult.tempPassword ? `Temporary password: ${createResult.tempPassword}\n` : "") +
      (createResult.loginUrl ? `Sign in at: ${createResult.loginUrl}\n` : "") +
      `Please change your password after first sign-in.`;
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copied", description: "Sign-in details copied to your clipboard." });
    } catch {
      toast({ title: "Couldn't copy", description: "Select and copy the details manually.", variant: "destructive" });
    }
  };

  // Form state
  const [newUser, setNewUser] = useState({
    email: "",
    full_name: "",
    role: "client",
    company_id: "",
  });

  useEffect(() => {
    loadUsers();
    loadCompanies();
  }, []);

  const loadUsers = async () => {
    try {
      // Two-step fetch: profiles, then companies map. Avoids supabase-js
      // failing when the implicit join name is ambiguous and gives us
      // clearer errors when the schema drifts.
      const [{ data: profilesData, error: profilesErr }, { data: companiesData, error: companiesErr }] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("id, email, full_name, role, company_id, company_slug, email_verified, created_at")
            .order("created_at", { ascending: false }),
          supabase.from("companies").select("id, company_name, slug"),
        ]);

      if (profilesErr) throw profilesErr;
      if (companiesErr) throw companiesErr;

      const companyMap = new Map<string, { company_name: string; slug: string | null }>();
      (companiesData || []).forEach((c: any) => {
        companyMap.set(c.id, { company_name: c.company_name, slug: c.slug });
      });

      const usersWithCompany = (profilesData || []).map((user: any) => ({
        ...user,
        company_name: user.company_id ? companyMap.get(user.company_id)?.company_name ?? null : null,
      }));

      // Enrich with auth sign-in activity to derive invite status. A
      // user is "pending" until they first sign in via their invite /
      // set-password link (last_sign_in_at is null), then "active". If
      // the enrichment call fails we leave status undefined and fall
      // back to email_verified in the UI.
      let activity: Record<string, { last_sign_in_at: string | null }> = {};
      try {
        const r = await fetch("/api/admin/users-activity");
        const j = await r.json().catch(() => ({}));
        if (r.ok && j?.activity) activity = j.activity;
      } catch (e) {
        console.warn("[user-management] users-activity fetch failed:", e);
      }
      const enriched = usersWithCompany.map((u: any) => {
        const lastSignIn = activity[u.id]?.last_sign_in_at ?? null;
        return {
          ...u,
          last_sign_in_at: lastSignIn,
          invite_status: lastSignIn ? "active" : "pending",
        };
      });

      setUsers(enriched as any);
    } catch (error: any) {
      console.error("Error loading users:", error);
      toast({
        title: "Failed to load users",
        description: dbErrorMessage(error, { entity: "user" }),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from("companies")
        .select("id, company_name, slug")
        .order("company_name");

      if (error) throw error;
      setCompanies(data || []);
    } catch (error) {
      console.error("Error loading companies:", error);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    try {
      // FIX (2026-06-12): this used to call client-side
      // supabase.auth.signUp, which signs the NEW user into the
      // current browser - so the admin got booted out of their own
      // session and "became" the user they just created. It also
      // inserted the profile from the browser, tripping profiles RLS.
      // Route through the service-role API instead (same as every
      // other admin add-user surface): no session change, no RLS
      // issue, server-generated temp password.
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newUser.email.toLowerCase(),
          full_name: newUser.full_name,
          role: newUser.role,
          company_id: newUser.company_id || null,
        }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to create user");
      }

      const tempPassword = (payload as any)?.tempPassword as string | undefined;
      const emailDelivered = !!(payload as any)?.emailDelivered;
      const loginUrl = (payload as any)?.loginUrl as string | undefined;
      const createdEmail = newUser.email;

      loadUsers();

      // Always surface the credentials. The temp password is a working
      // login even when the invite emails (the email only sends a
      // set-password link, which doesn't invalidate the temp password).
      // Hiding it on email-success left no way in if the email never
      // arrived. We keep the dialog open and note whether an invite was
      // also emailed.
      setCreateResult({ email: createdEmail, tempPassword, loginUrl, emailed: emailDelivered });
    } catch (error: any) {
      console.error("Error creating user:", error);
      toast({
        title: "Error",
        description: dbErrorMessage(error, { entity: "user" }),
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleResendInvite = async (userId: string) => {
    setResendingId(userId);
    try {
      const res = await fetch("/api/admin/resend-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) throw new Error(j?.error || "Failed to resend invite");
      toast({ title: "Invite sent", description: j.message || "Invitation re-sent." });
    } catch (error: any) {
      toast({
        title: "Couldn't resend invite",
        description: dbErrorMessage(error, { entity: "invite" }),
        variant: "destructive",
      });
    } finally {
      setResendingId(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteUserId) return;

    try {
      // Delete from profiles (will cascade to auth.users via trigger)
      const { error } = await supabase
        .from("profiles")
        .delete()
        .eq("id", deleteUserId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "User deleted successfully",
      });

      setDeleteUserId(null);
      loadUsers();
    } catch (error: any) {
      console.error("Error deleting user:", error);
      toast({
        title: "Error",
        description: dbErrorMessage(error, { entity: "user" }),
        variant: "destructive",
      });
    }
  };

  const fuzzyUsers = useFuzzyItems(
    users,
    searchTerm,
    [
      { key: "full_name" as any, weight: 3 },
      { key: "email" as any, weight: 2 },
      { key: "company_name" as any, weight: 2 },
      { key: "role" as any, weight: 1 },
    ],
    { limit: 0 },
  );

  const roleOptions = useMemo(
    () =>
      Array.from(new Set(users.map((account) => account.role).filter(Boolean))).sort((a, b) =>
        getRoleLabel(a).localeCompare(getRoleLabel(b)),
      ),
    [users],
  );

  const companyOptions = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((account) => {
      if (account.company_id && account.company_name) map.set(account.company_id, account.company_name);
    });
    companies.forEach((company) => {
      if (company.id && company.company_name) map.set(company.id, company.company_name);
    });
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [companies, users]);

  const summary = useMemo(() => {
    const active = users.filter((account) => getInviteStatus(account) === "active").length;
    const pending = users.length - active;
    return {
      total: users.length,
      active,
      pending,
      platformAdmins: users.filter((account) => account.role === "super_admin").length,
      tenantLinked: users.filter((account) => account.company_id).length,
      clients: users.filter((account) => account.role === "client").length,
    };
  }, [users]);

  const visibleUsers = useMemo(
    () =>
      fuzzyUsers.filter((account) => {
        const status = getInviteStatus(account as User);
        if (statusFilter !== "all" && status !== statusFilter) return false;
        if (roleFilter !== "all" && account.role !== roleFilter) return false;
        if (companyFilter !== "all" && (account.company_id || "unassigned") !== companyFilter) return false;
        return true;
      }),
    [companyFilter, fuzzyUsers, roleFilter, statusFilter],
  );

  // Layered column sort, click any header to flip the order.
  const userSortColumns: ColumnDef<any>[] = useMemo(() => [
    { key: "user",    accessor: (u) => u.full_name || u.email,                  type: "string" },
    { key: "role",    accessor: (u) => getRoleLabel(u.role),                    type: "string" },
    { key: "company", accessor: (u) => u.company_name || "",                    type: "string" },
    { key: "status",  accessor: (u) => getInviteStatus(u as User),              type: "string" },
    { key: "created", accessor: (u) => u.created_at,                            type: "date"   },
  ], []);
  const sortedUsers = useSortable<any>(visibleUsers, userSortColumns, { defaultKey: "created", defaultDir: "desc" });
  const filteredUsers = sortedUsers.rows;
  const hasActiveFilters =
    !!searchTerm.trim() || statusFilter !== "all" || roleFilter !== "all" || companyFilter !== "all";
  const deleteTarget = users.find((account) => account.id === deleteUserId);

  const getRoleBadge = (role: string) => {
    return (
      <Badge
        variant="outline"
        className={cn(
          "border-slate-200 bg-slate-50 text-slate-700",
          role === "super_admin" && "border-rose-200 bg-rose-50 text-rose-700",
          role === "company_admin" && "border-amber-200 bg-amber-50 text-amber-800",
          role === "client" && "border-emerald-200 bg-emerald-50 text-emerald-700",
        )}
      >
        {getRoleLabel(role)}
      </Badge>
    );
  };

  const getStatusBadge = (account: User) => {
    const active = getInviteStatus(account) === "active";
    return (
      <Badge
        variant="outline"
        className={cn(
          "gap-1 border-amber-200 bg-amber-50 text-amber-800",
          active && "border-emerald-200 bg-emerald-50 text-emerald-700",
        )}
      >
        {active ? <CheckCircle2 className="h-3 w-3" /> : <MailQuestion className="h-3 w-3" />}
        {active ? "Active" : "Invite pending"}
      </Badge>
    );
  };

  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
      <div className="admin-page-shell">
        <PlatformNav />
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
        <PortalHeader
          title="User management"
          subtitle="Platform-wide account directory with tenant ownership, invite state, and safe account actions."
          icon={Users}
          actions={
          <Dialog open={addUserOpen} onOpenChange={closeAddUserDialog}>
            <DialogTrigger asChild>
              <Button className="bg-slate-950 text-white hover:bg-slate-800">
                <UserPlus className="w-4 h-4 mr-2" />
                Add user
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              {createResult ? (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <MailWarning className="w-5 h-5 text-amber-500" />
                      {createResult.emailed ? "User created - sign-in details" : "Share these sign-in details"}
                    </DialogTitle>
                    <DialogDescription>
                      {createResult.emailed ? (
                        <><strong>{createResult.email}</strong> was created and emailed a link to set their own password. They can also sign in right away with the temporary password below.</>
                      ) : (
                        <><strong>{createResult.email}</strong> was created, but this company hasn&apos;t set up an email sender yet, so we couldn&apos;t email the invite. Pass these details on directly.</>
                      )}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm space-y-1.5">
                      <div><span className="text-slate-500">Email:</span> <strong>{createResult.email}</strong></div>
                      {createResult.tempPassword && (
                        <div>
                          <span className="text-slate-500">Temporary password:</span>{" "}
                          <strong className="font-mono">{createResult.tempPassword}</strong>
                        </div>
                      )}
                      {createResult.loginUrl && (
                        <div>
                          <span className="text-slate-500">Sign in at:</span>{" "}
                          <strong className="break-all">{createResult.loginUrl}</strong>
                        </div>
                      )}
                      <p className="text-xs text-slate-500 pt-1">
                        They should change this password after their first sign-in.
                      </p>
                    </div>
                    {!createResult.emailed && (
                      <p className="text-xs text-slate-500">
                        Set up an email sender under <strong>Email settings</strong> so future invites send automatically.
                      </p>
                    )}
                    <div className="flex justify-between gap-2 pt-2">
                      <Button type="button" variant="outline" onClick={copyCreateResult} className="gap-1.5">
                        <Copy className="w-4 h-4" /> Copy details
                      </Button>
                      <Button type="button" onClick={() => closeAddUserDialog(false)}>
                        Done
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
              <>
              <DialogHeader>
                <DialogTitle>Create user</DialogTitle>
                <DialogDescription>
                  Create the account, assign its first role, and show the temporary sign-in details once.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="full_name">Full name</Label>
                  <Input
                    id="full_name"
                    value={newUser.full_name}
                    onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select value={newUser.role} onValueChange={(value) => setNewUser({ ...newUser, role: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="super_admin">Platform admin</SelectItem>
                      <SelectItem value="company_admin">Company admin</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="owner">Owner</SelectItem>
                      <SelectItem value="kitchen">Kitchen</SelectItem>
                      <SelectItem value="driver">Driver</SelectItem>
                      <SelectItem value="client">Client</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {newUser.role !== "super_admin" && (
                  <div className="space-y-2">
                    <Label htmlFor="company">Company</Label>
                    <Select value={newUser.company_id} onValueChange={(value) => setNewUser({ ...newUser, company_id: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select company" />
                      </SelectTrigger>
                      <SelectContent>
                        {companies.map((company) => (
                          <SelectItem key={company.id} value={company.id}>
                            {company.company_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                  A unique temporary password is generated by the server and shown after save for direct handover.
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => closeAddUserDialog(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creating} className="bg-slate-950 text-white hover:bg-slate-800">
                    {creating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create user"
                    )}
                  </Button>
                </div>
              </form>
              </>
              )}
            </DialogContent>
          </Dialog>
          }
        />
        <PageWorkbench />

        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <StatTile label="Accounts" value={summary.total} hint="All platform-visible profiles" icon={Users} />
          <StatTile label="Active" value={summary.active} hint="Signed in at least once" icon={CheckCircle2} />
          <StatTile label="Invite pending" value={summary.pending} hint="Created but not accepted" icon={MailQuestion} />
          <StatTile label="Tenant-linked" value={summary.tenantLinked} hint="Assigned to a company" icon={Building2} />
          <StatTile label="Platform admins" value={summary.platformAdmins} hint="Global admin access" icon={ShieldCheck} />
        </div>

        <PortalCard>
          <PortalCardHeader
            title={
              <span className="flex items-center gap-2">
                Account directory ({filteredUsers.length})
                <InfoTooltip content="Every user account across every tenant on the platform, with the company they belong to.\n\nStatus reflects invite acceptance: Active means the user has signed in (accepted their invite / set their password); Pending means they were invited but haven't signed in yet. Use Resend invite to send a pending staff member a fresh set-password link." />
              </span>
            }
            action={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!hasActiveFilters}
                onClick={() => {
                  setSearchTerm("");
                  setStatusFilter("all");
                  setRoleFilter("all");
                  setCompanyFilter("all");
                }}
              >
                Clear filters
              </Button>
            }
          />
          <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(220px,1.4fr)_repeat(3,minmax(160px,1fr))]">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search name, email, company, or role"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Invite pending</SelectItem>
              </SelectContent>
            </Select>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {roleOptions.map((role) => (
                  <SelectItem key={role} value={role}>{getRoleLabel(role)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={companyFilter} onValueChange={setCompanyFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Company" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All companies</SelectItem>
                <SelectItem value="unassigned">No company</SelectItem>
                {companyOptions.map((company) => (
                  <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <SortHeader sortKey="user" activeKey={sortedUsers.sortKey} activeDir={sortedUsers.sortDir} onToggle={sortedUsers.toggle}>User</SortHeader>
                    </TableHead>
                    <TableHead>
                      <SortHeader sortKey="role" activeKey={sortedUsers.sortKey} activeDir={sortedUsers.sortDir} onToggle={sortedUsers.toggle}>Role</SortHeader>
                    </TableHead>
                    <TableHead>
                      <SortHeader sortKey="company" activeKey={sortedUsers.sortKey} activeDir={sortedUsers.sortDir} onToggle={sortedUsers.toggle}>Company</SortHeader>
                    </TableHead>
                    <TableHead>
                      <SortHeader sortKey="status" activeKey={sortedUsers.sortKey} activeDir={sortedUsers.sortDir} onToggle={sortedUsers.toggle}>Status</SortHeader>
                    </TableHead>
                    <TableHead>
                      <SortHeader sortKey="created" activeKey={sortedUsers.sortKey} activeDir={sortedUsers.sortDir} onToggle={sortedUsers.toggle}>Created</SortHeader>
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{user.full_name}</div>
                          <div className="text-sm text-slate-500">{user.email}</div>
                        </div>
                      </TableCell>
                      <TableCell>{getRoleBadge(user.role)}</TableCell>
                      <TableCell>
                        {user.company_name ? (
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-slate-400" />
                            <span className="text-sm">{user.company_name}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-slate-400">-</span>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(user as User)}</TableCell>
                      <TableCell>
                        <span className="text-sm text-slate-500">
                          {new Date(user.created_at).toLocaleDateString()}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Resend invite only for pending STAFF (clients
                              sign in via magic-link, not a set-password
                              invite). Hidden once the user is active so the
                              option isn't shown again and again. */}
                          {getInviteStatus(user as User) !== "active" &&
                            user.role !== "client" && (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={resendingId === user.id}
                                onClick={() => handleResendInvite(user.id)}
                                className="gap-1.5 border-amber-200 text-amber-800 hover:bg-amber-50"
                              >
                                {resendingId === user.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Send className="w-4 h-4" />
                                )}
                                Resend invite
                              </Button>
                            )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteUserId(user.id)}
                            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredUsers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <EmptyState
                          inCard
                          icon={hasActiveFilters ? Search : Users}
                          title={hasActiveFilters ? "No accounts match these filters" : "No users yet"}
                          description={
                            hasActiveFilters
                              ? "Clear the filters or search by another name, email, company, or role."
                              : "Create the first platform or tenant account to start managing access."
                          }
                          cta={
                            hasActiveFilters
                              ? {
                                  label: "Clear filters",
                                  variant: "outline",
                                  onClick: () => {
                                    setSearchTerm("");
                                    setStatusFilter("all");
                                    setRoleFilter("all");
                                    setCompanyFilter("all");
                                  },
                                }
                              : { label: "Add user", onClick: () => setAddUserOpen(true) }
                          }
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
        </PortalCard>

        <AlertDialog open={!!deleteUserId} onOpenChange={() => setDeleteUserId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-rose-600" />
                Delete user?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget?.full_name || deleteTarget?.email || "This user"} will be permanently removed. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteUser} className="bg-rose-600 hover:bg-rose-700">
                Delete user
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </PortalShell>
      </div>
    </ProtectedRoute>
  );
}
