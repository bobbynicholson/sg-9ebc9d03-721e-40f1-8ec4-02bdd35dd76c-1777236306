/**
 * useShoppingModeToast - Wave 70.29
 *
 * Fires a one-shot toast when the shopping portal first enters
 * "run" mode in a given browser session. Mirrors useServiceModeToast
 * (kitchen) and useCleaningModeToast (cleaning).
 *
 * Why run and not the other modes: run is the only mode where the
 * shopper is physically in the field (likely on mobile, in a shop).
 * Plan / reconcile / quiet are passive desk modes.
 *
 * Session-scoped: fires once per browser session, never spams a
 * returning user. Only fires when the auto-detector flips to run.
 */
import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useShoppingPortalMode } from "@/hooks/useShoppingPortalMode";

const SESSION_KEY = "shoppingPortalMode:welcomedSession";

export function useShoppingModeToast() {
  const { mode, autoMode, activeLists } = useShoppingPortalMode();
  const { toast } = useToast();
  const lastModeRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (lastModeRef.current === mode) return;

    const previous = lastModeRef.current;
    lastModeRef.current = mode;

    if (mode !== "run" || autoMode !== "run") return;
    if (previous === null) {
      try {
        if (sessionStorage.getItem(SESSION_KEY)) return;
      } catch { /* ignore */ }
    }

    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch { /* ignore */ }

    toast({
      title: "Shop in progress",
      description: `${activeLists} active list${activeLists === 1 ? "" : "s"}. Tick items off as you buy them and snap receipts when you check out.`,
    });
  }, [mode, autoMode, activeLists, toast]);
}
