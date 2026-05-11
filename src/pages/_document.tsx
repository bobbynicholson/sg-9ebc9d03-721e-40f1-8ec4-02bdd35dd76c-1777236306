import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="googlebot" content="noindex, nofollow" />
        {/* Phase 3 #3: driver portal PWA. The manifest scope limits
            installability to /team-portal/driver/ so a tenant admin
            doesn't get prompted to install the driver app on their
            laptop. theme-color matches the manifest emerald accent. */}
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#10b981" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="CateringMS Driver" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
