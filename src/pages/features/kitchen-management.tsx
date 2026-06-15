import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  CheckCircle,
  Clock,
  ListChecks,
  Users
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import Head from "next/head";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { EASE, btnPress } from "@/components/motion/marketing";

export default function KitchenManagementPage() {
  const features = [
    "Automated prep schedules for each order",
    "Ingredient requirements pulled from inventory",
    "Production timeline optimization",
    "Team task assignments",
    "Shopping lists auto-generated",
    "Quality control checklists"
  ];

  const benefits = [
    {
      icon: Clock,
      title: "Smart Scheduling",
      description: "Prep schedules based on event time working backwards to start times"
    },
    {
      icon: ListChecks,
      title: "Task Checklists",
      description: "Teams check off completed tasks as they go for accountability"
    },
    {
      icon: Users,
      title: "Team Coordination",
      description: "Everyone sees what others are doing for seamless coordination"
    }
  ];

  return (
    <>
      <Head>
        <title>Kitchen production management - CateringMS</title>
        <meta name="description" content="Smart prep lists, order coordination, and production workflows for your kitchen team. Reduce prep time by 30% with automated kitchen management." />
        <meta name="keywords" content="kitchen management, food production, prep lists, catering kitchen, workflow optimization, team coordination" />
        <link rel="canonical" href="https://cateringms.com/features/kitchen-management" />
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
                  Turn kitchen chaos into{" "}
                  <em className="font-semibold not-italic text-amber-700">smooth operations</em>
                </h1>
              </StaggerItem>

              <StaggerItem>
                <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-stone-600 sm:text-xl">
                  Smart prep schedules, automated shopping lists, and team coordination that keeps your kitchen running efficiently
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
                    Book Demo
                  </Button>
                </Link>
              </StaggerItem>
            </Stagger>
          </div>
        </section>

        {/* ===================== EVERYONE KNOWS WHAT TO DO ===================== */}
        <section className="mx-auto max-w-6xl px-4 py-20 md:py-28">
          <div className="grid items-center gap-12 md:grid-cols-2">
            <Reveal>
              <h2 className="text-balance font-display text-3xl font-semibold tracking-tight text-stone-900 md:text-4xl">
                Everyone Knows Exactly What to Do and When
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-stone-600">
                Your kitchen team sees exactly what needs to be prepared, when it needs to be ready, and what ingredients are available. No more confusion or last-minute scrambles.
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
            <Reveal delay={0.08}>
              <figure className="rounded-3xl border border-stone-200 bg-white p-10 shadow-sm">
                <div className="flex items-baseline gap-1">
                  <span className="font-display text-6xl font-semibold tracking-tight text-stone-900">30-35</span>
                  <span className="font-display text-3xl font-semibold text-amber-700">%</span>
                </div>
                <figcaption className="mt-4">
                  <p className="text-xl font-semibold text-stone-900">Faster prep times</p>
                  <p className="mt-2 text-sm leading-relaxed text-stone-600">
                    Optimized workflows reduce kitchen prep by roughly a third.
                  </p>
                </figcaption>
                <div className="mt-8 space-y-3">
                  {[
                    "Prep timed backwards from service",
                    "Shopping lists built from the menu",
                    "Every station sees its own tasks",
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
          <div className="mx-auto max-w-6xl px-4">
            <Reveal className="mx-auto mb-16 max-w-3xl text-center">
              <h2 className="text-balance font-display text-3xl font-semibold tracking-tight text-stone-900 md:text-5xl">
                Production that runs like clockwork
              </h2>
              <p className="mt-4 text-lg text-stone-600">Smart scheduling, clear checklists, and a team that stays in sync.</p>
            </Reveal>

            {/* Numbered production steps - the sequence is real, so the numbers carry meaning. */}
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

        {/* ===================== CTA BANNER ===================== */}
        <section className="px-4 py-20 md:py-24">
          <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-stone-950 px-6 py-16 text-center shadow-2xl sm:px-12 md:py-20">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(245,158,11,0.28),transparent)]" />
            <div className="relative mx-auto max-w-3xl">
              <h2 className="text-balance font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-5xl">
                No More Last-Minute Kitchen Panic
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-stone-200 sm:text-xl">
                Stop the chaos. Give your team clear timelines, tasks, and coordination tools that keep production flowing smoothly.
              </p>
              <div className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
                <Link href="/company-signup" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    className={`group h-12 w-full rounded-full bg-gradient-to-b from-amber-500 to-amber-600 px-9 text-base font-semibold text-white shadow-lg shadow-amber-700/25 hover:from-amber-500 hover:to-amber-700 sm:w-auto ${btnPress}`}
                  >
                    Organize Your Kitchen Today
                    <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Button>
                </Link>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ===================== FOOTER LINK ===================== */}
        <section className="px-4 pb-20 md:pb-28">
          <Reveal className="text-center">
            <p className="text-stone-600">
              Discover{" "}
              <Link href="/blog/kitchen-workflow-optimization" className="font-medium text-amber-700 underline-offset-2 hover:underline">
                kitchen workflow optimization tips
              </Link>
            </p>
          </Reveal>
        </section>

        <Footer />
      </div>
    </>
  );
}
