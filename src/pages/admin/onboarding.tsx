import { useCallback, useEffect, useState } from "react";
import Head from "next/head";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  Circle,
  Rocket,
  Loader2,
  ArrowRight,
} from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ChatBot } from "@/components/ChatBot";
import {
  onboardingProgressService,
  type OnboardingState,
} from "@/services/onboardingProgressService";

export default function AdminOnboarding() {
  const { user, profile, company } = useAuth() as {
    user: { user_metadata?: { company_id?: string } } | null;
    profile: { company_id?: string | null } | null;
    company: { id?: string; slug?: string | null } | null;
  };
  const { toast } = useToast();

  const companyId =
    company?.id || profile?.company_id || user?.user_metadata?.company_id || null;
  const slug = company?.slug || "";

  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingComplete, setSavingComplete] = useState(false);

  const reload = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const next = await onboardingProgressService.getState(companyId, slug);
      setState(next);
    } finally {
      setLoading(false);
    }
  }, [companyId, slug]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleMarkComplete = async () => {
    if (!companyId) return;
    setSavingComplete(true);
    const result = await onboardingProgressService.markComplete(companyId);
    setSavingComplete(false);
    if (result.error) {
      toast({ title: "Couldn't save", description: result.error, variant: "destructive" });
      return;
    }
    toast({ title: "Onboarding complete", description: "Welcome aboard." });
    void reload();
  };

  const handleUnmarkComplete = async () => {
    if (!companyId) return;
    await onboardingProgressService.unmarkComplete(companyId);
    void reload();
  };

  const handleStepClick = async (stepId: string) => {
    if (!companyId) return;
    if (stepId === "welcome" || stepId === "final_review") {
      await onboardingProgressService.markStepDone(companyId, stepId);
      void reload();
    }
  };

  return (
    <>
      <NoIndexMeta />
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>Getting started | CateringMS</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 lg:pl-72 xl:pl-80">
        <div
          className="px-3 sm:px-4 md:px-6 pt-20 lg:pt-6 pb-8 max-w-screen-2xl"
          style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom, 2rem))" }}
        >
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg">
              <Rocket className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Getting started</h1>
              <p className="text-slate-600">A short checklist to set up CateringMS for your business.</p>
            </div>
          </div>

          {loading && !state && (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-12 text-center text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" />
                Loading your setup progress...
              </CardContent>
            </Card>
          )}

          {state && (
            <>
              <Card className="border-0 shadow-lg mb-8 bg-gradient-to-r from-green-50 to-emerald-50">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 mb-1">Setup progress</h3>
                      <p className="text-sm text-slate-600">
                        {state.completedSteps} of {state.totalSteps} steps complete
                        {" -- "}
                        {state.completedRequiredSteps} of {state.requiredSteps} required
                      </p>
                    </div>
                    <div className="text-3xl font-bold text-green-600">{state.progressPct}%</div>
                  </div>
                  <Progress value={state.progressPct} className="h-3" />
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {state.steps.map((step, index) => (
                  <Card
                    key={step.id}
                    className={`border-0 shadow-lg hover:shadow-xl transition-shadow ${
                      step.completed ? "bg-gradient-to-br from-green-50 to-emerald-50" : ""
                    }`}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between mb-3">
                        <div
                          className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl ${
                            step.completed ? "bg-green-100" : "bg-slate-100"
                          }`}
                          aria-hidden
                        >
                          {step.icon}
                        </div>
                        {step.completed ? (
                          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Done
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            <Circle className="w-3 h-3 mr-1" />
                            Step {index + 1}
                          </Badge>
                        )}
                      </div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        {step.label}
                        {step.required ? null : <span className="text-xs font-normal text-slate-500">optional</span>}
                      </CardTitle>
                      <p className="text-sm text-slate-600">{step.description}</p>
                      {typeof step.count === "number" && step.count > 0 && (
                        <p className="text-xs text-slate-500 mt-2">
                          {step.count} record{step.count === 1 ? "" : "s"} so far
                        </p>
                      )}
                    </CardHeader>
                    <CardContent>
                      <Link href={step.href} onClick={() => void handleStepClick(step.id)}>
                        <Button className="w-full" variant={step.completed ? "outline" : "default"}>
                          {step.completed ? "Review" : "Start"}
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {state.completedAt ? (
                <Card className="mt-8 border-0 shadow-lg bg-gradient-to-r from-green-500 to-emerald-600">
                  <CardContent className="p-8 text-center text-white">
                    <Rocket className="w-16 h-16 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold mb-2">You're set up.</h2>
                    <p className="mb-6 text-green-100">
                      Onboarding complete. You can come back here any time, or step back into setup mode if anything changes.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      <Link href={slug ? `/${slug}/admin/dashboard` : "/admin/dashboard"}>
                        <Button size="lg" className="bg-white text-green-700 hover:bg-green-50">
                          Go to dashboard
                        </Button>
                      </Link>
                      <Button
                        size="lg"
                        variant="outline"
                        className="bg-transparent border-white text-white hover:bg-white/10"
                        onClick={() => void handleUnmarkComplete()}
                      >
                        Re-open setup
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : state.allRequiredComplete ? (
                <Card className="mt-8 border-0 shadow-lg bg-gradient-to-r from-purple-500 to-pink-500">
                  <CardContent className="p-8 text-center text-white">
                    <Rocket className="w-16 h-16 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold mb-2">Looking good.</h2>
                    <p className="mb-6 text-purple-100">
                      Every required step is in. Mark setup complete and we'll stop nudging you back here on each login.
                    </p>
                    <Button
                      size="lg"
                      className="bg-white text-purple-700 hover:bg-purple-50"
                      disabled={savingComplete}
                      onClick={() => void handleMarkComplete()}
                    >
                      {savingComplete ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                      Mark setup complete
                    </Button>
                  </CardContent>
                </Card>
              ) : null}
            </>
          )}
        </div>

        <Footer />
      </div>

      <ChatBot userRole="admin" companyId={companyId ?? undefined} />
    </>
  );
}
