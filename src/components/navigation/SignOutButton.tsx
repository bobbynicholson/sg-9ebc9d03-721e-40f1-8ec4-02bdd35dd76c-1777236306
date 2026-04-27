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
        "w-full border border-red-100 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700",
        collapsed ? "justify-center px-2" : "justify-start gap-3 px-4",
        className,
      )}
    >
      <LogOut className="h-4 w-4" />
      {!collapsed && <span>{signingOut ? "Signing out..." : "Sign out"}</span>}
    </Button>
  );
}
