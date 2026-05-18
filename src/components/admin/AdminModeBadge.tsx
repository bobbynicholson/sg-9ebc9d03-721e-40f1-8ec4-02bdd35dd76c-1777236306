/**
 * AdminModeBadge - Wave 70.31
 *
 * Sits at the top of the admin nav above the live state strip.
 * Tells the owner which phase of the day the business is in
 * (setup / quiet / pipeline / ops / review) and the relevant time
 * signal as a subline.
 *
 * Tap target: popover with auto-detected mode + manual override
 * tiles. Same pattern as kitchen / cleaning / shopping.
 *
 * Tones:
 *   setup     - indigo, first-week onboarding
 *   quiet     - slate, neutral
 *   pipeline  - blue, sales focus
 *   ops       - brand-primary -> brand-secondary gradient, pulses
 *                (the "live" state)
 *   review    - emerald, end of day
 */
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sparkles, Moon, Briefcase, Activity, Wallet, ChevronDown, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminPortalMode, type AdminPortalMode } from "@/hooks/useAdminPortalMode";

const MODE_META: Record<AdminPortalMode, {
  label: string;
  shortLabel: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  bg: string;
  text: string;
  pulse: boolean;
}> = {
  setup: {
    label: "Finish setup",
    shortLabel: "Setup",
    description: "Your tenant is new. Finish onboarding to unlock full features.",
    icon: Sparkles,
    bg: "bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800",
    text: "text-indigo-800 dark:text-indigo-300",
    pulse: false,
  },
  quiet: {
    label: "Quiet day",
    shortLabel: "Quiet",
    description: "No events today, no overdue quotes. Good time for catch-up + planning.",
    icon: Moon,
    bg: "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700",
    text: "text-slate-700 dark:text-slate-300",
    pulse: false,
  },
  pipeline: {
    label: "Pipeline focus",
    shortLabel: "Pipeline",
    description: "Quotes need follow-up or new leads waiting. Convert before the next event.",
    icon: Briefcase,
    bg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
    text: "text-blue-800 dark:text-blue-300",
    pulse: false,
  },
  ops: {
    label: "Service hours",
    shortLabel: "Ops",
    description: "Events live today. Dispatch + tracking are your primary views right now.",
    icon: Activity,
    bg: "bg-gradient-to-r from-brand-primary to-brand-secondary border-purple-600",
    text: "text-white",
    pulse: true,
  },
  review: {
    label: "Day wrap",
    shortLabel: "Review",
    description: "Today's events are done. Review revenue, chase unpaid invoices, close out.",
    icon: Wallet,
    bg: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800",
    text: "text-emerald-800 dark:text-emerald-300",
    pulse: false,
  },
};

export function AdminModeBadge() {
  const state = useAdminPortalMode();
  const [open, setOpen] = useState(false);
  const meta = MODE_META[state.mode];
  const Icon = meta.icon;

  const subline = (() => {
    if (state.mode === "setup") {
      return state.tenantAgeDays !== null
        ? `${state.tenantAgeDays} day${state.tenantAgeDays === 1 ? "" : "s"} into setup`
        : "Complete the onboarding wizard";
    }
    if (state.mode === "quiet") return "Nothing pressing right now";
    if (state.mode === "pipeline") {
      return state.quotesOverdue === 1
        ? "1 quote needs follow-up"
        : `${state.quotesOverdue} quotes need follow-up`;
    }
    if (state.mode === "ops") {
      const bits: string[] = [];
      bits.push(`${state.eventsToday} event${state.eventsToday === 1 ? "" : "s"} today`);
      if (state.inTransitNow > 0) bits.push(`${state.inTransitNow} on the road`);
      return bits.join(" · ");
    }
    if (state.mode === "review") return "Today's events delivered - review the day";
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
      aria-label={`Admin mode: ${meta.label}. Tap to override.`}
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
          <p className="text-[13px] font-semibold text-slate-900">Business mode</p>
          <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
            The portal picks the right mode based on today's events, pipeline pressure, and time of day. Tap one below to lock the portal into that mode for this browser session.
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
          {(["setup", "quiet", "pipeline", "ops", "review"] as AdminPortalMode[]).map((m) => {
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
                    ? "border-purple-500 bg-purple-50"
                    : "border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300",
                )}
              >
                <span className={cn(
                  "flex-shrink-0 w-7 h-7 rounded-md flex items-center justify-center mt-0.5",
                  active ? "bg-purple-500 text-white" : "bg-slate-100 text-slate-600",
                )}>
                  <MIcon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className={cn(
                      "text-[12px] font-semibold",
                      active ? "text-purple-900" : "text-slate-800",
                    )}>
                      {M.shortLabel}
                    </span>
                    {active && (
                      <span className="text-[9px] uppercase tracking-wider bg-purple-500 text-white px-1.5 py-0.5 rounded font-bold">
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
            Auto mode reads today's events, in-transit count, overdue quotes, tenant age, and time of day. Overrides only stick until you close the tab.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
