import Link from "next/link";
import { ChevronDown, LogOut, Settings, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RoleSwitcher } from "@/components/RoleSwitcher";

/**
 * Desktop header controls for a signed-in visitor: role switcher, dashboard
 * link and account menu. Split out of LandingHeader and loaded only once a
 * user is known, so signed-out visitors never download the dropdown code.
 */
export function LandingAccountMenu({ email, dashboardPath, onSignOut }: {
  email: string;
  dashboardPath: string;
  onSignOut: () => void;
}) {
  return (
    <>
      <RoleSwitcher variant="compact" showLabel={false} />
      <Button asChild className="rounded-full bg-amber-800 px-5 font-semibold text-white hover:bg-amber-900">
        <Link href={dashboardPath}>Dashboard</Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2 rounded-full text-stone-700 hover:bg-stone-100">
            <User className="h-4 w-4" aria-hidden="true" />
            <span className="hidden xl:inline">{email}</span>
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem asChild>
            <Link href="/account/settings" className="flex cursor-pointer items-center">
              <Settings className="mr-2 h-4 w-4" aria-hidden="true" /> Account settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onSignOut} className="cursor-pointer text-rose-600">
            <LogOut className="mr-2 h-4 w-4" aria-hidden="true" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
