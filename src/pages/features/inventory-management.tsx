import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  CheckCircle,
  AlertCircle,
  TrendingDown,
  RefreshCw
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { btnPress } from "@/components/motion/marketing";
import Head from "next/head";

export default function InventoryManagementPage() {
  const features = [
    "Real-time stock level tracking",
    "Automatic expiry date alerts",
    "Equipment availability calendar",
    "Cleaning schedule integration",
    "Purchase history and supplier tracking",
    "Waste reduction analytics"
  ];

  const benefits = [
    {
      icon: AlertCircle,
      title: "Expiry Alerts",
      description: "Get notified 7, 3, and 1 day before items expire so you can use them in time"
    },
    {
      icon: RefreshCw,
      title: "Equipment Tracking",
      description: "See what's available, in use, or being cleaned at any time"
    },
    {
      icon: TrendingDown,
      title: "Waste Reduction",
      description: "Analytics show what's being wasted so you can order smarter"
    }
  ];

  return (
    <>
      <Head>
        <title>Inventory & Equipment Tracking - CateringMS</title>
        <meta name="description" content="Complete inventory management with automatic expiry alerts, equipment availability tracking, and waste reduction. Cut food waste by 45% with smart inventory control." />
        <meta name="keywords" content="catering inventory management, food tracking, equipment management, expiry alerts, waste reduction, stock control" />
        <link rel="canonical" href="https://cateringms.com/features/inventory-management" />
      </Head>

      <Header />

      <div className="font-body min-h-screen bg-stone-50 text-stone-900">
        {/* ===================== HERO ===================== */}
        <section className="relative overflow-hidden border-b border-stone-200 bg-white">
          {/* Single warm wash anchored at the top - solid colour, no glass. */}
          <div className="pointer-events-none absolute inset-x-0 -top-40 h-[480px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(245,158,11,0.10),transparent)]" />

          <div className="relative mx-auto max-w-7xl px-4 py-20 md:py-28">
            <Stagger className="mx-auto max-w-3xl text-center" gap={0.07}>
              <StaggerItem>
                <h1 className="text-balance font-display text-4xl font-medium leading-[1.06] tracking-tight text-stone-900 sm:text-5xl lg:text-[clamp(3rem,5vw,4.5rem)]">
                  Never run out or throw away{" "}
                  <em className="font-semibold not-italic text-amber-700">food again</em>
                </h1>
              </StaggerItem>

              <StaggerItem>
                <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-stone-600 sm:text-xl">
                  Track every ingredient and piece of equipment with automatic expiry alerts and availability monitoring.
                </p>
              </StaggerItem>

              <StaggerItem className="mx-auto mt-8 flex max-w-md flex-col items-stretch justify-center gap-3 sm:max-w-none sm:flex-row sm:items-center">
                <Link href="/company-signup" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    className={`group h-12 w-full rounded-full bg-gradient-to-b from-amber-500 to-amber-600 px-8 text-base font-semibold text-white shadow-lg shadow-amber-700/25 hover:from-amber-500 hover:to-amber-700 hover:shadow-xl hover:shadow-amber-700/30 sm:w-auto ${btnPress}`}
                  >
                    Start Free Trial
                    <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Button>
                </Link>
                <Link href="/contact" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    variant="outline"
                    className={`h-12 w-full rounded-full border-stone-300 bg-white px-8 text-base font-semibold text-stone-700 hover:border-stone-400 hover:bg-stone-50 sm:w-auto ${btnPress}`}
                  >
                    See Demo
                  </Button>
                </Link>
              </StaggerItem>
            </Stagger>
          </div>
        </section>

        {/* ===================== OVERVIEW ===================== */}
        <section className="mx-auto max-w-7xl px-4 py-20 md:py-28">
          <div className="grid items-center gap-12 md:grid-cols-2">
            <Reveal>
              <h2 className="text-balance font-display text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">
                Know exactly what you have, when you have it
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-stone-600">
                Stop guessing what's in stock. Track ingredients, equipment, and supplies in real-time with automatic alerts before anything expires or runs out.
              </p>
              <Stagger className="mt-8 space-y-4" gap={0.06}>
                {features.map((feature, i) => (
                  <StaggerItem key={i} className="flex items-start gap-3">
                    <CheckCircle className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
                    <span className="text-stone-700">{feature}</span>
                  </StaggerItem>
                ))}
              </Stagger>
            </Reveal>

            {/* Editorial stat panel - solid figure, no gradient text. */}
            <Reveal delay={0.05}>
              <figure className="rounded-3xl border border-stone-200 bg-white p-10 shadow-sm">
                <div className="flex items-baseline gap-1">
                  <span className="font-display text-6xl font-semibold tracking-tight text-stone-900">45-50</span>
                  <span className="font-display text-3xl font-semibold text-amber-700">%</span>
                </div>
                <figcaption className="mt-4">
                  <p className="text-xl font-semibold text-stone-900">Less food waste</p>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600">
                    Reduce waste with expiry tracking and smarter ordering.
                  </p>
                </figcaption>
                <div className="mt-8 space-y-3">
                  {[
                    { k: "7 days out", v: "First expiry alert" },
                    { k: "3 days out", v: "Use-it-now reminder" },
                    { k: "1 day out", v: "Final warning" },
                  ].map((row) => (
                    <div key={row.k} className="flex items-center justify-between border-b border-stone-100 pb-3 text-sm last:border-0 last:pb-0">
                      <span className="font-medium text-stone-900">{row.k}</span>
                      <span className="text-stone-600">{row.v}</span>
                    </div>
                  ))}
                </div>
              </figure>
            </Reveal>
          </div>
        </section>

        {/* ===================== BENEFITS ===================== */}
        <section className="bg-white py-20 md:py-28">
          <div className="mx-auto max-w-7xl px-4">
            <Reveal className="mx-auto mb-16 max-w-3xl text-center">
              <h2 className="text-balance font-display text-3xl font-semibold tracking-tight text-stone-900 md:text-5xl">
                Everything you need to stay ahead of stock
              </h2>
            </Reveal>

            {/* Hairline-divided row - the icons lead, no repeated gradient chips. */}
            <Stagger className="grid gap-x-10 gap-y-12 sm:grid-cols-3 sm:divide-x sm:divide-stone-200">
              {benefits.map((benefit, i) => (
                <StaggerItem key={i} className="sm:px-8 sm:first:pl-0 sm:last:pr-0">
                  <benefit.icon className="h-8 w-8 text-amber-600" />
                  <h3 className="mb-2 mt-5 text-xl font-semibold text-stone-900">{benefit.title}</h3>
                  <p className="leading-relaxed text-stone-600">{benefit.description}</p>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* ===================== CTA ===================== */}
        <section className="px-4 py-20 md:py-24">
          <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-stone-950 px-6 py-16 text-center shadow-2xl sm:px-12 md:py-20">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(245,158,11,0.28),transparent)]" />
            <div className="relative mx-auto max-w-3xl">
              <h2 className="text-balance font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-5xl">
                Stop throwing money in the bin
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-stone-200 sm:text-xl">
                Food waste kills your margins. CateringMS tracks expiry dates and helps you use ingredients before they go bad.
              </p>
              <div className="mt-8 flex justify-center">
                <Link href="/company-signup" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    className={`group h-12 w-full rounded-full bg-gradient-to-b from-amber-500 to-amber-600 px-9 text-base font-semibold text-white shadow-lg shadow-amber-700/25 hover:from-amber-500 hover:to-amber-700 sm:w-auto ${btnPress}`}
                  >
                    Start Saving Money Today
                    <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Button>
                </Link>
              </div>
            </div>
          </Reveal>

          <Reveal className="mt-12 text-center">
            <p className="text-stone-600">
              Learn more about{" "}
              <Link href="/blog/managing-equipment-like-a-pro" className="font-medium text-amber-700 underline-offset-2 hover:underline">
                inventory management best practices
              </Link>
            </p>
          </Reveal>
        </section>

        <Footer />
      </div>
    </>
  );
}
