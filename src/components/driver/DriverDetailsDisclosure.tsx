import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Keeps secondary driver information out of the way until it is needed.
 * The summary is intentionally action-oriented so a driver can scan the
 * page and open only the detail relevant to the current task.
 */
export function DriverDetailsDisclosure({
  label,
  count,
  children,
  defaultOpen = false,
  className = "",
}: {
  label: string;
  count?: React.ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <details
      open={defaultOpen}
      className={`group rounded-xl border border-slate-200/90 bg-white dark:border-slate-800 dark:bg-slate-900/95 ${className}`}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold text-slate-900 marker:hidden dark:text-white [&::-webkit-details-marker]:hidden">
        <span>{label}</span>
        <span className="flex items-center gap-2 text-xs font-normal text-slate-500 dark:text-slate-400">
          {count}
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
        </span>
      </summary>
      <div className="border-t border-slate-200 px-4 py-4 dark:border-slate-800">{children}</div>
    </details>
  );
}
