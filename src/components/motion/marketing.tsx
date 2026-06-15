import * as React from "react";

/**
 * Shared visual language for the refined/premium marketing pass, encoding the
 * emil-design-eng motion philosophy. Every marketing/explanatory page imports
 * these so the whole site moves with one voice:
 *
 *   - Specific transition properties + the strong ease-out curve (never
 *     `transition-all` -- it animates properties you didn't mean to and
 *     drops frames).
 *   - Subtle hover-lift on cards (-translate-y, never a big scale).
 *   - `active:scale` press feedback so pressable elements feel like they
 *     heard the user.
 *
 * Keep these on marketing surfaces. Do NOT sprinkle them across the dashboard
 * -- frequently-seen UI should be crisp and still (the scroll-reveal
 * primitives in ./Reveal carry the same warning).
 */

// Strong ease-out curve -- matches --ease-out in globals.css. The built-in
// CSS easings are too weak; this is the curve with punch.
export const EASE = "ease-[cubic-bezier(0.23,1,0.32,1)]";

// Card surface: hover-lift + shadow bloom on hover, animating only the
// properties that actually change. `group` so child icon chips can react.
export const cardBase = `group h-full rounded-2xl border border-slate-200 bg-white shadow-sm transition-[transform,box-shadow,border-color] duration-300 ${EASE} hover:-translate-y-1 hover:border-slate-300 hover:shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600`;

// Press feedback for buttons/CTAs: snappy (150ms), scales down on :active so
// the click registers physically. Never animate `all`.
export const btnPress = `transition-[transform,box-shadow,background-color,border-color,color] duration-150 ${EASE} active:scale-[0.97]`;

// Icon chip inside a card -- nudges up on the card's group-hover.
export const iconChip = `inline-flex items-center justify-center rounded-xl shadow-sm transition-transform duration-300 ${EASE} group-hover:scale-105`;

/** Reusable eyebrow label above each section heading. */
export function Eyebrow({
  icon: Icon,
  children,
  className = "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300",
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium shadow-sm ${className}`}
    >
      <Icon className="h-4 w-4" />
      {children}
    </span>
  );
}
