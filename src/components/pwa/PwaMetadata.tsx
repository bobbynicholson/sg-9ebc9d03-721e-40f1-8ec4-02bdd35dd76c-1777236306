import Head from "next/head";
import { buildPwaManifest, pwaIconUrl, pwaManifestUrl, type PwaBranding } from "@/lib/pwa/metadata";

export function PwaMetadata({ branding }: { branding: PwaBranding | null }) {
  const manifest = buildPwaManifest(branding);
  return <Head>
    <link key="pwa-manifest" rel="manifest" href={pwaManifestUrl(branding)} />
    <link key="pwa-apple-icon" rel="apple-touch-icon" sizes="180x180" href={pwaIconUrl(branding, 180)} />
    <link key="pwa-favicon" rel="icon" type="image/png" href={pwaIconUrl(branding, 192)} />
    <meta key="pwa-application-name" name="application-name" content={manifest.name} />
    <meta key="pwa-apple-title" name="apple-mobile-web-app-title" content={manifest.name} />
    <meta key="pwa-theme" name="theme-color" content={manifest.theme_color} />
    <meta key="pwa-mobile" name="mobile-web-app-capable" content="yes" />
    <meta key="pwa-apple-capable" name="apple-mobile-web-app-capable" content="yes" />
    <meta key="pwa-apple-status" name="apple-mobile-web-app-status-bar-style" content="default" />
  </Head>;
}
