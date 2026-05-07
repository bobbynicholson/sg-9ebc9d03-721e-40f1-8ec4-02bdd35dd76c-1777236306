/**
 * EmptyState -- canonical empty-list primitive.
 *
 * Per docs/ui-conventions.md section 4 ("Tables and lists"): "Empty
 * states get a centred icon + a short headline + one CTA." The audit
 * found this rule was honoured only on admin/wages.tsx; every other
 * list page rendered "No data" or an empty grid. This primitive
 * codifies the pattern so list pages can adopt with one line.
 *
 * Usage:
 *   <EmptyState
 *     icon={Users}
 *     title="No clients yet"
 *     description="Add your first client to start sending quotes."
 *     cta={{ label: "Add client", onClick: () => setOpen(true) }}
 *   />
 */
import * as React from "react";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  cta?: {
    label: string;
    onClick?: () => void;
    href?: string;
    variant?: "default" | "outline" | "ghost";
  };
  /** Optional secondary CTA (e.g. "or import existing"). */
  secondaryCta?: {
    label: string;
    onClick?: () => void;
    href?: string;
  };
  className?: string;
  /** Tighter padding when used inside a card. */
  inCard?: boolean;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  cta,
  secondaryCta,
  className,
  inCard = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        inCard ? "py-10 px-4" : "py-16 px-6",
        className,
      )}
    >
      {Icon && (
        <div className="mb-4 rounded-full bg-slate-100 p-3">
          <Icon className="h-6 w-6 text-slate-500" aria-hidden="true" />
        </div>
      )}
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-slate-600">{description}</p>
      )}
      {(cta || secondaryCta) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {cta && (
            cta.href ? (
              <Button asChild variant={cta.variant ?? "default"} size="sm">
                <a href={cta.href}>{cta.label}</a>
              </Button>
            ) : (
              <Button variant={cta.variant ?? "default"} size="sm" onClick={cta.onClick}>
                {cta.label}
              </Button>
            )
          )}
          {secondaryCta && (
            secondaryCta.href ? (
              <Button asChild variant="ghost" size="sm">
                <a href={secondaryCta.href}>{secondaryCta.label}</a>
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={secondaryCta.onClick}>
                {secondaryCta.label}
              </Button>
            )
          )}
        </div>
      )}
    </div>
  );
}
