/**
 * KitchenServiceModeBadge - Wave 70.7b
 *
 * Sits at the top of the kitchen nav above the live state strip.
 * Communicates which phase of the day the kitchen is in (off / prep
 * / service / close) and the relevant time signal (e.g. "Service in
 * 2h 30m" or "5 items on pass").
 *
 * The badge is also a tap target: opens a popover with the auto-
 * detected mode + a manual override (e.g. for the chef doing late-
 * night prep for tomorrow's breakfast event when the auto-detector
 * would otherwise say "off").
 *
 * Tones:
 *   off     - slate, neutral
 *   prep    - brand, warming up
 *   service - brand gradient, pulses, the "live" state
 *   close   - brand, winding down
 */
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChefHat, Flame, Coffee, Moon, ChevronDown, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePortalServiceMode, type PortalServiceMode } from "@/hooks/usePortalServiceMode";

const MODE_META: Record<PortalServiceMode, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  bg: string;
  text: string;
  pulse: boolean;
}> = {
  off: {
    label: "Off duty",
    icon: Moon,
    bg: "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700",
    text: "text-slate-700 dark:text-slate-300",
    pulse: false,
  },
  prep: {
    label: "Prep mode",
    icon: ChefHat,
    bg: "bg-brand-primary/10 dark:bg-brand-primary/15 border-brand-primary/20 dark:border-brand-primary/30",
    text: "text-brand-primary dark:text-brand-primary",
    pulse: false,
  },
  service: {
    label: "Service",
    icon: Flame,
    bg: "bg-brand-primary border-brand-primary",
    text: "text-white",
    pulse: true,
  },
  close: {
    label: "Close-down",
    icon: Coffee,
    bg: "bg-brand-primary/10 dark:bg-brand-primary/15 border-brand-primary/20 dark:border-brand-primary/30",
    text: "text-brand-primary dark:text-brand-primary",
    pulse: false,
  },
};

function formatHM(mins: number): string {
  const sign = mins < 0 ? "-" : "";
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = Math.floor(abs % 60);
  if (h === 0) return `${sign}${m}m`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${m}m`;
}

export function KitchenServiceModeBadge() {
  const state = usePortalServiceMode();
  const [open, setOpen] = useState(false);
  const meta = MODE_META[state.mode];
  const Icon = meta.icon;

  // Status line below the label, e.g. "Service in 2h 30m" or
  // "5 items on pass". Computed from the hook's existing fields.
  const subline = (() => {
    if (state.mode === "off") return state.todayEventCount === 0 ? "No events today" : "Standing by";
    if (state.mode === "prep") {
      if (state.minutesToNextEvent != null && state.minutesToNextEvent > 0) {
        return `Service in ${formatHM(state.minutesToNextEvent)}`;
      }
      return "Preparing";
    }
    if (state.mode === "service") {
      return state.todayEventCount === 1
        ? "Service in progress"
        : `${state.todayEventCount} events today`;
    }
    if (state.mode === "close") return "Wrapping up";
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
      aria-label={`Service mode: ${meta.label}. Tap to override.`}
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
      <PopoverContent className="w-64 p-3" side="bottom" align="start">
        <div className="space-y-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Mode</p>
            <p className="text-xs text-slate-600">
              Auto-detected: <span className="font-semibold capitalize">{state.autoMode}</span>
              {state.override && (
                <> &middot; <span className="text-brand-primary">overridden</span></>
              )}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {(["off", "prep", "service", "close"] as PortalServiceMode[]).map((m) => {
              const M = MODE_META[m];
              const MIcon = M.icon;
              const active = state.mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    state.setOverride(state.autoMode === m ? null : m);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-all",
                    active
                      ? "border-brand-primary/40 bg-brand-primary/10 text-brand-primary"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                  )}
                >
                  <MIcon className="h-3 w-3" />
                  <span className="capitalize">{m}</span>
                </button>
              );
            })}
          </div>
          {state.override && (
            <button
              type="button"
              onClick={() => { state.setOverride(null); setOpen(false); }}
              className="w-full flex items-center justify-center gap-1.5 text-[11px] text-slate-600 hover:text-slate-900 mt-1 py-1"
            >
              <RotateCcw className="h-3 w-3" />
              Clear override
            </button>
          )}
          <p className="text-[10px] text-slate-500 leading-snug pt-1 border-t border-slate-100">
            Auto mode is based on today's first + last event. Override sticks for this browser session only.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
