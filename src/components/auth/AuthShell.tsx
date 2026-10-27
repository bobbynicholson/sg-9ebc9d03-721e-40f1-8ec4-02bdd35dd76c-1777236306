/** Shared sign-in and onboarding shell for platform and white-label tenants. */
import Link from "next/link";
import Head from "next/head";
import { ChefHat, CheckCircle2 } from "lucide-react";

const DEFAULT_ACCENT = "#f59e0b";
const DEFAULT_PILLS = ["Quotes & invoices", "Live delivery tracking", "Online payments"];

interface AuthShellProps {
  children: React.ReactNode;
  headline?: string;
  subcopy?: string;
  brandName?: string;
  brandLogoUrl?: string | null;
  accent?: string;
  /** Kept for existing tenant configuration compatibility. */
  accentTo?: string;
  pills?: string[];
  footerNote?: React.ReactNode;
}

export function AuthShell({
  children,
  headline = "Run your whole catering business in one place.",
  subcopy = "From first enquiry to final plate, keep quotes, kitchen work, delivery and payments connected.",
  brandName = "CateringMS",
  brandLogoUrl = null,
  accent = DEFAULT_ACCENT,
  pills = DEFAULT_PILLS,
  footerNote,
}: AuthShellProps) {
  const LogoChip = ({ size }: { size: "lg" | "sm" }) => {
    const box = size === "lg" ? "h-11 w-11 rounded-2xl" : "h-10 w-10 rounded-xl";
    const img = size === "lg" ? "h-9 w-9" : "h-8 w-8";
    const icon = size === "lg" ? "h-6 w-6" : "h-5 w-5";
    return (
      <div className={`flex shrink-0 items-center justify-center ${box}`} style={{ backgroundColor: accent }}>
        {brandLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brandLogoUrl} alt={brandName} className={`${img} rounded-lg object-contain`} />
        ) : (
          <ChefHat className={`${icon} text-white`} aria-hidden="true" />
        )}
      </div>
    );
  };

  return (
    <>
    <Head>
      <title>{`${brandName} | Workspace access`}</title>
    </Head>
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-2">
      <section className="relative hidden min-h-screen flex-col justify-between bg-stone-950 p-10 text-white lg:flex xl:p-14">
        <div className="flex items-center gap-3">
          <LogoChip size="lg" />
          <span className="truncate font-display text-2xl font-semibold tracking-tight">{brandName}</span>
        </div>

        <div className="my-12 max-w-xl">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.16em]" style={{ color: accent }}>
            Workspace access
          </p>
          <h1 className="text-balance font-display text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">
            {headline}
          </h1>
          <p className="mt-5 max-w-lg text-pretty text-lg leading-relaxed text-stone-300">{subcopy}</p>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {pills.map((pill) => (
              <li key={pill} className="flex items-center gap-2.5 text-sm text-stone-200">
                <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: accent }} aria-hidden="true" />
                {pill}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sm text-stone-400">
          {footerNote ?? `© ${new Date().getFullYear()} ${brandName}`}
        </p>
      </section>

      <main
        className="flex min-h-screen flex-col items-center justify-center bg-stone-50 px-4 py-10 sm:px-6 lg:bg-white lg:px-10"
        style={{
          paddingTop: "max(2.5rem, env(safe-area-inset-top, 2.5rem))",
          paddingBottom: "max(2.5rem, env(safe-area-inset-bottom, 2.5rem))",
        }}
      >
        <div className="mb-6 flex items-center gap-2.5 lg:hidden">
          <LogoChip size="sm" />
          <span className="max-w-[60vw] truncate font-display text-xl font-semibold tracking-tight text-stone-900">
            {brandName}
          </span>
        </div>

        {children}

        <footer className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-stone-500">
          <span>© {new Date().getFullYear()} {brandName}</span>
          <Link href="/privacy" className="underline-offset-2 hover:text-stone-800 hover:underline">Privacy</Link>
          <Link href="/terms" className="underline-offset-2 hover:text-stone-800 hover:underline">Terms</Link>
        </footer>
      </main>
    </div>
    </>
  );
}
