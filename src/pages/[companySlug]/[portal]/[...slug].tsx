import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, Shield } from "lucide-react";
import Link from "next/link";
import { roleService } from "@/services/roleService";
import { UserRole } from "@/types/app";

// Portal Components for Driver, Shopping, Cleaning, Kitchen
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

// Admin Dashboard Component
import AdminDashboard from "@/components/portals/admin/Dashboard";

const PORTAL_ROUTES = {
  admin: {
    allowedRoles: ["admin", "owner"],
    routes: {
      dashboard: AdminDashboard,
    },
    redirectRoutes: {
      // ✅ FIX: Include company slug prefix in redirect URLs
      leads: (slug: string) => `/${slug}/admin/leads`,
      "leads/new": (slug: string) => `/${slug}/admin/leads/new`,
      quotes: (slug: string) => `/${slug}/admin/quotes`,
      "quotes/new": (slug: string) => `/${slug}/admin/quotes/new`,
      calendar: (slug: string) => `/${slug}/admin/calendar`,
      notifications: (slug: string) => `/${slug}/admin/notifications`,
      integrations: (slug: string) => `/${slug}/admin/integrations`,
      "client-portal": (slug: string) => `/${slug}/admin/client-portal`,
      drivers: (slug: string) => `/${slug}/admin/drivers`,
      orders: (slug: string) => `/${slug}/admin/orders`,
      inventory: (slug: string) => `/${slug}/admin/inventory`,
      shopping: (slug: string) => `/${slug}/admin/shopping`,
      "job-progress-overview": (slug: string) => `/${slug}/portal/admin/job-progress-overview`,
      "staff-hours": (slug: string) => `/${slug}/admin/staff-hours`,
      "operations-hub": (slug: string) => `/${slug}/admin/operations-hub`,
      "operations-standards": (slug: string) => `/${slug}/admin/operations-standards`,
      "equipment-shortages": (slug: string) => `/${slug}/admin/equipment-shortages`,
      "regions": (slug: string) => `/${slug}/admin/regions`,
      "email-templates": (slug: string) => `/${slug}/admin/email-templates`,
      "after-sales-emails": (slug: string) => `/${slug}/admin/after-sales-emails`,
      "email-automation-dashboard": (slug: string) => `/${slug}/admin/email-automation-dashboard`,
      "email-automation-settings": (slug: string) => `/${slug}/admin/email-automation-settings`,
      "notification-settings": (slug: string) => `/${slug}/portal/admin/notification-settings`,
      "client-search": (slug: string) => `/${slug}/admin/client-search`,
      "client-database": (slug: string) => `/${slug}/admin/client-database`,
      "white-label": (slug: string) => `/${slug}/admin/white-label`,
      "financial-dashboard": (slug: string) => `/${slug}/admin/financial-dashboard`,
      subscription: (slug: string) => `/${slug}/admin/subscription`,
      "payment-gateways": (slug: string) => `/${slug}/admin/payment-gateways`,
      "driver-management": (slug: string) => `/${slug}/admin/driver-management`,
      "kitchen-duty-tracking": (slug: string) => `/${slug}/admin/kitchen-duty-tracking`,
      users: (slug: string) => `/${slug}/admin/users`,
      reports: (slug: string) => `/${slug}/admin/reports`,
      settings: (slug: string) => `/${slug}/admin/settings`,
      onboarding: (slug: string) => `/${slug}/admin/onboarding`,
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
    redirectRoutes: {},
    defaultRoute: "dashboard",
  },
  shopping: {
    allowedRoles: ["shopping", "shopping_staff", "admin", "owner"],
    routes: {
      dashboard: ShoppingDashboard,
      orders: ShoppingOrders,
      suppliers: ShoppingSuppliers,
      inventory: ShoppingInventory,
    },
    redirectRoutes: {},
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
    redirectRoutes: {},
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
    redirectRoutes: {},
    defaultRoute: "dashboard",
  },
};

export default function PortalPage() {
  const router = useRouter();
  const { user, userRoles, activeRole, loading: authLoading, companySlug: userCompanySlug } = useAuth();
  const { companySlug, portal, slug } = router.query;
  
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [securityError, setSecurityError] = useState<string | null>(null);

  const currentRoute = Array.isArray(slug) ? slug.join("/") : (slug || "dashboard");
  
  useEffect(() => {
    if (authLoading) return;

    // CRITICAL: User must be logged in to access any portal
    if (!user) {
      router.push(`/${companySlug}/auth/login?redirect=${encodeURIComponent(router.asPath)}`);
      return;
    }

    // CRITICAL SECURITY: Validate company_slug matches user's company
    // This prevents users from accessing other companies' data
    if (!userCompanySlug) {
      setSecurityError("No company associated with your account. Please contact support.");
      setIsLoading(false);
      return;
    }

    if (userCompanySlug !== companySlug) {
      console.error(`SECURITY: User from company '${userCompanySlug}' attempted to access '${companySlug}'`);
      setSecurityError("You don't have permission to access this company's portal.");
      setIsLoading(false);
      return;
    }

    // Validate portal exists
    const portalConfig = PORTAL_ROUTES[portal as string];
    if (!portalConfig) {
      setIsLoading(false);
      return;
    }

    // Check if user has any role that grants access to this portal
    const userRolesList = userRoles.map(r => r.department);
    const hasAccess = portalConfig.allowedRoles.some(role => 
      userRolesList.includes(role as any)
    );
    
    setIsAuthorized(hasAccess);
    setIsLoading(false);
    setSecurityError(null);

    // Handle redirects and route validation
    if (hasAccess) {
      const redirectFunc = portalConfig.redirectRoutes && (portalConfig.redirectRoutes as any)[currentRoute];
      if (redirectFunc && typeof redirectFunc === 'function') {
        router.push(redirectFunc(companySlug));
        return;
      }

      if (!(portalConfig.routes as any)[currentRoute]) {
        router.push(`/${companySlug}/${portal}/${portalConfig.defaultRoute}`);
      }
    }
  }, [user, userRoles, authLoading, companySlug, userCompanySlug, portal, currentRoute, router]);

  // Loading state
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

  // Security error (company mismatch)
  if (securityError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-red-100 px-4">
        <Card className="w-full max-w-md border-red-200">
          <CardContent className="pt-6 text-center">
            <Shield className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-red-900 mb-2">Access Denied</h2>
            <p className="text-red-700 mb-4">{securityError}</p>
            <div className="space-y-2">
              {userCompanySlug && (
                <Link href={`/${userCompanySlug}/${portal}/dashboard`}>
                  <Button className="w-full">Go to Your Company Portal</Button>
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

  // Portal not found
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

  // Not authorized for this portal
  if (!isAuthorized) {
    const userRolesList = userRoles.map(r => roleService.getRoleDisplayName(r.department as UserRole)).join(", ");
    
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
                  roleService.getRoleDisplayName(r as UserRole)
                ).join(", ")}
              </p>
              <p className="text-sm text-slate-500">
                <strong>Your roles:</strong> {userRolesList || "No roles assigned"}
              </p>
            </div>
            <div className="space-y-2">
              {userRoles.length > 0 && (
                <Link href={roleService.getRoleDashboardUrl(userRoles[0].department as UserRole, userCompanySlug || undefined)}>
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

  // Route component not found
  const RouteComponent = (portalConfig.routes as any)[currentRoute];
  
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

  // Render the portal component
  return (
    <RouteComponent 
      companySlug={companySlug as string}
      portal={portal as string}
      currentRoute={currentRoute}
    />
  );
}
