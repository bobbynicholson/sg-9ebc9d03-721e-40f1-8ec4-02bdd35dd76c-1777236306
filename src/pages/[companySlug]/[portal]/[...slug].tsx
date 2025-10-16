import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle } from "lucide-react";
import Link from "next/link";

// Portal Components (to be created/imported)
import AdminDashboard from "@/components/portals/admin/Dashboard";
import AdminUsers from "@/components/portals/admin/Users";
import AdminReports from "@/components/portals/admin/Reports";
import AdminSettings from "@/components/portals/admin/Settings";

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

// Portal route configuration
const PORTAL_ROUTES = {
  admin: {
    allowedRoles: ["admin", "super_admin"],
    routes: {
      dashboard: AdminDashboard,
      users: AdminUsers,
      reports: AdminReports,
      settings: AdminSettings,
    },
    defaultRoute: "dashboard",
  },
  driver: {
    allowedRoles: ["driver", "admin"],
    routes: {
      dashboard: DriverDashboard,
      routes: DriverRoutes,
      deliveries: DriverDeliveries,
      profile: DriverProfile,
    },
    defaultRoute: "dashboard",
  },
  shopping: {
    allowedRoles: ["shopping_staff", "admin"],
    routes: {
      dashboard: ShoppingDashboard,
      orders: ShoppingOrders,
      suppliers: ShoppingSuppliers,
      inventory: ShoppingInventory,
    },
    defaultRoute: "dashboard",
  },
  cleaning: {
    allowedRoles: ["cleaning_staff", "admin"],
    routes: {
      dashboard: CleaningDashboard,
      tasks: CleaningTasks,
      schedules: CleaningSchedules,
      supplies: CleaningSupplies,
    },
    defaultRoute: "dashboard",
  },
  kitchen: {
    allowedRoles: ["kitchen_staff", "admin"],
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
  const { user, profile, loading: authLoading } = useAuth();
  const { companySlug, portal, slug } = router.query;
  
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Get the current route from slug array
  const currentRoute = Array.isArray(slug) ? slug[0] : (slug || "dashboard");
  
  useEffect(() => {
    if (authLoading) return;

    // Check if user is authenticated
    if (!user || !profile) {
      router.push(`/${companySlug}/auth/login?redirect=${router.asPath}`);
      return;
    }

    // Check if portal exists
    const portalConfig = PORTAL_ROUTES[portal as string];
    if (!portalConfig) {
      setIsLoading(false);
      return;
    }

    // Check if user has permission for this portal
    const userRole = profile.role || "client";
    const hasAccess = portalConfig.allowedRoles.includes(userRole);
    
    setIsAuthorized(hasAccess);
    setIsLoading(false);

    // Redirect to default route if current route doesn't exist
    if (hasAccess && !portalConfig.routes[currentRoute]) {
      router.push(`/${companySlug}/${portal}/${portalConfig.defaultRoute}`);
    }
  }, [user, profile, authLoading, companySlug, portal, currentRoute, router]);

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

  // Portal doesn't exist
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

  // User not authorized
  if (!isAuthorized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h2>
            <p className="text-slate-600 mb-4">
              You don't have permission to access the {portal} portal.
            </p>
            <div className="space-y-2">
              <p className="text-sm text-slate-500">
                Required roles: {portalConfig.allowedRoles.join(", ")}
              </p>
              <p className="text-sm text-slate-500">
                Your role: {profile?.role || "unknown"}
              </p>
            </div>
            <div className="mt-6 space-y-2">
              <Link href="/">
                <Button className="w-full">Return to Home</Button>
              </Link>
              <Link href={`/${companySlug}/auth/login`}>
                <Button variant="outline" className="w-full">Switch Account</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Get the component for current route
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

  // Render the portal page with the component
  return (
    <RouteComponent 
      companySlug={companySlug as string}
      portal={portal as string}
      currentRoute={currentRoute}
    />
  );
}
