/**
 * AuthShell - shared split-panel layout for the public sign-in /
 * sign-up pages.
 *
 * Desktop (lg+): two columns. Left is a premium brand panel — warm food
 * photography under a dark scrim, an elegant serif headline, three quick
 * trust pills, a glass testimonial, a rating row, and one subtle floating
 * "live" card that hints at the product. Right is the form on a clean field.
 *
 * Mobile: the brand panel is hidden; the form sits on a soft stone gradient
 * with a compact brand badge above it so the page still feels branded.
 *
 * Brand colours match the marketing landing page (warm amber on dark stone)
 * so the whole product reads as one premium brand.
 */
import Link from "next/link";
import { ChefHat, CheckCircle2, Star, Check } from "lucide-react";

// Warm, appetising hero image (validated Unsplash id; same family as the
// landing page so auth and marketing feel like one brand).
const PANEL_IMG =
  "https://images.unsplash.com/photo-1600891964092-4316c288032e?auto=format&fit=crop&q=70&w=1300";

const PILLS = [
  "Quotes & invoices",
  "Live delivery tracking",
  "Online payments",
];

interface AuthShellProps {
  /** Form / card content for the right column. */
  children: React.ReactNode;
  /** Headline shown on the desktop brand panel. */
  headline?: string;
  /** Sub-copy under the headline. */
  subcopy?: string;
}

export function AuthShell({
  children,
  headline = "Run your whole catering business in one place.",
  subcopy = "From first enquiry to final plate — quotes, kitchen, delivery and payments, beautifully connected.",
}: AuthShellProps) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2 bg-white">
      {/* Brand showcase panel - desktop only. Pinned to one viewport height
          (sticky, self-start) so a long form on the right doesn't stretch it. */}
      <div className="relative hidden lg:flex lg:sticky lg:top-0 lg:h-screen lg:self-start flex-col justify-between overflow-hidden bg-stone-950 p-12 text-white">
        {/* Food photography */}
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url('${PANEL_IMG}')` }}
        />
        {/* Scrims for depth + legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/85 to-stone-950/70" />
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_25%_0%,rgba(245,158,11,0.22),transparent)]" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg">
            <ChefHat className="h-6 w-6 text-white" />
          </div>
          <span className="font-display text-2xl font-semibold tracking-tight">CateringMS</span>
        </div>

        {/* Floating "live" product card — one tasteful hint of the software */}
        <div className="pointer-events-none absolute right-10 top-28 hidden animate-[floaty_6s_ease-in-out_infinite] xl:block motion-reduce:animate-none">
          <div className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/10 px-3.5 py-2.5 shadow-xl backdrop-blur-md">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-400/90">
              <Check className="h-4 w-4 text-white" />
            </span>
            <div className="leading-tight">
              <p className="text-[12px] font-semibold text-white">Quote accepted</p>
              <p className="text-[10px] text-white/70">Naidoo Wedding · R 92,400</p>
            </div>
          </div>
        </div>

        {/* Headline + trust */}
        <div className="relative max-w-md">
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-white/10 px-3 py-1 text-xs font-medium text-amber-100 backdrop-blur-md">
            <Star className="h-3.5 w-3.5 fill-amber-300 text-amber-300" />
            Trusted by catering teams across South Africa
          </span>

          <h2 className="mt-5 font-display text-[2.6rem] font-semibold leading-[1.08] tracking-tight">
            {headline}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-stone-300">{subcopy}</p>

          <div className="mt-6 flex flex-wrap gap-2">
            {PILLS.map((p) => (
              <span
                key={p}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[13px] text-stone-200 backdrop-blur-sm"
              >
                <CheckCircle2 className="h-3.5 w-3.5 text-amber-300" />
                {p}
              </span>
            ))}
          </div>

          {/* Glass testimonial */}
          <figure className="mt-8 rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-md">
            <div className="mb-2 flex gap-0.5">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-amber-300 text-amber-300" />
              ))}
            </div>
            <blockquote className="text-sm italic leading-relaxed text-stone-100">
              &ldquo;Everything from the first quote to the final invoice lives in one
              place now — our team stopped chasing spreadsheets.&rdquo;
            </blockquote>
            <figcaption className="mt-3 text-xs font-semibold text-stone-400">
              Sarah Johnson · Cape Town Catering Co.
            </figcaption>
          </figure>
        </div>

        <p className="relative text-sm text-stone-500">
          © CateringMS — catering management, simplified.
        </p>
      </div>

      {/* Form column */}
      <div
        className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-stone-50 to-stone-100 px-4 py-10 lg:min-h-0 lg:bg-white lg:bg-none"
        style={{
          paddingTop: "max(2.5rem, env(safe-area-inset-top, 2.5rem))",
          paddingBottom: "max(2.5rem, env(safe-area-inset-bottom, 2.5rem))",
        }}
      >
        {/* Mobile brand badge (panel is hidden below lg) */}
        <div className="mb-6 flex items-center gap-2.5 lg:hidden">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-md">
            <ChefHat className="h-5 w-5 text-white" />
          </div>
          <span className="font-display text-xl font-semibold tracking-tight text-stone-900">CateringMS</span>
        </div>

        {children}

        {/* In-flow footer (replaces the global fixed slim footer that
            overlapped this layout). Links go to the real /privacy + /terms. */}
        <footer className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-stone-400">
          <span>© {new Date().getFullYear()} CateringMS</span>
          <span className="text-stone-300">·</span>
          <Link href="/privacy" className="transition-colors hover:text-stone-600">Privacy</Link>
          <span className="text-stone-300">·</span>
          <Link href="/terms" className="transition-colors hover:text-stone-600">Terms</Link>
        </footer>
      </div>
    </div>
  );
}
