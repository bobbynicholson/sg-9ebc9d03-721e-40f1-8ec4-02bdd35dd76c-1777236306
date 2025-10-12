import { useState, useEffect } from "react";
import { useDemoMode, DemoRole } from "@/contexts/DemoModeContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  Users,
  Truck,
  ShieldCheck,
  ChefHat,
  ShoppingCart,
  Sparkles,
  Check,
  Info
} from "lucide-react";

const ROLE_CONFIG: Record<Exclude<DemoRole, null>, { label: string; icon: typeof Users; color: string; description: string }> = {
  admin: {
    label: "Admin",
    icon: ShieldCheck,
    color: "bg-purple-500",
    description: "Full system access - manage leads, orders, inventory, staff, and settings"
  },
  driver: {
    label: "Driver",
    icon: Truck,
    color: "bg-blue-500",
    description: "View available jobs, track deliveries, and manage earnings"
  },
  client: {
    label: "Client",
    icon: Users,
    color: "bg-green-500",
    description: "Book events, track orders, view invoices, and submit feedback"
  },
  kitchen: {
    label: "Kitchen",
    icon: ChefHat,
    color: "bg-orange-500",
    description: "View prep schedules, production lists, and order details"
  },
  shopping: {
    label: "Shopping",
    icon: ShoppingCart,
    color: "bg-pink-500",
    description: "Manage shopping lists, track inventory, and scan receipts"
  },
  cleaning: {
    label: "Cleaning",
    icon: Sparkles,
    color: "bg-teal-500",
    description: "View cleaning schedules, equipment status, and completed jobs"
  }
};

export function DemoModeToggle() {
  const [mounted, setMounted] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const { isDemoMode, demoRole, setDemoMode, setDemoRole, getDemoUser } = useDemoMode();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button
        variant="outline"
        className="gap-2 border-2 border-purple-500 hover:bg-purple-50"
        disabled
      >
        <Sparkles className="w-4 h-4" />
        <span className="hidden sm:inline">Try Demo</span>
        <span className="sm:hidden">Demo</span>
      </Button>
    );
  }

  const handleRoleChange = (role: DemoRole) => {
    if (role) {
      setDemoRole(role);
      if (!isDemoMode) {
        setDemoMode(true);
      }
    }
  };

  const handleToggleDemoMode = () => {
    if (isDemoMode) {
      setDemoMode(false);
      setDemoRole(null);
    } else {
      setDemoMode(true);
      setDemoRole("admin");
    }
  };

  const currentUser = getDemoUser();
  const CurrentIcon = demoRole ? ROLE_CONFIG[demoRole].icon : Users;

  return (
    <>
      <div className="flex items-center gap-2">
        {isDemoMode && demoRole && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className={`gap-2 border-2 ${ROLE_CONFIG[demoRole].color} bg-opacity-10 hover:bg-opacity-20 transition-all`}
              >
                <CurrentIcon className="w-4 h-4" />
                <span className="hidden sm:inline">{ROLE_CONFIG[demoRole].label} Demo</span>
                <span className="sm:hidden">Demo</span>
                <Badge variant="secondary" className="ml-1">
                  {currentUser?.full_name.split(" ")[0]}
                </Badge>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel className="flex items-center justify-between">
                <span>Switch Demo Role</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowInfo(true)}
                  className="h-auto p-1"
                >
                  <Info className="w-4 h-4" />
                </Button>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              
              {(Object.keys(ROLE_CONFIG) as Array<Exclude<DemoRole, null>>).map((role) => {
                const config = ROLE_CONFIG[role];
                const Icon = config.icon;
                const isActive = demoRole === role;
                
                return (
                  <DropdownMenuItem
                    key={role}
                    onClick={() => handleRoleChange(role)}
                    className="flex items-start gap-3 p-3 cursor-pointer"
                  >
                    <div className={`p-2 rounded-lg ${config.color} bg-opacity-20`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{config.label}</span>
                        {isActive && (
                          <Check className="w-4 h-4 text-green-600" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {config.description}
                      </p>
                    </div>
                  </DropdownMenuItem>
                );
              })}
              
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleToggleDemoMode}
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                Exit Demo Mode
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {!isDemoMode && (
          <Button
            onClick={handleToggleDemoMode}
            variant="outline"
            className="gap-2 border-2 border-purple-500 hover:bg-purple-50"
          >
            <Sparkles className="w-4 h-4" />
            <span className="hidden sm:inline">Try Demo</span>
            <span className="sm:hidden">Demo</span>
          </Button>
        )}
      </div>

      <Dialog open={showInfo} onOpenChange={setShowInfo}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-purple-600" />
              Demo Mode Guide
            </DialogTitle>
            <DialogDescription>
              Experience CateringMS from different perspectives
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 mb-2">What is Demo Mode?</h4>
              <p className="text-sm text-blue-800">
                Demo Mode lets you explore CateringMS as different users without signing up. Switch between roles to see how each team member experiences the platform. All data is simulated and resets when you exit demo mode.
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold">Available Demo Roles:</h4>
              
              {(Object.keys(ROLE_CONFIG) as Array<Exclude<DemoRole, null>>).map((role) => {
                const config = ROLE_CONFIG[role];
                const Icon = config.icon;
                
                return (
                  <div key={role} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                    <div className={`p-2 rounded-lg ${config.color} bg-opacity-20`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h5 className="font-semibold">{config.label}</h5>
                      <p className="text-sm text-muted-foreground">{config.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h4 className="font-semibold text-amber-900 mb-2">Note</h4>
              <p className="text-sm text-amber-800">
                Demo mode is designed for exploration and testing. To use CateringMS for your business, sign up for a free trial with your own account.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
