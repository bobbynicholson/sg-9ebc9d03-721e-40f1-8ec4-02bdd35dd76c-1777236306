import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft, UtensilsCrossed, ChefHat } from "lucide-react";
import { Reveal } from "@/components/motion/Reveal";
import { iconChip } from "@/components/motion/marketing";

export default function Custom404() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-slate-50 via-white to-violet-50 p-6 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Soft ambient glow - restrained, no loud gradients */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-violet-200/40 blur-3xl dark:bg-violet-500/10" />
        <div className="absolute bottom-0 right-1/4 h-72 w-72 rounded-full bg-fuchsia-200/30 blur-3xl dark:bg-fuchsia-500/10" />
      </div>

      <Reveal className="relative z-10 w-full max-w-2xl text-center" y={20}>
        {/* Chef hat icon chip */}
        <div className="mb-8 flex justify-center">
          <span
            className={`${iconChip} h-20 w-20 bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white`}
          >
            <ChefHat className="h-10 w-10" strokeWidth={1.75} />
          </span>
        </div>

        {/* Main 404 heading */}
        <h1 className="mb-6 flex items-center justify-center gap-2 text-7xl font-bold leading-none tracking-tight text-slate-900 sm:text-8xl dark:text-white">
          4
          <UtensilsCrossed className="h-14 w-14 text-violet-500 sm:h-16 sm:w-16" strokeWidth={1.75} />
          4
        </h1>

        <h2 className="mb-4 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
          Oops! This Page is Off the Menu
        </h2>

        <div className="mb-8 rounded-2xl border border-slate-200 bg-white/80 p-8 shadow-sm backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/70">
          <p className="mb-5 text-base leading-relaxed text-slate-600 dark:text-slate-300">
            Looks like someone sent this page to the wrong kitchen. We searched everywhere - checked the walk-in freezer, looked under the prep tables, even asked the dishwasher. No luck.
          </p>

          <div className="mb-6 rounded-xl border border-violet-100 bg-violet-50/60 p-6 text-left dark:border-violet-900/40 dark:bg-violet-950/30">
            <p className="mb-3 font-medium text-slate-900 dark:text-white">
              🎯 <strong>Chef&apos;s Suggestions:</strong>
            </p>
            <ul className="space-y-2 text-slate-600 dark:text-slate-300">
              <li className="flex items-start">
                <span className="mr-2 text-violet-400">•</span>
                <span>The URL might have been plated incorrectly (check for typos)</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2 text-violet-400">•</span>
                <span>This dish might have been 86&apos;d from our menu</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2 text-violet-400">•</span>
                <span>Perhaps you clicked a link that&apos;s past its expiry date</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2 text-violet-400">•</span>
                <span>The page delivery got lost between the kitchen and your table</span>
              </li>
            </ul>
          </div>

          <p className="mb-6 italic text-slate-500 dark:text-slate-400">
            &quot;A recipe for disaster: 1 cup of broken links, a pinch of confusion, served with a side of 404.&quot;
          </p>

          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/">
              <Button
                size="lg"
                className="w-full bg-gradient-to-r from-violet-600 to-fuchsia-600 shadow-sm hover:from-violet-700 hover:to-fuchsia-700 sm:w-auto"
              >
                <Home className="mr-2 h-5 w-5" />
                Back to Main Course
              </Button>
            </Link>

            <Button
              onClick={() => window.history.back()}
              variant="outline"
              size="lg"
              className="w-full border-slate-300 hover:bg-slate-50 sm:w-auto dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <ArrowLeft className="mr-2 h-5 w-5" />
              Previous Page
            </Button>
          </div>
        </div>

        {/* Fun fact section */}
        <div className="rounded-xl border border-slate-200 bg-white/60 p-6 text-left shadow-sm backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/50">
          <p className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">
            Fun Fact: While you&apos;re here...
          </p>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Did you know that catering companies typically plan for 15-20% food waste to ensure no guest goes hungry? Unlike this page, we always deliver what we promise! 🎉
          </p>
        </div>
      </Reveal>
    </div>
  );
}
