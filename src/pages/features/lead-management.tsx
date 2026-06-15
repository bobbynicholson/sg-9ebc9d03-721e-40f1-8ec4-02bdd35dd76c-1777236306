import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Users, ArrowRight, CheckCircle, TrendingUp, Clock, Target, Sparkles } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import Head from "next/head";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { cardBase, btnPress, iconChip, Eyebrow } from "@/components/motion/marketing";

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

      <div className="min-h-screen bg-white text-slate-900">
        {/* ===================== HERO ===================== */}
        <section className="relative overflow-hidden border-b border-slate-100 bg-white">
          {/* Soft brand glow + faint grid, masked so it fades into the page. */}
          <div className="pointer-events-none absolute inset-x-0 -top-40 h-[560px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(124,58,237,0.12),transparent)]" />
          <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:46px_46px] [mask-image:radial-gradient(70%_55%_at_50%_0%,black,transparent)]" />

          <div className="relative mx-auto max-w-6xl px-4 py-20 md:py-28">
            <Stagger className="mx-auto max-w-3xl text-center" gap={0.07}>
              <StaggerItem className="mb-6 flex justify-center">
                <Eyebrow icon={Users} className="border-violet-200 bg-violet-50 text-violet-700">
                  Lead Management
                </Eyebrow>
              </StaggerItem>

              <StaggerItem>
                <h1 className="text-balance text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                  Turn more leads into{" "}
                  <span className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-500 bg-clip-text text-transparent">
                    paying clients
                  </span>
                </h1>
              </StaggerItem>

              <StaggerItem>
                <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-slate-600 sm:text-xl">
                  Capture leads automatically, generate quotes in 60 seconds, and increase conversions with smart follow-ups
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
              <Eyebrow icon={Target} className="border-violet-200 bg-violet-50 text-violet-700">
                The sales pipeline
              </Eyebrow>
              <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
                Never Lose a Lead Again
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-slate-600">
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
                    <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" />
                    <span className="text-slate-700">{feature}</span>
                  </StaggerItem>
                ))}
              </Stagger>
            </Reveal>

            <Reveal delay={0.05}>
              <div className="flex items-center justify-center rounded-3xl border border-violet-100 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-10 text-center">
                <div>
                  <div className="bg-gradient-to-r from-violet-600 to-fuchsia-600 bg-clip-text text-6xl font-bold tracking-tight text-transparent">
                    2-2.5x
                  </div>
                  <p className="mt-4 text-xl font-semibold text-slate-900">Higher Conversion Rate</p>
                  <p className="mt-2 text-sm text-slate-600">Industry data shows automated follow-ups double conversions</p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ===================== BENEFITS ===================== */}
        <section className="bg-slate-50 py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-4">
            <Reveal className="mx-auto mb-16 max-w-3xl text-center">
              <Eyebrow icon={Sparkles} className="border-violet-200 bg-violet-50 text-violet-700">
                Why it works
              </Eyebrow>
              <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight text-slate-900 md:text-5xl">
                Respond faster, convert more
              </h2>
            </Reveal>

            <Stagger className="grid gap-6 md:grid-cols-3">
              {[
                {
                  icon: Clock,
                  title: "60 Second Quotes",
                  description: "Generate professional, itemized quotes faster than your competitors can answer the phone"
                },
                {
                  icon: Target,
                  title: "Smart Follow-Ups",
                  description: "Automated sequences at day 3, 7, and 14 with personalized messaging"
                },
                {
                  icon: TrendingUp,
                  title: "Real-Time Analytics",
                  description: "See exactly where leads drop off and optimize your conversion funnel"
                }
              ].map((benefit, i) => (
                <StaggerItem key={i}>
                  <div className={`${cardBase} flex h-full flex-col p-7`}>
                    <div className={`${iconChip} mb-6 h-14 w-14 bg-gradient-to-br from-violet-500 to-fuchsia-500`}>
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
                Stop Losing Leads to Slow Responses
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-violet-50 sm:text-xl">
                The faster you respond, the higher your conversion rate. CateringMS helps you respond to every lead within minutes, not hours.
              </p>
              <div className="mt-8 flex justify-center">
                <Link href="/company-signup" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    className={`h-12 w-full rounded-full bg-white px-9 text-base font-semibold text-violet-700 shadow-xl hover:bg-violet-50 sm:w-auto ${btnPress}`}
                  >
                    Start Converting More Leads Today
                    <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Button>
                </Link>
              </div>
            </div>
          </Reveal>

          <Reveal className="mt-12 text-center">
            <p className="text-slate-600">
              See how other catering businesses are{" "}
              <Link href="/blog/improve-quote-conversion-rates" className="font-medium text-violet-600 underline-offset-2 hover:underline">improving their quote conversion rates</Link>
            </p>
          </Reveal>
        </section>

        <Footer />
      </div>
    </>
  );
}
