/**
 * useAdminModeToast -- Wave 70.31
 *
 * Fires a one-shot toast when the admin portal first enters "ops"
 * mode in a given browser session. Mirrors the toast pattern from
 * the staff portals.
 *
 * Why ops only: the other modes (quiet/pipeline/review/setup) are
 * passive states the owner can observe. Ops means events are
 * actually happening today -- the operator should know the portal
 * has noticed.
 */
import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAdminPortalMode } from "@/hooks/useAdminPortalMode";

const SESSION_KEY = "adminPortalMode:welcomedSession";

export function useAdminModeToast() {
  const { mode, autoMode, eventsToday, inTransitNow } = useAdminPortalMode();
  const { toast } = useToast();
  const lastModeRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (lastModeRef.current === mode) return;

    const previous = lastModeRef.current;
    lastModeRef.current = mode;

    if (mode !== "ops" || autoMode !== "ops") return;
    if (previous === null) {
      try {
        if (sessionStorage.getItem(SESSION_KEY)) return;
      } catch { /* ignore */ }
    }

    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch { /* ignore */ }

    const description = inTransitNow > 0
      ? `${eventsToday} event${eventsToday === 1 ? "" : "s"} today, ${inTransitNow} on the road right now.`
      : `${eventsToday} event${eventsToday === 1 ? "" : "s"} on today. Live ops + dispatch are your primary views.`;

    toast({
      title: "Service hours",
      description,
    });
  }, [mode, autoMode, eventsToday, inTransitNow, toast]);
}
