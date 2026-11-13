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
import { AdminSearchField } from "@/components/admin/AdminControlSurface";
import {
  Users,
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
  UserPlus,
  UserX,
  UserCheck,
  Clock,
  Mail,
  Trash2,
  Copy,
  MailWarning,
  Send,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import Head from "next/head";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { userManagementService, StaffDirectoryUser } from "@/services/userManagementService";
import { notificationService } from "@/services/notificationService";
import { useToast } from "@/hooks/use-toast";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { WhatsAppTemplateSend } from "@/components/messaging/WhatsAppTemplateSend";
import { WhatsAppManualStaffSend } from "@/components/messaging/WhatsAppManualStaffSend";
import { useTenantHref } from "@/lib/tenantUrl";
import { formatLocalDate } from "@/lib/localFormat";
import { loginActivityBucket } from "@/lib/loginActivity";
import { toLocalISO } from "@/lib/localDate";
import { normalizeRoleValue as normalizeAppRoleValue } from "@/lib/roleDerivation";
import { getTenantSlugFromPathname } from "@/lib/tenantRoute";
import styles from "./users.module.css";

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

const WHATSAPP_STAFF_ROLES = new Set([
  "kitchen_manager", "kitchen_staff", "shopping_staff", "driver", "waiter", "cleaning_manager", "cleaning_staff",
]);

function AdminUsersPage() {
  const router = useRouter();
  const sessionHeaders = async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {};
  };
  const [users, setUsers] = useState<StaffDirectoryUser[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const usersLoadedRef = useRef(false);
  const usersRequestRef = useRef<Promise<void> | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | null>(null);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [invitationsLoading, setInvitationsLoading] = useState(false);
  const invitationsLoadedRef = useRef(false);
  // Surfaced in the Pending invitations panel; a silent failure here
  // looked identical to "no pending invitations".
  const [invitationsError, setInvitationsError] = useState<string | null>(null);
  // USR-C: Invite User dialog state.
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<UserRole>(UserRole.KITCHEN_STAFF);
  const [inviting, setInviting] = useState(false);
  // After Add user: show invite delivery status without exposing any password.
  const [createResult, setCreateResult] = useState<
    { email: string; name: string; loginUrl?: string; emailed?: boolean } | null
  >(null);
  // USR-C: Deactivate-confirm + role-mutation tracking. Held on a
  // per-user id so two clicks on different rows don't race.
  const [confirmDeactivate, setConfirmDeactivate] = useState<StaffDirectoryUser | null>(null);
  const [statusBusy, setStatusBusy] = useState<string | null>(null);
  const [resendingUserId, setResendingUserId] = useState<string | null>(null);
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
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [bulkRole, setBulkRole] = useState<UserRole | undefined>(undefined);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  // Wave 27.3: tenant-slug wrapper for internal navigations.
  const { withSlug } = useTenantHref();
  const { toast } = useToast();
  const routeTenantSlug = getTenantSlugFromPathname(router.asPath);

  // A bare /admin/users URL is ambiguous: this page is the staff list for
  // one catering company, while platform-wide users belong under the
  // platform user-management page. Keep direct bookmarks safe and make the
  // company visible in the URL before loading this tenant page.
  useEffect(() => {
    if (!router.isReady || !user || routeTenantSlug) return;
    const pathname = (router.asPath || "").split(/[?#]/)[0];
    if (pathname !== "/admin/users") return;

    const role = String(user.active_role || user.role || "").toLowerCase();
    if (role === UserRole.SUPER_ADMIN) {
      void router.replace("/admin/platform/user-management");
      return;
    }

    const companyUsersPath = withSlug("/admin/users");
    if (companyUsersPath !== "/admin/users") {
      void router.replace(companyUsersPath);
    }
  }, [router, user, routeTenantSlug, withSlug]);

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
    // Leadership - the business owner. Sees finance + all company controls.
    {
      value: UserRole.OWNER, label: "Company Owner", icon: Shield,
      color: "bg-amber-100 text-amber-800 border-amber-200",
      group: "leadership",
      description: "The business owner: full company control, finance, payroll, settings, and every region.",
    },
    // Administrative - company-wide access versus daily operations.
    {
      value: UserRole.COMPANY_ADMIN, label: "Business Administrator", icon: Shield,
      color: "bg-blue-100 text-blue-700 border-blue-200",
      group: "administrative",
      description: "Runs the company for the owner: full operational, finance, payroll, reporting, and all-region access.",
    },
    {
      value: UserRole.ADMIN, label: "Operations Administrator", icon: Shield,
      color: "bg-slate-100 text-slate-700 border-slate-200",
      group: "administrative",
      description: "Trusted day-to-day manager: orders, clients, calendar, dispatch, and staff. No sensitive finance settings, payment gateways, subscriptions, or company-wide payroll.",
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

  // Build the complete effective access list from the legacy profile role,
  // active portal, primary department, and every durable department row.
  // The admin view must show all roles even when a manager also has the
  // matching staff role; hiding one makes cross-trained access ambiguous.
  const userAccessRoles = (targetUser: StaffDirectoryUser): UserRole[] => {
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
    { key: "administrative", label: "Administrative",        hint: "Choose the access levels needed. Assign both Business and Operations for both views." },
    { key: "operational",    label: "Operational portals",   hint: "Hands-on roles. Tick any that apply if the user works in those teams too." },
    { key: "client",         label: "Client portal",         hint: "Only tick if this person should see their own client-facing view. Rare for staff." },
  ];

  // USR-D: smart guidance based on the current selection. Surfaces
  // the most common mistake or next-step suggestion above the
  // grid - redundant administrative selections or a client/staff mix.
  const guidance = useMemo(() => {
    const set = new Set<string>(selectedDepartments as unknown as string[]);
    if (set.has("client") && set.size > 1) {
      return "Client + a staff role is unusual. The client portal is locked to /c/ and won't share session with the admin portal.";
    }
    if (set.has("admin") && set.has("company_admin")) {
      return "Both administrator views are assigned. Set Primary to choose which one opens after sign-in.";
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

  const loadUsers = async (refreshAfterPending = false): Promise<void> => {
    if (usersRequestRef.current) {
      if (!refreshAfterPending) return usersRequestRef.current;
      await usersRequestRef.current;
      return loadUsers();
    }

    const isInitialLoad = !usersLoadedRef.current;
    if (isInitialLoad) setLoading(true);
    else setRefreshing(true);

    const request = (async () => {
      try {
        const fetchedUsers = await userManagementService.getStaffDirectory(user?.company_id);
        usersLoadedRef.current = true;
        setUsers(fetchedUsers);
        setError(null);
      } catch (error) {
        console.error("Error loading users:", error);
        setError(usersLoadedRef.current
          ? "Couldn't refresh the team list. Showing the last loaded roster."
          : "Failed to load users. Please try again.");
      } finally {
        setLoading(false);
        setRefreshing(false);
        usersRequestRef.current = null;
      }
    })();
    usersRequestRef.current = request;
    return request;
  };

  // USR-C (task #208, 2026-05-24): pending invitations loader.
  // Pulls staff_invitations for the tenant with status='pending'.
  // Expired invites surface with a chip so the operator can resend
  // or cancel.
  const loadInvitations = async () => {
    if (!user?.company_id) return;
    if (!invitationsLoadedRef.current) setInvitationsLoading(true);
    setInvitationsError(null);
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
      // Command-centre audit (2026-07-02): staff_invitations carries no
      // email / full_name columns, so every row rendered as "Invitee /
      // (no email captured)". The table DOES carry user_id (create-user
      // provisions the profile up front) - resolve identity through
      // profiles so the operator can tell pending invites apart.
      const rows = (data || []) as Array<PendingInvitation & { user_id?: string | null }>;
      const inviteeIds = Array.from(new Set(rows.map((r) => r.user_id).filter((id): id is string => Boolean(id))));
      if (inviteeIds.length > 0) {
        const { data: inviteeProfiles, error: profErr } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", inviteeIds);
        // Best-effort enrichment: a failed lookup keeps the plain rows.
        if (!profErr && inviteeProfiles) {
          const byId = new Map(
            (inviteeProfiles as Array<{ id: string; full_name: string | null; email: string | null }>)
              .map((p) => [p.id, p]),
          );
          for (const r of rows) {
            const p = r.user_id ? byId.get(r.user_id) : undefined;
            if (p) {
              r.full_name = r.full_name || p.full_name;
              r.email = r.email || p.email;
            }
          }
        }
      }
      setInvitations(rows);
      invitationsLoadedRef.current = true;
    } catch (err) {
      console.error("Error loading invitations:", err);
      setInvitationsError(err instanceof Error ? err.message : "Couldn't load pending invitations.");
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

  // Refresh only the panel affected by a live change. A short debounce
  // folds profile + department events from one role save together.
  useEffect(() => {
    if (!user?.company_id) return;
    let usersTimer: ReturnType<typeof setTimeout> | null = null;
    let invitationsTimer: ReturnType<typeof setTimeout> | null = null;
    const bumpUsers = () => {
      if (usersTimer) clearTimeout(usersTimer);
      usersTimer = setTimeout(() => void loadUsers(), 300);
    };
    const bumpInvitations = () => {
      if (invitationsTimer) clearTimeout(invitationsTimer);
      invitationsTimer = setTimeout(() => void loadInvitations(), 300);
    };
    const channel = supabase
      .channel(`admin-users:${user.company_id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `company_id=eq.${user.company_id}` }, bumpUsers)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_departments" }, bumpUsers)
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_invitations", filter: `company_id=eq.${user.company_id}` }, bumpInvitations)
      .subscribe();
    return () => {
      if (usersTimer) clearTimeout(usersTimer);
      if (invitationsTimer) clearTimeout(invitationsTimer);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id]);

  // Initial load of invitations.
  useEffect(() => {
    if (user?.company_id) void loadInvitations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id]);

  // Create the account server-side and send a one-time password setup link.
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

      void loadUsers(true);
      void loadInvitations();
      const emailed = payload.emailDelivered === true;

      setCreateResult({
        email: trimmedEmail,
        name: trimmedName || trimmedEmail.split("@")[0],
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

  // Copy only non-secret login guidance; password setup links stay in email.
  const copyCreateResult = async () => {
    if (!createResult) return;
    const text =
      `Email: ${createResult.email}\n` +
      (createResult.loginUrl ? `Sign in at: ${createResult.loginUrl}\n` : "") +
      (createResult.emailed
        ? "A one-time password setup link was emailed."
        : "The invite was not emailed. Configure the sender, then resend the invite from the user list.");
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
  const handleStatusToggle = async (targetUser: StaffDirectoryUser, nextActive: boolean) => {
    if (!user?.id) return;
    setStatusBusy(targetUser.id);
    try {
      await userManagementService.updateUserStatus(targetUser.id, nextActive, user.id);
      // Command-centre audit (2026-07-02): tell the person their access
      // is back. Best-effort + dedup - a failed notification never blocks
      // the status change. Deactivation skips the notify (they cannot
      // sign in to read it; the row would only confuse them later).
      if (nextActive) {
        void notificationService.createNotification({
            company_id: user.company_id,
            recipient_id: targetUser.id,
            notification_type: "account_reactivated",
            title: "Your account was reactivated",
            message: "An administrator restored your access. You can sign in again.",
            dedup: true,
          }).catch(() => undefined);
      }
      setUsers((current) => current.map((item) => item.id === targetUser.id
        ? { ...item, is_active: nextActive }
        : item));
      toast({
        title: nextActive ? "User reactivated" : "User deactivated",
        description: nextActive
          ? `${targetUser.full_name || targetUser.email} can sign in again.`
          : `${targetUser.full_name || targetUser.email} can no longer sign in. Reactivate from this page.`,
      });
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

  // Send a fresh set-password/login link without creating another user.
  // The server endpoint is tenant-scoped and is also used by the platform
  // user-management page, so this works for both pending invites and users
  // who already signed in but need a new login link.
  const handleResendInvite = async (targetUser: StaffDirectoryUser) => {
    if (!targetUser.email) {
      toast({
        title: "Email required",
        description: "Add an email address to this user before sending a login link.",
        variant: "destructive",
      });
      return;
    }

    setResendingUserId(targetUser.id);
    try {
      const res = await fetch("/api/admin/resend-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ userId: targetUser.id }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.ok) {
        throw new Error(payload?.error || "Could not send the login link.");
      }

      void loadInvitations();
      toast({
        title: targetUser.last_sign_in_at ? "Login link sent" : "Invite resent",
        description: payload.message || `A fresh link was sent to ${targetUser.email}.`,
      });
    } catch (err) {
      toast({
        title: "Could not send login link",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setResendingUserId(null);
    }
  };

  // USR-C: cancel a pending invitation. Service exists; reload on
  // success so the row drops out of the tab.
  const handleCancelInvitation = async (invitationId: string) => {
    try {
      await userManagementService.cancelInvitation(invitationId);
      setInvitations((current) => current.filter((invitation) => invitation.id !== invitationId));
      toast({ title: "Invitation cancelled" });
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

      const response = await fetch(`/api/admin/users/${userId}/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await sessionHeaders()) },
        body: JSON.stringify({
          departments: normalizedDepartments,
          primaryRole: normalizedPrimary,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "Failed to update user access");
      }

      // Command-centre audit (2026-07-02): the affected user should hear
      // about an access change without waiting to trip over a missing
      // (or new) portal. Best-effort + dedup; never blocks the save.
      if (userId !== user?.id) {
        const primaryLabel = roleMetaFor(normalizedPrimary)?.label || String(normalizedPrimary);
        void notificationService.createNotification({
          company_id: user?.company_id,
          recipient_id: userId,
          notification_type: "access_updated",
          title: "Your access was updated",
          message: `An administrator updated your portal access. Your primary role is now ${primaryLabel}.`,
          dedup: true,
          dedupWindowMinutes: 10,
        }).catch(() => undefined);
      }

      setUsers((current) => current.map((targetUser) => targetUser.id === userId
        ? {
            ...targetUser,
            active_role: normalizedPrimary,
            is_active: true,
            departments: normalizedDepartments,
            primary_department: normalizedPrimary,
          }
        : targetUser));

      setEditingUser(null);
      setSelectedDepartments([]);
      setPrimaryDepartment(null);

      toast({
        title: "Success",
        description: result.email?.userEmailSent
          ? "User roles updated, account activated, and access email sent"
          : "User roles updated and account activated; user email could not be sent",
      });
    } catch (error) {
      console.error("Error saving roles:", error);
      toast({
        title: "Could not save access",
        description: error instanceof Error
          ? error.message
          : "We could not save these roles. Check the selections and try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleUserSelection = (userId: string, checked: boolean) => {
    setSelectedUserIds((current) => {
      if (checked) return current.includes(userId) ? current : [...current, userId];
      return current.filter((id) => id !== userId);
    });
  };

  const toggleVisibleUserSelection = (checked: boolean) => {
    const visibleIds = filteredUsers.map((targetUser) => targetUser.id);
    setSelectedUserIds((current) => {
      if (checked) return Array.from(new Set([...current, ...visibleIds]));
      const visible = new Set(visibleIds);
      return current.filter((id) => !visible.has(id));
    });
  };

  const handleBulkAssignRole = async () => {
    if (selectedUserIds.length === 0 || !bulkRole) {
      toast({
        title: "Choose users and a role",
        description: "Select at least one staff user, then choose the role to add.",
        variant: "destructive",
      });
      return;
    }

    try {
      setBulkSaving(true);
      const response = await fetch("/api/admin/users/bulk-access", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await sessionHeaders()) },
        credentials: "same-origin",
        body: JSON.stringify({ user_ids: selectedUserIds, role: bulkRole }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) {
        throw new Error(result?.error || "Failed to assign the role");
      }

      const assignedUsers = new Set(selectedUserIds);
      setUsers((current) => current.map((targetUser) => {
        if (!assignedUsers.has(targetUser.id)) return targetUser;
        const departments = Array.from(new Set([...(targetUser.departments || []), bulkRole]));
        const currentPrimaryRole = normalizeRoleValue(
          targetUser.primary_department,
          normalizeRoleValue(
            targetUser.active_role,
            normalizeRoleValue(targetUser.role as string | null | undefined),
          ),
        );
        return {
          ...targetUser,
          is_active: true,
          departments,
          primary_department: currentPrimaryRole || bulkRole,
          active_role: targetUser.active_role || targetUser.role || bulkRole,
        };
      }));
      setSelectedUserIds([]);
      setBulkRole(undefined);
      const roleLabel = roleMetaFor(bulkRole)?.label || bulkRole;
      const assignedCount = Number(result.assigned_count || 0);
      const alreadyAssignedCount = Number(result.already_assigned_count || 0);
      const assignmentSummary = assignedCount > 0
        ? `${roleLabel} added to ${assignedCount} user${assignedCount === 1 ? "" : "s"}.`
        : `Every selected user already has ${roleLabel}.`;
      const alreadySummary = assignedCount > 0 && alreadyAssignedCount > 0
        ? ` ${alreadyAssignedCount} already had this role.`
        : "";
      toast({
        title: "Role assigned",
        description: `${assignmentSummary}${alreadySummary} Existing roles and primary roles were kept.`,
      });
    } catch (err) {
      toast({
        title: "Could not assign role",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setBulkSaving(false);
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

  useEffect(() => {
    const validIds = new Set(users.map((targetUser) => targetUser.id));
    setSelectedUserIds((current) => current.filter((id) => validIds.has(id)));
  }, [users]);

  const fuzzyOrAll = searchTerm ? fuzzyUsers : users;
  const roleFilteredUsers = roleFilter
    ? fuzzyOrAll.filter((targetUser) => userAccessRoles(targetUser).includes(roleFilter))
    : fuzzyOrAll;

  const userSortColumns: ColumnDef<StaffDirectoryUser>[] = useMemo(() => [
    { key: "name",    accessor: (u) => u.full_name || u.email,                type: "string" },
    { key: "role",    accessor: (u) => (u.role || "").toString(),             type: "string" },
    { key: "email",   accessor: (u) => u.email || "",                         type: "string" },
    { key: "created", accessor: (u) => u.created_at,                          type: "date"   },
  ], []);
  const userSort = useSortable<StaffDirectoryUser>(roleFilteredUsers, userSortColumns, { defaultKey: "name", defaultDir: "asc" });
  const filteredUsers = userSort.rows;
  const visibleUserIds = filteredUsers.map((targetUser) => targetUser.id);
  const allVisibleUsersSelected = visibleUserIds.length > 0 && visibleUserIds.every((id) => selectedUserIds.includes(id));
  const activeUserCount = users.filter((u) => u.is_active).length;
  const inactiveUserCount = Math.max(users.length - activeUserCount, 0);
  const pendingInviteCount = invitations.length;
  const roleCount = (role: UserRole) =>
    users.filter((targetUser) => userAccessRoles(targetUser).includes(role)).length;
  const visibleUserLabel = roleFilter
    ? `${filteredUsers.length} ${roleMetaFor(roleFilter)?.label || "role"} staff · ${users.length} total`
    : searchTerm
      ? `${filteredUsers.length} of ${users.length} staff`
      : `${users.length} staff users`;

  if (loading) {
    return (
      <>
        <NoIndexMeta />
        <Head>
          <meta name="robots" content="noindex, nofollow" />
          <title>User management - CateringMS</title>
        </Head>
        
        <AdminNav />

        <div className={`admin-page-shell ${styles.shell}`}>
          <div className={styles.content}>
            <div className={styles.eyebrow}>Staff directory · access management</div>
            <header className={styles.header}>
              <div>
                <h1 className={styles.title}>People &amp; access</h1>
                <p className={styles.subtitle}>Loading the latest team roster and access assignments…</p>
              </div>
            </header>
            <div className={styles.summaryGrid} aria-hidden="true">
              {[0, 1, 2, 3].map((i) => <div key={i} className={`${styles.loadingCard} animate-pulse`} />)}
            </div>
            <div className={styles.loadingCard} aria-hidden="true" />
            <p className="mt-5 text-center text-sm text-slate-600">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
              Loading users…
            </p>
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
        
        <div className={`admin-page-shell ${styles.shell}`}>
          <div className={styles.content}>
            <Card className="mx-auto max-w-2xl border border-rose-200 bg-white">
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
      
      <div className={`admin-page-shell ${styles.shell}`}>
        <div className={styles.content}>
          <div className={styles.eyebrow}>Staff directory · access management</div>
          <header className={styles.header}>
            <div>
              <h1 className={styles.title}>People &amp; access</h1>
              <p className={styles.subtitle}>Manage staff accounts, team assignments, and portal access. Client accounts are managed in Contacts.</p>
            </div>
            <div className={styles.headerActions}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { void Promise.all([loadUsers(), loadInvitations()]); }}
                disabled={loading || refreshing || invitationsLoading}
                aria-label="Refresh users and invitations"
                title="Refresh users and invitations"
                className={styles.secondaryAction}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${refreshing || invitationsLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
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
                      esc(u.phone_number || u.mobile_number || ""),
                      esc(u.primary_department || ""),
                      esc((u.departments || []).join("; ")),
                      esc(u.created_at ? toLocalISO(new Date(u.created_at)) : ""),
                    ].join(","));
                  }
                  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
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
                className={styles.secondaryAction}
              >
                <Download className="mr-2 h-4 w-4" />
                Export CSV
              </Button>
              <Button
                size="sm"
                onClick={() => setInviteOpen(true)}
                className={styles.primaryAction}
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Invite staff
              </Button>
            </div>
          </header>

          {/* Logged-in load failure remains visible alongside the last roster. */}
          {error && user && (
            <div className={styles.errorBanner}>
              <p className="text-sm font-semibold">
                {usersLoadedRef.current ? "Couldn't refresh the team list" : "Couldn't load the team list"}
              </p>
              <p className="mt-1 text-sm">{error}</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => { void loadUsers(); }} disabled={loading || refreshing}>
                <RefreshCw className="mr-2 h-4 w-4" />Retry
              </Button>
            </div>
          )}

          <div className={styles.summaryGrid}>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Staff accounts</span>
              <strong className={styles.metricValue}>{users.length}</strong>
              <span className={styles.metricNote}>All teams in this company</span>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Active</span>
              <strong className={styles.metricValue}>{activeUserCount}</strong>
              <span className={styles.metricNote}>Can sign in</span>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Inactive</span>
              <strong className={styles.metricValue}>{inactiveUserCount}</strong>
              <span className={styles.metricNote}>Can be reactivated here</span>
            </div>
            <div className={styles.metric}>
              <span className={styles.metricLabel}>Invitations waiting</span>
              <strong className={styles.metricValue}>{pendingInviteCount}</strong>
              <span className={styles.metricNote}>Pending staff sign-in</span>
            </div>
          </div>

          <div className={styles.layout}>
            <aside className={styles.aside}>
              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2 className={styles.panelTitle}>Access overview</h2>
                    <span className={styles.panelHint}>Choose a role to filter staff</span>
                  </div>
                  {roleFilter && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setRoleFilter(null)} className="h-7 px-2 text-xs text-emerald-900">
                      Clear
                    </Button>
                  )}
                </div>
                <div className={styles.roleGroups}>
                  {ROLE_GROUPS.filter((group) => group.key !== "client").map((group) => {
                    const rolesInGroup = roleConfig.filter((role) => role.group === group.key);
                    if (rolesInGroup.length === 0) return null;
                    return (
                      <div key={group.key} className={styles.roleGroup}>
                        <div className={styles.roleGroupHeader}>
                          <p className={styles.roleGroupTitle}>{group.label}</p>
                          <p className={styles.roleGroupHint}>{group.key === "operational" ? "Portal assignments" : group.key === "administrative" ? "Company access" : "Full access"}</p>
                        </div>
                        <div className={styles.roleList}>
                          {rolesInGroup.map((role) => {
                            const count = roleCount(role.value);
                            return (
                              <button
                                key={role.value}
                                type="button"
                                className={styles.roleFilter}
                                aria-pressed={roleFilter === role.value}
                                onClick={() => setRoleFilter((current) => current === role.value ? null : role.value)}
                                title={`Show ${count} ${role.label} ${count === 1 ? "staff member" : "staff members"}`}
                              >
                                <span className={styles.roleFilterName}>
                                  <role.icon className={`${styles.roleIcon} h-3.5 w-3.5`} aria-hidden="true" />
                                  <span className="truncate">{role.label}</span>
                                </span>
                                <span className={styles.roleCount}>{count}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </aside>

            <main className={styles.mainColumn}>
              <section className={styles.directoryPanel}>
                <div className={styles.directoryHeader}>
                  <div>
                    <h2 className={styles.directoryHeading}>Staff directory</h2>
                    <div className={styles.directorySubhead}>
                      <span>{visibleUserLabel}</span>
                      {refreshing && (
                        <span role="status" aria-live="polite" className={styles.updating}>
                          <Loader2 className="h-3 w-3 animate-spin" /> Updating
                        </span>
                      )}
                      {roleFilter && <span>· {roleMetaFor(roleFilter)?.label}</span>}
                    </div>
                  </div>
                  <div className={styles.tools}>
                    <AdminSearchField
                      inputRef={searchRef}
                      placeholder="Search name, email, or role"
                      value={searchTerm}
                      onChange={setSearchTerm}
                    />
                    <SortMenu
                      activeKey={userSort.sortKey}
                      activeDir={userSort.sortDir}
                      onPick={userSort.setSort}
                      options={[
                        { key: "name", dir: "asc", label: "Name (A to Z)" },
                        { key: "name", dir: "desc", label: "Name (Z to A)" },
                        { key: "role", dir: "asc", label: "Role (A to Z)" },
                        { key: "email", dir: "asc", label: "Email (A to Z)" },
                        { key: "created", dir: "desc", label: "Newest first" },
                        { key: "created", dir: "asc", label: "Oldest first" },
                      ]}
                    />
                  </div>
                </div>
                <div className={styles.selectionBar}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <label className={styles.selectAll}>
                      <Checkbox
                        id="select-visible-users"
                        checked={allVisibleUsersSelected}
                        onCheckedChange={(checked) => toggleVisibleUserSelection(checked === true)}
                        aria-label="Select all visible staff users"
                      />
                      <span>Select all visible users</span>
                      {selectedUserIds.length > 0 && (
                        <Badge className="border-slate-200 bg-white text-slate-700">
                          {selectedUserIds.length} selected
                        </Badge>
                      )}
                    </label>
                    {selectedUserIds.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedUserIds([]);
                          setBulkRole(undefined);
                        }}
                        disabled={bulkSaving}
                        className="w-full text-slate-600 sm:w-auto"
                      >
                        Clear selection
                      </Button>
                    )}
                  </div>

                  {selectedUserIds.length > 0 && (
                    <div className={styles.bulkBox}>
                      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <div>
                          <p className={styles.bulkTitle}>Add one role to the selected users</p>
                          <p className={styles.bulkDescription}>
                            This adds the role to everyone selected. Their existing roles and login destination stay unchanged.
                          </p>
                        </div>
                        <div className={styles.bulkActions}>
                          <Select value={bulkRole} onValueChange={(value) => setBulkRole(value as UserRole)}>
                            <SelectTrigger className="w-full bg-white sm:w-[220px]">
                              <SelectValue placeholder="Choose a role to add" />
                            </SelectTrigger>
                            <SelectContent>
                              {roleConfig
                                .filter((role) => role.group !== "client")
                                .map((role) => (
                                  <SelectItem key={role.value} value={role.value}>
                                    {role.label}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            onClick={handleBulkAssignRole}
                            disabled={!bulkRole || bulkSaving}
                            className="bg-brand-primary hover:bg-brand-primary/90"
                          >
                            {bulkSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
                            {bulkSaving ? "Assigning..." : "Assign role"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {filteredUsers.length === 0 ? (
                  <div className={styles.emptyState}>
                    <Users className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                    <p className={styles.emptyTitle}>No users found</p>
                    <p className={styles.emptyCopy}>
                      {searchTerm ? "Clear the search or try another role name." : "Add the first staff login from the button above."}
                    </p>
                  </div>
                ) : (
                  <div className={styles.staffList}>
                    {filteredUsers.map((targetUser) => {
                      const roles = userAccessRoles(targetUser);
                      const primaryFallbackRole = normalizeRoleValue(
                        targetUser.active_role,
                        normalizeRoleValue(targetUser.role as string | null | undefined),
                      );
                      const primaryRoleValue = normalizeRoleValue(
                        targetUser.primary_department,
                        primaryFallbackRole,
                      ) || primaryFallbackRole;
                      const primaryRole = roleMetaFor(primaryRoleValue);
                      const PrimaryIcon = primaryRole?.icon || UserCircle;
                      const activeRoleValue = normalizeRoleValue(targetUser.active_role, primaryFallbackRole);
                      const activity = loginActivityBucket(targetUser.last_sign_in_at);
                      return (
                        <div key={targetUser.id} className={styles.staffRow}>
                          <div className={styles.staffGrid}>
                            <div className={styles.personCell}>
                              <div className="flex min-w-0 items-center gap-3">
                                <Checkbox
                                  id={`select-user-${targetUser.id}`}
                                  checked={selectedUserIds.includes(targetUser.id)}
                                  onCheckedChange={(checked) => toggleUserSelection(targetUser.id, checked === true)}
                                  aria-label={`Select ${targetUser.full_name || targetUser.email || "staff user"}`}
                                />
                                <div className={styles.avatar}>
                                  {(targetUser.full_name || targetUser.email || "?").slice(0, 2).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                                    <h3 className={styles.personName}>
                                      {targetUser.full_name || "Unnamed User"}
                                    </h3>
                                    <Badge className={`${styles.accountStatus} ${targetUser.is_active ? "" : styles.inactiveStatus}`}>
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
                                    className={styles.emailButton}
                                    title="Copy email"
                                  >
                                    {targetUser.email || "No email"}
                                  </button>
                                </div>
                              </div>
                            </div>

                            <div className={styles.accessCell}>
                              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
                                <PrimaryIcon className="h-3.5 w-3.5" />
                                <span>Access</span>
                                <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-semibold">
                                  {roles.length} {roles.length === 1 ? "role" : "roles"}
                                </Badge>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {roles.length > 0 ? (
                                  roles.map((dept) => {
                                    const config = roleMetaFor(dept);
                                    const Icon = config?.icon || UserCircle;
                                    const isPrimary = dept === primaryRoleValue;
                                    const isActive = dept === activeRoleValue;
                                    return (
                                      <Badge
                                        key={dept}
                                        title={`${config?.label || dept}${isPrimary ? " · primary role" : ""}${isActive ? " · active portal" : ""}`}
                                        aria-label={`${config?.label || dept}${isPrimary ? ", primary role" : ""}${isActive ? ", active portal" : ""}`}
                                        className={`${styles.roleChip} ${isPrimary ? styles.primaryRoleChip : styles.secondaryRoleChip}`}
                                      >
                                        <Icon className="h-3 w-3 shrink-0" />
                                        <span className="min-w-0">{config?.label || dept}</span>
                                        {isPrimary && <span className="shrink-0 text-[10px] opacity-75">Primary</span>}
                                        {isActive && <span className="shrink-0 text-[10px] opacity-75">Active</span>}
                                      </Badge>
                                    );
                                  })
                                ) : (
                                  <Badge className={styles.secondaryRoleChip}>No access assigned</Badge>
                                )}
                              </div>
                            </div>

                            <div className={styles.activityCell}>
                              <span className={styles.activityLabel}>Activity</span>
                              <span
                                className={styles.activityPill}
                                data-activity={activity.kind}
                                title={
                                  targetUser.last_sign_in_at
                                    ? `Last sign-in: ${new Date(targetUser.last_sign_in_at).toLocaleString("en-ZA")}`
                                    : "No login recorded yet"
                                }
                              >
                                {activity.label}
                              </span>
                              <p className={styles.personMeta}>
                                {/* No fake fallback: showing today's date
                                    for a missing created_at claimed the
                                    user joined just now. */}
                                Joined {targetUser.created_at ? formatLocalDate(targetUser.created_at) : "--"}
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
                                  className={styles.phoneButton}
                                  title="Copy phone number"
                                >
                                  {targetUser.phone_number}
                                </button>
                              )}
                              {targetUser.is_active && roles.some((role) => WHATSAPP_STAFF_ROLES.has(String(role))) && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  <WhatsAppTemplateSend
                                    entityType="staff"
                                    entityId={targetUser.id}
                                    companyId={user?.company_id}
                                    recipientName={targetUser.full_name}
                                    buttonLabel="Send welcome"
                                  />
                                  <WhatsAppManualStaffSend
                                    messageKey="whatsapp_staff_check_in"
                                    recipientName={targetUser.full_name || "staff member"}
                                    recipientPhone={targetUser.mobile_number || targetUser.phone_number}
                                    buttonLabel="Check in"
                                  />
                                </div>
                              )}
                            </div>

                            {editingUser !== targetUser.id && (
                              <div className={styles.actionsCell}>
                                {targetUser.is_active && targetUser.email && targetUser.id !== user?.id && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleResendInvite(targetUser)}
                                    disabled={resendingUserId === targetUser.id}
                                    title={targetUser.last_sign_in_at ? "Send a fresh login link" : "Resend the expired or missing invite"}
                                    className={styles.resendAction}
                                  >
                                    {resendingUserId === targetUser.id ? (
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                      <Send className="mr-2 h-4 w-4" />
                                    )}
                                    {resendingUserId === targetUser.id
                                      ? "Sending..."
                                      : targetUser.last_sign_in_at
                                        ? "Send login link"
                                        : "Resend invite"}
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditUser(targetUser.id)}
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
                                    className={styles.dangerAction}
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
                                    className={styles.reactivateAction}
                                  >
                                    <UserCheck className="mr-2 h-4 w-4" />
                                    {statusBusy === targetUser.id ? "Saving..." : "Reactivate"}
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>

                      {editingUser === targetUser.id && (
                        <div className={styles.editor}>
                          {/* USR-D (task #209, 2026-05-25): grouped
                              picker with per-role descriptions. The
                              old flat 7-checkbox grid gave no hint
                              what each role meant - operators had
                              to guess whether an "owner-admin"
                              needed both a Business Administrator and an Operations Administrator.
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
                                trips a known footgun (redundant admin
                                tick or client+staff mix). */}
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
                                  <div key={group.key} className={`${styles.editorGroup} rounded-lg border p-2.5`}>
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
                                            className={`${styles.editorChoice} ${isPrimary ? styles.editorPrimary : ""} ${isSelected ? styles.editorChoiceSelected : ""} relative rounded-md border p-2.5`}
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

              <section className={`${styles.panel} ${styles.pendingPanel}`}>
                <div className={styles.panelHeader}>
                  <div>
                    <h2 className={styles.panelTitle}>Pending invitations</h2>
                    <p className={styles.panelHint}>{pendingInviteCount} waiting to accept</p>
                  </div>
                </div>
                <div className={styles.pendingBody}>
                  {invitationsError ? (
                    <div className={styles.errorBanner}>
                      <p className="text-sm font-semibold">Couldn&apos;t load pending invitations</p>
                      <p className="mt-1 text-sm">{invitationsError}</p>
                      <Button size="sm" variant="outline" className="mt-3" onClick={loadInvitations} disabled={invitationsLoading}>
                        Retry
                      </Button>
                    </div>
                  ) : (
                    <PendingInvitationsList
                      invitations={invitations}
                      loading={invitationsLoading}
                      onCancel={handleCancelInvitation}
                    />
                  )}
                </div>
              </section>
            </main>
          </div>
        </div>
      </div>

      {/* The dialog provisions a company-scoped account through the
          authenticated admin API, then offers the recipient a secure
          password setup link. */}
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
        <DialogContent className={`${styles.dialog} max-w-md`}>
          {createResult ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <MailWarning className="w-5 h-5 text-amber-500" />
                  {createResult.emailed ? "User added - invite sent" : "User added - invite not sent"}
                </DialogTitle>
                <DialogDescription>
                  {createResult.emailed
                    ? "We emailed a one-time link so they can set their own password. No password is shared with admins."
                    : "We couldn't email the invite. Configure an email sender, then use Resend invite from the user list."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm space-y-1.5">
                  <div><span className="text-slate-500">Email:</span> <strong>{createResult.email}</strong></div>
                  {createResult.loginUrl && (
                    <div>
                      <span className="text-slate-500">Sign in at:</span>{" "}
                      <strong className="break-all">{createResult.loginUrl}</strong>
                    </div>
                  )}
                  <p className="text-xs text-slate-500 pt-1">
                    {createResult.emailed ? "The invitee sets their own password through the email link." : "Send a fresh invite after email delivery is configured."}
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
              The account is created on the server and the user receives a one-time email link to set their password. Admins never see or share that password.
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
                  {roleConfig.map((role) => (
                      <SelectItem key={role.value} value={role.value} className="py-2">
                        <div className="pr-4">
                          <p className="font-medium">{role.label}</p>
                          <p className="mt-0.5 max-w-[340px] whitespace-normal text-[11px] leading-snug text-slate-500">
                            {role.description}
                          </p>
                        </div>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            {roleMetaFor(inviteRole) && (
              <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-900">
                <strong>{roleMetaFor(inviteRole)?.label}:</strong> {roleMetaFor(inviteRole)?.description}
              </div>
            )}
            <p className="text-[11px] text-slate-500">
              Choose the role that matches the person&apos;s responsibility. The role sets their initial portal and access level; additional operational roles can be added later from the user&apos;s row. Super Admin is platform-only and cannot be created from a company Teams Hub.
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
        <AlertDialogContent className={styles.dialog}>
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
      <div className={styles.pendingEmpty}>
        <Mail className="mx-auto mb-3 h-10 w-10 text-slate-300" />
        <p className={styles.pendingEmptyTitle}>No pending invitations</p>
        <p className={styles.pendingEmptyCopy}>New staff you add will appear here until they accept or expire.</p>
      </div>
    );
  }
  const nowMs = Date.now();
  return (
    <div className={styles.pendingList}>
      {invitations.map((inv) => {
        const expiresMs = inv.expires_at ? new Date(inv.expires_at).getTime() : null;
        const expired = expiresMs != null && expiresMs < nowMs;
        return (
          <div key={inv.id} className={styles.pendingRow}>
              <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${styles.inviteAvatar}`}>
                <Mail className="h-4 w-4 text-amber-700" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={styles.inviteName}>{inv.full_name || inv.email || "Invitee"}</p>
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
                <p className={styles.inviteMeta}>{inv.email || "(no email captured)"}</p>
                <p className={styles.inviteMeta}>
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
                className={styles.cancelInvite}
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
