/**
 * PWAInstallPrompt - authenticated CateringMS Add-to-Home-Screen banner.
 *
 * Phase 7 #4. Authenticated portal surfaces ship the shared manifest
 * and service worker (registered in _app.tsx), which is enough to make
 * Chrome / Edge fire `beforeinstallprompt` once a user has visited a few
 * times. This component:
 *
 *   - captures that deferred event so we can fire it on a button
 *     click instead of relying on the browser's auto chip;
 *   - falls back to plain instructions on iOS Safari, which never
 *     fires the event (Apple's chosen path is Share -> Add to Home);
 *   - hides itself when the app is already running standalone;
 *   - remembers a dismissal in localStorage so we don't nag.
 *
 * Mount it from the authenticated app shell. Public website pages remain
 * ordinary website pages, while admin, platform, team and client workspaces
 * can all offer the same install affordance without changing their normal
 * browser sign-in flow.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Smartphone, X, Download, ChevronRight, Share2 } from "lucide-react";

const DISMISS_KEY = "cateringmsPwaInstallDismissedAt";
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
  const [iosInstructionsOpen, setIosInstructionsOpen] = useState(false);
  const [showBrowserHint, setShowBrowserHint] = useState(false);
  const [browserStepsOpen, setBrowserStepsOpen] = useState(false);
  const [shareOpened, setShareOpened] = useState(false);
  const [dismissed, setDismissed] = useState(true); // start hidden
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [installing, setInstalling] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef(0);
  const dragValueRef = useRef(0);
  const dragMovedRef = useRef(false);
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;

    // Honour a recent dismissal.
    let last = 0;
    try {
      last = Number(window.localStorage.getItem(DISMISS_KEY) || 0);
    } catch {
      // Private browsing / blocked storage should not prevent installation.
    }
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
      const prompt = e as BeforeInstallPromptEvent;
      deferredRef.current = prompt;
      setDeferred(prompt);
      setShowBrowserHint(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const onInstalled = () => {
      deferredRef.current = null;
      setDeferred(null);
      setDismissed(true);
    };
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // The sidebar exposes a permanent install entry. Some desktop browsers do
  // not emit beforeinstallprompt until the user has opened the browser menu,
  // so a manual request must still reveal a useful instruction card.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onInstallRequest = () => {
      if (isStandalone()) return;
      setDismissed(false);
      if (isIos()) {
        setShowIosHint(true);
        setIosInstructionsOpen(false);
        setShowBrowserHint(false);
      } else {
        setShowIosHint(false);
        setIosInstructionsOpen(false);
        setBrowserStepsOpen(false);
        setShowBrowserHint(!deferredRef.current);
      }
    };
    window.addEventListener("cms:pwa-install-request", onInstallRequest);
    return () => window.removeEventListener("cms:pwa-install-request", onInstallRequest);
  }, []);

  if (dismissed) return null;
  if (!deferred && !showIosHint && !showBrowserHint) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Private mode or storage full - harmless, just don't persist.
    }
    setDismissed(true);
  };

  const openIosShare = async () => {
    if (typeof window === "undefined") return;
    const share = (navigator as Navigator & {
      share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
    }).share;
    if (!share) {
      setShareOpened(false);
      return;
    }
    try {
      await share.call(navigator, {
        title: "CateringMS",
        text: "Add CateringMS to your Home Screen",
        url: window.location.href,
      });
      setShareOpened(true);
    } catch {
      // Closing the native share sheet is a normal user action.
    }
  };

  const install = async () => {
    if (!deferred) return;
    setInstalling(true);
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
    } finally {
      setInstalling(false);
    }
  };

  const slideMax = () => Math.max(0, (trackRef.current?.clientWidth || 0) - 56);

  const updateDrag = (clientX: number) => {
    const max = slideMax();
    const next = Math.max(0, Math.min(max, clientX - dragStartRef.current));
    if (Math.abs(next - dragValueRef.current) > 4) dragMovedRef.current = true;
    dragValueRef.current = next;
    setDragX(next);
  };

  const endDrag = () => {
    if (!dragging) return;
    setDragging(false);
    const max = slideMax();
    // A short tap remains a useful fallback for browsers that do not report
    // a reliable drag sequence. A real rightward slide still uses the same
    // 72% completion threshold shown in the UI.
    const completed = !dragMovedRef.current || (max > 0 && dragValueRef.current >= max * 0.72);
    dragValueRef.current = 0;
    setDragX(0);
    if (completed) {
      if ((showIosHint || showBrowserHint) && !deferred) setIosInstructionsOpen(true);
      else void install();
    }
  };

  const startDrag = (clientX: number) => {
    if ((!deferred && !showIosHint && !showBrowserHint) || installing) return;
    dragStartRef.current = clientX - dragValueRef.current;
    dragMovedRef.current = false;
    setDragging(true);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!installing && (deferred || showIosHint || showBrowserHint)) {
        if ((showIosHint || showBrowserHint) && !deferred) setIosInstructionsOpen(true);
        else void install();
      }
    }
  };

  return (
    <Card
      className="fixed inset-x-3 z-50 border-slate-200 bg-white/95 shadow-2xl backdrop-blur sm:inset-x-auto sm:right-6 sm:w-[min(430px,calc(100vw-3rem))]"
      style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <CardContent className="p-3.5 sm:p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-primary/10">
            {showIosHint ? (
              <Share2 className="h-5 w-5 text-brand-primary" />
            ) : (
              <Smartphone className="h-5 w-5 text-brand-primary" />
            )}
          </div>
          <div className="min-w-0 flex-1 pr-6">
            <p className="text-sm font-semibold text-slate-900">
              {showIosHint
                ? "Add CateringMS to your home screen"
                : showBrowserHint && !deferred
                  ? "Install CateringMS on this device"
                  : "Keep CateringMS one tap away"}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
              {showIosHint
                ? iosInstructionsOpen
                  ? "Safari needs one final confirmation: choose Add to Home Screen, then tap Add."
                  : "Slide right to see Safari's Share and Add to Home Screen steps."
                : showBrowserHint && !deferred
                  ? "Use your browser menu and choose Install CateringMS or Add to Home screen. Your signed-in session will stay available."
                  : "Open your workspace from the home screen and keep your signed-in session between launches."}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={dismiss}
            className="absolute right-2 top-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Dismiss install prompt"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {showIosHint && iosInstructionsOpen ? (
          <div className="mt-3 space-y-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
            <div className="flex min-w-0 items-center gap-2">
              <Share2 className="h-4 w-4 shrink-0 text-brand-primary" />
              <span className="min-w-0 break-words">Safari: Share → Add to Home Screen → Add</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-10 w-full justify-center gap-2 bg-white"
              onClick={() => void openIosShare()}
            >
              <Share2 className="h-4 w-4" />
              {shareOpened ? "Share sheet opened" : "Open Share"}
            </Button>
            <p className="text-[11px] font-normal leading-relaxed text-slate-500">
              If Add to Home Screen is not listed, tap Safari&apos;s Share icon in the browser toolbar.
            </p>
          </div>
        ) : showBrowserHint && !deferred && iosInstructionsOpen ? (
          <div className="mt-3 space-y-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
            <button
              type="button"
              className="flex min-h-10 w-full min-w-0 items-center gap-2 rounded-lg text-left hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
              onClick={() => setBrowserStepsOpen((open) => !open)}
              aria-expanded={browserStepsOpen}
            >
            <Download className="h-4 w-4 shrink-0 text-brand-primary" />
            <span className="min-w-0 break-words">Browser menu <span aria-hidden>→</span> Install CateringMS</span>
            </button>
            {browserStepsOpen && (
              <ol className="space-y-1.5 border-t border-slate-200 pt-2 text-[11px] font-normal leading-relaxed text-slate-600">
                <li><span className="font-semibold text-slate-800">1.</span> Open your browser menu <span aria-hidden>⋮</span>.</li>
                <li><span className="font-semibold text-slate-800">2.</span> Choose <span className="font-semibold text-slate-800">Install CateringMS</span> or <span className="font-semibold text-slate-800">Add to Home screen</span>.</li>
                <li><span className="font-semibold text-slate-800">3.</span> Confirm <span className="font-semibold text-slate-800">Install</span>.</li>
              </ol>
            )}
          </div>
        ) : deferred || showIosHint || showBrowserHint ? (
          <div
            ref={trackRef}
            className="relative mt-3 h-12 min-w-0 select-none touch-none overflow-hidden rounded-full bg-slate-100 p-1 ring-1 ring-inset ring-slate-200"
            style={{ touchAction: "none" }}
            onPointerDown={(event) => {
              if ((!deferred && !showIosHint && !showBrowserHint) || installing) return;
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              startDrag(event.clientX);
            }}
            onPointerMove={(event) => dragging && updateDrag(event.clientX)}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            role="button"
            tabIndex={0}
            aria-label={showIosHint ? "Slide right to see Safari install steps" : showBrowserHint ? "Slide right to see browser install steps" : "Slide right to install CateringMS"}
            onKeyDown={handleKeyDown}
          >
            <div
              className="absolute inset-y-1 left-1 flex items-center gap-1 rounded-full bg-brand-primary px-3 text-white shadow-md"
              style={{
                width: 48 + dragX,
                transition: dragging ? "none" : "width 180ms ease-out",
              }}
              aria-hidden="true"
            >
              <Download className="h-4 w-4 shrink-0" />
              <span className="sr-only">Install</span>
            </div>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-1 text-xs font-semibold text-slate-600">
              {installing
                ? "Installing..."
                : showIosHint
                  ? "Slide right to add"
                  : "Slide right to install"}
              {!installing && <ChevronRight className="h-4 w-4" />}
            </div>
            <div
              className="absolute inset-y-1 left-1 flex h-10 w-10 cursor-grab items-center justify-center rounded-full bg-brand-primary text-white shadow-md active:cursor-grabbing"
              style={{
                transform: `translateX(${dragX}px)`,
                transition: dragging ? "none" : "transform 180ms ease-out",
                touchAction: "none",
              }}
              aria-hidden="true"
            >
              <ChevronRight className="h-5 w-5" />
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
