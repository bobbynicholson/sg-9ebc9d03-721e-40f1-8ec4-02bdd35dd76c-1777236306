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
import { UserRole } from "@/types/app";

// Role icons mapping
const roleIcons: Record<string, React.ReactNode> = {
  admin: <UserCog className="h-4 w-4" />,
  driver: <Truck className="h-4 w-4" />,
  client: <Users className="h-4 w-4" />,
  cleaning: <Sparkles className="h-4 w-4" />,
  shopping: <ShoppingCart className="h-4 w-4" />,
  kitchen: <ChefHat className="h-4 w-4" />,
  owner: <Crown className="h-4 w-4" />,
  super_admin: <Shield className="h-4 w-4" />,
  shopping_staff: <ShoppingCart className="h-4 w-4" />,
  cleaning_staff: <Sparkles className="h-4 w-4" />,
  kitchen_staff: <ChefHat className="h-4 w-4" />,
};

// Role colors for badges
const roleColors: Record<string, string> = {
  admin: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  driver: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  client: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  cleaning: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300",
  shopping: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300",
  kitchen: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  owner: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  super_admin: "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300",
  shopping_staff: "bg-orange-50 text-orange-600 dark:bg-orange-950 dark:text-orange-400",
  cleaning_staff: "bg-cyan-50 text-cyan-600 dark:bg-cyan-950 dark:text-cyan-400",
  kitchen_staff: "bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-400",
};

interface RoleSwitcherProps {
  variant?: "default" | "compact";
  showLabel?: boolean;
}

export function RoleSwitcher({ variant = "default", showLabel = true }: RoleSwitcherProps) {
  const { userRoles, activeRole, switchRole } = useAuth();
  const [switching, setSwitching] = useState(false);

  // Don't show if user only has one role
  if (userRoles.length <= 1) {
    return null;
  }

  const handleRoleSwitch = async (newRole: UserRole) => {
    if (newRole === activeRole || switching) return;

    try {
      setSwitching(true);
      await switchRole(newRole);
    } catch (error) {
      console.error("Failed to switch role:", error);
      alert("Failed to switch role. Please try again.");
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
          {userRoles.map((role) => (
            <DropdownMenuItem
              key={role.id}
              onClick={() => handleRoleSwitch(role.department as UserRole)}
              disabled={role.department === activeRole || switching}
              className="gap-2"
            >
              {roleIcons[role.department]}
              <span className="flex-1">
                {roleService.getRoleDisplayName(role.department as UserRole)}
              </span>
              {role.department === activeRole && (
                <Badge variant="secondary" className="text-xs">
                  Active
                </Badge>
              )}
              {role.is_primary && role.department !== activeRole && (
                <Badge variant="outline" className="text-xs">
                  Primary
                </Badge>
              )}
            </DropdownMenuItem>
          ))}
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
              You have access to {userRoles.length} dashboards
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {userRoles.map((role) => {
          const isActive = role.department === activeRole;
          return (
            <DropdownMenuItem
              key={role.id}
              onClick={() => handleRoleSwitch(role.department as UserRole)}
              disabled={isActive || switching}
              className="gap-3 py-3 cursor-pointer"
            >
              <div className="flex-shrink-0">{roleIcons[role.department]}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">
                    {roleService.getRoleDisplayName(role.department as UserRole)}
                  </span>
                  {isActive && (
                    <Badge className={`text-xs ${currentRoleColor}`}>
                      Active
                    </Badge>
                  )}
                </div>
                {role.is_primary && !isActive && (
                  <p className="text-xs text-muted-foreground">
                    Primary dashboard
                  </p>
                )}
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
