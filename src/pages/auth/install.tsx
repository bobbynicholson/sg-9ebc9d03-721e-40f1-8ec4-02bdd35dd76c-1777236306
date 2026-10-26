import type { GetServerSideProps } from "next";
import Head from "next/head";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { PWAInstallPrompt } from "@/components/driver/PWAInstallPrompt";
import { buildPwaManifest, pwaIconUrl, type PwaBranding } from "@/lib/pwa/metadata";
import { getPwaBranding } from "@/lib/pwa/serverBranding";
import { pwaManifestUrl } from "@/lib/pwa/metadata";
import { Button } from "@/components/ui/button";

export default function InstallPage({ pwaBranding, brandingError }: { pwaBranding: PwaBranding | null; brandingError: boolean }) {
  const name = pwaBranding?.companyName || "CateringMS";
  const [checking, setChecking] = useState(false);
  const [setupResult, setSetupResult] = useState("");
  async function checkSetup() {
    setChecking(true); setSetupResult("");
    try {
      const response = await fetch(pwaManifestUrl(pwaBranding), { cache: "no-store" });
      if (!response.ok) throw new Error("Manifest unavailable");
      const manifest = await response.json();
      if (manifest.display !== "standalone" || !manifest.icons?.length) throw new Error("Invalid manifest");
      await Promise.all(manifest.icons.map(async (icon: { src: string }) => {
        const result = await fetch(icon.src, { method: "HEAD", cache: "no-store" });
        if (!result.ok || !result.headers.get("content-type")?.startsWith("image/")) throw new Error("Icon unavailable");
      }));
      setSetupResult("App name, manifest and icon URLs are available. Use the Install button when offered, or follow the steps for your browser.");
    } catch {
      setSetupResult("App setup could not be checked. Check your connection and try again, or follow the installation steps for your browser.");
    } finally { setChecking(false); }
  }
  return <>
    <Head><title>{name}</title><meta name="application-name" content={name} /></Head>
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-14">
      <div className="mx-auto max-w-xl">
        <div className="mb-6 flex items-center gap-4">
          <Image unoptimized src={pwaIconUrl(pwaBranding, 192)} alt="" width={64} height={64} className="h-16 w-16 shrink-0 rounded-xl bg-white object-contain" />
          <div className="min-w-0"><h1 className="break-words text-2xl font-semibold text-slate-950">Install {name}</h1><p className="mt-1 text-sm leading-6 text-slate-600">Add your company workspace to this device.</p></div>
        </div>
        {brandingError && <p role="alert" className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Company branding is temporarily unavailable. Refresh this page to try again.</p>}
        <PWAInstallPrompt appName={name} companySlug={pwaBranding?.slug} inline />
        <details className="mt-5 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">
          <summary className="min-h-11 cursor-pointer py-2 font-medium text-slate-950">Check website app setup</summary>
          <p className="mt-2">This checks the app name, manifest and icon URLs. Your browser handles installation and creates the app shortcut.</p>
          <Button type="button" variant="outline" className="mt-3 min-h-11 w-full" disabled={checking} onClick={() => void checkSetup()}>{checking ? "Checking app setup..." : "Check app setup"}</Button>
          {setupResult && <p role="status" className="mt-3">{setupResult}</p>}
        </details>
        <Link href={buildPwaManifest(pwaBranding).start_url} className="mt-5 inline-flex min-h-11 items-center text-sm font-medium text-brand-primary underline underline-offset-4">Continue to sign in</Link>
      </div>
    </main>
  </>;
}

export const getServerSideProps: GetServerSideProps = async ({ query, res }) => {
  res.setHeader("Cache-Control", "no-store");
  const slug = typeof query.company === "string" ? query.company : "";
  try {
    const branding = slug ? await getPwaBranding({ slug }) : null;
    if (slug && !branding) return { notFound: true };
    return { props: {
      pwaBranding: branding,
      brandingError: false,
      initialBranding: branding ? { ...branding, secondaryColor: null, accentColor: null, fontBody: null, fontDisplay: null } : null,
    } };
  } catch {
    res.statusCode = 503;
    return { props: { pwaBranding: null, initialBranding: null, brandingError: true } };
  }
};
