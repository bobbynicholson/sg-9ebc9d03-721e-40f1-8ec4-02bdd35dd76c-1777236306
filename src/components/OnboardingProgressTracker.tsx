
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Circle,
  Sparkles,
  ArrowRight,
  X
} from "lucide-react";
import { onboardingService } from "@/services/onboardingService";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";

interface OnboardingStep {
  id: string;
  label: string;
  completed: boolean;
  action?: {
    label: string;
    href: string;
  };
}

export function OnboardingProgressTracker() {
  const { user } = useAuth();
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (user) {
      loadProgress();
    }
    
    const wasDismissed = localStorage.getItem("onboarding-tracker-dismissed");
    if (wasDismissed === "true") {
      setDismissed(true);
    }
  }, [user]);

  const loadProgress = async () => {
    if (!user) return;
    
    try {
      const data = await onboardingService.getOnboardingProgress(user.id);
      setSteps(data.steps);
      setProgress(data.progress);
    } catch (error) {
      console.error("Error loading onboarding progress:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("onboarding-tracker-dismissed", "true");
  };

  if (loading || dismissed || progress === 100) return null;

  return (
    <Card className="border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50">
      <CardHeader className="relative pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-purple-500 rounded-lg">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg">Get Started with CaterOS</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Complete your setup to unlock full features
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="h-auto p-1"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
        
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Setup Progress</span>
            <Badge variant="secondary" className="bg-purple-100 text-purple-700">
              {progress}% Complete
            </Badge>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      </CardHeader>

      <CardContent className="space-y-2">
        {steps.map((step) => (
          <div
            key={step.id}
            className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
              step.completed
                ? "bg-green-50 border border-green-200"
                : "bg-white border border-slate-200 hover:border-purple-300"
            }`}
          >
            <div className="flex items-center gap-3">
              {step.completed ? (
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              ) : (
                <Circle className="w-5 h-5 text-slate-400" />
              )}
              <span
                className={`text-sm font-medium ${
                  step.completed ? "text-green-700" : "text-slate-700"
                }`}
              >
                {step.label}
              </span>
            </div>

            {!step.completed && step.action && (
              <Link href={step.action.href}>
                <Button size="sm" variant="ghost" className="gap-1">
                  {step.action.label}
                  <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            )}
          </div>
        ))}

        {progress < 100 && (
          <div className="pt-3 border-t border-purple-200">
            <p className="text-xs text-muted-foreground text-center">
              Need help? Contact support at{" "}
              <a
                href="tel:+27836525755"
                className="text-purple-600 hover:underline"
              >
                083 652 5755
              </a>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
