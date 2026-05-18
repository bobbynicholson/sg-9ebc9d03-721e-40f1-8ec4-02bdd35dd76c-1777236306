/**
 * CleaningModeBadge - Wave 70.28
 *
 * Sits at the top of the cleaning nav above the live state strip.
 * Communicates which phase of the day the cleaning team is in
 * (quiet / dispatch / returns / wrap) with a colour treatment + a
 * subline showing the next signal (e.g. "Next return 14:30" or
 * "3 still being washed").
 *
 * Tap target: opens a popover with the auto-detected mode + a manual
 * override. Override sticks for the browser session only - so a
 * cleaner doing late-night damage triage can lock the mode to wrap
 * even when the auto-detector says quiet.
 *
 * Tones (designed to pass WCAG AA on white sidebar bg):
 *   quiet     - slate, neutral
 *   dispatch  - amber, warming up
 *   returns   - cyan-strong gradient, pulses (the "live" state)
 *   wrap      - emerald, winding down
 */
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Moon, Truck, PackageOpen, CheckCircle2, ChevronDown, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCleaningPortalMode, type CleaningPortalMode } from "@/hooks/useCleaningPortalMode";

const MODE_META: Record<CleaningPortalMode, {
  label: string;
  shortLabel: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  bg: string;
  text: string;
  pulse: boolean;
}> = {
  quiet: {
    label: "All clear",
    shortLabel: "Quiet",
    description: "No events out, nothing returning. Quiet day for catch-up.",
    icon: Moon,
    bg: "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700",
    text: "text-slate-700 dark:text-slate-300",
    pulse: false,
  },
  dispatch: {
    label: "Going out",
    shortLabel: "Dispatch",
    description: "Events going out today. Verify equipment before it leaves.",
    icon: Truck,
    bg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
    text: "text-amber-800 dark:text-amber-300",
    pulse: false,
  },
  returns: {
    label: "Returns active",
    shortLabel: "Returns",
    description: "Equipment is coming back. Verify each handover as it lands.",
    icon: PackageOpen,
    bg: "bg-gradient-to-r from-cyan-500 to-blue-500 border-cyan-600",
    text: "text-white",
    pulse: true,
  },
  wrap: {
    label: "Wrap up",
    shortLabel: "Wrap",
    description: "Last washes of the day. Sign off jobs and clock out.",
    icon: CheckCircle2,
    bg: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800",
    text: "text-emerald-800 dark:text-emerald-300",
    pulse: false,
  },
};

function formatTimeShort(iso: string | null): string {
  if (!iso) return "--";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "--";
  return d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function CleaningModeBadge() {
  const state = useCleaningPortalMode();
  const [open, setOpen] = useState(false);
  const meta = MODE_META[state.mode];
  const Icon = meta.icon;

  // Subline below the label - the "what" of the current mode.
  const subline = (() => {
    if (state.mode === "quiet") return "No returns due. Catch up on damages.";
    if (state.mode === "dispatch") {
      return state.outboundToday === 1
        ? "1 event going out today. Verify before dispatch."
        : `${state.outboundToday} events going out today.`;
    }
    if (state.mode === "returns") {
      if (state.returnsDue > 0) {
        const next = formatTimeShort(state.nextReturnAt);
        return state.returnsDue === 1
          ? `Next return ${next}.`
          : `${state.returnsDue} due, next at ${next}.`;
      }
      return state.activeHandovers === 1
        ? "1 handover being washed."
        : `${state.activeHandovers} handovers being washed.`;
    }
    if (state.mode === "wrap") {
      return state.activeHandovers === 1
        ? "1 handover still open."
        : `${state.activeHandovers} handovers still open.`;
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
      aria-label={`Cleaning mode: ${meta.label}. Tap to override.`}
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
        {/* Wave 70.28a - redesigned popover. The previous version
            showed four 8-char tiles with no explanation of what
            tapping each does. Now: a header that names the concept,
            full-width tiles per mode with description, an obvious
            active state, and a footnote that distinguishes
            auto-detect from manual override. */}
        <div className="p-3 border-b border-slate-100">
          <p className="text-[13px] font-semibold text-slate-900">Cleaning mode</p>
          <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
            The portal picks the right mode for the time of day. Tap one below to lock the portal into that mode for this browser session.
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
          {(["quiet", "dispatch", "returns", "wrap"] as CleaningPortalMode[]).map((m) => {
            const M = MODE_META[m];
            const MIcon = M.icon;
            const active = state.mode === m;
            const isAuto = state.autoMode === m && !state.override;
            return (
              <button
                key={m}
                type="button"
                onClick={() => {
                  // Tap the current auto-mode -> clear override
                  // (back to auto). Tap any other mode -> set override.
                  state.setOverride(state.autoMode === m ? null : m);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-start gap-2.5 rounded-md border px-2.5 py-2 text-left transition-all",
                  active
                    ? "border-cyan-500 bg-cyan-50"
                    : "border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300",
                )}
              >
                <span className={cn(
                  "flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center mt-0.5",
                  active ? "bg-cyan-500 text-white" : "bg-slate-100 text-slate-600",
                )}>
                  <MIcon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className={cn(
                      "text-[12px] font-semibold",
                      active ? "text-cyan-900" : "text-slate-800",
                    )}>
                      {M.shortLabel}
                    </span>
                    {active && (
                      <span className="text-[9px] uppercase tracking-wider bg-cyan-500 text-white px-1.5 py-0.5 rounded font-bold">
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
            Auto mode reads today's outbound events, returns due in the next 4 hours, and active washes. Overrides only stick until you close the tab.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
