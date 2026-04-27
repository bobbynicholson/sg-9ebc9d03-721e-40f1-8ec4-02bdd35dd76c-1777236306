/**
 * Watches for new deploys and prompts the user to refresh so they're
 * always running the latest bundle. Solves the "Ctrl+Shift+R isn't doing
 * the trick" problem -- when a deploy lands, the client picks it up on
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
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Sparkles } from "lucide-react";

const POLL_MS = 60_000;
const COUNTDOWN_S = 8;

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
  const [initial, setInitial] = useState<string | null>(null);
  const [latest, setLatest] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(COUNTDOWN_S);

  // Capture the build we loaded with
  useEffect(() => {
    (async () => {
      const id = await fetchBuildId();
      if (id) setInitial(id);
    })();
  }, []);

  // Poll for new deploys
  useEffect(() => {
    if (!initial || initial === "dev") return;
    let cancelled = false;
    const tick = async () => {
      const id = await fetchBuildId();
      if (cancelled) return;
      if (id && id !== initial) setLatest(id);
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

  // Auto-reload countdown once we know there's a new build
  useEffect(() => {
    if (!latest) return;
    setCountdown(COUNTDOWN_S);
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(t);
          // Hard reload so the new HTML + bundles come down
          if (typeof window !== "undefined") {
            window.location.reload();
          }
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [latest]);

  if (!latest) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] max-w-md w-[calc(100%-2rem)] sm:w-auto">
      <div className="bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-700 px-4 py-3 flex items-center gap-3 animate-in slide-in-from-bottom-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">A new version is available</p>
          <p className="text-xs text-slate-400">
            Refreshing in {countdown}s to pick up the latest changes...
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
      </div>
    </div>
  );
}
