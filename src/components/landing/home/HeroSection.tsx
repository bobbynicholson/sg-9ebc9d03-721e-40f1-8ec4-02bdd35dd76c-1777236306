import { useRef } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { Star, ArrowRight, Phone, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPreview } from "@/components/landing/ProductPreview";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import {
  IMG,
  Photo,
  amberBtn,
  heroOutlineBtn,
  PHONE_DISPLAY,
  PHONE_TEL,
} from "./shared";

export function HeroSection() {
  const heroRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  // Subtle hero parallax: the photo drifts slower than the page. Disabled
  // entirely under prefers-reduced-motion.
  const heroY = useTransform(scrollYProgress, [0, 1], ["0%", reduce ? "0%" : "18%"]);

  return (
    <section ref={heroRef} className="relative isolate overflow-hidden bg-stone-950 text-white">
      {/* Parallax food photography (graceful gradient until a real photo is dropped in) */}
      <motion.div style={{ y: heroY }} className="absolute inset-0 -z-20 scale-[1.18]">
        <Photo
          src={IMG.hero}
          alt="An elegant catering spread of plated dishes and canapés"
          gradient="from-stone-700 via-stone-900 to-stone-950"
          className="h-full w-full"
        />
      </motion.div>
      {/* Scrims for legible text over any photo */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-stone-950 via-stone-950/90 to-stone-950/75" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(75%_55%_at_50%_0%,rgba(245,158,11,0.20),transparent)]" />

      <div className="relative mx-auto max-w-7xl px-4 pb-24 pt-14 md:pb-32 md:pt-20">
        <Stagger className="mx-auto max-w-3xl text-center" gap={0.08}>
          <StaggerItem>
            <h1 className="text-balance font-display text-5xl font-medium leading-[1.04] tracking-tight text-white sm:text-6xl lg:text-[clamp(3.5rem,6vw,5.25rem)]">
              Run a catering business your clients rave about
            </h1>
          </StaggerItem>

          <StaggerItem>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-stone-200 sm:text-xl">
              The complete operating system for weddings, corporate functions and
              private events. Quote, plan, deliver and get paid, beautifully,
              from one platform built for South African caterers.
            </p>
          </StaggerItem>

          <StaggerItem className="mx-auto mt-9 flex max-w-md flex-col items-stretch justify-center gap-3 sm:max-w-none sm:flex-row sm:items-center">
            <Link href="/company-signup" className="w-full sm:w-auto">
              <Button size="lg" className={`group w-full px-8 sm:w-auto ${amberBtn}`}>
                Get Your Free Quote
                <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Button>
            </Link>
            <a href={`tel:${PHONE_TEL}`} className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className={`px-8 ${heroOutlineBtn}`}>
                <Phone className="h-5 w-5" />
                {PHONE_DISPLAY}
              </Button>
            </a>
          </StaggerItem>

          {/* Above-the-fold trust indicators */}
          <StaggerItem className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-stone-300">
            <span className="inline-flex items-center gap-1.5">
              <span className="flex">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                ))}
              </span>
              <span className="font-medium text-white">4.9/5</span> from 127 reviews
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-amber-400" /> No credit card required
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-amber-400" /> Set up in under 3 hours
            </span>
          </StaggerItem>
        </Stagger>

        {/* Product showcase - the "this is serious software" centrepiece */}
        <Reveal className="mt-14 md:mt-20" y={28}>
          <ProductPreview />
        </Reveal>
      </div>
    </section>
  );
}
