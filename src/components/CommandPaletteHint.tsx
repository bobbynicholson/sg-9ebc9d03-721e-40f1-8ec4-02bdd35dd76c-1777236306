import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Discoverability badge for the global Cmd+K command palette.
 * Renders a "Quick search Cmd K" pill that, when clicked, fires the same
 * keyboard event the palette listens for (so we don't have to thread state
 * through every nav).
 */
export function CommandPaletteHint({ className }: { className?: string }) {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    // navigator.platform is deprecated and unreliable on Windows (can report
    // odd values), which made the pill show the wrong key. Prefer the modern
    // userAgentData.platform, fall back to platform/userAgent.
    const plat =
      (navigator as any).userAgentData?.platform ||
      navigator.platform ||
      navigator.userAgent ||
      "";
    setIsMac(/mac|iphone|ipad|ipod/i.test(plat));
  }, []);

  const open = () => {
    const event = new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: !isMac,
      metaKey: isMac,
      bubbles: true,
    });
    window.dispatchEvent(event);
  };

  return (
    <button
      type="button"
      onClick={open}
      title="Quick search & jump to anywhere"
      className={cn(
        "group inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-500 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700",
        className,
      )}
    >
      <Search className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Quick search</span>
      <kbd className="rounded border bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 group-hover:bg-white">
        {isMac ? "⌘" : "Ctrl"} K
      </kbd>
    </button>
  );
}
