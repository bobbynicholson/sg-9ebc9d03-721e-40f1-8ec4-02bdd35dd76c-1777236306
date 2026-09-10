/**
 * PWAInstallPrompt - driver portal Add-to-Home-Screen banner.
 *
 * Phase 7 #4. The driver portal already ships a manifest (see
 * _document.tsx) and a service worker (registered in _app.tsx),
 * which is enough to make Chrome / Edge fire `beforeinstallprompt`
 * once a driver has visited a few times. This component:
 *
 *   - captures that deferred event so we can fire it on a button
 *     click instead of relying on the browser's auto chip;
 *   - falls back to plain instructions on iOS Safari, which never
 *     fires the event (Apple's chosen path is Share -> Add to Home);
 *   - hides itself when the app is already running standalone;
 *   - remembers a dismissal in localStorage so we don't nag.
 *
 * Mount it inside the driver dashboard only - the manifest scope
 * limits install eligibility to /team-portal/driver/ anyway, but
 * this keeps the banner from rendering on admin views even briefly.
 */
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Smartphone, X, Download } from "lucide-react";

const DISMISS_KEY = "driverPwaInstallDismissedAt";
// Stay quiet for 14 days after a dismissal. After that the banner
// can come back - a driver who was on a borrowed phone last time
// might be on their own this time.
const QUIET_MS = 14 * 24 * 3600 * 1000;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS exposes the legacy navigator.standalone; everywhere else
  // uses the display-mode media query.
  const nav = window.navigator as any;
  if (nav.standalone === true) return true;
  return window.matchMedia?.("(display-mode: standalone)").matches ?? false;
}

function isIos(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  // iPad on iOS 13+ pretends to be Mac, so check touch points too.
  return /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes("Mac") && (window.navigator as any).maxTouchPoints > 1);
}

export function PWAInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(true); // start hidden

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;

    // Honour a recent dismissal.
    const last = Number(window.localStorage.getItem(DISMISS_KEY) || 0);
    if (last && Date.now() - last < QUIET_MS) return;

    setDismissed(false);

    // iOS never fires beforeinstallprompt. Show the hint card if
    // we're on an iDevice running in regular Safari (not already
    // installed).
    if (isIos()) {
      setShowIosHint(true);
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (dismissed) return null;
  if (!deferred && !showIosHint) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Private mode or storage full - harmless, just don't persist.
    }
    setDismissed(true);
  };

  const install = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        setDismissed(true);
      } else {
        // User said no - give them 14 days of quiet.
        dismiss();
      }
      setDeferred(null);
    } catch {
      // Some browsers reject if the prompt is fired twice; safest
      // to just clear and hide.
      setDeferred(null);
    }
  };

  return (
    <Card className="border-brand-primary/20 bg-brand-primary/5">
      <CardContent className="p-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-brand-primary/10 flex items-center justify-center shrink-0">
          <Smartphone className="w-5 h-5 text-brand-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-brand-primary">
            Install the driver app
          </p>
          <p className="text-xs text-slate-700">
            {showIosHint
              ? "Tap the Share icon in Safari, then \"Add to Home Screen\" for a faster, full-screen experience."
              : "Add it to your home screen so it opens like a regular app - faster login, full-screen, works on patchy signal."}
          </p>
        </div>
        {!showIosHint && deferred && (
          <Button
            size="sm"
            onClick={install}
            className="bg-brand-primary hover:bg-brand-primary/90 shrink-0"
          >
            <Download className="w-4 h-4 mr-1" />
            Install
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={dismiss}
          className="shrink-0 text-brand-primary hover:bg-brand-primary/10"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
