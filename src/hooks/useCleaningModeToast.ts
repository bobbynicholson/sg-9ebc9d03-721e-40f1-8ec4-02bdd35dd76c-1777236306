/**
 * useCleaningModeToast -- Wave 70.28
 *
 * Fires a one-shot toast when the cleaning portal first enters
 * "returns" mode in a given browser session. Mirrors
 * useServiceModeToast on the kitchen side.
 *
 * Why returns and not the other modes: returns is the only mode
 * where reaction time matters (equipment is on the way back, the
 * cleaner needs to be ready). quiet / dispatch / wrap are passive
 * states the cleaner can observe at their own pace.
 *
 * Session-scoped: fires once per browser session, never spams a
 * returning user. Only fires when the auto-detector flips to
 * returns -- manual overrides are user-initiated and don't need
 * confirmation.
 */
import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useCleaningPortalMode } from "@/hooks/useCleaningPortalMode";

const SESSION_KEY = "cleaningPortalMode:welcomedSession";

export function useCleaningModeToast() {
  const { mode, autoMode, returnsDue, activeHandovers } = useCleaningPortalMode();
  const { toast } = useToast();
  const lastModeRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (lastModeRef.current === mode) return;

    const previous = lastModeRef.current;
    lastModeRef.current = mode;

    // Only fire on transitions INTO returns mode, and only when
    // the auto-detector says so.
    if (mode !== "returns" || autoMode !== "returns") return;
    if (previous === null) {
      // First render after page load. Still fire if first time
      // this session, otherwise skip.
      try {
        if (sessionStorage.getItem(SESSION_KEY)) return;
      } catch { /* ignore */ }
    }

    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch { /* ignore */ }

    const description = returnsDue > 0
      ? `${returnsDue} handover${returnsDue === 1 ? "" : "s"} due in the next 4 hours.`
      : `${activeHandovers} handover${activeHandovers === 1 ? "" : "s"} currently being washed.`;

    toast({
      title: "Returns mode active",
      description: `${description} Verify each handover as it lands.`,
    });
  }, [mode, autoMode, returnsDue, activeHandovers, toast]);
}
