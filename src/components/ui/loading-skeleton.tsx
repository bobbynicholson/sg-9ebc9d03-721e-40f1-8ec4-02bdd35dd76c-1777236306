/**
 * LoadingSkeleton -- canonical loading-state primitives for list and
 * detail pages. The audit found loading states scattered across
 * spinners, "Loading..." text, and bespoke shimmer markup. These
 * primitives standardise on tailwind animate-pulse with three common
 * shapes:
 *
 *   <ListSkeleton rows={5} />          -- table-row stack
 *   <CardSkeleton tiles={4} />         -- stat-card grid
 *   <DetailSkeleton />                 -- single-record detail page
 *
 * Match the heights / spacing of the corresponding rendered content
 * so swap-in feels jitter-free.
 */
import * as React from "react";
import { cn } from "@/lib/utils";

interface BaseProps {
  className?: string;
}

export function SkeletonBlock({ className, ...rest }: BaseProps & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-slate-200/70", className)}
      {...rest}
    />
  );
}

export function ListSkeleton({
  rows = 5,
  className,
  withHeader = true,
}: BaseProps & { rows?: number; withHeader?: boolean }) {
  return (
    <div className={cn("space-y-3", className)} aria-busy="true" aria-live="polite">
      {withHeader && (
        <div className="flex items-center gap-3">
          <SkeletonBlock className="h-6 w-1/3" />
          <SkeletonBlock className="ml-auto h-9 w-28" />
        </div>
      )}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-md border border-slate-200 bg-white p-4">
          <SkeletonBlock className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <SkeletonBlock className="h-3.5 w-2/5" />
            <SkeletonBlock className="h-3 w-3/5" />
          </div>
          <SkeletonBlock className="h-7 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({
  tiles = 4,
  className,
}: BaseProps & { tiles?: number }) {
  return (
    <div
      className={cn(
        "grid gap-4",
        tiles >= 4 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
        className,
      )}
      aria-busy="true"
      aria-live="polite"
    >
      {Array.from({ length: tiles }).map((_, i) => (
        <div key={i} className="rounded-md border border-slate-200 bg-white p-4 space-y-3">
          <SkeletonBlock className="h-3 w-1/3" />
          <SkeletonBlock className="h-7 w-1/2" />
          <SkeletonBlock className="h-2.5 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function DetailSkeleton({ className }: BaseProps) {
  return (
    <div className={cn("space-y-6", className)} aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <SkeletonBlock className="h-7 w-1/2" />
        <SkeletonBlock className="h-3 w-2/3" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-20 rounded-md" />
        ))}
      </div>
      <div className="space-y-3 rounded-md border border-slate-200 bg-white p-5">
        <SkeletonBlock className="h-3.5 w-1/4" />
        <SkeletonBlock className="h-3 w-3/4" />
        <SkeletonBlock className="h-3 w-2/3" />
        <SkeletonBlock className="h-3 w-1/2" />
      </div>
    </div>
  );
}
