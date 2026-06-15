import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Package,
  ArrowRight,
  CheckCircle,
  AlertCircle,
  TrendingDown,
  RefreshCw
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { EASE, cardBase, btnPress, iconChip, Eyebrow } from "@/components/motion/marketing";
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
      description: "Get notified 7, 3, and 1 day before items expire so you can use them in time",
      color: "from-violet-500 to-fuchsia-500"
    },
    {
      icon: RefreshCw,
      title: "Equipment Tracking",
      description: "See what's available, in use, or being cleaned at any time",
      color: "from-fuchsia-500 to-rose-500"
    },
    {
      icon: TrendingDown,
      title: "Waste Reduction",
      description: "Analytics show what's being wasted so you can order smarter",
      color: "from-violet-600 to-indigo-500"
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

      <div className="min-h-screen bg-white text-slate-900">
        {/* ===================== HERO ===================== */}
        <section className="relative overflow-hidden border-b border-slate-100 bg-white">
          {/* Soft brand glow + faint grid, masked so it fades into the page. */}
          <div className="pointer-events-none absolute inset-x-0 -top-40 h-[560px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(124,58,237,0.12),transparent)]" />
          <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:46px_46px] [mask-image:radial-gradient(70%_55%_at_50%_0%,black,transparent)]" />

          <div className="relative mx-auto max-w-7xl px-4 py-20 md:py-28">
            <Stagger className="mx-auto max-w-3xl text-center" gap={0.07}>
              <StaggerItem className="mb-6 flex justify-center">
                <Eyebrow icon={Package} className="border-violet-200 bg-violet-50 text-violet-700">
                  Inventory Management
                </Eyebrow>
              </StaggerItem>

              <StaggerItem>
                <h1 className="text-balance text-5xl font-bold tracking-tight text-slate-900 sm:text-6xl lg:text-7xl">
                  Never run out or throw away{" "}
                  <span className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-500 bg-clip-text text-transparent">
                    food again
                  </span>
                </h1>
              </StaggerItem>

              <StaggerItem>
                <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-slate-600 sm:text-xl">
                  Track every ingredient and piece of equipment with automatic expiry alerts and availability monitoring.
                </p>
              </StaggerItem>

              <StaggerItem className="mx-auto mt-8 flex max-w-md flex-col items-stretch justify-center gap-3 sm:max-w-none sm:flex-row sm:items-center">
                <Link href="/company-signup" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    className={`h-12 w-full rounded-full bg-gradient-to-b from-violet-600 to-violet-700 px-8 text-base font-semibold text-white shadow-lg shadow-violet-600/20 hover:from-violet-600 hover:to-violet-800 hover:shadow-xl hover:shadow-violet-600/30 sm:w-auto ${btnPress}`}
                  >
                    Start Free Trial
                    <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Button>
                </Link>
                <Link href="/contact" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    variant="outline"
                    className={`h-12 w-full rounded-full border-slate-300 bg-white px-8 text-base font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50 sm:w-auto ${btnPress}`}
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
              <Eyebrow icon={CheckCircle} className="border-emerald-200 bg-emerald-50 text-emerald-600">
                Full visibility
              </Eyebrow>
              <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
                Know exactly what you have, when you have it
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-600">
                Stop guessing what's in stock. Track ingredients, equipment, and supplies in real-time with automatic alerts before anything expires or runs out.
              </p>
              <Stagger className="mt-8 space-y-4" gap={0.06}>
                {features.map((feature, i) => (
                  <StaggerItem key={i} className="flex items-start gap-3">
                    <CheckCircle className="mt-0.5 h-6 w-6 shrink-0 text-violet-600" />
                    <span className="text-slate-700">{feature}</span>
                  </StaggerItem>
                ))}
              </Stagger>
            </Reveal>

            <Reveal delay={0.05}>
              <div className="flex items-center justify-center rounded-3xl border border-violet-100 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-8 md:p-12">
                <div className="text-center">
                  <div className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-500 bg-clip-text text-6xl font-bold tracking-tight text-transparent md:text-7xl">
                    45-50%
                  </div>
                  <p className="mt-4 text-xl font-semibold text-slate-900">Less Food Waste</p>
                  <p className="mt-2 text-sm text-slate-600">Reduce waste with expiry tracking and smart ordering</p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ===================== BENEFITS ===================== */}
        <section className="bg-slate-50 py-20 md:py-28">
          <div className="mx-auto max-w-7xl px-4">
            <Reveal className="mx-auto mb-16 max-w-3xl text-center">
              <Eyebrow icon={Package} className="border-violet-200 bg-violet-50 text-violet-700">
                Built for control
              </Eyebrow>
              <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight text-slate-900 md:text-5xl">
                Everything you need to stay ahead of stock
              </h2>
            </Reveal>

            <Stagger className="grid gap-6 md:grid-cols-3">
              {benefits.map((benefit, i) => (
                <StaggerItem key={i}>
                  <div className={`${cardBase} flex h-full flex-col p-7`}>
                    <div className={`${iconChip} mb-6 h-14 w-14 bg-gradient-to-br ${benefit.color}`}>
                      <benefit.icon className="h-7 w-7 text-white" />
                    </div>
                    <h3 className="mb-2.5 text-xl font-semibold text-slate-900">{benefit.title}</h3>
                    <p className="leading-relaxed text-slate-600">{benefit.description}</p>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* ===================== CTA ===================== */}
        <section className="px-4 py-20 md:py-24">
          <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-500 px-6 py-16 text-center shadow-2xl shadow-violet-600/20 sm:px-12 md:py-20">
            <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(70%_70%_at_50%_50%,black,transparent)]" />
            <div className="relative mx-auto max-w-3xl">
              <h2 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl">
                Stop throwing money in the bin
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-violet-50 sm:text-xl">
                Food waste kills your margins. CateringMS tracks expiry dates and helps you use ingredients before they go bad.
              </p>
              <div className="mt-8 flex justify-center">
                <Link href="/company-signup" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    className={`h-12 w-full rounded-full bg-white px-9 text-base font-semibold text-violet-700 shadow-xl hover:bg-violet-50 sm:w-auto ${btnPress}`}
                  >
                    Start Saving Money Today
                    <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Button>
                </Link>
              </div>
            </div>
          </Reveal>

          <Reveal className="mt-12 text-center">
            <p className="text-slate-600">
              Learn more about{" "}
              <Link href="/blog/inventory-management-catering" className="font-medium text-violet-600 underline-offset-2 hover:underline">
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
