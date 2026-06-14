import { useState, useEffect, useMemo } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { PlatformNav } from "@/components/admin/PlatformNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { UserPlus, Trash2, Building2, Loader2, Search, Send, Copy, MailWarning } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useSortable, type ColumnDef } from "@/lib/useSortable";
import { SortHeader } from "@/components/ui/sort-header";

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

export default function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
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
      setNewUser({ email: "", full_name: "", password: "", role: "client", company_id: "" });
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
    password: "",
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
        description: error?.message || "Unknown error",
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
        description: error.message || "Failed to create user",
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
        description: error?.message || "Try again.",
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
        description: error.message || "Failed to delete user",
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

  // Layered column sort, click any header to flip the order.
  const userSortColumns: ColumnDef<any>[] = useMemo(() => [
    { key: "user",    accessor: (u) => u.full_name || u.email,                  type: "string" },
    { key: "role",    accessor: (u) => u.role,                                  type: "string" },
    { key: "company", accessor: (u) => u.company_name || "",                    type: "string" },
    { key: "status",  accessor: (u) => u.invite_status || (u.email_verified ? "active" : "pending"), type: "string" },
    { key: "created", accessor: (u) => u.created_at,                            type: "date"   },
  ], []);
  const sortedUsers = useSortable<any>(fuzzyUsers, userSortColumns, { defaultKey: "created", defaultDir: "desc" });
  const filteredUsers = sortedUsers.rows;

  const getRoleBadge = (role: string) => {
    const roleConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      super_admin: { label: "Platform Admin", variant: "destructive" },
      company_admin: { label: "Company Admin", variant: "default" },
      admin: { label: "Admin", variant: "default" },
      owner: { label: "Owner", variant: "secondary" },
      kitchen: { label: "Kitchen", variant: "outline" },
      driver: { label: "Driver", variant: "outline" },
      client: { label: "Client", variant: "outline" },
    };

    const config = roleConfig[role] || { label: role, variant: "outline" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
      <div className="min-h-screen overflow-x-hidden bg-slate-50 lg:pl-72 xl:pl-80 pt-20 lg:pt-0">
        <PlatformNav />
        <div className="p-6 max-w-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">User Management</h1>
            <p className="text-slate-600 mt-1">Manage system users and permissions</p>
          </div>
          <Dialog open={addUserOpen} onOpenChange={closeAddUserDialog}>
            <DialogTrigger asChild>
              <Button className="bg-brand-primary hover:opacity-90">
                <UserPlus className="w-4 h-4 mr-2" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              {createResult ? (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <MailWarning className="w-5 h-5 text-amber-500" />
                      {createResult.emailed ? "User created — sign-in details" : "Share these sign-in details"}
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
                        Set up an email sender under <strong>Email settings</strong> (Admin → Settings → Email) so future invites send automatically.
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
                <DialogTitle>Create New User</DialogTitle>
                <DialogDescription>
                  Add a new user. They'll get an email invite to set their own password and sign in. You can resend the invite later from the user list if they're still pending.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="full_name">Full Name</Label>
                  <Input
                    id="full_name"
                    value={newUser.full_name}
                    onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    required
                    minLength={6}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select value={newUser.role} onValueChange={(value) => setNewUser({ ...newUser, role: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="super_admin">Platform Admin</SelectItem>
                      <SelectItem value="company_admin">Company Admin</SelectItem>
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
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => closeAddUserDialog(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={creating}>
                    {creating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      "Create User"
                    )}
                  </Button>
                </div>
              </form>
              </>
              )}
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                All Users ({filteredUsers.length})
                <InfoTooltip content="Every user account across every tenant on the platform, with the company they belong to.\n\nStatus reflects invite acceptance: Active means the user has signed in (accepted their invite / set their password); Pending means they were invited but haven't signed in yet. Use Resend invite to send a pending staff member a fresh set-password link." />
              </CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
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
                      <TableCell>
                        {(user.invite_status || (user.email_verified ? "active" : "pending")) === "active" ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                            Invited · Pending
                          </Badge>
                        )}
                      </TableCell>
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
                          {(user.invite_status || (user.email_verified ? "active" : "pending")) !== "active" &&
                            user.role !== "client" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={resendingId === user.id}
                                onClick={() => handleResendInvite(user.id)}
                                className="text-brand-primary hover:bg-brand-primary/10 gap-1.5"
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
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredUsers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-slate-500">
                        No users found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <AlertDialog open={!!deleteUserId} onOpenChange={() => setDeleteUserId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete User</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this user? This action cannot be undone and will permanently remove the user and all associated data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteUser} className="bg-red-600 hover:bg-red-700">
                Delete User
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      </div>
    </ProtectedRoute>
  );
}