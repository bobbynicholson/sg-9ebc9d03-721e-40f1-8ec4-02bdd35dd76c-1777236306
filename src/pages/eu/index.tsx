import { useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";

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
      <Header />
      <main className="flex min-h-[70vh] items-center justify-center bg-[linear-gradient(180deg,#eef2f6_0%,#f8fafc_260px,#f8fafc_100%)] p-4">
        <div className="rounded-2xl border border-slate-300/80 bg-white/90 px-6 py-5 text-center text-sm text-slate-600 shadow-sm">
          Loading EU pricing...
        </div>
      </main>
      <Footer />
    </>
  );
}
