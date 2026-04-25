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
import { LayoutDashboard, Users, Truck, ChefHat, ShoppingCart, Sparkles, Home, X } from "lucide-react";
import { useState, useEffect } from "react";

const PORTALS = [
  { name: "Admin", route: "/admin/dashboard", icon: LayoutDashboard, color: "text-blue-600" },
  { name: "Client", route: "/client-portal/dashboard", icon: Users, color: "text-green-600" },
  { name: "Driver", route: "/team-portal/driver/dashboard", icon: Truck, color: "text-orange-600" },
  { name: "Kitchen", route: "/team-portal/kitchen/dashboard", icon: ChefHat, color: "text-red-600" },
  { name: "Shopping", route: "/team-portal/shopping/dashboard", icon: ShoppingCart, color: "text-purple-600" },
  { name: "Cleaning", route: "/team-portal/cleaning/dashboard", icon: Sparkles, color: "text-teal-600" },
];

export function PortalSwitcher() {
  const router = useRouter();
  const [investorMode, setInvestorMode] = useState(false);

  useEffect(() => {
    // Check if investor mode is active
    const checkInvestorMode = () => {
      if (typeof window !== "undefined") {
        const isActive = localStorage.getItem("INVESTOR_MODE") === "true";
        setInvestorMode(isActive);
      }
    };

    checkInvestorMode();
    // Recheck on route changes
    router.events?.on("routeChangeComplete", checkInvestorMode);

    return () => {
      router.events?.off("routeChangeComplete", checkInvestorMode);
    };
  }, [router]);

  const handleExitInvestorMode = () => {
    localStorage.removeItem("INVESTOR_MODE");
    localStorage.removeItem("BYPASS_AUTH");
    setInvestorMode(false);
    router.push("/");
  };

  const handleBackToDemo = () => {
    router.push("/investor-demo");
  };

  if (!investorMode) return null;

  return (
    <>
      {/* Floating Badge - Top Right */}
      <div className="fixed top-4 right-4 z-50">
        <Badge className="bg-gradient-to-r from-green-500 to-emerald-600 text-white px-4 py-2 shadow-lg animate-pulse">
          🚀 Investor Demo Active
        </Badge>
      </div>

      {/* Floating Portal Switcher - Bottom Right */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3">
        {/* Back to Demo Dashboard */}
        <Button
          onClick={handleBackToDemo}
          size="lg"
          className="h-12 px-4 rounded-full shadow-2xl bg-slate-700 hover:bg-slate-800 text-white"
          title="Return to Demo Dashboard"
        >
          <Home className="w-5 h-5 mr-2" />
          Demo Home
        </Button>

        {/* Portal Switcher Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button 
              size="lg"
              className="h-14 w-14 rounded-full shadow-2xl bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
              title="Quick Portal Switch"
            >
              <LayoutDashboard className="w-6 h-6" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-xs text-slate-500 uppercase tracking-wide">
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
                  className={`cursor-pointer py-3 ${isActive ? "bg-blue-50" : ""}`}
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
              onClick={handleExitInvestorMode}
              className="cursor-pointer text-red-600 hover:bg-red-50 py-3"
            >
              <X className="w-4 h-4 mr-3" />
              Exit Demo Mode
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}