/**
 * DigitalClock -- Wave 70.10
 *
 * A compact wall-clock readout for portal sidebars. Bobby's brief:
 * the kitchen / driver / cleaning / shopping staff need to see the
 * time at a glance without checking their phone or looking up at
 * a wall clock that may not exist.
 *
 * Layout: monospaced HH:mm on the first line, day + date on the
 * second. Updates every second so the seconds-less HH:mm stays
 * accurate even when the minute rolls over.
 *
 * Variants:
 *   "sidebar" (default) -- two-line compact for desktop sidebars
 *   "mobile"            -- single-line horizontal for mobile drawer
 *                           headers where vertical space is tight
 *
 * Localised to en-ZA (matches the rest of the portal). 24-hour
 * format because the kitchen / dispatch world runs in 24h not 12h.
 *
 * Renders nothing during SSR to avoid hydration mismatch on the
 * first-second clock value.
 */
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface DigitalClockProps {
  variant?: "sidebar" | "mobile";
  className?: string;
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export function DigitalClock({ variant = "sidebar", className }: DigitalClockProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // Initial set + tick. setNow only runs client-side; the SSR
    // render returns null so hydration matches.
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!now) return null;

  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  const dayLabel = now.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });

  if (variant === "mobile") {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300",
          className,
        )}
        aria-label={`Current time ${hh}:${mm}`}
      >
        <Clock className="h-3.5 w-3.5 opacity-70" />
        <span className="tabular-nums">{hh}:{mm}</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 px-2.5 py-1.5",
        "flex items-center gap-2",
        className,
      )}
      aria-label={`Current time ${hh}:${mm}, ${dayLabel}`}
    >
      <Clock className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
      <div className="min-w-0">
        <div className="text-base font-bold tabular-nums leading-none text-slate-900 dark:text-slate-100">
          {hh}<span className="motion-safe:animate-pulse text-slate-400">:</span>{mm}
        </div>
        <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-0.5 leading-none truncate">
          {dayLabel}
        </div>
      </div>
    </div>
  );
}
