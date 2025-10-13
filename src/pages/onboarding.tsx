import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import {
  Settings,
  Users,
  ClipboardList,
  Palette,
  DollarSign,
  Mail,
  Sparkles,
  CheckCircle,
} from "lucide-react";
import { OnboardingChecklistItem, aiOnboardingService } from "@/services/aiOnboardingService";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Footer } from "@/components/Footer";
import { Switch } from "@/components/ui/switch";

const StepIcon = ({
  category,
  isCompleted,
}: {
  category: string;
  isCompleted: boolean;
}) => {
  let Icon;
  let colorClass;

  switch (category) {
    case "initial_setup":
      Icon = Settings;
      colorClass = isCompleted ? "text-green-600" : "text-indigo-600";
      break;
    case "customization":
      Icon = Palette;
      colorClass = isCompleted ? "text-green-600" : "text-pink-600";
      break;
    case "team":
      Icon = Users;
      colorClass = isCompleted ? "text-green-600" : "text-purple-600";
      break;
    case "first_order":
      Icon = ClipboardList;
      colorClass = isCompleted ? "text-green-600" : "text-orange-600";
      break;
    default:
      Icon = Sparkles;
      colorClass = isCompleted ? "text-green-600" : "text-yellow-600";
  }

  return <Icon className={`w-6 h-6 ${colorClass}`} />;
};


export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [checklist, setChecklist] = useState<OnboardingChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user?.id) {
      loadChecklist(user.id);
    }
  }, [user?.id]);

  const loadChecklist = async (userId: string) => {
    setLoading(true);
    const items = await aiOnboardingService.getOnboardingState(userId);
    setChecklist(items);
    setLoading(false);
  };

  const handleToggle = async (taskId: string) => {
    const item = checklist.find((i) => i.id === taskId);
    if (!item || !user?.id) return;

    const updatedChecklist = await aiOnboardingService.updateChecklistItem(
      user.id,
      taskId,
      !item.isCompleted
    );
    if (updatedChecklist) {
      setChecklist(updatedChecklist);
    }
  };

  const completedCount = checklist.filter((item) => item.isCompleted).length;
  const totalCount = checklist.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const totalEstimatedTime = checklist.reduce((sum, item) => sum + item.estimatedTime, 0);

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Welcome to CateringMS - Get Started</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50">
        <main className="container mx-auto px-4 py-8 max-w-5xl">
          <div className="mb-8 text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Sparkles className="w-8 h-8 text-purple-600" />
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                Welcome to CateringMS
              </h1>
            </div>
            <p className="text-lg text-slate-600 mb-6">
              Let&apos;s get your catering business set up. This will only take about {totalEstimatedTime} minutes.
            </p>

            <div className="max-w-2xl mx-auto">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="font-medium text-slate-700">Overall Progress</span>
                <Badge className="bg-purple-100 text-purple-700 border-purple-200">
                  {progress.toFixed(0)}% Complete
                </Badge>
              </div>
              <Progress value={progress} className="h-3" />
            </div>
          </div>

          {loading ? (
            <div className="text-center py-16">
              <p className="text-muted-foreground">Generating your personalized onboarding plan...</p>
            </div>
          ) : (
            <>
              <Card className="border-2 shadow-lg">
                <CardHeader>
                    <CardTitle className="text-2xl">Your Onboarding Checklist</CardTitle>
                    <CardDescription>
                        Follow these steps to get your catering business up and running.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {checklist.map((item) => (
                      <div
                        key={item.id}
                        className={`p-4 rounded-lg border-2 flex items-start gap-4 transition-all ${
                          item.isCompleted
                            ? "bg-green-50 border-green-200"
                            : "bg-white hover:bg-gray-50"
                        }`}
                      >
                        <StepIcon
                          category={item.category}
                          isCompleted={item.isCompleted}
                        />
                        <div className="flex-1">
                          <h4 className="font-semibold text-gray-900">{item.label}</h4>
                          <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                          <div className="flex items-center gap-4 mt-3">
                            <Link href={item.actionUrl} passHref>
                              <Button variant="outline" size="sm">
                                Go to page
                              </Button>
                            </Link>
                            <Badge variant="secondary">{item.estimatedTime} min</Badge>
                          </div>
                        </div>
                        <div className="flex items-center h-full">
                          <Switch
                            checked={item.isCompleted}
                            onCheckedChange={() => handleToggle(item.id)}
                            aria-label={`Mark ${item.label} as complete`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <div className="mt-6 flex justify-end">
                <Button onClick={() => router.push("/admin/dashboard")} className="bg-gradient-to-r from-purple-600 to-pink-600">
                    Go to Dashboard
                </Button>
              </div>
            </>
          )}
        </main>
        <Footer />
      </div>
    </>
  );
}
