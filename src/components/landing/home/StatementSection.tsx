import { Reveal } from "@/components/motion/Reveal";

/**
 * Editorial interlude: one oversized display-serif statement in generous
 * whitespace. A breath between the photo-heavy gallery and the process
 * timeline - and the single line the page wants remembered.
 */
export function StatementSection() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-24 md:py-32">
      <Reveal>
        <span aria-hidden className="mb-7 block h-1 w-12 rounded-full bg-amber-500" />
        <p className="max-w-4xl text-balance font-display text-4xl font-medium leading-[1.12] tracking-tight text-stone-900 md:text-6xl">
          Great catering looks effortless. Behind it sit a quote, a prep list,
          a route and an invoice that all agree.
        </p>
        <p className="mt-7 max-w-2xl text-lg leading-relaxed text-stone-600">
          CateringMS keeps them agreeing, automatically, for every function you
          take on.
        </p>
      </Reveal>
    </section>
  );
}
