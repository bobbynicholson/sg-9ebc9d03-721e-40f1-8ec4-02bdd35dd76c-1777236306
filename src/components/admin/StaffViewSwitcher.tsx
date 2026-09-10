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
import { Eye, Truck, ChefHat, ShoppingCart, Sparkles, User, LayoutDashboard } from "lucide-react";

interface StaffMember {
  id: string;
  full_name: string;
  email: string;
  active_role: string;
}

interface ViewSwitcherProps {
  companySlug: string;
}

export function StaffViewSwitcher({ companySlug }: ViewSwitcherProps) {
  const router = useRouter();
  const { profile } = useAuth();
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [currentView, setCurrentView] = useState<string>("admin");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadStaffMembers();
    detectCurrentView();
  }, [profile, router.pathname]);

  const loadStaffMembers = async () => {
    if (!profile?.company_id) return;

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, active_role")
        .eq("company_id", profile.company_id)
        .neq("active_role", "company_admin")
        .neq("active_role", "super_admin")
        .order("active_role")
        .order("full_name");

      if (error) throw error;
      setStaffMembers(data || []);
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
    setLoading(true);
    const routes: Record<string, string> = {
      driver: withTeamSlug("/team-portal/driver/dashboard"),
      waiter: withTeamSlug("/team-portal/waiter/dashboard"),
      kitchen: withTeamSlug("/team-portal/kitchen/today"),
      shopping: withTeamSlug("/team-portal/shopping/dashboard"),
      cleaning: withTeamSlug("/team-portal/cleaning/dashboard"),
      admin: companySlug ? `/${companySlug}/admin/dashboard` : "/admin/dashboard",
    };

    router.push(routes[department] || routes.admin).finally(() => setLoading(false));
  };

  const switchToStaffView = (staffMember: StaffMember) => {
    setLoading(true);
    const roleRoutes: Record<string, string> = {
      driver: withTeamSlug("/team-portal/driver/dashboard"),
      waiter: withTeamSlug("/team-portal/waiter/dashboard"),
      kitchen_manager: withTeamSlug("/team-portal/kitchen/today"),
      kitchen_staff: withTeamSlug("/team-portal/kitchen/today"),
      shopping_staff: withTeamSlug("/team-portal/shopping/dashboard"),
      cleaning_manager: withTeamSlug("/team-portal/cleaning/dashboard"),
      cleaning_staff: withTeamSlug("/team-portal/cleaning/dashboard"),
    };

    const route = roleRoutes[staffMember.active_role];
    if (route) {
      router.push(route).finally(() => setLoading(false));
    }
  };

  const getViewBadgeColor = () => {
    return "bg-brand-primary";
  };

  const getViewLabel = () => {
    const labels: Record<string, string> = {
      admin: "Admin View",
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
  };

  if (profile?.active_role !== "company_admin" && profile?.active_role !== "super_admin") {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          disabled={loading}
          title={`Switch view (currently ${getViewLabel()})`}
          className="relative h-9 w-9 shrink-0 rounded-lg border-slate-300 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-950 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/15"
        >
          <Eye className="h-4 w-4" />
          <span
            className={`absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${getViewBadgeColor()}`}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="start"
        sideOffset={10}
        collisionPadding={12}
        className="z-[1200] max-h-[min(80vh,34rem)] w-[min(22rem,calc(100vw-2rem))] overflow-x-hidden overflow-y-auto"
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">Switch View</p>
            <p className="text-xs text-muted-foreground">
              See what your staff see and help where needed
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
                View as Staff Member
              </DropdownMenuLabel>
              
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
