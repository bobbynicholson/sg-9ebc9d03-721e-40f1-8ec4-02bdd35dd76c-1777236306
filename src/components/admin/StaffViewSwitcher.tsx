import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-mobile";
import { Check, ChefHat, Eye, LayoutDashboard, ShoppingCart, Sparkles, Truck, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { deriveUserRoles, normalizeRoleValue } from "@/lib/roleDerivation";
import { roleService } from "@/services/roleService";
import { UserRole } from "@/types/app";

interface StaffMember {
  id: string;
  full_name: string;
  email: string;
  active_role: UserRole;
  roles: UserRole[];
}

interface ViewSwitcherProps {
  companySlug: string;
}

const DEPARTMENT_ROLES: Record<string, UserRole[]> = {
  driver: [UserRole.DRIVER],
  waiter: [UserRole.WAITER],
  kitchen: [UserRole.KITCHEN_MANAGER, UserRole.KITCHEN_STAFF],
  shopping: [UserRole.SHOPPING_STAFF],
  cleaning: [UserRole.CLEANING_MANAGER, UserRole.CLEANING_STAFF],
  admin: [UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.OWNER, UserRole.REGION_ADMIN, UserRole.SALES_ADMIN],
};

const STAFF_ROLE_GROUPS: Array<{ label: string; roles: UserRole[] }> = [
  { label: "Administrators", roles: DEPARTMENT_ROLES.admin },
  { label: "Drivers", roles: DEPARTMENT_ROLES.driver },
  { label: "Waiters", roles: DEPARTMENT_ROLES.waiter },
  { label: "Kitchen", roles: DEPARTMENT_ROLES.kitchen },
  { label: "Shopping", roles: DEPARTMENT_ROLES.shopping },
  { label: "Cleaning", roles: DEPARTMENT_ROLES.cleaning },
];

const PREVIEWABLE_ROLES = new Set<UserRole>(STAFF_ROLE_GROUPS.flatMap((group) => group.roles));

export function StaffViewSwitcher({ companySlug }: ViewSwitcherProps) {
  const router = useRouter();
  const {
    profile,
    authenticatedUser,
    userRoles,
    activeRole,
    staffPreview,
    startStaffPreview,
    switchStaffPreviewRole,
    clearStaffPreview,
  } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [currentView, setCurrentView] = useState("admin");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void loadStaffMembers();
  }, [profile?.company_id, authenticatedUser?.id]);

  useEffect(() => {
    detectCurrentView();
  }, [router.pathname, activeRole]);

  useEffect(() => {
    if (!isMobile || typeof document === "undefined") {
      setPortalContainer(null);
      return;
    }
    setPortalContainer(document.querySelector<HTMLElement>('[role="dialog"][data-state="open"]'));
  }, [isMobile]);

  const loadStaffMembers = async () => {
    if (!profile?.company_id || !authenticatedUser?.id) {
      setStaffMembers([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, active_role, role, is_active, deleted_at")
        .eq("company_id", profile.company_id)
        .neq("id", authenticatedUser.id)
        .order("active_role")
        .order("full_name");
      if (error) throw error;

      const activeProfiles = (data || []).filter((person) =>
        person.is_active !== false && !person.deleted_at &&
        person.role !== UserRole.SUPER_ADMIN && person.active_role !== UserRole.SUPER_ADMIN,
      );
      const personIds = activeProfiles.map((person) => person.id);
      const assignmentsByPerson = new Map<string, Array<{ department?: string | null; is_primary?: boolean | null }>>();

      if (personIds.length) {
        const { data: assignments, error: assignmentsError } = await supabase
          .from("user_departments")
          .select("user_id, department, is_primary")
          .in("user_id", personIds);
        if (assignmentsError) throw assignmentsError;
        for (const assignment of assignments || []) {
          const rows = assignmentsByPerson.get(assignment.user_id) || [];
          rows.push({ department: assignment.department, is_primary: assignment.is_primary });
          assignmentsByPerson.set(assignment.user_id, rows);
        }
      }

      const staff = activeProfiles.flatMap((person) => {
        const resolved = deriveUserRoles({
          profileRole: person.role,
          activeRole: person.active_role,
          departments: assignmentsByPerson.get(person.id) || [],
        });
        const roles = resolved.roles.filter((role) => PREVIEWABLE_ROLES.has(role));
        if (!roles.length) return [];
        return [{
          id: person.id,
          full_name: person.full_name || "",
          email: person.email || "",
          active_role: roles.includes(resolved.activeRole) ? resolved.activeRole : roles[0],
          roles,
        }];
      });
      setStaffMembers(staff);
    } catch (error) {
      console.error("Error loading staff accounts for preview:", error);
      toast({
        title: "Staff accounts could not be loaded",
        description: "Refresh the page or check that your account has administrator access.",
        variant: "destructive",
      });
    }
  };

  const detectCurrentView = () => {
    const path = router.pathname;
    if (path.includes("/team-portal/driver")) setCurrentView("driver");
    else if (path.includes("/team-portal/waiter")) setCurrentView("waiter");
    else if (path.includes("/team-portal/kitchen")) setCurrentView("kitchen");
    else if (path.includes("/team-portal/shopping")) setCurrentView("shopping");
    else if (path.includes("/team-portal/cleaning")) setCurrentView("cleaning");
    else if (path.includes("/admin")) setCurrentView("admin");
  };

  const withTeamSlug = (href: string) => companySlug ? `/${companySlug}${href}` : href;
  const staffCountForDepartment = (department: string) => {
    const roles = DEPARTMENT_ROLES[department] || [];
    return staffMembers.filter((staff) => roles.some((role) => staff.roles.includes(role))).length;
  };
  const routeForRole = (role: UserRole) => {
    const routes: Partial<Record<UserRole, string>> = {
      [UserRole.COMPANY_ADMIN]: withTeamSlug("/admin/dashboard"),
      [UserRole.ADMIN]: withTeamSlug("/admin/dashboard"),
      [UserRole.OWNER]: withTeamSlug("/admin/dashboard"),
      [UserRole.REGION_ADMIN]: withTeamSlug("/admin/dashboard"),
      [UserRole.SALES_ADMIN]: withTeamSlug("/admin/dashboard"),
      [UserRole.DRIVER]: withTeamSlug("/team-portal/driver/dashboard"),
      [UserRole.WAITER]: withTeamSlug("/team-portal/waiter/dashboard"),
      [UserRole.KITCHEN_MANAGER]: withTeamSlug("/team-portal/kitchen/today"),
      [UserRole.KITCHEN_STAFF]: withTeamSlug("/team-portal/kitchen/today"),
      [UserRole.SHOPPING_STAFF]: withTeamSlug("/team-portal/shopping/dashboard"),
      [UserRole.CLEANING_MANAGER]: withTeamSlug("/team-portal/cleaning/dashboard"),
      [UserRole.CLEANING_STAFF]: withTeamSlug("/team-portal/cleaning/dashboard"),
    };
    return routes[role] || withTeamSlug("/admin/dashboard");
  };

  const navigateToRole = async (role: UserRole) => {
    if (staffPreview) await switchStaffPreviewRole(role);
    setViewMenuOpen(false);
    if (typeof window !== "undefined") window.dispatchEvent(new Event("cms:portal-nav-close"));
    await router.push(routeForRole(role));
  };

  const switchToDepartmentView = async (department: string) => {
    if (department === "admin") {
      const matchingRole = userRoles.find((role) => DEPARTMENT_ROLES.admin.includes(role));
      if (staffPreview && matchingRole) {
        try {
          await navigateToRole(matchingRole);
        } catch (error) {
          showNavigationError(error);
        }
        return;
      }
      clearStaffPreview();
      setViewMenuOpen(false);
      if (typeof window !== "undefined") window.dispatchEvent(new Event("cms:portal-nav-close"));
      setLoading(true);
      void router.push(withTeamSlug("/admin/dashboard")).finally(() => setLoading(false));
      return;
    }

    const roleOptions = DEPARTMENT_ROLES[department] || [];
    const currentRole = staffPreview ? roleOptions.find((role) => userRoles.includes(role)) : undefined;
    if (currentRole) {
      try {
        await navigateToRole(currentRole);
      } catch (error) {
        showNavigationError(error);
      }
      return;
    }

    const staff = staffMembers.find((person) => roleOptions.some((role) => person.roles.includes(role)));
    if (!staff) {
      toast({
        title: "No staff account has that portal",
        description: "Assign the role to a staff account, then open that account from this menu.",
        variant: "destructive",
      });
      return;
    }
    const role = roleOptions.find((candidate) => staff.roles.includes(candidate)) || staff.active_role;
    await switchToStaffView(staff, role);
  };

  const showNavigationError = (error: unknown) => {
    toast({
      title: "Could not open that portal",
      description: error instanceof Error ? error.message : "Please refresh and try again.",
      variant: "destructive",
    });
  };

  const switchToStaffView = async (staffMember: StaffMember, role = staffMember.active_role) => {
    if (!staffMember.roles.includes(role)) return;
    setLoading(true);
    try {
      await startStaffPreview(staffMember.id, role);
      setViewMenuOpen(false);
      if (typeof window !== "undefined") window.dispatchEvent(new Event("cms:portal-nav-close"));
      await router.push(routeForRole(role));
    } catch (error) {
      showNavigationError(error);
    } finally {
      setLoading(false);
    }
  };

  const getViewLabel = () => staffPreview
    ? `${staffPreview.fullName} · ${roleService.getRoleDisplayName(staffPreview.role)}`
    : currentView === "admin" ? "Admin View" : `${currentView} dashboard`;

  const staffByRole = Object.fromEntries(
    STAFF_ROLE_GROUPS.map(({ label, roles }) => [
      label,
      staffMembers.filter((staff) => roles.some((role) => staff.roles.includes(role))),
    ]),
  ) as Record<string, StaffMember[]>;
  const departmentViews = [
    { id: "driver", label: "Driver", icon: Truck },
    { id: "waiter", label: "Waiter", icon: Sparkles },
    { id: "kitchen", label: "Kitchen", icon: ChefHat },
    { id: "shopping", label: "Shopping", icon: ShoppingCart },
    { id: "cleaning", label: "Cleaning", icon: Sparkles },
  ];

  const accountRoles = [profile?.role, profile?.active_role, ...userRoles].map((role) => String(role || ""));
  const canSwitchWorkspace = Boolean(staffPreview) || accountRoles.some((role) =>
    [UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN].includes(role as UserRole),
  );

  if (!canSwitchWorkspace) return null;

  return (
    <DropdownMenu open={viewMenuOpen} onOpenChange={setViewMenuOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          disabled={loading}
          title={`Switch view (currently ${getViewLabel()})`}
          aria-label={`Switch view, currently ${getViewLabel()}`}
          className="h-11 w-11 shrink-0 rounded-lg border-slate-300 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-brand-primary dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15 dark:focus-visible:ring-white"
        >
          <Eye className="h-[18px] w-[18px]" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={isMobile ? "bottom" : "right"}
        align={isMobile ? "center" : "start"}
        portalContainer={portalContainer}
        sideOffset={10}
        collisionPadding={12}
        className={`z-[1200] ${isMobile ? "max-h-[min(55dvh,var(--radix-dropdown-menu-content-available-height))]" : "max-h-[min(80vh,34rem)]"} w-[min(22rem,calc(100vw-2rem))] overflow-x-hidden overflow-y-auto border-slate-200 bg-white text-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 [&_[role=menuitem]]:min-h-11`}
      >
        <DropdownMenuLabel className="font-normal">
          <span className="block text-sm font-medium">Switch workspace</span>
          <span className="block text-xs text-muted-foreground">Open a staff portal and keep access as you move around</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-1 text-xs text-muted-foreground">Administrator</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => { void switchToDepartmentView("admin"); }}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            <span className="min-w-0 flex-1 truncate">{staffPreview ? "Return to admin workspace" : "Admin dashboard"}</span>
            {!staffPreview && currentView === "admin" && <Badge className="ml-auto text-xs">Current</Badge>}
          </DropdownMenuItem>
        </DropdownMenuGroup>

        {staffPreview && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-2 py-1 text-xs text-muted-foreground">
                Portals for {staffPreview.fullName}
              </DropdownMenuLabel>
              {userRoles.map((role) => (
                <DropdownMenuItem
                  key={role}
                  disabled={loading || role === staffPreview.role}
                  onClick={() => { void navigateToRole(role).catch(showNavigationError); }}
                >
                  <User className="mr-2 h-4 w-4" />
                  <span className="min-w-0 flex-1 truncate">{roleService.getRoleDisplayName(role)}</span>
                  {role === staffPreview.role && <Check className="ml-auto h-4 w-4 text-emerald-600" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={() => { void switchToDepartmentView("admin"); }}>
                <Eye className="mr-2 h-4 w-4" />
                <span className="min-w-0 flex-1 truncate">Exit preview · {staffPreview.fullName}</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-1 text-xs text-muted-foreground">Department dashboards</DropdownMenuLabel>
          {departmentViews.map(({ id, label, icon: Icon }) => (
            <DropdownMenuItem key={id} onClick={() => { void switchToDepartmentView(id); }}>
              <Icon className="mr-2 h-4 w-4" />
              <span className="min-w-0 flex-1 truncate">{label} portal</span>
              {currentView === id && <Badge className="ml-auto text-xs">Current</Badge>}
              {currentView !== id && staffCountForDepartment(id) > 0 && (
                <Badge variant="secondary" className="ml-auto text-xs">
                  {staffCountForDepartment(id)}
                </Badge>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-1 text-xs text-muted-foreground">All staff accounts</DropdownMenuLabel>
          {staffMembers.map((staff) => (
            <DropdownMenuItem
              key={staff.id}
              onClick={() => { void switchToStaffView(staff); }}
              disabled={loading}
              className="items-start"
            >
              <User className="mr-2 mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{staff.full_name || staff.email}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {staff.roles.map((role) => roleService.getRoleDisplayName(role)).join(" · ")}
                </span>
              </span>
              {staffPreview?.userId === staff.id && <Badge className="ml-2 shrink-0 text-xs">Viewing</Badge>}
            </DropdownMenuItem>
          ))}
          {staffMembers.length === 0 && (
            <div className="px-2 py-5 text-center text-sm text-muted-foreground">No active staff accounts are available.</div>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
