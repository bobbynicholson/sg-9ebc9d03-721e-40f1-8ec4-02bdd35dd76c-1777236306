/**
 * Reusable date-range picker for dashboards. Sets the scope every metric
 * tile reads from -- when the user picks a range, all numbers re-fetch
 * filtered by orders.event_date within the range.
 *
 * Catering businesses think in terms of when the event happens, not when
 * the order was created, so we filter on event_date by default.
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type DateRangePresetId =
  | "today"
  | "this_week"
  | "this_month"
  | "last_30"
  | "last_90"
  | "ytd"
  | "next_30"
  | "all_time"
  | "custom";

export interface DateRange {
  from: Date;
  to: Date;
  presetId: DateRangePresetId;
  label: string;
}

const startOfDay = (d: Date) => { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; };
const endOfDay   = (d: Date) => { const c = new Date(d); c.setHours(23, 59, 59, 999); return c; };
const addDays    = (d: Date, n: number) => { const c = new Date(d); c.setDate(c.getDate() + n); return c; };

export function resolvePreset(id: DateRangePresetId): DateRange {
  const today = startOfDay(new Date());
  switch (id) {
    case "today":
      return { from: today, to: endOfDay(today), presetId: id, label: "Today" };
    case "this_week": {
      const day = today.getDay() === 0 ? 7 : today.getDay(); // Mon=1..Sun=7
      const monday = addDays(today, -(day - 1));
      return { from: monday, to: endOfDay(addDays(monday, 6)), presetId: id, label: "This week" };
    }
    case "this_month": {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const last  = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { from: first, to: endOfDay(last), presetId: id, label: "This month" };
    }
    case "last_30":
      return { from: addDays(today, -29), to: endOfDay(today), presetId: id, label: "Last 30 days" };
    case "last_90":
      return { from: addDays(today, -89), to: endOfDay(today), presetId: id, label: "Last 90 days" };
    case "ytd":
      return { from: new Date(today.getFullYear(), 0, 1), to: endOfDay(today), presetId: id, label: "Year to date" };
    case "next_30":
      return { from: today, to: endOfDay(addDays(today, 29)), presetId: id, label: "Next 30 days" };
    case "all_time":
      return { from: new Date(2000, 0, 1), to: endOfDay(addDays(today, 365 * 5)), presetId: id, label: "All time" };
    default:
      return { from: today, to: endOfDay(today), presetId: id, label: "Custom" };
  }
}

const PRESETS: { id: DateRangePresetId; label: string }[] = [
  { id: "today",      label: "Today" },
  { id: "this_week",  label: "This week" },
  { id: "this_month", label: "This month" },
  { id: "last_30",    label: "Last 30 days" },
  { id: "last_90",    label: "Last 90 days" },
  { id: "ytd",        label: "Year to date" },
  { id: "next_30",    label: "Next 30 days" },
  { id: "all_time",   label: "All time" },
];

export function DashboardDateRange({
  range,
  onChange,
  className = "",
}: {
  range: DateRange;
  onChange: (r: DateRange) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState<Date | undefined>(range.from);
  const [customTo, setCustomTo] = useState<Date | undefined>(range.to);

  const formatted = useMemo(() => {
    if (range.presetId !== "custom") return range.label;
    const f = range.from.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
    const t = range.to.toLocaleDateString("en-ZA",   { day: "numeric", month: "short", year: "numeric" });
    return `${f} - ${t}`;
  }, [range]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("gap-2", className)}>
          <CalendarIcon className="w-4 h-4" />
          <span className="font-medium">{formatted}</span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[640px] p-0" sideOffset={4}>
        <div className="flex">
          <div className="w-44 border-r p-2 space-y-0.5">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 px-2 py-1">
              Quick ranges
            </p>
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  const next = resolvePreset(p.id);
                  onChange(next);
                  setCustomFrom(next.from);
                  setCustomTo(next.to);
                  setOpen(false);
                }}
                className={cn(
                  "w-full text-left px-2 py-1.5 text-sm rounded-md hover:bg-slate-100 dark:hover:bg-slate-800",
                  range.presetId === p.id && "bg-slate-100 dark:bg-slate-800 font-semibold",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="p-3">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 mb-2">
              Custom range
            </p>
            <Calendar
              mode="range"
              selected={{ from: customFrom, to: customTo }}
              onSelect={(r: any) => {
                setCustomFrom(r?.from);
                setCustomTo(r?.to);
              }}
              numberOfMonths={2}
              defaultMonth={customFrom}
            />
            <div className="flex items-center justify-end gap-2 mt-3">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!customFrom || !customTo}
                onClick={() => {
                  if (!customFrom || !customTo) return;
                  onChange({
                    from: startOfDay(customFrom),
                    to: endOfDay(customTo),
                    presetId: "custom",
                    label: "Custom",
                  });
                  setOpen(false);
                }}
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
