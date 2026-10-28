import { Html, Head, Main, NextScript } from "next/document";
import { BRANDING_BOOT_SCRIPT, BRANDING_BOOT_STYLE } from "@/lib/branding/bootScript";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="googlebot" content="noindex, nofollow" />
        {/* Paint the company's saved colours before the first frame so tenant
            pages never flash the default palette (see bootScript.ts). */}
        <style dangerouslySetInnerHTML={{ __html: BRANDING_BOOT_STYLE }} />
        <script dangerouslySetInnerHTML={{ __html: BRANDING_BOOT_SCRIPT }} />
        {/* PwaMetadata in _app owns the keyed install metadata, including SSR
            company branding on login/install pages. Do not duplicate it here. */}
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
