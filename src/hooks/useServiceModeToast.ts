/**
 * useServiceModeToast - Wave 70.7c
 *
 * Fires a single toast when the kitchen first enters service mode
 * in a given browser session. Mounted at the top of the kitchen
 * portal layout so it works regardless of which page the user is on
 * when the mode flips.
 *
 * Why session-scoped (not localStorage): we don't want the toast
 * to ever spam a returning user, but we DO want it to fire on the
 * first transition each session so the chef who reopens the app
 * at 11:55 sees "service mode active" once at noon.
 *
 * Why a single toast (not a multi-step tour): tours rot. A single
 * acknowledging toast tells the user "the app knows you're in
 * service now" without taking over the screen.
 */
import { useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { usePortalServiceMode } from "@/hooks/usePortalServiceMode";

const SESSION_KEY = "kitchenServiceMode:welcomedSession";

export function useServiceModeToast() {
  const { mode, autoMode } = usePortalServiceMode();
  const { toast } = useToast();
  const lastModeRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (lastModeRef.current === mode) return;

    const previous = lastModeRef.current;
    lastModeRef.current = mode;

    // Only fire on transitions INTO service mode, and only when
    // it's the auto-detector saying so (manual overrides are user-
    // initiated, no need to confirm what they just chose).
    if (mode !== "service" || autoMode !== "service") return;
    if (previous === null) {
      // First render after page load. We still want to fire if it's
      // the first time this session, but only if we haven't shown
      // it before.
      try {
        if (sessionStorage.getItem(SESSION_KEY)) return;
      } catch { /* ignore */ }
    }

    try {
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch { /* ignore */ }

    toast({
      title: "Service mode active",
      description: "The portal is in service mode. Production grid is your primary view, mark items ready as they leave the pass.",
    });
  }, [mode, autoMode, toast]);
}
