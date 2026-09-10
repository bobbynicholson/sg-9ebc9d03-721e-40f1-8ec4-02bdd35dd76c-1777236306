import { useRef, useEffect } from "react";
import {
  motion,
  animate,
  useTransform,
  useMotionValue,
  useInView,
  useReducedMotion,
} from "framer-motion";
import { EASE, btnPress } from "@/components/motion/marketing";
import { Reveal } from "@/components/motion/Reveal";

// Phone number (mirrors the JSON-LD contactPoint) - wired for click-to-call.
export const PHONE_DISPLAY = "+27 83 652 5755";
export const PHONE_TEL = "+27836525755";

// Warm-luxury surface language for the landing page. Kept local (not in the
// shared marketing tokens) because the rest of the site stays on the cooler
// violet/slate palette - only the landing page wears the warm catering skin.
export const warmCard = `group relative h-full overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm transition-[transform,box-shadow,border-color] duration-300 ${EASE} hover:-translate-y-1 hover:border-amber-200/80 hover:shadow-[0_24px_60px_-24px_rgba(120,53,15,0.30)]`;
export const amberBtn = `h-12 rounded-full bg-gradient-to-b from-amber-500 to-amber-600 px-8 text-base font-semibold text-white shadow-lg shadow-amber-700/25 hover:from-amber-500 hover:to-amber-700 hover:shadow-xl hover:shadow-amber-700/30 ${btnPress}`;
export const chip = `inline-flex items-center justify-center rounded-xl shadow-sm transition-transform duration-300 ${EASE} group-hover:scale-105`;
export const heroOutlineBtn = `h-12 w-full rounded-full border-white/40 bg-white/10 text-base font-semibold text-white hover:border-white/60 hover:bg-white/15 sm:w-auto ${btnPress}`;

// Authentic, hand-picked Unsplash catering photography (validated to resolve).
// `u()` builds an optimised, CDN-resized URL. Swap any id for your own shoot
// later - or drop a local file and point src at /images/... instead.
export const u = (id: string, w: number, extra = "") =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&q=70&w=${w}${extra}`;

export const IMG = {
  hero: u("1511795409834-ef04bbd61622", 2000),
  heroCard: u("1504674900247-0877df9cc836", 900, "&h=1200"),
  why: u("1577219491135-ce391730fb2c", 900, "&h=1200"),
  cta: u("1463183547458-6a2c760d0912", 1800),
  services: {
    weddings: u("1606660023296-81d67734170a", 800),
    corporate: u("1671612451404-f4f8fc5fe25e", 800),
    private: u("1660120447916-123439b05c40", 800),
    gala: u("1525441273400-056e9c7517b3", 800),
  },
  menu: {
    beef: u("1600891964092-4316c288032e", 800),
    arancini: u("1780134758247-f780bcb9dca5", 800),
    linefish: u("1467003909585-2f8a72700288", 800),
    grazing: u("1773517906154-f98ddb122263", 800),
    malva: u("1527751171053-6ac5ec50000b", 800),
    potjie: u("1594041680534-e8c8cdebd659", 800),
  },
  gallery: [
    u("1576842546422-60562b9242ae", 900),
    u("1663530761401-15eefb544889", 600),
    u("1774921676955-b54c02fe4fb0", 600),
    u("1767500536243-bf6807a331e4", 600),
    u("1414235077428-338989a2e8c0", 600),
  ],
  people: {
    sarah: u("1494790108377-be9c29b29330", 240, "&h=240&crop=faces"),
    michael: u("1507003211169-0a1dd7228f2d", 240, "&h=240&crop=faces"),
    linda: u("1573497491765-dccce02b29df", 240, "&h=240&crop=faces"),
  },
};

/**
 * Split editorial section header: heading left under a short amber rule,
 * supporting copy right, bottom-aligned. One consistent header voice for
 * every section (replaces the old all-centered stacks).
 */
export function SectionHeader({
  title,
  copy,
  dark = false,
  className = "",
}: {
  title: string;
  copy: React.ReactNode;
  dark?: boolean;
  className?: string;
}) {
  return (
    <Reveal className={`mb-14 flex flex-col gap-6 md:flex-row md:items-end md:justify-between md:gap-12 ${className}`}>
      <div className="max-w-xl">
        <span aria-hidden className="mb-5 block h-1 w-12 rounded-full bg-amber-500" />
        <h2 className={`text-balance font-display text-3xl font-medium tracking-tight md:text-5xl ${dark ? "text-white" : "text-stone-900"}`}>
          {title}
        </h2>
      </div>
      <p className={`max-w-md text-balance text-lg md:pb-1.5 md:text-right ${dark ? "text-stone-300" : "text-stone-600"}`}>
        {copy}
      </p>
    </Reveal>
  );
}

/**
 * Graceful image slot. Renders a warm gradient immediately and layers the
 * real photo on top via CSS background - so a missing file simply shows the
 * gradient (no broken-image icons, no runtime 404s). Drop real photos into
 * /public/images/... and they appear with zero code changes.
 *
 * An empty `alt` marks the photo as decorative: it is hidden from assistive
 * technology instead of being announced as a nameless image.
 */
export function Photo({
  src,
  alt,
  gradient = "from-stone-200 via-stone-300 to-stone-400",
  className = "",
  zoom = false,
  children,
}: {
  src: string;
  alt: string;
  gradient?: string;
  className?: string;
  zoom?: boolean;
  children?: React.ReactNode;
}) {
  const a11y = alt
    ? { role: "img", "aria-label": alt }
    : { "aria-hidden": true as const };
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br ${gradient} ${className}`}>
      <div
        {...a11y}
        className={`absolute inset-0 bg-cover bg-center bg-no-repeat ${
          zoom ? `transition-transform duration-1200 ${EASE} group-hover:scale-[1.06]` : ""
        }`}
        style={{ backgroundImage: `url('${src}')` }}
      />
      {children}
    </div>
  );
}

/**
 * Count-up number for the social-proof stats. Animates only when scrolled into
 * view, exactly once, and snaps straight to the value under reduced-motion.
 * `prefix`/`suffix` keep the honest range + unit (e.g. "10-" … "%").
 */
export function CountUp({
  to,
  prefix = "",
  suffix = "",
  className = "",
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => `${prefix}${Math.round(v)}${suffix}`);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      mv.set(to);
      return;
    }
    const controls = animate(mv, to, { duration: 1.1, ease: [0.23, 1, 0.32, 1] });
    return () => controls.stop();
  }, [inView, reduce, to, mv]);

  return (
    <motion.span ref={ref} className={className}>
      {text}
    </motion.span>
  );
}
