/**
 * ShoppingModeBadge -- Wave 70.29
 *
 * Sits at the top of the shopping nav above the live state strip.
 * Communicates which phase of the day the shopping team is in
 * (quiet / plan / run / reconcile) with a colour treatment + a
 * subline showing the next signal (e.g. "5 items short" or
 * "12 items left on the list").
 *
 * Tap target: opens a popover with the auto-detected mode + a manual
 * override. Same pattern as cleaning + kitchen.
 *
 * Tones (WCAG AA on white sidebar bg):
 *   quiet     -- slate, neutral
 *   plan      -- emerald, gearing up
 *   run       -- green pulse (the "live" state)
 *   reconcile -- amber, winding down
 */
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Moon, ListChecks, ShoppingCart, Receipt, ChevronDown, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useShoppingPortalMode, type ShoppingPortalMode } from "@/hooks/useShoppingPortalMode";

const MODE_META: Record<ShoppingPortalMode, {
  label: string;
  shortLabel: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  bg: string;
  text: string;
  pulse: boolean;
}> = {
  quiet: {
    label: "All stocked",
    shortLabel: "Quiet",
    description: "No shortfalls, no active list, no receipts to file. Catch-up window.",
    icon: Moon,
    bg: "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700",
    text: "text-slate-700 dark:text-slate-300",
    pulse: false,
  },
  plan: {
    label: "Plan today's shop",
    shortLabel: "Plan",
    description: "Shortfalls or upcoming events. Build today's buy list.",
    icon: ListChecks,
    bg: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800",
    text: "text-emerald-800 dark:text-emerald-300",
    pulse: false,
  },
  run: {
    label: "Shop in progress",
    shortLabel: "Run",
    description: "A shopping list is active right now. Tick items off as you buy.",
    icon: ShoppingCart,
    bg: "bg-gradient-to-r from-green-500 to-emerald-500 border-green-600",
    text: "text-white",
    pulse: true,
  },
  reconcile: {
    label: "File receipts",
    shortLabel: "Reconcile",
    description: "Today's shops are done. Upload receipts and log actual totals.",
    icon: Receipt,
    bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
    text: "text-amber-800 dark:text-amber-300",
    pulse: false,
  },
};

export function ShoppingModeBadge() {
  const state = useShoppingPortalMode();
  const [open, setOpen] = useState(false);
  const meta = MODE_META[state.mode];
  const Icon = meta.icon;

  const subline = (() => {
    if (state.mode === "quiet") return "All caught up. Nothing pressing.";
    if (state.mode === "plan") {
      const bits: string[] = [];
      if (state.shortfallCount > 0) bits.push(`${state.shortfallCount} short`);
      if (state.upcomingEvents48h > 0) bits.push(`${state.upcomingEvents48h} event${state.upcomingEvents48h === 1 ? "" : "s"} in 48h`);
      return bits.length ? bits.join(" · ") : "Plan today's run.";
    }
    if (state.mode === "run") {
      return state.activeLists === 1
        ? "1 active shopping list."
        : `${state.activeLists} active shopping lists.`;
    }
    if (state.mode === "reconcile") {
      return state.unfiledReceiptsToday === 1
        ? "1 receipt to file."
        : `${state.unfiledReceiptsToday} receipts to file.`;
    }
    return "";
  })();

  const trigger = (
    <button
      type="button"
      className={cn(
        "w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 transition-all",
        meta.bg,
        meta.text,
        "hover:brightness-105 active:scale-[0.99]",
      )}
      aria-label={`Shopping mode: ${meta.label}. Tap to override.`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <span className={cn("relative flex-shrink-0", meta.pulse ? "motion-safe:animate-pulse" : "")}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="min-w-0 text-left">
          <span className="block text-[11px] font-bold uppercase tracking-[0.08em] leading-none">
            {meta.label}
          </span>
          {subline && (
            <span className="block text-[11px] mt-0.5 leading-none opacity-90 truncate">
              {subline}
            </span>
          )}
        </span>
      </span>
      <ChevronDown className="h-3.5 w-3.5 opacity-70 flex-shrink-0" />
    </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-80 p-0" side="bottom" align="start">
        <div className="p-3 border-b border-slate-100">
          <p className="text-[13px] font-semibold text-slate-900">Shopping mode</p>
          <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
            The portal picks the right mode for where you are in the day. Tap one below to lock the portal into that mode for this browser session.
          </p>
          <div className="mt-2 flex items-center gap-1.5 text-[10px]">
            <span className="text-slate-500">Auto-detected:</span>
            <span className="font-semibold capitalize text-slate-700">{MODE_META[state.autoMode].shortLabel}</span>
            {state.override && (
              <>
                <span className="text-slate-400">·</span>
                <span className="text-amber-700 font-medium">manually overridden</span>
              </>
            )}
          </div>
        </div>

        <div className="p-2 space-y-1">
          {(["quiet", "plan", "run", "reconcile"] as ShoppingPortalMode[]).map((m) => {
            const M = MODE_META[m];
            const MIcon = M.icon;
            const active = state.mode === m;
            const isAuto = state.autoMode === m && !state.override;
            return (
              <button
                key={m}
                type="button"
                onClick={() => {
                  state.setOverride(state.autoMode === m ? null : m);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-start gap-2.5 rounded-md border px-2.5 py-2 text-left transition-all",
                  active
                    ? "border-emerald-500 bg-emerald-50"
                    : "border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300",
                )}
              >
                <span className={cn(
                  "flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center mt-0.5",
                  active ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-600",
                )}>
                  <MIcon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className={cn(
                      "text-[12px] font-semibold",
                      active ? "text-emerald-900" : "text-slate-800",
                    )}>
                      {M.shortLabel}
                    </span>
                    {active && (
                      <span className="text-[9px] uppercase tracking-wider bg-emerald-500 text-white px-1.5 py-0.5 rounded font-bold">
                        Active
                      </span>
                    )}
                    {isAuto && !active && (
                      <span className="text-[9px] uppercase tracking-wider text-slate-500 font-medium">
                        Auto
                      </span>
                    )}
                  </span>
                  <span className="block text-[11px] text-slate-600 leading-snug mt-0.5">
                    {M.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {state.override && (
          <div className="px-2 pb-2">
            <button
              type="button"
              onClick={() => { state.setOverride(null); setOpen(false); }}
              className="w-full flex items-center justify-center gap-1.5 text-[11px] text-slate-700 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-md py-1.5 font-medium"
            >
              <RotateCcw className="h-3 w-3" />
              Back to auto-detect ({MODE_META[state.autoMode].shortLabel})
            </button>
          </div>
        )}

        <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/50">
          <p className="text-[10px] text-slate-500 leading-snug">
            Auto mode reads shortfall items, upcoming events, active shopping lists, and today's unfiled receipts. Overrides only stick until you close the tab.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
