import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { roleService } from "@/services/roleService";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  UserCog,
  Truck,
  Users,
  Sparkles,
  ShoppingCart,
  ChefHat,
  Crown,
  Shield,
  Loader2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { UserRole } from "@/types/app";

// Role icons mapping
const roleIcons: Record<string, React.ReactNode> = {
  super_admin: <Shield className="h-4 w-4" />,
  company_admin: <UserCog className="h-4 w-4" />,
  admin: <UserCog className="h-4 w-4" />,
  owner: <Crown className="h-4 w-4" />,
  driver: <Truck className="h-4 w-4" />,
  client: <Users className="h-4 w-4" />,
  cleaning: <Sparkles className="h-4 w-4" />,
  shopping: <ShoppingCart className="h-4 w-4" />,
  kitchen: <ChefHat className="h-4 w-4" />,
  shopping_staff: <ShoppingCart className="h-4 w-4" />,
  cleaning_staff: <Sparkles className="h-4 w-4" />,
  kitchen_staff: <ChefHat className="h-4 w-4" />,
};

// Role colors for badges
const roleColors: Record<string, string> = {
  super_admin: "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300",
  company_admin: "bg-brand-primary/10 text-brand-primary dark:bg-brand-primary/15 dark:text-brand-primary",
  admin: "bg-brand-primary/10 text-brand-primary dark:bg-brand-primary/15 dark:text-brand-primary",
  owner: "bg-brand-primary/10 text-brand-primary dark:bg-brand-primary/15 dark:text-brand-primary",
  driver: "bg-brand-primary/10 text-brand-primary dark:bg-brand-primary/15 dark:text-brand-primary",
  client: "bg-brand-primary/10 text-brand-primary dark:bg-brand-primary/15 dark:text-brand-primary",
  cleaning: "bg-brand-primary/10 text-brand-primary dark:bg-brand-primary/15 dark:text-brand-primary",
  shopping: "bg-brand-primary/10 text-brand-primary dark:bg-brand-primary/15 dark:text-brand-primary",
  kitchen: "bg-brand-primary/10 text-brand-primary dark:bg-brand-primary/15 dark:text-brand-primary",
  shopping_staff: "bg-brand-primary/5 text-brand-primary dark:bg-brand-primary/10 dark:text-brand-primary",
  cleaning_staff: "bg-brand-primary/5 text-brand-primary dark:bg-brand-primary/10 dark:text-brand-primary",
  kitchen_staff: "bg-brand-primary/5 text-brand-primary dark:bg-brand-primary/10 dark:text-brand-primary",
};

interface RoleSwitcherProps {
  variant?: "default" | "compact";
  showLabel?: boolean;
}

export function RoleSwitcher({ variant = "default", showLabel = true }: RoleSwitcherProps) {
  const { userRoles, activeRole, switchRole } = useAuth();
  const { toast } = useToast();
  const [switching, setSwitching] = useState(false);

  // The picker only ever offers roles the user has actually been
  // granted. Super_admin used to get a "god mode" path that let them
  // act as any role on the platform - that's a tenant-isolation
  // violation and got pulled. Now super_admin sees nothing here
  // unless their profile genuinely holds multiple roles.
  const displayRoles = userRoles;

  if (displayRoles.length <= 1) {
    return null;
  }

  const handleRoleSwitch = async (newRole: UserRole) => {
    if (newRole === activeRole || switching) return;

    try {
      setSwitching(true);
      await switchRole(newRole);
    } catch (error) {
      console.error("Failed to switch role:", error);
      toast({
        title: "Role not switched",
        description: "Refresh and try switching roles again.",
        variant: "destructive",
      });
    } finally {
      setSwitching(false);
    }
  };

  const currentRoleName = roleService.getRoleDisplayName(activeRole as any);
  const currentRoleIcon = roleIcons[activeRole] || <Users className="h-4 w-4" />;
  const currentRoleColor = roleColors[activeRole] || "bg-gray-100 text-gray-700";

  if (variant === "compact") {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            disabled={switching}
          >
            {switching ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="text-xs">Switching...</span>
              </>
            ) : (
              <>
                {currentRoleIcon}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Switch Dashboard</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {displayRoles.map((role) => {
            const roleKey = String(role);
            const isActive = role === activeRole;
            return (
              <DropdownMenuItem
                key={roleKey}
                onClick={() => handleRoleSwitch(role)}
                disabled={isActive || switching}
                className="gap-2"
              >
                {roleIcons[roleKey] || <Users className="h-4 w-4" />}
                <span className="flex-1">
                  {roleService.getRoleDisplayName(role) || roleKey}
                </span>
                {isActive && (
                  <Badge variant="secondary" className="text-xs">
                    Active
                  </Badge>
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="gap-2 min-w-[180px] justify-between"
          disabled={switching}
        >
          {switching ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="font-medium">Switching...</span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                {currentRoleIcon}
                {showLabel && (
                  <span className="font-medium">{currentRoleName}</span>
                )}
              </div>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">Switch Dashboard</p>
            <p className="text-xs leading-none text-muted-foreground">
              You have access to {displayRoles.length} dashboards
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {displayRoles.map((role) => {
          const roleKey = String(role);
          const isActive = role === activeRole;
          return (
            <DropdownMenuItem
              key={roleKey}
              onClick={() => handleRoleSwitch(role)}
              disabled={isActive || switching}
              className="gap-3 py-3 cursor-pointer"
            >
              <div className="flex-shrink-0">{roleIcons[roleKey] || <Users className="h-4 w-4" />}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">
                    {roleService.getRoleDisplayName(role) || roleKey}
                  </span>
                  {isActive && (
                    <Badge className={`text-xs ${currentRoleColor}`}>
                      Active
                    </Badge>
                  )}
                </div>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
