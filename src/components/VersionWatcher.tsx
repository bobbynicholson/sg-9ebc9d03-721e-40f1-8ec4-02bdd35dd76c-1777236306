/**
 * Watches for new deploys and prompts the user to refresh so they're
 * always running the latest bundle. Solves the "Ctrl+Shift+R isn't doing
 * the trick" problem - when a deploy lands, the client picks it up on
 * its own.
 *
 * How it works:
 * 1. On mount, captures the current build ID (read from /api/version).
 * 2. Every 60s, polls /api/version. Also re-checks when the tab regains
 *    focus and when the connection comes back online.
 * 3. If the server's build ID differs from what we loaded, we know a
 *    new deploy is live. Show a banner with a manual "Refresh" button
 *    and auto-reload after 8 seconds.
 *
 * Skips on dev (build ID is "dev"). Won't double-prompt.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { RefreshCw, Sparkles } from "lucide-react";

// LCF-E (task #226, 2026-05-25): poll less aggressively + don't
// auto-reload. The previous setup (60s polls + 8s countdown +
// hard reload) created a feedback loop during Vercel's rolling
// deploys when edge nodes split-brain between old/new bundles:
//   poll lands on new node -> banner -> auto reload
//   page reloads onto old node -> initial captured as old
//   next poll lands on new node -> banner -> auto reload
//   ... repeat forever
// We now poll every 5 minutes and only ever SHOW the banner -
// the user clicks "Refresh now" if they want to pick up the new
// bundle. Worst case the user dismisses a banner; no loops.
const POLL_MS = 5 * 60_000;

async function fetchBuildId(): Promise<string | null> {
  try {
    const r = await fetch(`/api/version?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    const data = await r.json();
    return data?.buildId ?? null;
  } catch {
    return null;
  }
}

export function VersionWatcher() {
  const router = useRouter();
  const [initial, setInitial] = useState<string | null>(null);
  const [latest, setLatest] = useState<string | null>(null);

  // Self-hide on customer-facing surfaces (public quote, order
  // tracking, pay-invoice, unsubscribe, embed widgets). "A new
  // version is available" is internal dev-speak - on the client's
  // branded quote page it reads as a glitch and competes with the
  // accept CTA. Operators in admin / portals keep the banner; stale
  // bundles there cause real support pain.
  const p = router.pathname;
  const isCustomerFacing =
    p.startsWith("/q/") ||
    p.startsWith("/c/") ||
    p.startsWith("/pay/") ||
    p.startsWith("/u/") ||
    p.startsWith("/embed");

  // Capture the build we loaded with
  useEffect(() => {
    (async () => {
      const id = await fetchBuildId();
      if (id) setInitial(id);
    })();
  }, []);

  // Poll for new deploys.
  //
  // LCF-D (task #225, 2026-05-25): require TWO consecutive polls to
  // return the same new build id before triggering the reload
  // countdown. Vercel's rolling deploys put edge nodes into a split-
  // brain state for a minute or two - poll lands on node A (new
  // build), next poll lands on node B (old build), then back to A...
  // Without the consecutive-match gate the watcher fired the reload
  // countdown, the page reloaded onto a different node, mounted with
  // a now-stale `initial`, polled, saw a mismatch again, reload
  // countdown, and so on. End result: tab stuck in a reload loop
  // until propagation finished. The two-strike gate kills the
  // oscillation - a transient flip can't trigger reload, only a
  // stable rollover does.
  const candidateRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initial || initial === "dev") return;
    let cancelled = false;
    const tick = async () => {
      const id = await fetchBuildId();
      if (cancelled) return;
      if (!id || id === initial) {
        // Match initial - reset the candidate so a future flicker
        // back to "different" has to start the streak over.
        candidateRef.current = null;
        return;
      }
      if (candidateRef.current === id) {
        // Same new id twice in a row - rollover is stable, commit.
        setLatest(id);
        return;
      }
      candidateRef.current = id;
    };
    const interval = setInterval(tick, POLL_MS);
    const onFocus = () => tick();
    const onOnline = () => tick();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [initial]);

  // LCF-E: no auto-reload effect. The banner stays until the user
  // clicks Refresh now or dismisses with a hard refresh. Removed
  // because the countdown + auto-reload was looping during rolling
  // deploys when edge nodes served inconsistent build ids.

  if (isCustomerFacing || !latest) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] max-w-md w-[calc(100%-2rem)] sm:w-auto">
      <div className="bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-700 px-4 py-3 flex items-center gap-3 animate-in slide-in-from-bottom-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">A new version is available</p>
          <p className="text-xs text-slate-400">
            Tap Refresh now when it's convenient to pick up the latest changes.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => window.location.reload()}
          className="bg-white text-slate-900 hover:bg-slate-100 gap-1.5 flex-shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh now
        </Button>
        <button
          type="button"
          onClick={() => setLatest(null)}
          className="text-slate-400 hover:text-white text-xs flex-shrink-0"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
