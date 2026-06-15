import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Mail,
  ArrowRight,
  CheckCircle,
  Zap,
  RefreshCw,
  TrendingUp,
  Sparkles
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import Head from "next/head";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { EASE, cardBase, btnPress, iconChip, Eyebrow } from "@/components/motion/marketing";

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

      <div className="min-h-screen bg-white text-slate-900">
        {/* ===================== HERO ===================== */}
        <section className="relative overflow-hidden border-b border-slate-100 bg-white">
          {/* Soft brand glow + faint grid, masked so it fades into the page. */}
          <div className="pointer-events-none absolute inset-x-0 -top-40 h-[560px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(124,58,237,0.12),transparent)]" />
          <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:46px_46px] [mask-image:radial-gradient(70%_55%_at_50%_0%,black,transparent)]" />

          <div className="relative mx-auto max-w-7xl px-4 py-20 md:py-28">
            <Stagger className="mx-auto max-w-3xl text-center" gap={0.07}>
              <StaggerItem className="mb-6 flex justify-center">
                <Eyebrow icon={Mail} className="border-violet-200 bg-violet-50 text-violet-700">
                  Email Automation
                </Eyebrow>
              </StaggerItem>

              <StaggerItem>
                <h1 className="text-balance text-5xl font-bold tracking-tight text-slate-900 sm:text-6xl lg:text-7xl">
                  Never Miss a{" "}
                  <span className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-500 bg-clip-text text-transparent">
                    Follow-Up
                  </span>{" "}
                  Again
                </h1>
              </StaggerItem>

              <StaggerItem>
                <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-slate-600 sm:text-xl">
                  Automated email sequences that nurture leads, convert quotes, and bring clients back for more bookings
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
              <Eyebrow icon={Sparkles} className="border-violet-200 bg-violet-50 text-violet-700">
                Hands-free marketing
              </Eyebrow>
              <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
                Set It and Forget It Marketing
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-600">
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
                      <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" />
                      <span className="text-base text-slate-700">{feature}</span>
                    </div>
                  </StaggerItem>
                ))}
              </Stagger>
            </Reveal>

            <Reveal delay={0.05}>
              <div className="flex min-h-[260px] items-center justify-center rounded-3xl border border-violet-100 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-8 md:p-12">
                <div className="text-center">
                  <div className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-500 bg-clip-text text-5xl font-bold tracking-tight text-transparent md:text-6xl">
                    2-2.5x
                  </div>
                  <p className="mt-4 text-xl text-slate-700">More Repeat Bookings</p>
                  <p className="mt-2 text-sm text-slate-500">Automated nurture campaigns bring clients back</p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ===================== BENEFITS ===================== */}
        <section className="bg-slate-50 py-20 md:py-28">
          <div className="mx-auto max-w-7xl px-4">
            <Reveal className="mx-auto mb-16 max-w-3xl text-center">
              <Eyebrow icon={Zap} className="border-violet-200 bg-violet-50 text-violet-700">
                Why it works
              </Eyebrow>
              <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight text-slate-900 md:text-5xl">
                Follow-ups that run themselves
              </h2>
            </Reveal>

            <Stagger className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {[
                {
                  icon: Zap,
                  title: "Instant Follow-Ups",
                  description: "Quote sent? Follow-up emails go out automatically at day 3, 7, and 14"
                },
                {
                  icon: RefreshCw,
                  title: "12-Month Nurture",
                  description: "Keep clients engaged for a full year after their event with smart campaigns"
                },
                {
                  icon: TrendingUp,
                  title: "Higher Conversions",
                  description: "Automated follow-ups convert 2x more quotes than manual processes"
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

        {/* ===================== CTA + BLOG LINK ===================== */}
        <section className="mx-auto max-w-7xl px-4 py-20 md:py-24">
          <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-500 px-6 py-16 text-center shadow-2xl shadow-violet-600/20 sm:px-12 md:py-20">
            <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(70%_70%_at_50%_50%,black,transparent)]" />
            <div className="relative mx-auto max-w-3xl">
              <h2 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl">
                Stop Losing Clients to Manual Follow-Ups
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-violet-50 sm:text-xl">
                Most quotes need 3-5 follow-ups to convert. Manual follow-ups are inconsistent and time-consuming. Automation does it perfectly, every time.
              </p>
              <div className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
                <Link href="/company-signup" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    className={`h-12 w-full rounded-full bg-white px-9 text-base font-semibold text-violet-700 shadow-xl hover:bg-violet-50 sm:w-auto ${btnPress}`}
                  >
                    Automate Your Follow-Ups Today
                    <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Button>
                </Link>
              </div>
            </div>
          </Reveal>

          <Reveal className="mt-12 text-center">
            <p className="text-base text-slate-600">
              Read about{" "}
              <Link href="/blog/email-automation-for-catering" className="font-medium text-violet-600 underline-offset-2 hover:underline">email automation strategies</Link>
            </p>
          </Reveal>
        </section>

        <Footer />
      </div>
    </>
  );
}
