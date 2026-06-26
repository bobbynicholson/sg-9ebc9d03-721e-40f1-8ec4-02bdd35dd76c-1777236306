import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { LayoutDashboard, Users, Truck, ChefHat, ShoppingCart, Sparkles, Crown, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantHref } from "@/lib/tenantUrl";

const PORTALS = [
  { name: "Admin", route: "/admin/dashboard", icon: LayoutDashboard, color: "text-brand-primary" },
  { name: "Client", route: "/client-portal/dashboard", icon: Users, color: "text-brand-primary" },
  { name: "Driver", route: "/team-portal/driver/dashboard", icon: Truck, color: "text-brand-primary" },
  { name: "Waiter", route: "/team-portal/waiter/dashboard", icon: Sparkles, color: "text-brand-primary" },
  { name: "Kitchen", route: "/team-portal/kitchen/today", icon: ChefHat, color: "text-brand-primary" },
  { name: "Shopping", route: "/team-portal/shopping/dashboard", icon: ShoppingCart, color: "text-brand-primary" },
  { name: "Cleaning", route: "/team-portal/cleaning/dashboard", icon: Sparkles, color: "text-brand-primary" },
];

export function PortalSwitcher() {
  const router = useRouter();
  // Wave 27.3: tenant-slug wrapper for internal navigations.
  const { withSlug } = useTenantHref();
  const { user, signOut } = useAuth();

  // Only show for super_admin users
  if (!user || user.role !== "super_admin") return null;

  const handleBackToDashboard = () => {
    router.push(withSlug("/admin/platform/dashboard"));
  };

  const handleSignOut = async () => {
    await signOut();
    router.push("/auth/login");
  };

  return (
    <>
      {/* Floating Badge - Top Right */}
      <div className="fixed top-4 right-4 z-50">
        <Badge className="bg-gradient-to-r from-brand-primary to-brand-secondary text-white px-4 py-2 shadow-lg animate-pulse border-2 border-brand-primary/40">
          <Crown className="w-4 h-4 mr-2" />
          SUPER ADMIN
        </Badge>
      </div>

      {/* Floating Portal Switcher - Bottom Right */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
        {/* Super Admin Dashboard Button */}
        <Button
          onClick={handleBackToDashboard}
          size="lg"
          className="h-12 px-4 rounded-full shadow-2xl bg-gradient-to-r from-brand-primary to-brand-secondary hover:brightness-105 text-white font-semibold"
          title="Return to Super Admin Dashboard"
        >
          <Crown className="w-5 h-5 mr-2" />
          Dashboard
        </Button>

        {/* Portal Switcher Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              size="lg"
              className="h-14 w-14 rounded-full shadow-2xl bg-gradient-to-r from-brand-primary to-brand-secondary hover:brightness-105 text-white"
              title="Quick Portal Switch"
            >
              <LayoutDashboard className="w-6 h-6" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-xs text-slate-500 uppercase tracking-wide flex items-center gap-2">
              <Crown className="w-3 h-3" />
              Switch Portal
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {PORTALS.map((portal) => {
              const Icon = portal.icon;
              const isActive = router.pathname.startsWith(portal.route.split("/").slice(0, -1).join("/"));
              
              return (
                <DropdownMenuItem
                  key={portal.route}
                  onClick={() => router.push(portal.route)}
                  className={`cursor-pointer py-3 ${isActive ? "bg-brand-primary/10" : ""}`}
                >
                  <Icon className={`w-4 h-4 mr-3 ${portal.color}`} />
                  <span className={isActive ? "font-semibold" : ""}>{portal.name}</span>
                  {isActive && (
                    <Badge variant="outline" className="ml-auto text-xs">Active</Badge>
                  )}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="cursor-pointer text-red-600 hover:bg-red-50 py-3"
            >
              <LogOut className="w-4 h-4 mr-3" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
