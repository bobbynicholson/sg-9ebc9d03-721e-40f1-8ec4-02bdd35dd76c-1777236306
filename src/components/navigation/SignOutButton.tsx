import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { signOutAndRedirect } from "@/lib/signOut";

interface SignOutButtonProps {
  collapsed?: boolean;
  className?: string;
}

/**
 * Standalone sign-out button used at the bottom of every portal sidebar.
 * Routes the user back to their tenant login (/{slug}/login) when we know
 * which company they came from, so they can re-enter via the same branded
 * URL. Falls back to /auth/login.
 */
export function SignOutButton({ collapsed = false, className }: SignOutButtonProps) {
  const { profile } = useAuth() as any;
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    await signOutAndRedirect(profile);
  };

  return (
    <Button
      variant="ghost"
      onClick={handleSignOut}
      disabled={signingOut}
      title="Sign out"
      className={cn(
        "h-10 max-w-full min-w-0 overflow-hidden rounded-lg border border-transparent bg-transparent text-[13px] font-semibold text-rose-600 shadow-none hover:border-rose-200/70 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-300 dark:hover:border-rose-500/20 dark:hover:bg-rose-500/10 dark:hover:text-rose-200",
        collapsed ? "mx-auto w-10 flex-none justify-center p-0" : "w-full justify-start gap-2.5 px-3",
        className,
      )}
    >
      <LogOut className="h-4 w-4 flex-shrink-0" />
      {!collapsed && (
        <span className="min-w-0 truncate">
          {signingOut ? "Signing out..." : "Sign out"}
        </span>
      )}
    </Button>
  );
}
