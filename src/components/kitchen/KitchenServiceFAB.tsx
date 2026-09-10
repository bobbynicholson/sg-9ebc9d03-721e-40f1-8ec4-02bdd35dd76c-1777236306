/**
 * KitchenServiceFAB - Wave 70.7c
 *
 * Floating action button at the bottom-LEFT of the screen on
 * mobile during service hours. Opens the same navigation drawer
 * the top-left burger opens, so a chef with one hand on a knife
 * can reach the nav from a natural thumb position without going
 * to the top-left corner.
 *
 * Why bottom-LEFT not bottom-right: the ChatBot bubble already
 * lives bottom-right on the kitchen dashboard, and "left side =
 * nav" is the platform's mental model anyway.
 *
 * Visibility rules:
 *   - Mobile only (lg:hidden)
 *   - Only when service mode = "service"
 *   - Respects safe-area-inset-bottom for iOS notch / home bar
 *   - Pulses subtly when there are overdue items (motion-safe)
 *
 * Implementation: this button doesn't own the drawer itself; it
 * dispatches a custom event the PortalSidebar listens for. Keeps
 * the FAB decoupled from any specific sidebar plumbing.
 */
import { Menu, Flame } from "lucide-react";
import { usePortalServiceMode } from "@/hooks/usePortalServiceMode";
import { useKitchenLiveCounts } from "@/hooks/useKitchenLiveCounts";
import { cn } from "@/lib/utils";

export const KITCHEN_FAB_OPEN_EVENT = "kitchen-fab:open-nav";

export function KitchenServiceFAB() {
  const { mode } = usePortalServiceMode();
  const counts = useKitchenLiveCounts();

  if (mode !== "service") return null;

  const overdue = counts.overdue > 0;
  const onPass = counts.onPass;

  const handleClick = () => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(KITCHEN_FAB_OPEN_EVENT));
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Open kitchen menu"
      className={cn(
        "lg:hidden fixed left-4 z-50 flex items-center gap-2 px-4 py-3 rounded-full shadow-xl",
        "bg-brand-primary text-white",
        "hover:opacity-90 active:scale-95 transition-all",
        overdue ? "motion-safe:animate-pulse" : "",
      )}
      style={{
        bottom: "max(1rem, env(safe-area-inset-bottom, 1rem))",
      }}
    >
      <Menu className="h-5 w-5" />
      {onPass > 0 && (
        <span className="flex items-center gap-1 text-xs font-bold">
          <Flame className="h-3.5 w-3.5" />
          {onPass}
        </span>
      )}
    </button>
  );
}
