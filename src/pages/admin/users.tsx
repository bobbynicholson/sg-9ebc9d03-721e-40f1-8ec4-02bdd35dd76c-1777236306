import { useState, useEffect, useMemo, useRef } from "react";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";
import { useSortable, type ColumnDef } from "@/lib/useSortable";
import { SortMenu } from "@/components/ui/sort-menu";
import Link from "next/link";
import { useRouter } from "next/router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
  DialogDescription,
} from "@/components/ui/dialog";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader,
  PageWorkbench,
} from "@/components/portal/ui";
import {
  Users,
  ArrowLeft,
  Search,
  Shield,
  ChefHat,
  Truck,
  ShoppingCart,
  Sparkles,
  UserCircle,
  Edit,
  CheckCircle,
  Loader2,
  AlertCircle,
  RefreshCw,
  Download,
  X,
  UserPlus,
  UserX,
  UserCheck,
  Clock,
  Mail,
  Trash2,
  Copy,
  MailWarning,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import Head from "next/head";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { userManagementService, UserWithDepartments } from "@/services/userManagementService";
import { useToast } from "@/hooks/use-toast";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useTenantHref } from "@/lib/tenantUrl";
import { formatLocalDate } from "@/lib/localFormat";
import { loginActivityBucket } from "@/lib/loginActivity";
import { toLocalISO } from "@/lib/localDate";
import { normalizeRoleValue as normalizeAppRoleValue } from "@/lib/roleDerivation";

// USR-C (task #208, 2026-05-24): pending-invite shape used by the
// new Pending tab + Invite dialog.
interface PendingInvitation {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  status: string | null;
  invited_by: string | null;
  created_at: string | null;
  expires_at: string | null;
}

function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserWithDepartments[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [invitationsLoading, setInvitationsLoading] = useState(false);
  // USR-C: Invite User dialog state.
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>(UserRole.KITCHEN_STAFF);
  const [inviting, setInviting] = useState(false);
  // After Add user: the server-generated temp password (a real, working
  // login) + whether an invite email also went out. Drives the
  // "sign-in details" panel so the operator always has a way in, even
  // when no email sender is configured. Mirrors the other admin
  // add-user surfaces (/[slug]/admin/users, drivers, platform).
  const [createResult, setCreateResult] = useState<
    { email: string; name: string; tempPassword?: string; loginUrl?: string; emailed?: boolean } | null
  >(null);
  // USR-C: Deactivate-confirm + role-mutation tracking. Held on a
  // per-user id so two clicks on different rows don't race.
  const [confirmDeactivate, setConfirmDeactivate] = useState<UserWithDepartments | null>(null);
  const [statusBusy, setStatusBusy] = useState<string | null>(null);
  // Phase 26 #6: "/" or Cmd-F focuses the search input.
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
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [selectedDepartments, setSelectedDepartments] = useState<UserRole[]>([]);
  const [primaryDepartment, setPrimaryDepartment] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  // Wave 27.3: tenant-slug wrapper for internal navigations.
  const { withSlug } = useTenantHref();
  const { toast } = useToast();

  // USR-D (task #209, 2026-05-24): the Edit Departments picker was
  // a flat 7-checkbox grid with no copy explaining what each grants.
  // Reworked into 4 groups with per-role descriptions so the
  // operator knows what they're actually ticking. Also adds the
  // three roles the user_role enum supports but this picker was
  // missing: owner, sales_admin, region_admin.
  //
  // department on user_departments is a free-text column (not the
  // user_role enum), so we can add new values without a migration.
  const roleConfig: Array<{
    value: UserRole;
    label: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    icon: any;
    color: string;
    group: "leadership" | "administrative" | "operational" | "client";
    description: string;
  }> = [
    // Leadership - founder / shareholder access. Sees finance + all
    // company controls.
    {
      value: UserRole.OWNER, label: "Owner", icon: Shield,
      color: "bg-amber-100 text-amber-800 border-amber-200",
      group: "leadership",
      description: "Full company control: finance, settings, every operational surface. Pick this for shareholders / directors.",
    },
    // Administrative - day-to-day admin. Two levels: company-wide
    // (admin everything) vs region-scoped.
    {
      value: UserRole.COMPANY_ADMIN, label: "Company Admin", icon: Shield,
      color: "bg-blue-100 text-blue-700 border-blue-200",
      group: "administrative",
      description: "Runs the business day-to-day: every order, every region, every report. Same finance access as owner.",
    },
    {
      value: UserRole.ADMIN, label: "Admin", icon: Shield,
      color: "bg-slate-100 text-slate-700 border-slate-200",
      group: "administrative",
      description: "General admin access without owner-level finance settings. Manages orders, calendar, dispatch, staff.",
    },
    {
      value: UserRole.SALES_ADMIN, label: "Sales Admin", icon: UserCircle,
      color: "bg-rose-100 text-rose-700 border-rose-200",
      group: "administrative",
      description: "Leads, quotes, client communications. Sees order pipeline but not kitchen / driver tooling.",
    },
    {
      value: UserRole.REGION_ADMIN, label: "Region Admin", icon: Shield,
      color: "bg-rose-100 text-rose-700 border-rose-200",
      group: "administrative",
      description: "Admin scoped to a single region. Like Admin but rows outside their region are filtered out.",
    },
    // Operational portals - hands-on roles. Each opens a specific
    // mobile portal optimised for that job.
    {
      value: UserRole.KITCHEN_MANAGER, label: "Kitchen Manager", icon: ChefHat,
      color: "bg-amber-100 text-amber-800 border-amber-200",
      group: "operational",
      description: "Kitchen manager portal: team clock-in/out, prep control, cleaning visibility, no finance.",
    },
    {
      value: UserRole.KITCHEN_STAFF, label: "Kitchen Team", icon: ChefHat,
      color: "bg-orange-100 text-orange-700 border-orange-200",
      group: "operational",
      description: "Kitchen portal: today's prep tasks, clock-in / clock-out, handover notes.",
    },
    {
      value: UserRole.DRIVER, label: "Driver", icon: Truck,
      color: "bg-blue-100 text-blue-700 border-blue-200",
      group: "operational",
      description: "Driver portal on mobile: assigned routes, accept / reject jobs, proof-of-delivery.",
    },
    {
      value: UserRole.WAITER, label: "Waiter / Server", icon: UserCheck,
      color: "bg-cyan-100 text-cyan-700 border-cyan-200",
      group: "operational",
      description: "On-site service portal: event tasks, attendance, service handover.",
    },
    {
      value: UserRole.SHOPPING_STAFF, label: "Shopping Team", icon: ShoppingCart,
      color: "bg-brand-primary/15 text-brand-primary border-brand-primary/20",
      group: "operational",
      description: "Shopping portal: Buy-now list, snap-a-slip receipts, supplier contacts.",
    },
    {
      value: UserRole.CLEANING_MANAGER, label: "Cleaning Manager", icon: Sparkles,
      color: "bg-brand-primary/15 text-brand-primary border-brand-primary/20",
      group: "operational",
      description: "Cleaning manager portal: cleaning queue, team availability, handovers, no finance.",
    },
    {
      value: UserRole.CLEANING_STAFF, label: "Cleaning Team", icon: Sparkles,
      color: "bg-brand-primary/15 text-brand-primary border-brand-primary/20",
      group: "operational",
      description: "Cleaning portal: post-event handovers, equipment damages log, low-supplies alerts.",
    },
    // Client - the outside-facing portal. Lives on /c/* paths.
    {
      value: UserRole.CLIENT, label: "Client", icon: UserCircle,
      color: "bg-slate-100 text-slate-700 border-slate-200",
      group: "client",
      description: "Client portal at /c/. Sees their own quotes, orders, payments. Never sees other clients.",
    },
  ];

  const normalizeRoleValue = (
    value?: UserRole | string | null,
    fallbackRole?: UserRole | string | null,
  ): UserRole | null => normalizeAppRoleValue(value || null, fallbackRole || null);

  const roleMetaFor = (value?: UserRole | string | null) => {
    const normalized = normalizeRoleValue(value);
    return normalized ? roleConfig.find((role) => role.value === normalized) : undefined;
  };

  const userAccessRoles = (targetUser: UserWithDepartments): UserRole[] => {
    const baseRole = normalizeRoleValue(targetUser.role as string | null | undefined);
    const activeRole = normalizeRoleValue(targetUser.active_role, baseRole);
    const fallbackRole = activeRole || baseRole;
    const roles = [
      baseRole,
      activeRole,
      normalizeRoleValue(targetUser.primary_department, fallbackRole),
      ...(targetUser.departments || []).map((role) => normalizeRoleValue(role as string | null | undefined, fallbackRole)),
    ]
      .filter((role): role is UserRole => Boolean(role));
    return Array.from(new Set(roles));
  };

  // USR-D: group labels + intro copy for the picker. Pure data so
  // the render below can stay tight.
  const ROLE_GROUPS: Array<{
    key: "leadership" | "administrative" | "operational" | "client";
    label: string;
    hint: string;
  }> = [
    { key: "leadership",     label: "Leadership",            hint: "Founder / shareholder. Full finance access." },
    { key: "administrative", label: "Administrative",        hint: "Pick ONE - they stack from broadest (Company Admin) to narrowest (Region Admin)." },
    { key: "operational",    label: "Operational portals",   hint: "Hands-on roles. Tick any that apply if the user works in those teams too." },
    { key: "client",         label: "Client portal",         hint: "Only tick if this person should see their own client-facing view. Rare for staff." },
  ];

  // USR-D: smart guidance based on the current selection. Surfaces
  // the most common mistake or next-step suggestion above the
  // grid - "Owner + Company Admin" pattern, lonely "Admin" tick,
  // etc.
  const guidance = useMemo(() => {
    const set = new Set<string>(selectedDepartments as unknown as string[]);
    if (set.has("owner") && !set.has("company_admin")) {
      return "Owners almost always need Company Admin too - that's the role that opens every operational page (orders, calendar, dispatch). Without it the owner only sees finance.";
    }
    if (set.has("client") && set.size > 1) {
      return "Client + a staff role is unusual. The client portal is locked to /c/ and won't share session with the admin portal.";
    }
    if (set.has("admin") && set.has("company_admin")) {
      return "Company Admin already includes everything Admin does. Tick only one.";
    }
    if (selectedDepartments.length === 0) {
      return null;
    }
    return null;
  }, [selectedDepartments]);

  useEffect(() => {
    if (user) {
      loadUsers();
    } else if (user === null) {
      setLoading(false);
      setError("Please log in to manage users.");
    }
  }, [user]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const fetchedUsers = await userManagementService.getAllUsers(user?.company_id, {
        excludeRoles: ["client"],
      });
      setUsers(fetchedUsers);
    } catch (error) {
      console.error("Error loading users:", error);
      setError("Failed to load users. Please try again.");
      toast({
        title: "Error",
        description: "Failed to load users",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // USR-C (task #208, 2026-05-24): pending invitations loader.
  // Pulls staff_invitations for the tenant with status='pending'.
  // Expired invites surface with a chip so the operator can resend
  // or cancel.
  const loadInvitations = async () => {
    if (!user?.company_id) return;
    setInvitationsLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("staff_invitations")
        // staff_invitations has no email / full_name columns - selecting
        // them 400'd the query and the Pending-invites tab was always empty.
        .select("id, user_id, role, status, invited_by, created_at, expires_at")
        .eq("company_id", user.company_id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setInvitations((data || []) as PendingInvitation[]);
    } catch (err) {
      console.error("Error loading invitations:", err);
    } finally {
      setInvitationsLoading(false);
    }
  };

  // USR-C: URL persistence on q. Reads on mount; the
  // sort sync writes back via SortMenu's setSort indirectly through
  // userSort below.
  useEffect(() => {
    const q = typeof router.query.q === "string" ? router.query.q : "";
    if (q !== searchTerm) setSearchTerm(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  // Write q back to the URL with shallow replace so the URL
  // reflects the current view but doesn't push history entries on
  // every keystroke.
  useEffect(() => {
    if (!router.isReady) return;
    const next: Record<string, string> = { ...router.query } as Record<string, string>;
    if (searchTerm) next.q = searchTerm; else delete next.q;
    delete next.tab;
    const desired = new URLSearchParams(next).toString();
    const current = new URLSearchParams(router.query as Record<string, string>).toString();
    if (desired !== current) {
      router.replace({ pathname: router.pathname, query: next }, undefined, { shallow: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  // USR-C: realtime debounce. New signup / department change /
  // invitation accept should refresh the page without manual click.
  // 1500ms because role / department admin work tends to cluster.
  useEffect(() => {
    if (!user?.company_id) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void loadUsers();
        void loadInvitations();
      }, 1500);
    };
    const channel = supabase
      .channel(`admin-users:${user.company_id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `company_id=eq.${user.company_id}` }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_departments" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_invitations", filter: `company_id=eq.${user.company_id}` }, bump)
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id]);

  // Initial load of invitations.
  useEffect(() => {
    if (user?.company_id) void loadInvitations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id]);

  // Add-new-user submit handler. Was the magic-link-only invite flow
  // (staff_invitations + email, no usable login until the invitee
  // clicked the email). That left no temp password on screen and broke
  // completely when no email sender was configured. Now routes through
  // /api/admin/create-user - the same server-side, service-role flow the
  // other admin surfaces use: it creates an ACTIVE user immediately,
  // generates a random password, emails an invite when possible, and
  // returns the temp password so we can always show it on screen.
  const handleInviteSubmit = async () => {
    if (!user?.company_id || !user.id) return;
    const trimmedEmail = inviteEmail.trim();
    const trimmedName = inviteName.trim();
    if (!trimmedEmail) {
      toast({ title: "Email required", variant: "destructive" });
      return;
    }
    setInviting(true);
    try {
      const res = await fetch("/api/admin/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email: trimmedEmail.toLowerCase(),
          full_name: trimmedName || trimmedEmail.split("@")[0],
          role: String(inviteRole),
          company_id: user.company_id,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Could not add user", description: payload?.error || `Server returned ${res.status}`, variant: "destructive" });
        return;
      }

      // Refresh both lists (the user is active now; any stale pending
      // invite row for this email is harmless).
      void loadUsers();
      void loadInvitations();

      // Email the invite. create-user already tries server-side (Resend,
      // direct). If that didn't go out, fall back to the SAME browser
      // path the old invite flow used - billingEmailService routes
      // through /api/send-email, which reliably delivers for tenants with
      // a configured sender. Only fire the fallback when the server send
      // failed, so we never double-send.
      let emailed = !!(payload as any)?.emailDelivered;
      if (!emailed) {
        try {
          const { billingEmailService } = await import("@/services/billingEmailService");
          const sent = await billingEmailService.sendStaffInvitationEmail(
            trimmedEmail.toLowerCase(),
            (user as any).full_name || (user as any).email || "your admin",
            (user as any).company_name || "your team",
            (payload as any)?.loginUrl || `${window.location.origin}/auth/login`,
            user.company_id,
          );
          emailed = !!sent;
        } catch (e) {
          console.error("Fallback staff invite email failed:", e);
        }
      }

      // Always surface the credentials. The temp password is a working
      // login even when the invite email goes out (the email only sends
      // a set-password link, which doesn't invalidate the temp password).
      setCreateResult({
        email: trimmedEmail,
        name: trimmedName || trimmedEmail.split("@")[0],
        tempPassword: (payload as any)?.tempPassword,
        loginUrl: (payload as any)?.loginUrl,
        emailed,
      });
    } catch (err) {
      toast({
        title: "Could not add user",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setInviting(false);
    }
  };

  // Copy the new user's sign-in details as a ready-to-send message.
  const copyCreateResult = async () => {
    if (!createResult) return;
    const text =
      `Email: ${createResult.email}\n` +
      (createResult.tempPassword ? `Temporary password: ${createResult.tempPassword}\n` : "") +
      (createResult.loginUrl ? `Sign in at: ${createResult.loginUrl}\n` : "") +
      `Please change your password after first sign-in.`;
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Details copied", description: "Sign-in details copied to clipboard." });
    } catch {
      toast({ title: "Copy failed", description: "Browser blocked clipboard access.", variant: "destructive" });
    }
  };

  // USR-C: toggle is_active via the service. Audit-logged at the
  // service layer. Confirms before deactivating (a click-by-mistake
  // here locks someone out); re-activation is single-click.
  const handleStatusToggle = async (targetUser: UserWithDepartments, nextActive: boolean) => {
    if (!user?.id) return;
    setStatusBusy(targetUser.id);
    try {
      await userManagementService.updateUserStatus(targetUser.id, nextActive, user.id);
      toast({
        title: nextActive ? "User reactivated" : "User deactivated",
        description: nextActive
          ? `${targetUser.full_name || targetUser.email} can sign in again.`
          : `${targetUser.full_name || targetUser.email} can no longer sign in. Reactivate from this page.`,
      });
      await loadUsers();
    } catch (err) {
      toast({
        title: "Could not update",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setStatusBusy(null);
      setConfirmDeactivate(null);
    }
  };

  // USR-C: cancel a pending invitation. Service exists; reload on
  // success so the row drops out of the tab.
  const handleCancelInvitation = async (invitationId: string) => {
    try {
      await userManagementService.cancelInvitation(invitationId);
      toast({ title: "Invitation cancelled" });
      void loadInvitations();
    } catch (err) {
      toast({
        title: "Could not cancel",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  const handleEditUser = (userId: string) => {
    const targetUser = users.find(u => u.id === userId);
    if (targetUser) {
      const fallbackRole = normalizeRoleValue(
        targetUser.active_role,
        normalizeRoleValue(targetUser.role as string | null | undefined),
      ) || normalizeRoleValue(targetUser.role as string | null | undefined);
      const normalizedDepartments = (targetUser.departments || [])
        .map((dept) => normalizeRoleValue(dept, fallbackRole))
        .filter((dept): dept is UserRole => Boolean(dept));
      const nextDepartments = normalizedDepartments.length > 0
        ? Array.from(new Set(normalizedDepartments))
        : fallbackRole
          ? [fallbackRole]
          : [];
      const nextPrimary = normalizeRoleValue(targetUser.primary_department, fallbackRole) || nextDepartments[0] || null;
      setEditingUser(userId);
      setSelectedDepartments(nextDepartments);
      setPrimaryDepartment(nextPrimary);
    }
  };

  const handleSaveRoles = async (userId: string) => {
    if (selectedDepartments.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one department",
        variant: "destructive",
      });
      return;
    }

    if (!primaryDepartment) {
      toast({
        title: "Error",
        description: "Please select a primary department",
        variant: "destructive",
      });
      return;
    }

    try {
      setSaving(true);

      const normalizedPrimary = normalizeRoleValue(primaryDepartment);
      const normalizedDepartments = Array.from(new Set(
        selectedDepartments
          .map((dept) => normalizeRoleValue(dept))
          .filter((dept): dept is UserRole => Boolean(dept)),
      ));

      if (!normalizedPrimary || normalizedDepartments.length === 0) {
        throw new Error("Please select at least one valid department");
      }

      const assignments: { department: UserRole; is_primary: boolean; }[] = normalizedDepartments.map(dept => ({
        department: dept,
        is_primary: dept === normalizedPrimary,
      }));

      await userManagementService.assignDepartments(userId, assignments, user!.id);
      await loadUsers();

      setEditingUser(null);
      setSelectedDepartments([]);
      setPrimaryDepartment(null);

      toast({
        title: "Success",
        description: "User departments updated successfully",
      });
    } catch (error) {
      console.error("Error saving roles:", error);
      toast({
        title: "Error",
        description: "Failed to update user departments",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDepartmentToggle = (dept: UserRole) => {
    const normalizedDept = normalizeRoleValue(dept);
    if (!normalizedDept) return;
    setSelectedDepartments(prev => {
      if (prev.includes(normalizedDept)) {
        const newDepts = prev.filter(d => d !== normalizedDept);
        if (primaryDepartment === normalizedDept && newDepts.length > 0) {
          setPrimaryDepartment(newDepts[0]);
        } else if (newDepts.length === 0) {
          setPrimaryDepartment(null);
        }
        return newDepts;
      } else {
        if (prev.length === 0) {
          setPrimaryDepartment(normalizedDept);
        }
        return [...prev, normalizedDept];
      }
    });
  };

  const handleSetPrimary = (dept: UserRole) => {
    const normalizedDept = normalizeRoleValue(dept);
    if (normalizedDept && selectedDepartments.includes(normalizedDept)) {
      setPrimaryDepartment(normalizedDept);
    }
  };

  const fuzzyUsers = useFuzzyItems(
    users,
    searchTerm,
    [
      { key: "full_name" as any, weight: 3 },
      { key: "email" as any, weight: 2 },
      { key: "role" as any, weight: 1 },
    ],
    { limit: 0 },
  );

  const fuzzyOrAll = searchTerm ? fuzzyUsers : users;

  const userSortColumns: ColumnDef<UserWithDepartments>[] = useMemo(() => [
    { key: "name",    accessor: (u) => u.full_name || u.email,                type: "string" },
    { key: "role",    accessor: (u) => (u.role || "").toString(),             type: "string" },
    { key: "email",   accessor: (u) => u.email || "",                         type: "string" },
    { key: "created", accessor: (u) => u.created_at,                          type: "date"   },
  ], []);
  const userSort = useSortable<UserWithDepartments>(fuzzyOrAll, userSortColumns, { defaultKey: "name", defaultDir: "asc" });
  const filteredUsers = userSort.rows;
  const activeUserCount = users.filter((u) => u.is_active).length;
  const inactiveUserCount = Math.max(users.length - activeUserCount, 0);
  const pendingInviteCount = invitations.length;
  const roleCount = (role: UserRole) =>
    users.filter((targetUser) => userAccessRoles(targetUser).includes(role)).length;
  const visibleUserLabel =
    filteredUsers.length === users.length
      ? `${users.length} staff users`
      : `${filteredUsers.length} of ${users.length} staff users`;

  if (loading) {
    return (
      <>
        <NoIndexMeta />
        <Head>
          <meta name="robots" content="noindex, nofollow" />
          <title>User management - CateringMS</title>
        </Head>
        
        <AdminNav />
        
        <div className="admin-page-shell">
          <div className="px-4 py-8">
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <Loader2 className="w-12 h-12 animate-spin text-slate-600 mx-auto mb-4" />
                <p className="text-gray-600">Loading users...</p>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (error && !user) {
    return (
      <>
        <NoIndexMeta />
        <Head>
          <meta name="robots" content="noindex, nofollow" />
          <title>User management - CateringMS</title>
        </Head>
        
        <AdminNav />
        
        <div className="admin-page-shell">
          <div className="px-4 py-8">
            <Card className="border-2 border-rose-200 bg-rose-50">
              <CardContent className="pt-12 pb-12 text-center">
                <AlertCircle className="w-16 h-16 text-rose-500 mx-auto mb-4" />
                <p className="text-xl font-semibold text-gray-900 mb-2">Access Denied</p>
                <p className="text-gray-600 mb-4">{error}</p>
                <Link href="/auth/login">
                  <Button className="bg-brand-primary hover:opacity-90">
                    Go to Login
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <NoIndexMeta />
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>User management - CateringMS</title>
      </Head>
      
      <AdminNav />
      
      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <Link href={withSlug("/admin/dashboard")}>
            <Button variant="ghost" className="mb-4" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Admin Dashboard
            </Button>
          </Link>

          {/* USR-A (task #207, 2026-05-24): copy fix. Pre-fix
              the subtitle claimed clients were listed too, but
              the loadUsers call passes excludeRoles=["client"]
              so they are not. Same line also promised "Assign
              roles and revoke access here" - role edit ships
              via Edit Departments; revoke isn't surfaced yet
              (deferred to #208). Honest framing now. */}
          <PortalHeader
            title="Full team"
            icon={Users}
            subtitle="Everyone with a staff login: owners, admins, kitchen, drivers, waiters, shopping, cleaning. Assign departments here; client portal accounts are managed under /admin/contacts."
            actions={
            <>
                <InfoTooltip
                  content={"Refresh the user list to pick up the latest changes and department assignments."}
                  side="left"
                />
                {/* Phase 20 #2: team roster CSV export. HR + payroll
                    regularly want a flat list of every login on the
                    tenant with their email + primary department for
                    handover docs, audits, and identity reviews. */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (filteredUsers.length === 0) {
                      toast({ title: "Nothing to export", description: "Adjust your search until at least one user is visible." });
                      return;
                    }
                    const esc = (v: any) => {
                      if (v == null) return "";
                      const s = String(v).replace(/"/g, '""');
                      return /[",\n]/.test(s) ? `"${s}"` : s;
                    };
                    const headers = ["Name", "Email", "Phone", "Primary department", "All departments", "Created"];
                    const lines = [headers.join(",")];
                    for (const u of filteredUsers as any[]) {
                      lines.push([
                        esc(u.full_name || ""),
                        esc(u.email || ""),
                        esc(u.phone || ""),
                        esc(u.primary_department || ""),
                        esc((u.departments || []).join("; ")),
                        esc(u.created_at ? toLocalISO(new Date(u.created_at)) : ""),
                      ].join(","));
                    }
                    // USR-A (task #207, 2026-05-24): UTF-8 BOM so
                    // Excel-ZA reads SA surnames with diacritics
                    // (Müller, Naudé, etc.) correctly. Matches every
                    // other export in this codebase.
                    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `team-${toLocalISO(new Date())}.csv`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                  disabled={loading}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export CSV
                </Button>
                {/* USR-C (task #208, 2026-05-24): Invite User
                    button. Opens the dialog that calls the existing
                    inviteStaffMember service (which now has the
                    schema columns it needs). */}
                <Button
                  size="sm"
                  onClick={() => setInviteOpen(true)}
                  className="bg-brand-primary hover:opacity-90 gap-1.5"
                >
                  <UserPlus className="w-4 h-4" />
                  Add user
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadUsers}
                  disabled={loading}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
            </>
            }
          />
          <PageWorkbench />

          <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-950">Access control</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      Staff logins only. Client portal users stay with Contacts.
                    </p>
                  </div>
                  <span className="rounded-full border border-brand-primary/20 bg-brand-primary/10 px-2 py-1 text-[11px] font-medium text-brand-primary">
                    Live roster
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {[
                    { label: "Staff", value: users.length },
                    { label: "Active", value: activeUserCount },
                    { label: "Inactive", value: inactiveUserCount },
                    { label: "Pending", value: pendingInviteCount },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-[11px] font-medium text-slate-500">{item.label}</p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-950">{item.value}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-950">Role map</h2>
                  <span className="text-xs text-slate-500">Counts from visible tenant</span>
                </div>
                <div className="space-y-4">
                  {ROLE_GROUPS.map((group) => {
                    const rolesInGroup = roleConfig.filter((role) => role.group === group.key);
                    if (rolesInGroup.length === 0) return null;
                    return (
                      <div key={group.key} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
                          <p className="text-xs font-semibold text-slate-700">{group.label}</p>
                          <p className="max-w-[150px] truncate text-[11px] text-slate-500">{group.hint}</p>
                        </div>
                        <div className="space-y-1">
                          {rolesInGroup.map((role) => {
                            const count = roleCount(role.value);
                            return (
                              <div key={role.value} className="flex min-h-9 items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                                <span className="flex min-w-0 items-center gap-2">
                                  <role.icon className="h-4 w-4 shrink-0 text-slate-500" />
                                  <span className="truncate text-sm text-slate-800">{role.label}</span>
                                </span>
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-700">
                                  {count}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </aside>

            <main className="space-y-4">
              <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-slate-950">Team members</h2>
                    <p className="text-xs text-slate-500">{visibleUserLabel}</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] lg:w-[560px]">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        ref={searchRef}
                        type="text"
                        placeholder="Search name, email, or role"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="h-10 pl-9 pr-9 text-sm"
                      />
                      {searchTerm && (
                        <button
                          type="button"
                          onClick={() => setSearchTerm("")}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                          title="Clear search"
                          aria-label="Clear search"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <SortMenu
                      activeKey={userSort.sortKey}
                      activeDir={userSort.sortDir}
                      onPick={userSort.setSort}
                      options={[
                        { key: "name",    dir: "asc",  label: "Name (A to Z)" },
                        { key: "name",    dir: "desc", label: "Name (Z to A)" },
                        { key: "role",    dir: "asc",  label: "Role (A to Z)" },
                        { key: "email",   dir: "asc",  label: "Email (A to Z)" },
                        { key: "created", dir: "desc", label: "Newest first" },
                        { key: "created", dir: "asc",  label: "Oldest first" },
                      ]}
                    />
                  </div>
                </div>

                {filteredUsers.length === 0 ? (
                  <div className="p-10 text-center">
                    <Users className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                    <p className="text-base font-semibold text-slate-950">No users found</p>
                    <p className="mt-1 text-sm text-slate-600">
                      {searchTerm ? "Clear the search or try another role name." : "Add the first staff login from the button above."}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200">
                    {filteredUsers.map((targetUser) => {
                      const roles = userAccessRoles(targetUser);
                      const primaryRole = roleMetaFor(targetUser.primary_department || targetUser.role);
                      const PrimaryIcon = primaryRole?.icon || UserCircle;
                      const primaryFallbackRole = normalizeRoleValue(
                        targetUser.active_role,
                        normalizeRoleValue(targetUser.role as string | null | undefined),
                      );
                      const activity = loginActivityBucket(targetUser.last_sign_in_at);
                      return (
                        <div key={targetUser.id} className="p-4 transition-colors hover:bg-slate-50/70">
                          <div className="grid gap-4 xl:grid-cols-[minmax(220px,1.15fr)_minmax(220px,1fr)_170px_220px] xl:items-start">
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-sm font-semibold text-slate-700">
                                  {(targetUser.full_name || targetUser.email || "?").slice(0, 2).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                                    <h3 className="truncate text-sm font-semibold text-slate-950">
                                      {targetUser.full_name || "Unnamed User"}
                                    </h3>
                                    <Badge className={targetUser.is_active ? "border-brand-primary/20 bg-brand-primary/10 text-brand-primary" : "border-slate-200 bg-slate-100 text-slate-700"}>
                                      {targetUser.is_active ? "Active" : "Inactive"}
                                    </Badge>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await navigator.clipboard.writeText(String(targetUser.email || ""));
                                        toast({ title: "Email copied", description: targetUser.email || "" });
                                      } catch {
                                        toast({ title: "Copy failed", description: "Browser blocked clipboard access.", variant: "destructive" });
                                      }
                                    }}
                                    className="mt-0.5 block max-w-full truncate text-left text-xs text-slate-600 hover:text-slate-950 hover:underline"
                                    title="Copy email"
                                  >
                                    {targetUser.email || "No email"}
                                  </button>
                                </div>
                              </div>
                            </div>

                            <div className="min-w-0">
                              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-500">
                                <PrimaryIcon className="h-3.5 w-3.5" />
                                <span>Access</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {roles.length > 0 ? (
                                  roles.map((dept) => {
                                    const config = roleMetaFor(dept);
                                    const Icon = config?.icon || UserCircle;
                                    const isPrimary = dept === normalizeRoleValue(targetUser.primary_department, primaryFallbackRole);
                                    return (
                                      <Badge key={dept} className={`text-xs ${config?.color} ${isPrimary ? "ring-2 ring-offset-1 ring-slate-500" : ""}`}>
                                        <Icon className="mr-1 h-3 w-3" />
                                        {config?.label || dept}
                                      </Badge>
                                    );
                                  })
                                ) : (
                                  <Badge className="bg-slate-100 text-slate-600">No access assigned</Badge>
                                )}
                              </div>
                            </div>

                            <div className="text-xs text-slate-600">
                              <p className="font-medium text-slate-950">Activity</p>
                              <span
                                className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${activity.tone}`}
                                title={
                                  targetUser.last_sign_in_at
                                    ? `Last sign-in: ${new Date(targetUser.last_sign_in_at).toLocaleString("en-ZA")}`
                                    : "No login recorded yet"
                                }
                              >
                                {activity.label}
                              </span>
                              <p className="mt-1">
                                Joined {formatLocalDate(targetUser.created_at || Date.now())}
                              </p>
                              {targetUser.phone_number && (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(String(targetUser.phone_number || ""));
                                      toast({ title: "Phone copied", description: targetUser.phone_number });
                                    } catch {
                                      toast({ title: "Copy failed", description: "Browser blocked clipboard access.", variant: "destructive" });
                                    }
                                  }}
                                  className="mt-1 block text-slate-700 hover:text-slate-950 hover:underline"
                                  title="Copy phone number"
                                >
                                  {targetUser.phone_number}
                                </button>
                              )}
                            </div>

                            {editingUser !== targetUser.id && (
                              <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditUser(targetUser.id)}
                                  className="h-9 text-sm"
                                >
                                  <Edit className="mr-2 h-4 w-4" />
                                  Edit access
                                </Button>
                                {targetUser.is_active ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setConfirmDeactivate(targetUser)}
                                    disabled={statusBusy === targetUser.id || targetUser.id === user?.id}
                                    title={targetUser.id === user?.id ? "You can't deactivate yourself" : "Stop this user from signing in"}
                                    className="h-9 border-rose-300 text-sm text-rose-700 hover:bg-rose-50"
                                  >
                                    <UserX className="mr-2 h-4 w-4" />
                                    Deactivate
                                  </Button>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleStatusToggle(targetUser, true)}
                                    disabled={statusBusy === targetUser.id}
                                    className="h-9 border-brand-primary/30 text-sm text-brand-primary hover:bg-brand-primary/10"
                                  >
                                    <UserCheck className="mr-2 h-4 w-4" />
                                    {statusBusy === targetUser.id ? "Saving..." : "Reactivate"}
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>

                      {editingUser === targetUser.id && (
                        <div className="mt-4 space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-3 md:p-4">
                          {/* USR-D (task #209, 2026-05-25): grouped
                              picker with per-role descriptions. The
                              old flat 7-checkbox grid gave no hint
                              what each role meant - operators had
                              to guess whether an "owner-admin"
                              needed Admin or Company Admin or both.
                              Now: 4 groups (Leadership /
                              Administrative / Operational / Client),
                              one-line description per role, and a
                              smart guidance banner that catches the
                              most common mistakes. */}
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                              <Label className="font-semibold text-slate-700 text-sm md:text-base">
                                Assign access
                              </Label>
                              <span className="text-[11px] text-slate-500">
                                {selectedDepartments.length === 0
                                  ? "Pick at least one role"
                                  : `${selectedDepartments.length} role${selectedDepartments.length === 1 ? "" : "s"} selected`}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 mb-3">
                              Most staff need one or two roles. Tick every portal this person should be able to open. The <strong>Primary</strong> role is where they land after login.
                            </p>

                            {/* USR-D: smart-guidance banner. Shown
                                only when the current selection
                                trips a known footgun (owner without
                                company_admin, redundant admin tick,
                                client+staff mix). */}
                            {guidance && (
                              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 mb-3 flex items-start gap-2">
                                <AlertCircle className="w-3.5 h-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
                                <span>{guidance}</span>
                              </div>
                            )}

                            <div className="space-y-3">
                              {ROLE_GROUPS.map((group) => {
                                const rolesInGroup = roleConfig.filter((r) => r.group === group.key);
                                if (rolesInGroup.length === 0) return null;
                                return (
                                  <div key={group.key} className="rounded-lg border border-slate-200 bg-white p-2.5">
                                    <div className="flex items-baseline justify-between gap-2 mb-1.5 flex-wrap">
                                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                        {group.label}
                                      </p>
                                      <p className="text-[10px] text-slate-500 italic">{group.hint}</p>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      {rolesInGroup.map((role) => {
                                        const isSelected = selectedDepartments.includes(role.value);
                                        const isPrimary = primaryDepartment === role.value;
                                        return (
                                          <div
                                            key={role.value}
                                            className={`relative rounded-md border-2 transition-all p-2.5 ${
                                              isPrimary
                                                ? "border-slate-500 bg-slate-50"
                                                : isSelected
                                                  ? "border-slate-400 bg-white"
                                                  : "border-slate-200 bg-slate-50/60 hover:bg-white"
                                            }`}
                                          >
                                            <div className="flex items-start gap-2">
                                              <Checkbox
                                                id={`${targetUser.id}-${role.value}`}
                                                checked={isSelected}
                                                onCheckedChange={() => handleDepartmentToggle(role.value)}
                                                className="mt-0.5"
                                              />
                                              <div className="flex-1 min-w-0">
                                                <Label
                                                  htmlFor={`${targetUser.id}-${role.value}`}
                                                  className="text-sm font-semibold flex items-center gap-1.5 cursor-pointer"
                                                >
                                                  <role.icon className="w-3.5 h-3.5 flex-shrink-0" />
                                                  <span className="truncate">{role.label}</span>
                                                  {isPrimary && (
                                                    <Badge className="bg-slate-100 text-slate-700 border-0 text-[9px] ml-1">
                                                      Primary
                                                    </Badge>
                                                  )}
                                                </Label>
                                                <p className="text-[11px] text-slate-600 leading-snug mt-0.5">
                                                  {role.description}
                                                </p>
                                                {isSelected && !isPrimary && selectedDepartments.length > 1 && (
                                                  <button
                                                    type="button"
                                                    onClick={() => handleSetPrimary(role.value)}
                                                    className="text-[10px] text-slate-700 hover:underline mt-1"
                                                  >
                                                    Set as Primary
                                                  </button>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            <p className="text-xs text-slate-600 mt-3">
                              {primaryDepartment
                                ? <>Primary: <strong>{roleMetaFor(primaryDepartment)?.label}</strong>. They land here after login; can switch portals from the persona menu.</>
                                : "Select at least one role above."}
                            </p>
                          </div>
                          
                          <div className="flex flex-col sm:flex-row gap-2 pt-2">
                            <div className="flex items-center gap-2 w-full sm:w-auto">
                              <InfoTooltip
                                content={"Save these department assignments. The user will be able to access every portal you have ticked."}
                                side="top"
                              />
                              <Button 
                                onClick={() => handleSaveRoles(targetUser.id)}
                                className="bg-brand-primary hover:bg-brand-primary/90 flex-1 sm:flex-initial text-sm"
                                disabled={selectedDepartments.length === 0 || saving}
                                size="sm"
                              >
                                {saving ? (
                                  <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Saving...
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle className="w-4 h-4 mr-2" />
                                    Save Departments
                                  </>
                                )}
                              </Button>
                            </div>
                            <Button 
                              variant="outline"
                              onClick={() => {
                                setEditingUser(null);
                                setSelectedDepartments([]);
                                setPrimaryDepartment(null);
                              }}
                              className="w-full sm:w-auto text-sm"
                              size="sm"
                              disabled={saving}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-950">Pending invitations</h2>
                    <p className="text-xs text-slate-500">{pendingInviteCount} waiting to accept</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={loadInvitations} disabled={invitationsLoading}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${invitationsLoading ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>
                <div className="p-4">
                  <PendingInvitationsList
                    invitations={invitations}
                    loading={invitationsLoading}
                    onCancel={handleCancelInvitation}
                  />
                </div>
              </section>
            </main>
          </div>
        </PortalShell>
      </div>

      {/* USR-C (task #208, 2026-05-24): Invite User dialog. Calls
          the existing inviteStaffMember service (now functional
          after the staff_invitations email + full_name migration). */}
      <Dialog
        open={inviteOpen}
        onOpenChange={(o) => {
          if (!o) {
            setInviteOpen(false);
            setCreateResult(null);
            setInviteEmail("");
            setInviteName("");
            setInviteRole(UserRole.KITCHEN_STAFF);
          }
        }}
      >
        <DialogContent className="max-w-md">
          {createResult ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <MailWarning className="w-5 h-5 text-amber-500" />
                  {createResult.emailed ? "User added - sign-in details" : "Share these sign-in details"}
                </DialogTitle>
                <DialogDescription>
                  {createResult.emailed
                    ? "We emailed them a link to set their own password. They can also sign in right away with the temporary password below."
                    : "No email sender is set up yet, so we couldn't email the invite. Pass these details to the user directly."}
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
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={copyCreateResult} className="gap-1.5">
                  <Copy className="w-4 h-4" /> Copy details
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setInviteOpen(false);
                    setCreateResult(null);
                    setInviteEmail("");
                    setInviteName("");
                    setInviteRole(UserRole.KITCHEN_STAFF);
                  }}
                  className="bg-brand-primary hover:opacity-90"
                >
                  Done
                </Button>
              </DialogFooter>
            </>
          ) : (
          <>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-slate-600" />
              Add new user
            </DialogTitle>
            <DialogDescription>
              They're created right away and we'll show you a temporary password to share. If an email sender is set up, they also get an invite link to set their own password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Email</Label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="e.g. sipho@spitbraaidelivery.co.za"
                className="mt-1"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Full name (optional)</Label>
              <Input
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Sipho Dlamini"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Role</Label>
              <Select value={String(inviteRole)} onValueChange={(v) => setInviteRole(v as UserRole)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UserRole.ADMIN}>Admin</SelectItem>
                  <SelectItem value={UserRole.COMPANY_ADMIN}>Company Admin</SelectItem>
                  <SelectItem value={UserRole.KITCHEN_MANAGER}>Kitchen Manager</SelectItem>
                  <SelectItem value={UserRole.KITCHEN_STAFF}>Kitchen Team</SelectItem>
                  <SelectItem value={UserRole.DRIVER}>Driver</SelectItem>
                  <SelectItem value={UserRole.WAITER}>Waiter / Server</SelectItem>
                  <SelectItem value={UserRole.SHOPPING_STAFF}>Shopping Team</SelectItem>
                  <SelectItem value={UserRole.CLEANING_MANAGER}>Cleaning Manager</SelectItem>
                  <SelectItem value={UserRole.CLEANING_STAFF}>Cleaning Team</SelectItem>
                  <SelectItem value={UserRole.SALES_ADMIN}>Sales Admin</SelectItem>
                  <SelectItem value={UserRole.REGION_ADMIN}>Region Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-[11px] text-slate-500">
              Departments can be assigned on the user's row after they accept. The role here drives their initial portal default.
            </p>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={inviting}>Cancel</Button>
            </DialogClose>
            <Button
              onClick={handleInviteSubmit}
              disabled={inviting || !inviteEmail.trim()}
              className="bg-brand-primary hover:opacity-90 gap-1.5"
            >
              {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              {inviting ? "Adding..." : "Add user"}
            </Button>
          </DialogFooter>
          </>
          )}
        </DialogContent>
      </Dialog>

      {/* USR-C: deactivate confirm. Locking someone out is destructive
          enough to deserve a confirm. Reactivation skips it. */}
      <AlertDialog open={!!confirmDeactivate} onOpenChange={(o) => { if (!o) setConfirmDeactivate(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate this user?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDeactivate?.full_name || confirmDeactivate?.email} will not be able to sign in until you reactivate them.
              Their data stays - departments, history, payslips all remain.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusBusy === confirmDeactivate?.id}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDeactivate && handleStatusToggle(confirmDeactivate, false)}
              disabled={statusBusy === confirmDeactivate?.id}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {statusBusy === confirmDeactivate?.id ? "Saving..." : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// USR-C (task #208, 2026-05-24): pending invites tab body.
function PendingInvitationsList({
  invitations, loading, onCancel,
}: {
  invitations: PendingInvitation[];
  loading: boolean;
  onCancel: (id: string) => Promise<void>;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (invitations.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
        <Mail className="mx-auto mb-3 h-10 w-10 text-slate-300" />
        <p className="text-sm font-semibold text-slate-950">No pending invitations</p>
        <p className="mt-1 text-sm text-slate-600">New staff you add will appear here until they accept or expire.</p>
      </div>
    );
  }
  const nowMs = Date.now();
  return (
    <div className="divide-y divide-slate-200 rounded-xl border border-slate-200">
      {invitations.map((inv) => {
        const expiresMs = inv.expires_at ? new Date(inv.expires_at).getTime() : null;
        const expired = expiresMs != null && expiresMs < nowMs;
        return (
          <div key={inv.id} className="flex flex-wrap items-center gap-3 p-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100">
                <Mail className="h-4 w-4 text-amber-700" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="truncate text-sm font-semibold text-slate-950">{inv.full_name || inv.email || "Invitee"}</p>
                  {inv.role && (
                    <Badge variant="outline" className="text-[10px]">
                      {inv.role}
                    </Badge>
                  )}
                  {expired ? (
                    <Badge variant="destructive" className="text-[10px]">
                      <Clock className="mr-1 h-2.5 w-2.5" /> Expired
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">Pending</Badge>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-slate-600">{inv.email || "(no email captured)"}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Invited {inv.created_at ? formatLocalDate(inv.created_at) : "-"}
                  {inv.expires_at && (
                    <span className="ml-2">
                      Expires {formatLocalDate(inv.expires_at)}
                    </span>
                  )}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onCancel(inv.id)}
                className="gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Cancel
              </Button>
          </div>
        );
      })}
    </div>
  );
}

export default function UsersPage() {
  return (
    // USR-A (users audit, USR-2): dedupe COMPANY_ADMIN copy-paste
    // typo. Same pattern as CS-1 / STH-3 / HRS-1.
    // USR-B (task #207 must-fix, 2026-05-24): admit OWNER per
    // project_cateringms_owner_dashboard memo. Owner persona was
    // 403'd on their own tenant's user list - same drift fixed on
    // /admin/teams and /admin/inventory.
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.OWNER, UserRole.ADMIN]}>
      <AdminUsersPage />
    </ProtectedRoute>
  );
}
