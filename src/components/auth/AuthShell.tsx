/**
 * AuthShell - shared split-panel layout for the public sign-in /
 * sign-up pages.
 *
 * Desktop (lg+): two columns. Left is a branded showcase panel
 * (CateringMS purple->pink gradient, decorative blur orbs, headline +
 * feature bullets). Right is the form, centred on a clean white field.
 *
 * Mobile: the brand panel is hidden; the form sits on a soft slate
 * gradient with a compact brand badge above it so the page still feels
 * branded without the big panel.
 *
 * Brand colours are intentionally the platform purple->pink (same as
 * the rest of the public chrome) - no theme change.
 */
import Link from "next/link";
import { ChefHat, CheckCircle2 } from "lucide-react";

const FEATURES = [
  "Quotes, orders & invoices in one smooth flow",
  "Kitchen prep, dispatch & live delivery tracking",
  "Online deposits & balance payments, auto-reconciled",
  "Equipment, staff & supplier management built in",
  "Client portal with magic-link quote acceptance",
];

const STATS = [
  { value: "1", label: "platform for the whole operation" },
  { value: "0", label: "spreadsheets to keep in sync" },
  { value: "24/7", label: "client self-service portal" },
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
      {/* Brand showcase panel - desktop only. Pinned to one viewport
          height (sticky, self-start) so a long form on the right (e.g.
          the company-signup page) doesn't stretch the panel tall and
          spread its content into awkward gaps. */}
      <div className="relative hidden lg:flex lg:sticky lg:top-0 lg:h-screen lg:self-start flex-col justify-between overflow-hidden bg-gradient-to-br from-purple-600 via-purple-500 to-pink-500 p-12 text-white">
        {/* Soft dot-grid texture for depth */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        <div className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-white/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-16 h-[28rem] w-[28rem] rounded-full bg-pink-300/25 blur-3xl" />
        <div className="pointer-events-none absolute top-1/3 right-10 h-40 w-40 rounded-full bg-fuchsia-300/20 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 shadow-lg backdrop-blur">
            <ChefHat className="h-6 w-6 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">CateringMS</span>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-[2.75rem] font-bold leading-[1.1] tracking-tight">{headline}</h2>
          <p className="mt-4 text-lg text-white/85">{subcopy}</p>
          <ul className="mt-8 space-y-3.5">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-3 text-white/90">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-white/20">
                  <CheckCircle2 className="h-4 w-4 text-white" />
                </span>
                <span className="text-[15px]">{f}</span>
              </li>
            ))}
          </ul>

          {/* Trust stats row */}
          <div className="mt-9 grid grid-cols-3 gap-4 border-t border-white/20 pt-6">
            {STATS.map((s) => (
              <div key={s.label}>
                <p className="text-2xl font-bold text-white">{s.value}</p>
                <p className="mt-1 text-xs leading-snug text-white/70">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Testimonial */}
          <div className="mt-8 rounded-2xl bg-white/10 p-5 backdrop-blur">
            <p className="text-sm italic text-white/90">
              &ldquo;Everything from the first quote to the final invoice lives in one
              place now — our team stopped chasing spreadsheets.&rdquo;
            </p>
            <p className="mt-3 text-xs font-semibold text-white/80">
              Catering teams running on CateringMS
            </p>
          </div>
        </div>

        <p className="relative text-sm text-white/60">
          © CateringMS — catering management, simplified.
        </p>
      </div>

      {/* Form column */}
      <div
        className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-10 lg:min-h-0 lg:bg-white lg:bg-none"
        style={{
          paddingTop: "max(2.5rem, env(safe-area-inset-top, 2.5rem))",
          paddingBottom: "max(2.5rem, env(safe-area-inset-bottom, 2.5rem))",
        }}
      >
        {/* Mobile brand badge (panel is hidden below lg) */}
        <div className="mb-6 flex items-center gap-2.5 lg:hidden">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-pink-500 shadow-md">
            <ChefHat className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight text-slate-800">CateringMS</span>
        </div>

        {children}

        {/* In-flow footer (replaces the global fixed slim footer that
            overlapped this layout). Sits under the form, centred,
            subtle. Links go to the real /privacy + /terms pages. */}
        <footer className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-slate-400">
          <span>© {new Date().getFullYear()} CateringMS</span>
          <span className="text-slate-300">·</span>
          <Link href="/privacy" className="hover:text-slate-600 transition-colors">Privacy</Link>
          <span className="text-slate-300">·</span>
          <Link href="/terms" className="hover:text-slate-600 transition-colors">Terms</Link>
        </footer>
      </div>
    </div>
  );
}
