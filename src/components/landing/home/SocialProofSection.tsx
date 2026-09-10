import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { CountUp } from "./shared";

// prefix/suffix preserve the honest range; CountUp animates the headline figure.
const STATS = [
  { prefix: "", to: 12, suffix: "+", label: "Hours saved every week" },
  { prefix: "50-", to: 55, suffix: "%", label: "Fewer admin calls" },
  { prefix: "10-", to: 16, suffix: "%", label: "Higher profit margins" },
  { prefix: "1.5-", to: 2, suffix: "×", label: "More repeat bookings" },
];

const INTEGRATIONS = ["PayFast", "Stripe", "Xero", "QuickBooks", "Sage", "Paystack"];

export function SocialProofSection() {
  return (
    <section className="border-b border-stone-200">
      {/* Dark stats band bridging out of the hero: the figures keep the
          hero's stone-950 ground so the fold ends on one confident block
          instead of snapping to white mid-thought. */}
      <div className="bg-stone-950 text-white">
        <div className="mx-auto max-w-7xl border-t border-white/10 px-4 py-12 md:py-14">
          <Stagger
            className="grid grid-cols-2 divide-white/10 sm:grid-cols-4 sm:divide-x"
            gap={0.06}
          >
            {STATS.map((stat, index) => (
              <StaggerItem
                key={index}
                className="border-b border-white/10 px-2 py-6 sm:border-b-0 sm:px-8 sm:py-2 sm:first:pl-0 sm:last:pr-0"
              >
                <CountUp
                  to={stat.to}
                  prefix={stat.prefix}
                  suffix={stat.suffix}
                  className="block font-display text-4xl font-medium tracking-tight text-amber-300 md:text-5xl"
                />
                <div className="mt-2 text-sm leading-snug text-stone-300">{stat.label}</div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </div>

      {/* Integration marquee on white below the band */}
      <div className="bg-white">
        <div className="mx-auto max-w-7xl px-4 py-12 md:py-14">
          <Reveal>
            <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
              Payments &amp; accounting that just work
            </p>
            {/* Slow, seamless logo marquee (linear, pauses on hover, off under
                reduced motion). Track is duplicated so -50% loops forever. */}
            <div className="group mt-6 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
              <div className="flex w-max animate-[marquee_26s_linear_infinite] items-center gap-12 group-hover:[animation-play-state:paused] motion-reduce:animate-none motion-reduce:justify-center">
                {[...INTEGRATIONS, ...INTEGRATIONS].map((name, i) => (
                  <span
                    key={`${name}-${i}`}
                    className="shrink-0 text-lg font-semibold tracking-tight text-stone-500 transition-colors duration-200 hover:text-stone-700"
                    aria-hidden={i >= INTEGRATIONS.length}
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
