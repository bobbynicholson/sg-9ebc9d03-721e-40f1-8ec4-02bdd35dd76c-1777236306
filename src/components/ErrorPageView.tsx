import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home, RotateCcw, ChefHat, AlertTriangle } from "lucide-react";

/**
 * Shared branded error screen used by pages/_error.tsx and pages/500.tsx.
 * Deliberately uses only light, always-loaded primitives (no data fetching,
 * no framer-motion) so it renders reliably even when something upstream broke.
 */
export function ErrorPageView({
  statusCode,
  title,
  message,
}: {
  statusCode?: number;
  title?: string;
  message?: string;
}) {
  const heading = title || (statusCode === 500 ? "Something went wrong" : "Unexpected error");
  const body =
    message ||
    "Our kitchen hit a snag preparing this page. Your data is safe - give it another try, or head back to the dashboard.";
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#eef2f6_0%,#f8fafc_260px,#f8fafc_100%)] p-6 dark:bg-[linear-gradient(180deg,#020617_0%,#0f172a_260px,#0f172a_100%)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[linear-gradient(90deg,rgb(var(--brand-primary-rgb)/0.10),rgb(var(--brand-secondary-rgb)/0.08),rgb(var(--brand-accent-rgb)/0.10))] dark:opacity-35"
      />

      <div className="relative z-10 w-full max-w-xl text-center">
        <div className="mb-8 flex justify-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-primary via-brand-secondary to-brand-accent text-white shadow-sm">
            <ChefHat className="h-10 w-10" strokeWidth={1.75} />
          </span>
        </div>

        <h1 className="mb-3 flex items-center justify-center gap-3 text-5xl font-bold leading-none tracking-tight text-slate-900 sm:text-6xl dark:text-white">
          {statusCode ? statusCode : <AlertTriangle className="h-12 w-12 text-slate-500" strokeWidth={1.75} />}
        </h1>

        <h2 className="mb-4 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
          {heading}
        </h2>

        <div className="mb-8 rounded-2xl border border-slate-200 bg-white/80 p-8 shadow-sm backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/70">
          <p className="mb-6 text-base leading-relaxed text-slate-600 dark:text-slate-300">{body}</p>

          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              onClick={() => {
                if (typeof window !== "undefined") window.location.reload();
              }}
              size="lg"
              className="w-full bg-brand-primary text-primary-foreground shadow-sm hover:bg-brand-primary/90 sm:w-auto"
            >
              <RotateCcw className="mr-2 h-5 w-5" />
              Try again
            </Button>

            <Link href="/">
              <Button
                variant="outline"
                size="lg"
                className="w-full border-slate-300 hover:bg-slate-50 sm:w-auto dark:border-slate-700 dark:hover:bg-slate-800"
              >
                <Home className="mr-2 h-5 w-5" />
                Go home
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
