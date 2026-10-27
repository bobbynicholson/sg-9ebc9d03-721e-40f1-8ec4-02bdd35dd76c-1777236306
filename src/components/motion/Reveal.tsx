import { useEffect, useRef, type HTMLAttributes, type ReactNode, type RefObject } from "react";

/**
 * Shared scroll-reveal primitives for the marketing site.
 *
 *   - Content is always VISIBLE in the server HTML. Nothing waits for
 *     JavaScript to be readable, so the largest paint never waits on the
 *     bundle and visitors without JS see the full page.
 *   - After hydration, only elements that are still below the fold are
 *     hidden and then settle in (opacity + small translate, <= 400ms, the
 *     site-wide ease) the first time they scroll into view. Reveals fire once.
 *   - prefers-reduced-motion: no reveal at all, the content just stays put.
 *   - CSS-only animation (see [data-reveal] in globals.css) - no animation
 *     library ships with marketing pages.
 *
 * Keep these for marketing/explanatory surfaces. Do NOT sprinkle them across
 * the dashboard -- frequently-seen UI should be crisp and still.
 */

type DivProps = Omit<HTMLAttributes<HTMLDivElement>, "children">;

/**
 * Hides `ref`'s element if it is below the fold at hydration, then calls
 * `onShow` once it scrolls into view (`onShow` may return the longest
 * transition delay it set, in seconds). State lives in the element's data
 * attributes so no re-render is needed.
 */
export function useRevealOnScroll<T extends HTMLElement>(
  ref: RefObject<T | null>,
  attr: "reveal" | "stagger",
  onShow?: (el: T) => number | void,
) {
  const onShowRef = useRef(onShow);
  onShowRef.current = onShow;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined" || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    let cleanupTimer: number | undefined;
    let placed = false;
    // Once the entrance has played, hand the element back to its own styles
    // (hover transitions, transforms) with no leftover reveal delay.
    const settle = () => {
      delete el.dataset[attr];
      el.style.transitionDelay = "";
      el.querySelectorAll<HTMLElement>("[data-reveal-item]").forEach((item) => {
        item.style.transitionDelay = "";
      });
    };
    const io = new IntersectionObserver(
      (entries) => {
        // The first callback reports where the element sits after hydration.
        // Reading it here (not via getBoundingClientRect) avoids forcing a
        // synchronous layout per element while the page is still loading.
        if (!placed) {
          placed = true;
          const entry = entries[entries.length - 1];
          // Already on screen (or scrolled past): leave it exactly as rendered.
          if (entry.boundingClientRect.top < window.innerHeight) {
            io.disconnect();
            return;
          }
          el.dataset[attr] = "pending";
          return;
        }
        if (!entries.some((entry) => entry.isIntersecting)) return;
        io.disconnect();
        const longestDelay = onShowRef.current?.(el) || 0;
        el.dataset[attr] = "shown";
        cleanupTimer = window.setTimeout(settle, longestDelay * 1000 + 450);
      },
      { rootMargin: "0px 0px -80px 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (cleanupTimer !== undefined) window.clearTimeout(cleanupTimer);
      settle();
    };
  }, [ref, attr]);
}

// Reveal whole sections / single elements as they scroll into view.
export function Reveal({
  children,
  delay = 0,
  y = 18,
  style,
  ...rest
}: {
  children: ReactNode;
  /** Stagger entrance by this many seconds. */
  delay?: number;
  /** Travel distance in px before settling. */
  y?: number;
} & DivProps) {
  const ref = useRef<HTMLDivElement>(null);
  useRevealOnScroll(ref, "reveal", (el) => {
    el.style.transitionDelay = `${delay}s`;
    return delay;
  });
  return (
    <div ref={ref} style={{ ...style, ["--reveal-y" as string]: `${y}px` }} {...rest}>
      {children}
    </div>
  );
}

// Container that cascades its <StaggerItem> children into view. Keep grids,
// lists, and card rows feeling alive without everything popping at once.
export function Stagger({
  children,
  delayChildren = 0,
  gap = 0.06,
  ...rest
}: {
  children: ReactNode;
  delayChildren?: number;
  /** Seconds between each child (30-80ms is the sweet spot). */
  gap?: number;
} & DivProps) {
  const ref = useRef<HTMLDivElement>(null);
  useRevealOnScroll(ref, "stagger", (el) => {
    const items = el.querySelectorAll<HTMLElement>("[data-reveal-item]");
    items.forEach((item, i) => {
      item.style.transitionDelay = `${delayChildren + i * gap}s`;
    });
    return delayChildren + Math.max(0, items.length - 1) * gap;
  });
  return (
    <div ref={ref} {...rest}>
      {children}
    </div>
  );
}

// Child of <Stagger>. Inherits the cascade timing from its parent.
export function StaggerItem({
  children,
  ...rest
}: {
  children: ReactNode;
} & DivProps) {
  return (
    <div data-reveal-item="" {...rest}>
      {children}
    </div>
  );
}
