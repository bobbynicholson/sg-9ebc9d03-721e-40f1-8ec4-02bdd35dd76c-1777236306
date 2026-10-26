import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import type { InitialBranding } from "@/lib/branding/serverBrandingForSlug";
import { pwaRouteInfo } from "@/lib/pwa/routes";
import { PwaLoadingScreen } from "./PwaLoadingScreen";

/** Show the shared app splash only when a real app-page navigation takes time. */
export function PwaRouteTransition({ initialBranding }: { initialBranding?: InitialBranding | null }) {
  const router = useRouter();
  const [show, setShow] = useState(false);

  useEffect(() => {
    let timer: number | undefined;
    const clearTimer = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
    };
    const onStart = (url: string, options: { shallow?: boolean }) => {
      if (options.shallow) return;
      const currentPath = (router.asPath || "").split(/[?#]/)[0];
      const targetPath = (url || "").split(/[?#]/)[0];
      if (currentPath === targetPath) return;
      if (!pwaRouteInfo(currentPath).enabled && !pwaRouteInfo(targetPath).enabled) return;
      clearTimer();
      // Avoid flashing the splash on quick client-side transitions.
      timer = window.setTimeout(() => setShow(true), 140);
    };
    const onFinish = () => {
      clearTimer();
      setShow(false);
    };

    router.events.on("routeChangeStart", onStart);
    router.events.on("routeChangeComplete", onFinish);
    router.events.on("routeChangeError", onFinish);
    return () => {
      clearTimer();
      router.events.off("routeChangeStart", onStart);
      router.events.off("routeChangeComplete", onFinish);
      router.events.off("routeChangeError", onFinish);
    };
  }, [router]);

  return show ? <PwaLoadingScreen initialBranding={initialBranding} /> : null;
}
