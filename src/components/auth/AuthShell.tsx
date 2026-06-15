/**
 * AuthShell - shared split-panel layout for ALL sign-in / sign-up pages,
 * platform and white-label tenant alike.
 *
 * ONE UI everywhere. Only the COLOUR + logo + name change per tenant:
 *   - `accent` / `accentTo` drive the logo chip, glow, eyebrow + pill icons,
 *     and rating stars. Defaults to the CateringMS warm amber.
 *   - `brandName` / `brandLogoUrl` swap the wordmark + logo.
 * Everything else - the food-photo panel, glass testimonial, trust pills,
 * floating "live" card, the form column + mobile badge - is identical.
 *
 * The generic /auth/* pages call it with no branding (amber + CateringMS).
 * The /[company_slug]/* logins pass the tenant's colour, logo and name, so a
 * tenant just sees their colour over the same layout.
 */
import Link from "next/link";
import { ChefHat, CheckCircle2, Star, Check } from "lucide-react";

const PANEL_IMG =
  "https://images.unsplash.com/photo-1600891964092-4316c288032e?auto=format&fit=crop&q=70&w=1300";

const DEFAULT_ACCENT = "#f59e0b"; // amber-500
const DEFAULT_ACCENT_TO = "#ea580c"; // orange-600
const DEFAULT_PILLS = ["Quotes & invoices", "Live delivery tracking", "Online payments"];

interface AuthShellProps {
  /** Form / card content for the right column. */
  children: React.ReactNode;
  /** Headline shown on the desktop brand panel. */
  headline?: string;
  /** Sub-copy under the headline. */
  subcopy?: string;
  /** Wordmark next to the logo. Default "CateringMS". */
  brandName?: string;
  /** Optional logo image (tenant). Falls back to the ChefHat chip. */
  brandLogoUrl?: string | null;
  /** Accent colour (hex). Drives logo chip, glow, icons, stars. */
  accent?: string;
  /** Second accent stop for the logo chip gradient. */
  accentTo?: string;
  /** Trust pills. Defaults to the platform set. */
  pills?: string[];
  /** Small line bottom-left of the panel. Default "Powered by CateringMS"
   *  is used by tenants; the platform passes the © line. */
  footerNote?: React.ReactNode;
}

export function AuthShell({
  children,
  headline = "Run your whole catering business in one place.",
  subcopy = "From first enquiry to final plate - quotes, kitchen, delivery and payments, beautifully connected.",
  brandName = "CateringMS",
  brandLogoUrl = null,
  accent = DEFAULT_ACCENT,
  accentTo = DEFAULT_ACCENT_TO,
  pills = DEFAULT_PILLS,
  footerNote,
}: AuthShellProps) {
  const chipGradient = `linear-gradient(135deg, ${accent}, ${accentTo})`;

  // Reusable logo chip (tenant logo or the brand icon on an accent chip).
  const LogoChip = ({ size }: { size: "lg" | "sm" }) => {
    const box = size === "lg" ? "h-11 w-11 rounded-2xl" : "h-10 w-10 rounded-xl";
    const img = size === "lg" ? "h-9 w-9" : "h-8 w-8";
    const icon = size === "lg" ? "h-6 w-6" : "h-5 w-5";
    return (
      <div className={`flex items-center justify-center shadow-lg ${box}`} style={{ background: chipGradient }}>
        {brandLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brandLogoUrl} alt={brandName} className={`${img} rounded-lg object-contain`} />
        ) : (
          <ChefHat className={`${icon} text-white`} />
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2 bg-white">
      {/* Brand showcase panel - desktop only. */}
      <div className="relative hidden lg:flex lg:sticky lg:top-0 lg:h-screen lg:self-start flex-col justify-between overflow-hidden bg-stone-950 p-12 text-white">
        {/* Food photography */}
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url('${PANEL_IMG}')` }}
        />
        {/* Scrims + accent glow (the accent is the only thing that changes) */}
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/85 to-stone-950/70" />
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(60% 50% at 25% 0%, ${accent}40, transparent)` }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{ backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)", backgroundSize: "24px 24px" }}
        />

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <LogoChip size="lg" />
          <span className="font-display text-2xl font-semibold tracking-tight truncate">{brandName}</span>
        </div>

        {/* Floating "live" product card */}
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
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur-md">
            <Star className="h-3.5 w-3.5" style={{ color: accent, fill: accent }} />
            Trusted by catering teams across South Africa
          </span>

          <h2 className="mt-5 font-display text-[2.6rem] font-semibold leading-[1.08] tracking-tight">
            {headline}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-stone-300">{subcopy}</p>

          <div className="mt-6 flex flex-wrap gap-2">
            {pills.map((p) => (
              <span
                key={p}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[13px] text-stone-200 backdrop-blur-sm"
              >
                <CheckCircle2 className="h-3.5 w-3.5" style={{ color: accent }} />
                {p}
              </span>
            ))}
          </div>

          <figure className="mt-8 rounded-2xl border border-white/10 bg-white/[0.06] p-5 backdrop-blur-md">
            <div className="mb-2 flex gap-0.5">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="h-4 w-4" style={{ color: accent, fill: accent }} />
              ))}
            </div>
            <blockquote className="text-sm italic leading-relaxed text-stone-100">
              &ldquo;Everything from the first quote to the final invoice lives in one
              place now - our team stopped chasing spreadsheets.&rdquo;
            </blockquote>
            <figcaption className="mt-3 text-xs font-semibold text-stone-400">
              Sarah Johnson · Cape Town Catering Co.
            </figcaption>
          </figure>
        </div>

        <p className="relative text-sm text-stone-500">
          {footerNote ?? "© CateringMS - catering management, simplified."}
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
          <LogoChip size="sm" />
          <span className="font-display text-xl font-semibold tracking-tight text-stone-900 truncate max-w-[60vw]">
            {brandName}
          </span>
        </div>

        {children}

        <footer className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-stone-400">
          <span>© {new Date().getFullYear()} {brandName}</span>
          <span className="text-stone-300">·</span>
          <Link href="/privacy" className="transition-colors hover:text-stone-600">Privacy</Link>
          <span className="text-stone-300">·</span>
          <Link href="/terms" className="transition-colors hover:text-stone-600">Terms</Link>
        </footer>
      </div>
    </div>
  );
}
