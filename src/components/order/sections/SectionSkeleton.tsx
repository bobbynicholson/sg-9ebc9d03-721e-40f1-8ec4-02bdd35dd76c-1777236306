/**
 * ODOC Wave F: skeleton loading rows for order doc sections.
 *
 * Replaces the generic "Loading..." spinner with shimmer rows that
 * roughly match the shape of the content that's about to render -
 * 3 menu lines for Kitchen, 6 phase chips for Waiter, 4 totals
 * tiles for Finance, etc. Faster perceived load.
 */
import React from "react";

function Bar({ className = "h-3 w-32" }: { className?: string }) {
  return <span className={`inline-block rounded bg-slate-200 animate-pulse ${className}`} />;
}

/** Generic rows skeleton - N stacked bars at varied widths. */
export function SectionSkeleton({ rows = 3, variant = "rows" }: { rows?: number; variant?: "rows" | "tiles" | "chips" | "stepper" }) {
  if (variant === "tiles") {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="rounded-md border border-slate-200 p-3 space-y-2 bg-white">
            <Bar className="h-2.5 w-16" />
            <Bar className="h-4 w-24" />
          </div>
        ))}
      </div>
    );
  }
  if (variant === "chips") {
    return (
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: rows }).map((_, i) => (
          <Bar key={i} className={`h-6 ${["w-20", "w-24", "w-16", "w-28", "w-20", "w-32"][i % 6]} rounded-full`} />
        ))}
      </div>
    );
  }
  if (variant === "stepper") {
    return (
      <ol className="relative space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i} className="flex items-start gap-3">
            <Bar className="w-8 h-8 rounded-full" />
            <div className="flex-1 space-y-1.5 pt-1">
              <Bar className="h-3 w-32" />
              <Bar className="h-2 w-20" />
            </div>
          </li>
        ))}
      </ol>
    );
  }
  // rows
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-md border border-slate-200 p-3 space-y-2 bg-white">
          <div className="flex items-center gap-2">
            <Bar className="w-7 h-7 rounded-full" />
            <Bar className={`h-3 ${["w-40", "w-32", "w-48", "w-36"][i % 4]}`} />
          </div>
          <Bar className="h-2.5 w-24" />
        </div>
      ))}
    </div>
  );
}
