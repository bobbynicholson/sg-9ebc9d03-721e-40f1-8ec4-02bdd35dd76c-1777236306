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
import { ChefHat, CheckCircle2 } from "lucide-react";

const FEATURES = [
  "Quotes, orders & invoices in one smooth flow",
  "Kitchen prep, dispatch & live delivery tracking",
  "Online deposits & balance payments, auto-reconciled",
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
      {/* Brand showcase panel - desktop only */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-purple-600 via-purple-500 to-pink-500 p-12 text-white">
        <div className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-16 h-[28rem] w-[28rem] rounded-full bg-pink-300/20 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 shadow-lg backdrop-blur">
            <ChefHat className="h-6 w-6 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">CateringMS</span>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-4xl font-bold leading-tight">{headline}</h2>
          <p className="mt-4 text-lg text-white/80">{subcopy}</p>
          <ul className="mt-8 space-y-3">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-center gap-3 text-white/90">
                <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-white" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
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
      </div>
    </div>
  );
}
