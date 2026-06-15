import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Users, ArrowRight, CheckCircle, TrendingUp, Clock, Target } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import Head from "next/head";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { EASE, btnPress } from "@/components/motion/marketing";

export default function LeadManagementPage() {
  return (
    <>
      <Head>
        <title>Lead management and quote generation - CateringMS</title>
        <meta name="description" content="Capture leads automatically, generate professional quotes in 60 seconds, and track conversion rates in real-time. Increase your quote-to-booking conversion by 2x with CateringMS." />
        <meta name="keywords" content="catering lead management, quote generation, lead tracking, sales pipeline, catering CRM" />
        <link rel="canonical" href="https://cateringms.com/features/lead-management" />
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
                  Turn more leads into{" "}
                  <em className="font-semibold not-italic text-amber-700">paying clients</em>
                </h1>
              </StaggerItem>

              <StaggerItem>
                <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-stone-600 sm:text-xl">
                  Capture leads automatically, generate quotes in 60 seconds, and increase conversions with smart follow-ups
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
                    Schedule Demo
                  </Button>
                </Link>
              </StaggerItem>
            </Stagger>
          </div>
        </section>

        {/* ===================== NEVER LOSE A LEAD ===================== */}
        <section className="mx-auto max-w-6xl px-4 py-20 md:py-28">
          <div className="grid items-center gap-12 md:grid-cols-2">
            <Reveal>
              <h2 className="text-balance font-display text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">
                Never Lose a Lead Again
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-stone-600">
                Every inquiry matters. CateringMS captures leads from your website, phone calls, and manual entry, then automatically guides them through your sales pipeline.
              </p>
              <Stagger className="mt-8 space-y-4" gap={0.06}>
                {[
                  "Automatic lead capture from website forms",
                  "Generate professional quotes in under 60 seconds",
                  "Automated follow-up email sequences",
                  "Real-time conversion tracking",
                  "Smart lead scoring and prioritization",
                  "Complete lead history and communication log"
                ].map((feature, i) => (
                  <StaggerItem key={i} className="flex items-start gap-3">
                    <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                    <span className="text-stone-700">{feature}</span>
                  </StaggerItem>
                ))}
              </Stagger>
            </Reveal>

            {/* Editorial stat panel - solid figure, no gradient text, no big-number cliché. */}
            <Reveal delay={0.05}>
              <figure className="rounded-3xl border border-stone-200 bg-white p-10 shadow-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-6xl font-semibold tracking-tight text-stone-900">2-2.5</span>
                  <span className="font-display text-3xl font-semibold text-amber-700">&times;</span>
                </div>
                <figcaption className="mt-4">
                  <p className="text-xl font-semibold text-stone-900">Higher conversion rate</p>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600">
                    Industry data shows automated follow-ups double conversions.
                  </p>
                </figcaption>
                <div className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-stone-200 bg-stone-200 text-center">
                  {[
                    { k: "Day 3", v: "1st nudge" },
                    { k: "Day 7", v: "2nd nudge" },
                    { k: "Day 14", v: "Final" },
                  ].map((s) => (
                    <div key={s.k} className="bg-white px-2 py-4">
                      <div className="font-display text-lg font-semibold text-stone-900">{s.k}</div>
                      <div className="mt-1 text-xs text-stone-600">{s.v}</div>
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
                Respond faster, convert more
              </h2>
            </Reveal>

            {/* Varied layout: one wide lead card + two stacked supporting cards. */}
            <div className="grid gap-6 lg:grid-cols-3">
              <Reveal className="lg:col-span-2">
                <div className="flex h-full flex-col justify-between rounded-2xl border border-amber-200 bg-amber-50 p-8">
                  <div>
                    <Clock className="h-8 w-8 text-amber-700" />
                    <h3 className="mt-5 font-display text-2xl font-semibold text-stone-900">60 second quotes</h3>
                    <p className="mt-3 max-w-md leading-relaxed text-stone-700">
                      Generate professional, itemized quotes faster than your competitors can answer the phone.
                    </p>
                  </div>
                </div>
              </Reveal>

              <Stagger className="grid gap-6" gap={0.08}>
                {[
                  {
                    icon: Target,
                    title: "Smart follow-ups",
                    description: "Automated sequences at day 3, 7, and 14 with personalized messaging"
                  },
                  {
                    icon: TrendingUp,
                    title: "Real-time analytics",
                    description: "See exactly where leads drop off and optimize your conversion funnel"
                  }
                ].map((benefit, i) => (
                  <StaggerItem key={i}>
                    <div className={`flex h-full gap-4 rounded-2xl border border-stone-200 bg-white p-7 shadow-sm transition-[border-color,box-shadow] duration-300 ${EASE} hover:border-amber-200 hover:shadow-md`}>
                      <benefit.icon className="h-7 w-7 shrink-0 text-amber-600" />
                      <div>
                        <h3 className="text-lg font-semibold text-stone-900">{benefit.title}</h3>
                        <p className="mt-1.5 leading-relaxed text-stone-600">{benefit.description}</p>
                      </div>
                    </div>
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          </div>
        </section>

        {/* ===================== CTA ===================== */}
        <section className="px-4 py-20 md:py-24">
          <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-stone-950 px-6 py-16 text-center shadow-2xl sm:px-12 md:py-20">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(245,158,11,0.28),transparent)]" />
            <div className="relative mx-auto max-w-3xl">
              <h2 className="text-balance font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-5xl">
                Stop Losing Leads to Slow Responses
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-stone-200 sm:text-xl">
                The faster you respond, the higher your conversion rate. CateringMS helps you respond to every lead within minutes, not hours.
              </p>
              <div className="mt-8 flex justify-center">
                <Link href="/company-signup" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    className={`group h-12 w-full rounded-full bg-gradient-to-b from-amber-500 to-amber-600 px-9 text-base font-semibold text-white shadow-lg shadow-amber-700/25 hover:from-amber-500 hover:to-amber-700 sm:w-auto ${btnPress}`}
                  >
                    Start Converting More Leads Today
                    <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Button>
                </Link>
              </div>
            </div>
          </Reveal>

          <Reveal className="mt-12 text-center">
            <p className="text-stone-600">
              See how other catering businesses are{" "}
              <Link href="/blog/improve-quote-conversion-rates" className="font-medium text-amber-700 underline-offset-2 hover:underline">improving their quote conversion rates</Link>
            </p>
          </Reveal>
        </section>

        <Footer />
      </div>
    </>
  );
}
