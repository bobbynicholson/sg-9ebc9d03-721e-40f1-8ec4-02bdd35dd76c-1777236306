import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ChefHat,
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
import { EASE, cardBase, btnPress, iconChip, Eyebrow } from "@/components/motion/marketing";

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

      <div className="min-h-screen bg-white text-slate-900">
        {/* ===================== HERO ===================== */}
        <section className="relative overflow-hidden border-b border-slate-100 bg-white">
          {/* Soft brand glow + faint grid, masked so it fades into the page. */}
          <div className="pointer-events-none absolute inset-x-0 -top-40 h-[560px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(124,58,237,0.12),transparent)]" />
          <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:46px_46px] [mask-image:radial-gradient(70%_55%_at_50%_0%,black,transparent)]" />

          <div className="relative mx-auto max-w-6xl px-4 py-20 md:py-28">
            <Stagger className="mx-auto max-w-3xl text-center" gap={0.07}>
              <StaggerItem className="mb-6 flex justify-center">
                <Eyebrow icon={ChefHat} className="border-violet-200 bg-violet-50 text-violet-700">
                  Kitchen Management
                </Eyebrow>
              </StaggerItem>

              <StaggerItem>
                <h1 className="text-balance text-5xl font-bold tracking-tight text-slate-900 sm:text-6xl lg:text-7xl">
                  Turn Kitchen Chaos Into{" "}
                  <span className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-500 bg-clip-text text-transparent">
                    Smooth Operations
                  </span>
                </h1>
              </StaggerItem>

              <StaggerItem>
                <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-slate-600 sm:text-xl">
                  Smart prep schedules, automated shopping lists, and team coordination that keeps your kitchen running efficiently
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
              <Eyebrow icon={ListChecks} className="border-violet-200 bg-violet-50 text-violet-700">
                Clear, coordinated production
              </Eyebrow>
              <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
                Everyone Knows Exactly What to Do and When
              </h2>
              <p className="mt-4 text-lg leading-relaxed text-slate-600">
                Your kitchen team sees exactly what needs to be prepared, when it needs to be ready, and what ingredients are available. No more confusion or last-minute scrambles.
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

            <Reveal delay={0.08}>
              <div className="flex items-center justify-center rounded-3xl border border-violet-100 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-8 md:p-12">
                <div className="text-center">
                  <div className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-500 bg-clip-text text-6xl font-bold tracking-tight text-transparent md:text-7xl">
                    30-35%
                  </div>
                  <p className="mt-4 text-xl font-semibold text-slate-900">Faster Prep Times</p>
                  <p className="mt-2 text-sm text-slate-600">Optimized workflows reduce kitchen prep by a third</p>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ===================== BENEFITS ===================== */}
        <section className="bg-slate-50 py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-4">
            <Reveal className="mx-auto mb-16 max-w-3xl text-center">
              <Eyebrow icon={ChefHat} className="border-violet-200 bg-violet-50 text-violet-700">
                Built for the kitchen
              </Eyebrow>
              <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight text-slate-900 md:text-5xl">
                Production that runs like clockwork
              </h2>
              <p className="mt-4 text-lg text-slate-600">Smart scheduling, clear checklists, and a team that stays in sync.</p>
            </Reveal>

            <Stagger className="grid gap-6 md:grid-cols-3">
              {benefits.map((benefit, i) => (
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

        {/* ===================== CTA BANNER ===================== */}
        <section className="px-4 py-20 md:py-24">
          <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-500 px-6 py-16 text-center shadow-2xl shadow-violet-600/20 sm:px-12 md:py-20">
            <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(70%_70%_at_50%_50%,black,transparent)]" />
            <div className="relative mx-auto max-w-3xl">
              <h2 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl">
                No More Last-Minute Kitchen Panic
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-violet-50 sm:text-xl">
                Stop the chaos. Give your team clear timelines, tasks, and coordination tools that keep production flowing smoothly.
              </p>
              <div className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
                <Link href="/company-signup" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    className={`h-12 w-full rounded-full bg-white px-9 text-base font-semibold text-violet-700 shadow-xl hover:bg-violet-50 sm:w-auto ${btnPress}`}
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
            <p className="text-slate-600">
              Discover{" "}
              <Link href="/blog/kitchen-workflow-optimization" className="font-medium text-violet-600 underline-offset-2 hover:underline">
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
