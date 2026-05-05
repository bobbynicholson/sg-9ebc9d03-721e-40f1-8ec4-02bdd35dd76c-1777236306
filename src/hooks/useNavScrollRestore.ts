/**
 * useNavScrollRestore -- keep a sidebar scroll position pinned across
 * page navigations.
 *
 * Without this, the Pages Router remounts the layout on every route
 * change, the sidebar's scroll container snaps to top, and a menu
 * item the operator clicked near the bottom of the menu effectively
 * teleports off-screen. Pure restore by design -- no "scroll active
 * link into view" cleverness, because that fights the operator's
 * intent (they just chose where to look). On hard page loads
 * sessionStorage is empty, so the sidebar starts at top -- expected.
 *
 * Works with both shadcn / Radix ScrollArea (where the actual
 * scrolling element is `[data-radix-scroll-area-viewport]` inside
 * the wrapper) and native overflow elements (the ref'd element
 * scrolls itself).
 *
 * Usage:
 *   const scrollRef = useNavScrollRestore("admin-nav");
 *   <ScrollArea ref={scrollRef}>...</ScrollArea>
 * or
 *   const scrollRef = useNavScrollRestore("client-nav");
 *   <nav ref={scrollRef} className="overflow-y-auto">...</nav>
 *
 * The key must be unique per nav component so two navs don't fight
 * over the same sessionStorage slot.
 */
import { useEffect, useRef } from "react";
import { useRouter } from "next/router";

const STORAGE_PREFIX = "nav-scroll:";

export function useNavScrollRestore<T extends HTMLElement = HTMLDivElement>(key: string) {
  const ref = useRef<T | null>(null);
  const router = useRouter();

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    // shadcn ScrollArea wraps the actual scroller in a Radix viewport
    // div. Native overflow containers are themselves the scroller.
    const viewport: HTMLElement =
      root.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]") || root;

    const storageKey = STORAGE_PREFIX + key;

    // Restore in next frame so the layout has settled before we set
    // scrollTop -- otherwise the assignment can be no-op'd by Radix
    // when its content hasn't measured yet.
    const raf = requestAnimationFrame(() => {
      const saved = sessionStorage.getItem(storageKey);
      if (saved !== null) {
        const n = Number(saved);
        if (Number.isFinite(n) && n >= 0) viewport.scrollTop = n;
      }
    });

    const onScroll = () => {
      // sessionStorage writes are cheap; no need to throttle.
      sessionStorage.setItem(storageKey, String(viewport.scrollTop));
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      viewport.removeEventListener("scroll", onScroll);
    };
    // Re-run on path change so the restore fires after every navigation.
  }, [key, router.asPath]);

  return ref;
}
