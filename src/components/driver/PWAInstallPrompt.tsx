import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, Download, Share, Smartphone, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IosInstallGuide } from "@/components/pwa/IosInstallGuide";
import { BrowserInstallGuide } from "@/components/pwa/BrowserInstallGuide";
import { isInstalledApp, isIosDevice } from "@/lib/pwa/environment";
import { pwaInstallUrl, shouldOpenCompanyInstallPage } from "@/lib/pwa/metadata";

const DISMISS_KEY = "cateringmsPwaInstallDismissedAt:v2";
const QUIET_MS = 14 * 24 * 3600 * 1000;
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWAInstallPrompt({ appName = "CateringMS", companySlug, inline = false }: {
  appName?: string; companySlug?: string; inline?: boolean;
}) {
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [browserHint, setBrowserHint] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState("");
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);
  const trackRef = useRef<HTMLButtonElement>(null);
  const gesture = useRef<{ pointer: number; startX: number; value: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const installPath = pwaInstallUrl(companySlug);

  useEffect(() => {
    let quiet = false;
    try {
      const last = Number(localStorage.getItem(DISMISS_KEY) || 0);
      quiet = last > 0 && Date.now() - last < QUIET_MS;
    } catch { /* Installation still works when storage is blocked. */ }
    setIos(isIosDevice());
    setInstalled(isInstalledApp());
    setDismissed(!inline && quiet);
    setBrowserHint(inline);

    // Always capture the browser event, including after a recent dismissal.
    // A later sidebar request must still be able to use the native prompt.
    const onPrompt = (event: Event) => {
      event.preventDefault();
      deferredRef.current = event as BeforeInstallPromptEvent;
      setDeferred(deferredRef.current);
      setBrowserHint(false);
    };
    const onInstalled = () => { deferredRef.current = null; setDeferred(null); setInstalled(true); };
    const onModeChange = () => setInstalled(isInstalledApp());
    const onRequest = () => {
      setDismissed(false); setError(""); setStepsOpen(true);
      setBrowserHint(!deferredRef.current);
    };
    const mode = window.matchMedia?.("(display-mode: standalone)");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("cms:pwa-install-request", onRequest);
    window.addEventListener("pageshow", onModeChange);
    mode?.addEventListener?.("change", onModeChange);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("cms:pwa-install-request", onRequest);
      window.removeEventListener("pageshow", onModeChange);
      mode?.removeEventListener?.("change", onModeChange);
    };
  }, [inline]);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* Storage is optional. */ }
    setDismissed(true);
  };

  const opensCompanyGuide = shouldOpenCompanyInstallPage(inline, companySlug);

  async function activateInstall() {
    if (installing) return;
    // The install event may have been raised while the browser was still
    // using a generic manifest from an earlier app page. A tenant install
    // must start from its server-rendered branded page so the browser reads
    // the correct name, icon, launch URL and splash metadata together.
    if (shouldOpenCompanyInstallPage(inline, companySlug)) {
      window.location.assign(installPath);
      return;
    }
    const prompt = deferredRef.current;
    if (!prompt || ios) { setStepsOpen(true); return; }
    setInstalling(true); setError("");
    deferredRef.current = null;
    setDeferred(null);
    try {
      // Call directly from the user gesture so transient activation is retained.
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      else if (!inline) dismiss();
      else setBrowserHint(true);
    } catch {
      setBrowserHint(true); setStepsOpen(true);
      setError("The browser could not open installation. Use the browser steps below or try again after refreshing.");
    } finally { setInstalling(false); }
  }

  const resetGesture = () => { gesture.current = null; setDragging(false); setDragX(0); };
  const maxDrag = () => Math.max(0, (trackRef.current?.clientWidth || 0) - 56);

  if (installed) {
    return inline ? <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
      {appName} is installed or running as an app. <Link href={companySlug ? `/${companySlug}/login` : "/auth/login"} className="font-medium underline underline-offset-4">Open your workspace</Link>
    </div> : null;
  }
  if (!inline && (dismissed || (!ios && !browserHint && !deferred))) return null;

  return <Card
    data-pwa-install
    className={inline ? "min-w-0 rounded-xl border-slate-200 bg-white" : "fixed inset-x-3 z-[1200] max-h-[80dvh] overflow-y-auto overscroll-contain border-slate-200 bg-white shadow-xl sm:inset-x-auto sm:right-6 sm:w-[min(430px,calc(100vw-3rem))]"}
    style={inline ? undefined : { bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
    <CardContent className="p-4 sm:p-5">
      <div className="flex items-start gap-3">
        {ios ? <Share className="mt-0.5 h-5 w-5 shrink-0 text-brand-primary" /> : <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-brand-primary" />}
        <div className="min-w-0 flex-1">
          <p className="break-words text-base font-semibold text-slate-950">{ios ? `Add ${appName} to Home Screen` : `Install ${appName}`}</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">{ios ? "Use Safari's own toolbar to add this app." : "Keep your workspace one tap away."}</p>
        </div>
        {!inline && <Button type="button" variant="ghost" size="icon" className="-mr-2 -mt-2 shrink-0" onClick={dismiss} aria-label="Close install guide"><X className="h-4 w-4" /></Button>}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
      {ios ? <IosInstallGuide appName={appName} installPath={installPath} /> : <>
        {(deferred || !stepsOpen) && <Button type="button" disabled={installing} className="mt-4 min-h-11 w-full whitespace-normal bg-brand-primary text-white hover:bg-brand-primary/90" onClick={() => void activateInstall()}>
          <Download className="h-4 w-4" />{installing ? (opensCompanyGuide ? "Opening company install guide..." : "Opening install prompt...") : deferred ? (opensCompanyGuide ? `Open ${appName} install guide` : `Install ${appName}`) : opensCompanyGuide ? `Open ${appName} install guide` : "Show installation steps"}
        </Button>}
        {deferred || !stepsOpen ? <button
          ref={trackRef} type="button" disabled={installing}
          className="relative mt-4 h-12 w-full touch-none select-none overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary disabled:opacity-60"
          aria-label={opensCompanyGuide ? `Open ${appName} install guide; slide right or tap` : deferred ? `Install ${appName}; slide right or tap` : "Show browser install steps; slide right or tap"}
          onClick={event => {
            if (event.detail !== 0 && suppressClick.current) { suppressClick.current = false; return; }
            void activateInstall();
          }}
          onPointerDown={event => {
            if (gesture.current || !event.isPrimary || event.button !== 0 || installing) return;
            suppressClick.current = false;
            gesture.current = { pointer: event.pointerId, startX: event.clientX, value: 0, moved: false };
            setDragging(true);
            try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* Tap remains available if capture is unavailable. */ }
          }}
          onPointerMove={event => {
            const current = gesture.current;
            if (!current || current.pointer !== event.pointerId) return;
            const distance = event.clientX - current.startX;
            current.moved ||= Math.abs(distance) > 4;
            current.value = Math.max(0, Math.min(maxDrag(), distance));
            setDragX(current.value);
          }}
          onPointerUp={event => {
            const current = gesture.current;
            if (!current || current.pointer !== event.pointerId) return;
            suppressClick.current = current.moved;
            const completed = current.moved && maxDrag() > 0 && current.value >= maxDrag() * 0.72;
            resetGesture();
            if (completed) void activateInstall();
          }}
          onPointerCancel={() => { suppressClick.current = true; resetGesture(); }}
          onLostPointerCapture={resetGesture}
          onBlur={resetGesture}>
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center gap-1 pl-8 text-sm font-semibold text-slate-700">{installing ? (opensCompanyGuide ? "Opening company install guide..." : "Opening install prompt...") : opensCompanyGuide ? "Slide right to open company guide" : deferred ? "Slide right to install" : "Slide for install steps"}<ChevronRight className="h-4 w-4" /></span>
          <span aria-hidden="true" className="pointer-events-none absolute left-1 top-1 flex h-10 w-10 items-center justify-center rounded-full bg-brand-primary text-white" style={{ transform: `translateX(${dragX}px)`, transition: dragging ? "none" : "transform 180ms ease-out" }}><Download className="h-5 w-5" /></span>
        </button> : <div className="mt-4 space-y-3">
          <BrowserInstallGuide appName={appName} />
          <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => setStepsOpen(false)}>Show slider</Button>
        </div>}
      </>}
      {!inline && <Link href={installPath} className="mt-3 flex min-h-11 items-center justify-center gap-1 text-sm font-medium text-brand-primary underline underline-offset-4">Open full installation guide<ChevronRight className="h-4 w-4" /></Link>}
    </CardContent>
  </Card>;
}
