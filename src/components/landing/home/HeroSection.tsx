import Link from "next/link";
import { ArrowRight, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPreview } from "@/components/landing/ProductPreview";
import { amberBtn, heroOutlineBtn } from "./shared";

const BOOKING_STEPS = [
  "Quotes and client changes",
  "Deposits, balances and invoices",
  "Kitchen prep and shopping",
  "Delivery and event-day updates",
];

export function HeroSection() {
  return (
    <section className="relative isolate overflow-hidden bg-stone-950 text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(75%_80%_at_50%_0%,rgba(245,158,11,0.12),transparent)]" />

      <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-12 md:pb-20 md:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <span aria-hidden className="mb-6 block h-1 w-14 rounded-full bg-amber-500" />
            <h1 className="text-balance font-display text-4xl font-medium leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-[clamp(3.25rem,5vw,4.5rem)]">
              Every catering booking, in one place
            </h1>

            <p className="mt-5 max-w-2xl text-pretty text-lg leading-relaxed text-stone-200 sm:text-xl">
              Create quotes, track payments, plan kitchen prep and coordinate
              delivery, so everyone knows what happens next.
            </p>

            <div className="mt-7 flex max-w-md flex-col items-stretch gap-3 sm:max-w-none sm:flex-row sm:items-center">
              <Button
                asChild
                size="lg"
                className={`group w-full px-8 sm:w-auto ${amberBtn}`}
              >
                <Link href="/company-signup">
                  Start free trial
                  <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className={`px-8 ${heroOutlineBtn}`}
              >
                <Link href="/demo">Explore the demo</Link>
              </Button>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-stone-300">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4 text-amber-400" aria-hidden="true" />
                No credit card required
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4 text-amber-400" aria-hidden="true" />
                14-day free trial
              </span>
            </div>
          </div>

          <aside className="lg:col-span-5" aria-labelledby="booking-flow-title">
            <h2 id="booking-flow-title" className="mb-4 font-display text-2xl font-medium tracking-tight text-white sm:text-3xl">
              One booking, from quote to event day
            </h2>
            <ul className="divide-y divide-white/10 border-y border-white/10">
              {BOOKING_STEPS.map((item) => (
                <li key={item} className="flex items-center gap-3 py-3 text-sm text-stone-200 sm:text-base">
                  <CheckCircle className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>

        <div className="mt-12 md:mt-16">
          <ProductPreview />
        </div>
      </div>
    </section>
  );
}
