import Link from "next/link";
import { ArrowRight, Phone, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion/Reveal";
import {
  IMG,
  Photo,
  amberBtn,
  heroOutlineBtn,
  PHONE_DISPLAY,
  PHONE_TEL,
} from "./shared";

const ASSURANCES = [
  "No credit card required",
  "Cancel anytime",
  "Setup in under 3 hours",
  "Dedicated support included",
];

export function FinalCtaSection() {
  return (
    <section className="px-4 pb-20 md:pb-24">
      <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-stone-950 px-6 py-16 text-center shadow-2xl sm:px-12 md:py-20">
        {/* Warm food photo wash behind the banner (decorative, hidden from AT) */}
        <Photo
          src={IMG.cta}
          alt=""
          gradient="from-amber-700 via-stone-900 to-stone-950"
          className="absolute inset-0"
        />
        <div className="absolute inset-0 bg-stone-950/70" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(245,158,11,0.28),transparent)]" />

        <div className="relative mx-auto max-w-3xl">
          <h2 className="text-balance font-display text-3xl font-medium tracking-tight text-white sm:text-4xl md:text-5xl">
            Let&apos;s make your next event effortless
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-stone-200 sm:text-xl">
            Join forward-thinking catering businesses across South Africa running
            profitable, scalable operations - without being trapped in the day-to-day.
          </p>

          <div className="mx-auto mt-9 flex max-w-md flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
            <Link href="/company-signup" className="w-full sm:w-auto">
              <Button size="lg" className={`group w-full px-9 sm:w-auto ${amberBtn}`}>
                Get Your Free Quote
                <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Button>
            </Link>
            <a href={`tel:${PHONE_TEL}`} className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className={`px-9 ${heroOutlineBtn}`}>
                <Phone className="h-5 w-5" />
                Call {PHONE_DISPLAY}
              </Button>
            </a>
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm text-stone-300">
            {ASSURANCES.map((item) => (
              <div key={item} className="flex items-center gap-2">
                <Check className="h-4 w-4 flex-shrink-0 text-amber-400" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
