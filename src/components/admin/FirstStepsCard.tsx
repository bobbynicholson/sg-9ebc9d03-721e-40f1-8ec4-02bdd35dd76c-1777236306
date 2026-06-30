/**
 * Day-zero "First Steps" card for the admin dashboard.
 *
 * Renders a small, dismissible card listing the next 3 onboarding actions
 * a brand-new owner should take, derived from real signals via
 * onboardingProgressService. Hides itself when:
 *   - all required steps are complete, OR
 *   - companies.onboarding_completed_at is set, OR
 *   - companies.onboarding_dismissed_at is set (soft dismiss).
 *
 * The card lives inline on the dashboard so the owner sees a clear
 * "what to do now" prompt the moment they land on a mostly-empty
 * dashboard, rather than a wall of zeros.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2, Circle, Rocket, X } from "lucide-react";
import { onboardingProgressService, type OnboardingState } from "@/services/onboardingProgressService";

interface Props {
  companyId: string;
  slug: string;
}

export function FirstStepsCard({ companyId, slug }: Props) {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!companyId) return;
    void onboardingProgressService.getState(companyId, slug).then((s) => {
      if (!cancelled) setState(s);
    });
    return () => {
      cancelled = true;
    };
  }, [companyId, slug]);

  if (hidden) return null;
  if (!state) return null;

  // Only show for day-zero owners. Once anything significant is in
  // place we get out of the way.
  if (state.completedAt) return null;
  if (state.dismissedAt) return null;
  if (state.allRequiredComplete) return null;

  const tenantPath = slug ? `/${slug}` : "";
  const incomplete = state.steps.filter((s) => !s.completed).slice(0, 3);

  const handleDismiss = async () => {
    setDismissing(true);
    setHidden(true);
    void onboardingProgressService.dismissDashboardCard(companyId);
  };

  return (
    <Card className="border-0 shadow-lg mb-6 bg-gradient-to-br from-brand-primary/10 via-brand-secondary/10 to-brand-accent/10">
      <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Rocket className="w-4 h-4 sm:w-5 sm:h-5 text-brand-primary" />
            First steps
          </CardTitle>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            {state.completedRequiredSteps} of {state.requiredSteps} required complete. Tackle these next:
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 -mr-1 -mt-1 text-slate-500 hover:text-slate-900"
          aria-label="Dismiss"
          disabled={dismissing}
          onClick={() => void handleDismiss()}
        >
          <X className="w-4 h-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 sm:space-y-3">
          {incomplete.map((step, i) => (
            <Link
              key={step.id}
              href={step.href}
              className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all group"
            >
              <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0 text-sm font-bold text-slate-700">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{step.label}</p>
                <p className="text-xs text-slate-500 truncate">{step.description}</p>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 flex-shrink-0" />
            </Link>
          ))}
        </div>
        <div className="flex items-center justify-between mt-3">
          <Link
            href={`${tenantPath}/admin/onboarding`}
            className="text-xs text-slate-700 hover:text-slate-900 underline"
          >
            See full checklist
          </Link>
          <span className="text-xs text-slate-500 flex items-center gap-1">
            {state.completedSteps > 0 ? (
              <><CheckCircle2 className="w-3 h-3 text-brand-primary" /> {state.completedSteps} done</>
            ) : (
              <><Circle className="w-3 h-3" /> Just getting started</>
            )}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
