export function isInstalledApp(): boolean {
  if (typeof window === "undefined") return false;
  return (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    (window.matchMedia?.("(display-mode: standalone)").matches ?? false);
}

export function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (/Mac/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

export function iosBrowserHint(): "safari" | "chrome" | "other" {
  if (typeof navigator === "undefined") return "safari";
  const ua = navigator.userAgent;
  if (/CriOS/.test(ua)) return "chrome";
  // Browser identification is only a hint; embedded browsers can copy Safari's UA.
  if (/Version\/[\d.]+.*Safari/.test(ua) && !/FxiOS|EdgiOS|OPiOS|DuckDuckGo|GSA|FBAN|FBAV|Instagram/.test(ua)) return "safari";
  return "other";
}
