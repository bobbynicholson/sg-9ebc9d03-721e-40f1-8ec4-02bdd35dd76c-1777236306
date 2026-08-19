import { useEffect, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const SEEN_KEY = "cms:cmdk-hint-seen";

/**
 * Discoverability badge for the global Cmd+K command palette.
 * Renders a "Quick search Cmd K" pill that, when clicked, fires the same
 * keyboard event the palette listens for (so we don't have to thread state
 * through every nav).
 *
 * On first visit (localStorage flag not set) the pill pulses with a subtle
 * ring animation for 6 seconds to draw the eye, then settles into its
 * normal appearance. The flag persists so returning users never see the
 * pulse again.
 */
export function CommandPaletteHint({ className }: { className?: string }) {
  const [isMac, setIsMac] = useState(false);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    // Navigator detection
    const plat =
      (navigator as any).userAgentData?.platform ||
      navigator.platform ||
      navigator.userAgent ||
      "";
    setIsMac(/mac|iphone|ipad|ipod/i.test(plat));

    // First-visit pulse: check if the user has seen the hint before
    try {
      if (!localStorage.getItem(SEEN_KEY)) {
        setIsNew(true);
        // Auto-clear after 6s so it only pulses once per session
        const t = setTimeout(() => setIsNew(false), 6000);
        return () => clearTimeout(t);
      }
    } catch {
      // localStorage unavailable — degrade silently
    }
  }, []);

  const open = () => {
    // Mark as seen when explicitly clicked
    try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ }
    setIsNew(false);
    const event = new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: !isMac,
      metaKey: isMac,
      bubbles: true,
    });
    window.dispatchEvent(event);
  };

  return (
    <div className="relative inline-flex">
      {/* Attention pulse ring — only renders on first visit */}
      {isNew && (
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-md animate-ping opacity-60 bg-white/30 dark:bg-white/20 pointer-events-none"
        />
      )}
      <button
        type="button"
        onClick={open}
        title="Quick search & jump to anywhere"
        className={cn(
          "relative group inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 dark:border-white/20 dark:bg-white/10 dark:text-white/80 dark:hover:border-white/30 dark:hover:bg-white/15 dark:hover:text-white",
          isNew && "ring-2 ring-white/50 dark:ring-white/30",
          className,
        )}
      >
        {isNew ? (
          <Sparkles className="h-3.5 w-3.5 text-amber-400 animate-pulse" />
        ) : (
          <Search className="h-3.5 w-3.5" />
        )}
        <span className="hidden sm:inline">Quick search</span>
        <kbd className="rounded border bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 group-hover:bg-white dark:border-white/20 dark:bg-white/10 dark:text-white/70 dark:group-hover:bg-white/15">
          {isMac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>
    </div>
  );
}
