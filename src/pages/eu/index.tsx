import { useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

/**
 * Lightweight EU landing - writes the region preference and bounces
 * to /eu/pricing. The detailed marketing site for /uk and /us was
 * hand-rolled; we'll duplicate that for /eu when EU sales actually
 * start. Until then, region detection is the only thing that matters
 * for accurate currency display.
 */
export default function EUHomePage() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("market_region", "eu");
    }
    router.replace("/eu/pricing");
  }, [router]);

  return (
    <>
      <Head>
        <title>CateringMS Europe</title>
        <meta name="description" content="Catering management software for European caterers. EUR billing." />
      </Head>
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-slate-500">Loading EU pricing...</p>
      </div>
    </>
  );
}
