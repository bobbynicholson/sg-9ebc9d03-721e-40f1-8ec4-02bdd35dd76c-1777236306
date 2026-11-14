import { Html, Head, Main, NextScript } from "next/document";
import { BRANDING_BOOT_SCRIPT, BRANDING_BOOT_STYLE } from "@/lib/branding/bootScript";

const PWA_LAUNCH_SCRIPT = `(function(){try{var standalone=(window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches)||(navigator.standalone===true);if(standalone){var root=document.documentElement;root.classList.add("cms-pwa-starting");window.setTimeout(function(){root.classList.remove("cms-pwa-starting");},8000);}}catch(e){}})();`;

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="icon" type="image/png" sizes="192x192" href="/icons/cateringms-192.png?v=20261109" />
        <link rel="shortcut icon" href="/favicon.ico?v=20261109" />
        <meta name="robots" content="noindex, nofollow" />
        <meta name="googlebot" content="noindex, nofollow" />
        {/* Paint the company's saved colours before the first frame so tenant
            pages never flash the default palette (see bootScript.ts). */}
        <style dangerouslySetInnerHTML={{ __html: BRANDING_BOOT_STYLE }} />
        <script dangerouslySetInnerHTML={{ __html: PWA_LAUNCH_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: BRANDING_BOOT_SCRIPT }} />
        {/* PwaMetadata owns the company install manifest and app name. Keep the
            website favicon here so it stays the same on every route. */}
      </Head>
      <body>
        <div id="cms-pwa-launch-screen" role="status" aria-live="polite">
          <div className="cms-pwa-launch-content">
            <img src="/icons/cateringms-192.png" width="76" height="76" alt="" />
            <p>Opening your workspace</p>
            <span>Getting things ready</span>
            <i aria-hidden="true" />
          </div>
        </div>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
