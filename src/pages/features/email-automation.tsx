import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  CheckCircle,
  Zap,
  RefreshCw,
  TrendingUp
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import Head from "next/head";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { EASE, btnPress } from "@/components/motion/marketing";

export default function EmailAutomationPage() {
  return (
    <>
      <Head>
        <title>Email automation and follow-ups - CateringMS</title>
        <meta name="description" content="Automated email sequences for quote follow-ups, post-event reviews, and 12-month after-sales campaigns. Increase repeat bookings by 2x with smart email automation." />
        <meta name="keywords" content="email automation, quote follow-ups, after sales, email marketing, catering automation, client nurture" />
        <link rel="canonical" href="https://cateringms.com/features/email-automation" />
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
                  Never miss a{" "}
                  <em className="font-semibold not-italic text-amber-700">follow-up</em>{" "}
                  again
                </h1>
              </StaggerItem>

              <StaggerItem>
                <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-stone-600 sm:text-xl">
                  Automated email sequences that nurture leads, convert quotes, and bring clients back for more bookings
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
                    See Examples
                  </Button>
                </Link>
              </StaggerItem>
            </Stagger>
          </div>
        </section>

        {/* ===================== FEATURE + STAT ===================== */}
        <section className="mx-auto max-w-7xl px-4 py-20 md:py-28">
          <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-2 md:gap-12">
            <Reveal>
              <h2 className="text-balance font-display text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">
                Set It and Forget It Marketing
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-stone-600">
                Automated emails go out at the perfect time without you lifting a finger. Quote follow-ups, event reminders, review requests, and long-term nurture campaigns all run automatically.
              </p>
              <Stagger className="mt-8 space-y-3" gap={0.05}>
                {[
                  "Quote follow-ups at day 3, 7, and 14",
                  "Post-event review requests",
                  "12-month after-sales nurture campaign",
                  "Event reminder emails (14, 7, 3, 1 day before)",
                  "Fully customizable email templates",
                  "Track open rates and conversions"
                ].map((feature, i) => (
                  <StaggerItem key={i}>
                    <div className="flex items-start gap-3">
                      <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                      <span className="text-base text-stone-700">{feature}</span>
                    </div>
                  </StaggerItem>
                ))}
              </Stagger>
            </Reveal>

            {/* Editorial stat panel - solid figure, no gradient text. */}
            <Reveal delay={0.05}>
              <figure className="rounded-3xl border border-stone-200 bg-white p-10 shadow-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-6xl font-semibold tracking-tight text-stone-900">2-2.5</span>
                  <span className="font-display text-3xl font-semibold text-amber-700">&times;</span>
                </div>
                <figcaption className="mt-4">
                  <p className="text-xl font-semibold text-stone-900">More repeat bookings</p>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600">
                    Automated nurture campaigns bring clients back.
                  </p>
                </figcaption>
                <div className="mt-8 space-y-3">
                  {[
                    "Quote sent, follow-ups armed",
                    "Event reminders on schedule",
                    "Review request after the function",
                    "Year-long nurture keeps you top of mind",
                  ].map((line) => (
                    <div key={line} className="flex items-center gap-3 text-sm text-stone-700">
                      <CheckCircle className="h-4 w-4 shrink-0 text-amber-600" />
                      {line}
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
                Follow-ups that run themselves
              </h2>
            </Reveal>

            {/* Varied layout: one wide lead card + two stacked supporting cards. */}
            <div className="grid gap-6 lg:grid-cols-3">
              <Reveal className="lg:col-span-2">
                <div className="flex h-full flex-col justify-between rounded-2xl border border-amber-200 bg-amber-50 p-8">
                  <div>
                    <Zap className="h-8 w-8 text-amber-700" />
                    <h3 className="mt-5 font-display text-2xl font-semibold text-stone-900">Instant follow-ups</h3>
                    <p className="mt-3 max-w-md leading-relaxed text-stone-700">
                      Quote sent? Follow-up emails go out automatically at day 3, 7, and 14 while the booking is still warm.
                    </p>
                  </div>
                </div>
              </Reveal>

              <Stagger className="grid gap-6" gap={0.08}>
                {[
                  {
                    icon: RefreshCw,
                    title: "12-month nurture",
                    description: "Keep clients engaged for a full year after their event with smart campaigns"
                  },
                  {
                    icon: TrendingUp,
                    title: "Higher conversions",
                    description: "Automated follow-ups convert 2x more quotes than manual processes"
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

        {/* ===================== CTA + BLOG LINK ===================== */}
        <section className="mx-auto max-w-7xl px-4 py-20 md:py-24">
          <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-stone-950 px-6 py-16 text-center shadow-2xl sm:px-12 md:py-20">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(245,158,11,0.28),transparent)]" />
            <div className="relative mx-auto max-w-3xl">
              <h2 className="text-balance font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-5xl">
                Stop Losing Clients to Manual Follow-Ups
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-stone-200 sm:text-xl">
                Most quotes need 3-5 follow-ups to convert. Manual follow-ups are inconsistent and time-consuming. Automation does it perfectly, every time.
              </p>
              <div className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
                <Link href="/company-signup" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    className={`group h-12 w-full rounded-full bg-gradient-to-b from-amber-500 to-amber-600 px-9 text-base font-semibold text-white shadow-lg shadow-amber-700/25 hover:from-amber-500 hover:to-amber-700 sm:w-auto ${btnPress}`}
                  >
                    Automate Your Follow-Ups Today
                    <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Button>
                </Link>
              </div>
            </div>
          </Reveal>

          <Reveal className="mt-12 text-center">
            <p className="text-base text-stone-600">
              Read about{" "}
              <Link href="/blog/email-automation-for-catering" className="font-medium text-amber-700 underline-offset-2 hover:underline">email automation strategies</Link>
            </p>
          </Reveal>
        </section>

        <Footer />
      </div>
    </>
  );
}
