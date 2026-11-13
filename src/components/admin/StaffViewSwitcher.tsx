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
import { Eye, Truck, ChefHat, ShoppingCart, Sparkles, User, LayoutDashboard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { normalizeRoleValue } from "@/lib/roleDerivation";
import { roleService } from "@/services/roleService";

interface StaffMember {
  id: string;
  full_name: string;
  email: string;
  active_role: string;
  role?: string;
}

interface ViewSwitcherProps {
  companySlug: string;
}

export function StaffViewSwitcher({ companySlug }: ViewSwitcherProps) {
  const router = useRouter();
  const { profile, authenticatedUser, userRoles, staffPreview, startStaffPreview, clearStaffPreview } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [currentView, setCurrentView] = useState<string>("admin");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadStaffMembers();
    detectCurrentView();
  }, [profile, router.pathname]);

  useEffect(() => {
    if (!isMobile || typeof document === "undefined") {
      setPortalContainer(null);
      return;
    }
    setPortalContainer(document.querySelector<HTMLElement>('[role="dialog"][data-state="open"]'));
  }, [isMobile]);

  const loadStaffMembers = async () => {
    if (!profile?.company_id || !authenticatedUser?.id) return;

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, active_role, role")
        .eq("company_id", profile.company_id)
        .neq("id", authenticatedUser.id)
        .neq("active_role", "super_admin")
        .order("active_role")
        .order("full_name");

      if (error) throw error;
      setStaffMembers((data || []).map((staff) => ({
        ...staff,
        active_role: String(
          normalizeRoleValue(staff.active_role, normalizeRoleValue(staff.role)) ||
          staff.active_role ||
          staff.role ||
          "",
        ),
      })));
    } catch (error) {
      console.error("Error loading staff:", error);
    }
  };

  const detectCurrentView = () => {
    const path = router.pathname;
    
    if (path.includes("/team-portal/driver")) {
      setCurrentView("driver");
    } else if (path.includes("/team-portal/waiter")) {
      setCurrentView("waiter");
    } else if (path.includes("/team-portal/kitchen")) {
      setCurrentView("kitchen");
    } else if (path.includes("/team-portal/shopping")) {
      setCurrentView("shopping");
    } else if (path.includes("/team-portal/cleaning")) {
      setCurrentView("cleaning");
    } else if (path.includes("/admin")) {
      setCurrentView("admin");
    }
  };

  const withTeamSlug = (href: string) => companySlug ? `/${companySlug}${href}` : href;

  const switchToDepartmentView = (department: string) => {
    const routes: Record<string, string> = {
      driver: withTeamSlug("/team-portal/driver/dashboard"),
      waiter: withTeamSlug("/team-portal/waiter/dashboard"),
      kitchen: withTeamSlug("/team-portal/kitchen/today"),
      shopping: withTeamSlug("/team-portal/shopping/dashboard"),
      cleaning: withTeamSlug("/team-portal/cleaning/dashboard"),
      admin: companySlug ? `/${companySlug}/admin/dashboard` : "/admin/dashboard",
    };

    if (staffPreview && department !== "admin") {
      const departmentRoles: Record<string, string[]> = {
        driver: ["driver"],
        waiter: ["waiter"],
        kitchen: ["kitchen_manager", "kitchen_staff"],
        shopping: ["shopping_staff"],
        cleaning: ["cleaning_manager", "cleaning_staff"],
      };
      const assignedRoles = departmentRoles[department] || [];
      if (!assignedRoles.some((role) => userRoles.includes(role as any))) {
        toast({
          title: "This account has no access to that portal",
          description: "Choose a staff account assigned to that role, or select another role from this account.",
          variant: "destructive",
        });
        return;
      }
    }

    if (department === "admin" || !staffPreview) clearStaffPreview();
    if (typeof window !== "undefined") window.dispatchEvent(new Event("cms:portal-nav-close"));
    setLoading(true);
    router.push(routes[department] || routes.admin).finally(() => setLoading(false));
  };

  const switchToStaffView = (staffMember: StaffMember) => {
    setLoading(true);
    const roleRoutes: Record<string, string> = {
      company_admin: withTeamSlug("/admin/dashboard"),
      admin: withTeamSlug("/admin/dashboard"),
      owner: withTeamSlug("/admin/dashboard"),
      region_admin: withTeamSlug("/admin/dashboard"),
      sales_admin: withTeamSlug("/admin/dashboard"),
      driver: withTeamSlug("/team-portal/driver/dashboard"),
      waiter: withTeamSlug("/team-portal/waiter/dashboard"),
      server: withTeamSlug("/team-portal/waiter/dashboard"),
      waitering: withTeamSlug("/team-portal/waiter/dashboard"),
      kitchen_manager: withTeamSlug("/team-portal/kitchen/today"),
      kitchen_staff: withTeamSlug("/team-portal/kitchen/today"),
      kitchen: withTeamSlug("/team-portal/kitchen/today"),
      shopping_staff: withTeamSlug("/team-portal/shopping/dashboard"),
      shopping: withTeamSlug("/team-portal/shopping/dashboard"),
      cleaning_manager: withTeamSlug("/team-portal/cleaning/dashboard"),
      cleaning_staff: withTeamSlug("/team-portal/cleaning/dashboard"),
      cleaning: withTeamSlug("/team-portal/cleaning/dashboard"),
    };

    const route = roleRoutes[staffMember.active_role];
    if (!route) {
      setLoading(false);
      return;
    }
    void startStaffPreview(staffMember.id)
      .then(() => {
        setViewMenuOpen(false);
        if (typeof window !== "undefined") window.dispatchEvent(new Event("cms:portal-nav-close"));
        return router.push(route);
      })
      .catch((error) => {
        toast({
          title: "Could not open this staff dashboard",
          description: error instanceof Error ? error.message : "Please refresh and try again.",
          variant: "destructive",
        });
      })
      .finally(() => setLoading(false));
  };

  const getViewLabel = () => {
    if (staffPreview) {
      return `${staffPreview.fullName} · ${roleService.getRoleDisplayName(staffPreview.role)}`;
    }
    const labels: Record<string, string> = {
      admin: "Admin View",
      company_admin: "Business Administrator",
      owner: "Company Owner",
      region_admin: "Region Admin",
      sales_admin: "Sales Admin",
      operations_admin: "Operations Administrator",
      driver: "Driver Dashboard",
      waiter: "Waiter Dashboard",
      kitchen: "Kitchen Today",
      shopping: "Shopping Dashboard",
      cleaning: "Cleaning Dashboard",
    };
    return labels[currentView] || "Unknown View";
  };

  // Group staff by role
  const staffByRole = {
    driver: staffMembers.filter(s => s.active_role === "driver"),
    waiter: staffMembers.filter(s => s.active_role === "waiter"),
    kitchen_staff: staffMembers.filter(s => s.active_role === "kitchen_staff" || s.active_role === "kitchen_manager"),
    shopping_staff: staffMembers.filter(s => s.active_role === "shopping_staff"),
    cleaning_staff: staffMembers.filter(s => s.active_role === "cleaning_staff" || s.active_role === "cleaning_manager"),
    company_admin: staffMembers.filter(s => s.active_role === "company_admin"),
    admin: staffMembers.filter(s => s.active_role === "admin"),
    owner: staffMembers.filter(s => s.active_role === "owner"),
    region_admin: staffMembers.filter(s => s.active_role === "region_admin"),
    sales_admin: staffMembers.filter(s => s.active_role === "sales_admin"),
  };

  const accountRoles = [profile?.role, profile?.active_role, ...userRoles].map((role) => String(role || ""));
  const canSwitchWorkspace = Boolean(staffPreview) || accountRoles.some((role) =>
    ["company_admin", "admin", "owner", "super_admin"].includes(role),
  );

  if (!canSwitchWorkspace) {
    return null;
  }

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
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">Switch workspace</p>
            <p className="text-xs text-muted-foreground">
              Preview an employee’s portal across pages
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Admin View */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground px-2 py-1">
            Admin
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => switchToDepartmentView("admin")}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            <span>Admin Dashboard</span>
            {currentView === "admin" && (
              <Badge className="ml-auto bg-slate-900 text-white text-xs dark:bg-white dark:text-slate-950">Current</Badge>
            )}
          </DropdownMenuItem>
        </DropdownMenuGroup>

        {staffPreview && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => switchToDepartmentView("admin")}>
              <Eye className="mr-2 h-4 w-4" />
              <span className="min-w-0 flex-1 truncate">Exit preview · {staffPreview.fullName}</span>
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator />

        {/* Department Views */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground px-2 py-1">
            Department Dashboards
          </DropdownMenuLabel>
          <DropdownMenuItem onClick={() => switchToDepartmentView("driver")}>
            <Truck className="mr-2 h-4 w-4" />
            <span>Driver Portal</span>
            {currentView === "driver" && (
              <Badge className="ml-auto bg-slate-900 text-white text-xs dark:bg-white dark:text-slate-950">Current</Badge>
            )}
            {currentView !== "driver" && staffByRole.driver.length > 0 && (
              <Badge variant="secondary" className="ml-auto text-xs">
                {staffByRole.driver.length}
              </Badge>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => switchToDepartmentView("waiter")}>
            <Sparkles className="mr-2 h-4 w-4" />
            <span>Waiter Portal</span>
            {currentView === "waiter" && (
              <Badge className="ml-auto bg-slate-900 text-white text-xs dark:bg-white dark:text-slate-950">Current</Badge>
            )}
            {currentView !== "waiter" && staffByRole.waiter.length > 0 && (
              <Badge variant="secondary" className="ml-auto text-xs">
                {staffByRole.waiter.length}
              </Badge>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => switchToDepartmentView("kitchen")}>
            <ChefHat className="mr-2 h-4 w-4" />
            <span>Kitchen Portal</span>
            {currentView === "kitchen" && (
              <Badge className="ml-auto bg-slate-900 text-white text-xs dark:bg-white dark:text-slate-950">Current</Badge>
            )}
            {currentView !== "kitchen" && staffByRole.kitchen_staff.length > 0 && (
              <Badge variant="secondary" className="ml-auto text-xs">
                {staffByRole.kitchen_staff.length}
              </Badge>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => switchToDepartmentView("shopping")}>
            <ShoppingCart className="mr-2 h-4 w-4" />
            <span>Shopping Portal</span>
            {currentView === "shopping" && (
              <Badge className="ml-auto bg-slate-900 text-white text-xs dark:bg-white dark:text-slate-950">Current</Badge>
            )}
            {currentView !== "shopping" && staffByRole.shopping_staff.length > 0 && (
              <Badge variant="secondary" className="ml-auto text-xs">
                {staffByRole.shopping_staff.length}
              </Badge>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => switchToDepartmentView("cleaning")}>
            <Sparkles className="mr-2 h-4 w-4" />
            <span>Cleaning Portal</span>
            {currentView === "cleaning" && (
              <Badge className="ml-auto bg-slate-900 text-white text-xs dark:bg-white dark:text-slate-950">Current</Badge>
            )}
            {currentView !== "cleaning" && staffByRole.cleaning_staff.length > 0 && (
              <Badge variant="secondary" className="ml-auto text-xs">
                {staffByRole.cleaning_staff.length}
              </Badge>
            )}
          </DropdownMenuItem>
        </DropdownMenuGroup>

        {/* Staff Member Views */}
        {staffMembers.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground px-2 py-1">
                Preview a staff account
              </DropdownMenuLabel>

              {(staffByRole.company_admin.length + staffByRole.admin.length + staffByRole.owner.length + staffByRole.region_admin.length + staffByRole.sales_admin.length) > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Administrators
                  </div>
                  {[...staffByRole.company_admin, ...staffByRole.admin, ...staffByRole.owner, ...staffByRole.region_admin, ...staffByRole.sales_admin].map((staff) => (
                    <DropdownMenuItem
                      key={staff.id}
                      onClick={() => switchToStaffView(staff)}
                      disabled={loading}
                      className="pl-8"
                    >
                      <Eye className="mr-2 h-3 w-3" />
                      <span className="min-w-0 flex-1 truncate text-sm">{staff.full_name || staff.email}</span>
                      {staffPreview?.userId === staff.id && (
                        <Badge className="ml-auto text-xs">Viewing</Badge>
                      )}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              
              {/* Drivers */}
              {staffByRole.driver.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Drivers
                  </div>
                  {staffByRole.driver.map((staff) => (
                    <DropdownMenuItem
                      key={staff.id}
                      onClick={() => switchToStaffView(staff)}
                      disabled={loading}
                      className="pl-8"
                    >
                      <User className="mr-2 h-3 w-3" />
                      <span className="text-sm">{staff.full_name}</span>
                    </DropdownMenuItem>
                  ))}
                </>
              )}

              {/* Waiters */}
              {staffByRole.waiter.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 mt-2">
                    Waiters
                  </div>
                  {staffByRole.waiter.map((staff) => (
                    <DropdownMenuItem
                      key={staff.id}
                      onClick={() => switchToStaffView(staff)}
                      disabled={loading}
                      className="pl-8"
                    >
                      <User className="mr-2 h-3 w-3" />
                      <span className="text-sm">{staff.full_name}</span>
                    </DropdownMenuItem>
                  ))}
                </>
              )}

              {/* Kitchen Staff */}
              {staffByRole.kitchen_staff.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 mt-2">
                    Kitchen Staff
                  </div>
                  {staffByRole.kitchen_staff.map((staff) => (
                    <DropdownMenuItem
                      key={staff.id}
                      onClick={() => switchToStaffView(staff)}
                      disabled={loading}
                      className="pl-8"
                    >
                      <User className="mr-2 h-3 w-3" />
                      <span className="text-sm">{staff.full_name}</span>
                    </DropdownMenuItem>
                  ))}
                </>
              )}

              {/* Shopping Staff */}
              {staffByRole.shopping_staff.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 mt-2">
                    Shopping Staff
                  </div>
                  {staffByRole.shopping_staff.map((staff) => (
                    <DropdownMenuItem
                      key={staff.id}
                      onClick={() => switchToStaffView(staff)}
                      disabled={loading}
                      className="pl-8"
                    >
                      <User className="mr-2 h-3 w-3" />
                      <span className="text-sm">{staff.full_name}</span>
                    </DropdownMenuItem>
                  ))}
                </>
              )}

              {/* Cleaning Staff */}
              {staffByRole.cleaning_staff.length > 0 && (
                <>
                  <div className="px-2 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 mt-2">
                    Cleaning Staff
                  </div>
                  {staffByRole.cleaning_staff.map((staff) => (
                    <DropdownMenuItem
                      key={staff.id}
                      onClick={() => switchToStaffView(staff)}
                      disabled={loading}
                      className="pl-8"
                    >
                      <User className="mr-2 h-3 w-3" />
                      <span className="text-sm">{staff.full_name}</span>
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuGroup>
          </>
        )}

        {staffMembers.length === 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
              No staff members yet.
              <br />
              Add staff to view their dashboards.
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
