import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle } from "lucide-react";
import Link from "next/link";
import { roleService } from "@/services/roleService";

// Import existing pages that will be wrapped as portal components
import LeadsPage from "@/pages/leads/index";
import NewLeadPage from "@/pages/leads/new";
import QuotesPage from "@/pages/quotes/index";
import NewQuotePage from "@/pages/quotes/new";
import CalendarPage from "@/pages/calendar";
import NotificationsPage from "@/pages/notifications";
import IntegrationsPage from "@/pages/integrations";
import ClientPortalPage from "@/pages/client-portal";
import DriversPage from "@/pages/drivers";
import OrdersPage from "@/pages/orders";
import InventoryPage from "@/pages/inventory";
import ShoppingPage from "@/pages/shopping";
import JobProgressOverviewPage from "@/pages/portal/admin/job-progress-overview";

// Portal Components
import AdminDashboard from "@/components/portals/admin/Dashboard";
import AdminUsers from "@/components/portals/admin/Users";
import AdminReports from "@/components/portals/admin/Reports";
import AdminSettings from "@/components/portals/admin/Settings";
import AdminOnboarding from "@/components/portals/admin/Onboarding";

import DriverDashboard from "@/components/portals/driver/Dashboard";
import DriverRoutes from "@/components/portals/driver/Routes";
import DriverDeliveries from "@/components/portals/driver/Deliveries";
import DriverProfile from "@/components/portals/driver/Profile";

import ShoppingDashboard from "@/components/portals/shopping/Dashboard";
import ShoppingOrders from "@/components/portals/shopping/Orders";
import ShoppingSuppliers from "@/components/portals/shopping/Suppliers";
import ShoppingInventory from "@/components/portals/shopping/Inventory";

import CleaningDashboard from "@/components/portals/cleaning/Dashboard";
import CleaningTasks from "@/components/portals/cleaning/Tasks";
import CleaningSchedules from "@/components/portals/cleaning/Schedules";
import CleaningSupplies from "@/components/portals/cleaning/Supplies";

import KitchenDashboard from "@/components/portals/kitchen/Dashboard";
import KitchenMenu from "@/components/portals/kitchen/Menu";
import KitchenStock from "@/components/portals/kitchen/Stock";
import KitchenPrepList from "@/components/portals/kitchen/PrepList";

const PORTAL_ROUTES = {
  admin: {
    allowedRoles: ["admin", "owner", "super_admin"],
    routes: {
      dashboard: AdminDashboard,
      users: AdminUsers,
      reports: AdminReports,
      settings: AdminSettings,
      onboarding: AdminOnboarding,
      // Core Management Routes - ALL admin pages
      leads: LeadsPage,
      "leads/new": NewLeadPage,
      quotes: QuotesPage,
      "quotes/new": NewQuotePage,
      calendar: CalendarPage,
      notifications: NotificationsPage,
      integrations: IntegrationsPage,
      "client-portal": ClientPortalPage,
      drivers: DriversPage,
      orders: OrdersPage,
      inventory: InventoryPage,
      shopping: ShoppingPage,
      "job-progress-overview": JobProgressOverviewPage,
    },
    defaultRoute: "dashboard",
  },
  driver: {
    allowedRoles: ["driver", "admin", "owner"],
    routes: {
      dashboard: DriverDashboard,
      routes: DriverRoutes,
      deliveries: DriverDeliveries,
      profile: DriverProfile,
    },
    defaultRoute: "dashboard",
  },
  shopping: {
    allowedRoles: ["shopping", "shopping_staff", "admin", "owner"],
    routes: {
      dashboard: ShoppingDashboard,
      orders: ShoppingOrders,
      suppliers: ShoppingSuppliers,
      inventory: ShoppingInventory,
      shopping: ShoppingPage,
    },
    defaultRoute: "dashboard",
  },
  cleaning: {
    allowedRoles: ["cleaning", "cleaning_staff", "admin", "owner"],
    routes: {
      dashboard: CleaningDashboard,
      tasks: CleaningTasks,
      schedules: CleaningSchedules,
      supplies: CleaningSupplies,
    },
    defaultRoute: "dashboard",
  },
  kitchen: {
    allowedRoles: ["kitchen", "kitchen_staff", "admin", "owner"],
    routes: {
      dashboard: KitchenDashboard,
      menu: KitchenMenu,
      stock: KitchenStock,
      "prep-list": KitchenPrepList,
    },
    defaultRoute: "dashboard",
  },
};

export default function PortalPage() {
  const router = useRouter();
  const { user, userRoles, activeRole, loading: authLoading } = useAuth();
  const { companySlug, portal, slug } = router.query;
  
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const currentRoute = Array.isArray(slug) ? slug[0] : (slug || "dashboard");
  
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      router.push(`/${companySlug}/auth/login?redirect=${router.asPath}`);
      return;
    }

    if (user.company_slug && user.company_slug !== companySlug) {
      console.warn("Company slug mismatch - redirecting to user's company");
      router.push(`/${user.company_slug}/${portal}/${currentRoute}`);
      return;
    }

    const portalConfig = PORTAL_ROUTES[portal as string];
    if (!portalConfig) {
      setIsLoading(false);
      return;
    }

    const userRolesList = userRoles.map(r => r.department);
    const hasAccess = portalConfig.allowedRoles.some(role => 
      userRolesList.includes(role as any)
    );
    
    setIsAuthorized(hasAccess);
    setIsLoading(false);

    if (hasAccess && !portalConfig.routes[currentRoute]) {
      router.push(`/${companySlug}/${portal}/${portalConfig.defaultRoute}`);
    }
  }, [user, userRoles, authLoading, companySlug, portal, currentRoute, router]);

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Loader2 className="w-12 h-12 animate-spin text-blue-500 mx-auto mb-4" />
            <p className="text-slate-600">Loading portal...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const portalConfig = PORTAL_ROUTES[portal as string];
  if (!portalConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">Portal Not Found</h2>
            <p className="text-slate-600 mb-4">
              The portal "{portal}" doesn't exist.
            </p>
            <Link href="/">
              <Button>Return to Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isAuthorized) {
    const userRolesList = userRoles.map(r => roleService.getRoleDisplayName(r.department)).join(", ");
    
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h2>
            <p className="text-slate-600 mb-4">
              You don't have permission to access the {portal} portal.
            </p>
            <div className="space-y-2 mb-6">
              <p className="text-sm text-slate-500">
                <strong>Required roles:</strong> {portalConfig.allowedRoles.map(r => 
                  roleService.getRoleDisplayName(r as any)
                ).join(", ")}
              </p>
              <p className="text-sm text-slate-500">
                <strong>Your roles:</strong> {userRolesList || "No roles assigned"}
              </p>
            </div>
            <div className="space-y-2">
              {userRoles.length > 0 && (
                <Link href={roleService.getRoleDashboardUrl(userRoles[0].department, user?.company_slug || undefined)}>
                  <Button className="w-full">Go to Your Dashboard</Button>
                </Link>
              )}
              <Link href="/">
                <Button variant="outline" className="w-full">Return to Home</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const RouteComponent = portalConfig.routes[currentRoute];
  
  if (!RouteComponent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">Page Not Found</h2>
            <p className="text-slate-600 mb-4">
              The page "{currentRoute}" doesn't exist in the {portal} portal.
            </p>
            <Link href={`/${companySlug}/${portal}/${portalConfig.defaultRoute}`}>
              <Button>Go to Dashboard</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <RouteComponent 
      companySlug={companySlug as string}
      portal={portal as string}
      currentRoute={currentRoute}
    />
  );
}
