import { Html, Head, Main, NextScript } from "next/document";
import { BRANDING_BOOT_SCRIPT, BRANDING_BOOT_STYLE } from "@/lib/branding/bootScript";

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
        <script dangerouslySetInnerHTML={{ __html: BRANDING_BOOT_SCRIPT }} />
        {/* PwaMetadata owns the company install manifest and app name. Keep the
            website favicon here so it stays the same on every route. */}
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
