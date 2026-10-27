import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { isProductPath } from "@/lib/pwa/routes";

const DeferredCommandPaletteChunk = dynamic(
  () => import("@/components/CommandPalette").then((module) => module.CommandPalette),
  { ssr: false, loading: () => null },
);

/** Loads the command palette on its shortcut (and, on app pages, once the page settles). */
export function DeferredCommandPalette() {
  const router = useRouter();
  const [enabled, setEnabled] = useState(false);
  const [initialOpen, setInitialOpen] = useState(false);
  const activatedRef = useRef(false);
  const onProductPage = isProductPath(router.asPath || router.pathname || "");

  const activate = (open: boolean) => {
    if (activatedRef.current) return;
    activatedRef.current = true;
    setInitialOpen(open);
    setEnabled(true);
  };

  // The palette is not needed for the first paint. On app pages, load it
  // once the page settles; on public pages (marketing, customer links) it
  // only loads when someone actually presses its shortcut, so visitors
  // don't download the app's whole page index.
  useEffect(() => {
    if (!onProductPage) return;
    const idleTimer = window.setTimeout(() => activate(false), 1200);
    return () => window.clearTimeout(idleTimer);
  }, [onProductPage]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (activatedRef.current) return;
      const isMod = event.metaKey || event.ctrlKey;
      const isShortcut = isMod && event.key.toLowerCase() === "k";
      const isSlash = event.key === "/" && !["INPUT", "TEXTAREA"].includes((event.target as HTMLElement)?.tagName);
      if (!isShortcut && !isSlash) return;
      event.preventDefault();
      activate(true);
    };
    const onCustomOpen = () => activate(true);

    window.addEventListener("keydown", onKey);
    window.addEventListener("cmdk:open", onCustomOpen as EventListener);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("cmdk:open", onCustomOpen as EventListener);
    };
  }, []);

  return enabled ? <DeferredCommandPaletteChunk initialOpen={initialOpen} /> : null;
}
