/**
 * AllergenReviewBadge - visual indicator for menu_items that haven't
 * had an allergen review.
 *
 * Phase 1 P0-15 added menu_items.allergens_reviewed_at + reviewed_by
 * columns. NULL means "not yet reviewed"; a non-null timestamp means
 * an admin / kitchen lead explicitly signed off on the allergen
 * fields. Without a UI surface, the data column is invisible - the
 * kitchen prep view and quote builder still treat blank allergens as
 * "allergen-free", which was the original P0 risk.
 *
 * This badge renders three states:
 *   - reviewed=true  -> green check, "Allergens reviewed"
 *   - reviewed=false (NULL) -> amber alert, "Allergens not reviewed"
 *   - hideWhenReviewed -> renders nothing on the green case so the
 *     UI only fills with red flags
 *
 * Usage on a menu-item row:
 *   <AllergenReviewBadge reviewedAt={item.allergens_reviewed_at} />
 *
 * Usage on the quote builder when displaying picked items:
 *   <AllergenReviewBadge
 *     reviewedAt={item.allergens_reviewed_at}
 *     hideWhenReviewed
 *   />
 *
 * UI consumers should also disable / warn on quote acceptance if any
 * picked item has reviewedAt === null. That gating happens at the
 * page level, not here.
 */
import * as React from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatLocalDate } from "@/lib/localFormat";

export interface AllergenReviewBadgeProps {
  reviewedAt: string | null | undefined;
  /** Don't render anything when reviewed; only show the unreviewed warning. */
  hideWhenReviewed?: boolean;
  /** Smaller, inline-friendly form. */
  compact?: boolean;
  className?: string;
}

export function AllergenReviewBadge({
  reviewedAt,
  hideWhenReviewed = false,
  compact = false,
  className,
}: AllergenReviewBadgeProps) {
  const isReviewed = !!reviewedAt;

  if (isReviewed && hideWhenReviewed) return null;

  if (isReviewed) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700",
          compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs",
          className,
        )}
        title={`Allergens reviewed ${formatLocalDate(reviewedAt)}`}
      >
        <ShieldCheck className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} aria-hidden="true" />
        Allergens reviewed
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 text-amber-800",
        compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs",
        className,
      )}
      title="Open the menu item and confirm allergens before sending this on a quote"
    >
      <AlertTriangle className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} aria-hidden="true" />
      Allergens not reviewed
    </span>
  );
}
