import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

interface SignOutButtonProps {
  collapsed?: boolean;
  className?: string;
}

/**
 * Standalone sign-out button used at the bottom of every portal sidebar.
 * Clears local cookies/storage and hard-navigates to /auth/login so middleware
 * gets a clean session.
 */
export function SignOutButton({ collapsed = false, className }: SignOutButtonProps) {
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Sign out error", err);
    } finally {
      try {
        document.cookie.split(";").forEach((c) => {
          const n = c.split("=")[0].trim();
          document.cookie = `${n}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
        });
        localStorage.clear();
        sessionStorage.clear();
      } catch {}
      window.location.assign("/auth/login");
    }
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
