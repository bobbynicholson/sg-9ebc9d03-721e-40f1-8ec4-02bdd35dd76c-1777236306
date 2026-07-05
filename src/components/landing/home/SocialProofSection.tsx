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
    <section className="border-b border-stone-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-16 md:py-20">
        {/* Editorial figures row - hairline-divided, no icon chips. The
            numbers carry the weight; the labels sit quiet beside them. */}
        <Stagger
          className="grid grid-cols-2 divide-stone-200 sm:grid-cols-4 sm:divide-x"
          gap={0.06}
        >
          {STATS.map((stat, index) => (
            <StaggerItem
              key={index}
              className="border-b border-stone-200 px-2 py-6 sm:border-b-0 sm:px-8 sm:py-2 sm:first:pl-0 sm:last:pr-0"
            >
              <CountUp
                to={stat.to}
                prefix={stat.prefix}
                suffix={stat.suffix}
                className="block font-display text-4xl font-medium tracking-tight text-stone-900 md:text-5xl"
              />
              <div className="mt-2 text-sm leading-snug text-stone-600">{stat.label}</div>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal className="mt-14">
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
    </section>
  );
}
