import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  CheckCircle,
  Bell,
  Navigation,
  Clock
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import Head from "next/head";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { EASE, btnPress } from "@/components/motion/marketing";

export default function GPSTrackingPage() {
  const features = [
    "Live GPS tracking for all active deliveries",
    "Client-facing tracking portal with ETA",
    "Automatic notifications at each stage",
    "Driver route optimization",
    "Delivery proof of arrival with photos",
    "Complete delivery history and analytics"
  ];

  const benefits = [
    {
      icon: Navigation,
      title: "Live Location Sharing",
      description: "Drivers share GPS location automatically. No manual updates needed."
    },
    {
      icon: Bell,
      title: "Smart Notifications",
      description: "Automatic alerts when driver departs, arrives, and completes delivery"
    },
    {
      icon: Clock,
      title: "Accurate ETAs",
      description: "Real-time arrival estimates based on traffic and route conditions"
    }
  ];

  return (
    <>
      <Head>
        <title>GPS tracking for real-time delivery - CateringMS</title>
        <meta name="description" content="Live GPS tracking for catering deliveries. Clients track their order in real-time, drivers share location automatically, and admin monitors all deliveries from one dashboard. Reduce tracking calls by 65%." />
        <meta name="keywords" content="GPS tracking catering, delivery tracking, real-time location, driver tracking, catering delivery management" />
        <link rel="canonical" href="https://cateringms.com/features/gps-tracking" />
      </Head>

      <Header />

      <div className="font-body min-h-screen bg-stone-50 text-stone-900">
        {/* ===================== HERO ===================== */}
        <section className="relative overflow-hidden border-b border-stone-200 bg-white">
          {/* Single warm wash anchored at the top - solid colour, no glass. */}
          <div className="pointer-events-none absolute inset-x-0 -top-40 h-[480px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(245,158,11,0.10),transparent)]" />

          <div className="relative mx-auto max-w-6xl px-4 py-20 md:py-28">
            <Stagger className="mx-auto max-w-3xl text-center" gap={0.07}>
              <StaggerItem>
                <h1 className="text-balance font-display text-4xl font-medium leading-[1.06] tracking-tight text-stone-900 sm:text-5xl lg:text-[clamp(3rem,5vw,4.5rem)]">
                  Track every delivery in{" "}
                  <em className="font-semibold not-italic text-amber-700">real time</em>
                </h1>
              </StaggerItem>

              <StaggerItem>
                <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-stone-600 sm:text-xl">
                  Give your clients peace of mind with live GPS tracking. Reduce tracking calls by 65% with automatic notifications
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
                    See It In Action
                  </Button>
                </Link>
              </StaggerItem>
            </Stagger>
          </div>
        </section>

        {/* ===================== OVERVIEW ===================== */}
        <section className="mx-auto max-w-6xl px-4 py-20 md:py-28">
          <div className="grid items-center gap-12 md:grid-cols-2">
            <Reveal>
              <h2 className="text-balance font-display text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">
                Complete Delivery Visibility
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-stone-600">
                From kitchen to venue, track every step of the delivery journey. Clients see live updates, drivers get optimized routes, and admin monitors everything from one dashboard.
              </p>
              <Stagger className="mt-8 space-y-4" gap={0.06}>
                {features.map((feature, i) => (
                  <StaggerItem key={i}>
                    <div className="flex items-start gap-3">
                      <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                      <span className="text-stone-700">{feature}</span>
                    </div>
                  </StaggerItem>
                ))}
              </Stagger>
            </Reveal>

            {/* Editorial stat panel - solid figure, no gradient text. */}
            <Reveal delay={0.05}>
              <figure className="rounded-3xl border border-stone-200 bg-white p-10 shadow-sm">
                <div className="flex items-baseline gap-1">
                  <span className="font-display text-6xl font-semibold tracking-tight text-stone-900">65</span>
                  <span className="font-display text-3xl font-semibold text-amber-700">%</span>
                </div>
                <figcaption className="mt-4">
                  <p className="text-xl font-semibold text-stone-900">Fewer tracking calls</p>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600">
                    Clients can see exactly where their delivery is without calling.
                  </p>
                </figcaption>
                <div className="mt-8 space-y-3">
                  {["Departed kitchen", "On the way", "Arrived at venue"].map((stage, i) => (
                    <div key={stage} className="flex items-center gap-3 text-sm">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 font-display text-xs font-semibold text-amber-700">
                        {i + 1}
                      </span>
                      <span className="text-stone-700">{stage}</span>
                    </div>
                  ))}
                </div>
              </figure>
            </Reveal>
          </div>
        </section>

        {/* ===================== BENEFITS ===================== */}
        <section className="bg-white py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-4">
            <Reveal className="mx-auto mb-16 max-w-3xl text-center">
              <h2 className="text-balance font-display text-3xl font-semibold tracking-tight text-stone-900 md:text-5xl">
                Tracking that runs itself
              </h2>
            </Reveal>

            {/* Numbered flow - the stages are an ordered journey, so the numbers earn their place. */}
            <Stagger className="grid gap-6 md:grid-cols-3">
              {benefits.map((benefit, i) => (
                <StaggerItem key={i}>
                  <div className={`flex h-full flex-col rounded-2xl border border-stone-200 bg-white p-7 shadow-sm transition-[border-color,box-shadow] duration-300 ${EASE} hover:border-amber-200 hover:shadow-md`}>
                    <div className="flex items-center justify-between">
                      <benefit.icon className="h-7 w-7 text-amber-600" />
                      <span className="font-display text-3xl font-semibold tabular-nums text-stone-200">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <h3 className="mb-2 mt-5 text-xl font-semibold text-stone-900">{benefit.title}</h3>
                    <p className="leading-relaxed text-stone-600">{benefit.description}</p>
                  </div>
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
                Your Clients Deserve Delivery Peace of Mind
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-stone-200 sm:text-xl">
                Stop fielding tracking calls. Give clients the Uber-style experience they expect with real-time GPS tracking.
              </p>
              <div className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
                <Link href="/company-signup" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    className={`group h-12 w-full rounded-full bg-gradient-to-b from-amber-500 to-amber-600 px-9 text-base font-semibold text-white shadow-lg shadow-amber-700/25 hover:from-amber-500 hover:to-amber-700 sm:w-auto ${btnPress}`}
                  >
                    Enable GPS Tracking Today
                    <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Button>
                </Link>
              </div>
            </div>
          </Reveal>

          <Reveal className="mt-12 text-center">
            <p className="text-stone-600">
              Read about{" "}
              <Link href="/blog/delivery-and-logistics-nightmares" className="font-medium text-amber-700 underline-offset-2 hover:underline">
                GPS tracking benefits for catering businesses
              </Link>
            </p>
          </Reveal>
        </section>

        <Footer />
      </div>
    </>
  );
}
