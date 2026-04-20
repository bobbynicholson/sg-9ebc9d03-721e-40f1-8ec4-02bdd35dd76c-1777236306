import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  CheckCircle2, 
  Circle,
  Settings,
  Users,
  Package,
  CreditCard,
  Mail,
  Rocket
} from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import Head from "next/head";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { ChatBot } from "@/components/ChatBot";

const onboardingSteps = [
  {
    id: "company-setup",
    title: "Company Setup",
    description: "Configure your company details and branding",
    icon: Settings,
    link: "/admin/settings",
    completed: true
  },
  {
    id: "add-staff",
    title: "Add Staff Members",
    description: "Invite your team and assign roles",
    icon: Users,
    link: "/admin/users",
    completed: true
  },
  {
    id: "inventory",
    title: "Setup Inventory",
    description: "Add your equipment and menu items",
    icon: Package,
    link: "/admin/inventory",
    completed: false
  },
  {
    id: "payments",
    title: "Configure Payments",
    description: "Set up payment gateways",
    icon: CreditCard,
    link: "/admin/payment-gateways",
    completed: false
  },
  {
    id: "email",
    title: "Email Templates",
    description: "Customize your automated emails",
    icon: Mail,
    link: "/admin/email-templates",
    completed: false
  },
  {
    id: "launch",
    title: "Ready to Launch",
    description: "Start accepting orders",
    icon: Rocket,
    link: "/admin/dashboard",
    completed: false
  }
];

export default function AdminOnboarding() {
  const { user } = useAuth();
  const [steps] = useState(onboardingSteps);

  const completedCount = steps.filter(s => s.completed).length;
  const progress = (completedCount / steps.length) * 100;

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Onboarding - CateringMS Admin</title>
      </Head>

      <AdminNav />

      <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 lg:pl-64 xl:pl-72">
        <div className="container mx-auto px-4 py-6 md:py-8 lg:py-12 max-w-7xl">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg">
              <Rocket className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Getting Started</h1>
              <p className="text-slate-600">Complete these steps to set up your account</p>
            </div>
          </div>

          <Card className="border-0 shadow-lg mb-8 bg-gradient-to-r from-green-50 to-emerald-50">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-1">
                    Setup Progress
                  </h3>
                  <p className="text-sm text-slate-600">
                    {completedCount} of {steps.length} steps completed
                  </p>
                </div>
                <div className="text-3xl font-bold text-green-600">
                  {Math.round(progress)}%
                </div>
              </div>
              <Progress value={progress} className="h-3" />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <Card key={step.id} className={`border-0 shadow-lg hover:shadow-xl transition-shadow ${
                  step.completed ? "bg-gradient-to-br from-green-50 to-emerald-50" : ""
                }`}>
                  <CardHeader>
                    <div className="flex items-start justify-between mb-3">
                      <div className={`p-3 rounded-lg ${
                        step.completed ? "bg-green-100" : "bg-slate-100"
                      }`}>
                        <Icon className={`w-6 h-6 ${
                          step.completed ? "text-green-600" : "text-slate-600"
                        }`} />
                      </div>
                      {step.completed ? (
                        <Badge className="bg-green-100 text-green-800">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Completed
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          <Circle className="w-3 h-3 mr-1" />
                          Step {index + 1}
                        </Badge>
                      )}
                    </div>
                    <CardTitle className="text-lg">{step.title}</CardTitle>
                    <p className="text-sm text-slate-600">{step.description}</p>
                  </CardHeader>
                  <CardContent>
                    <Link href={step.link}>
                      <Button className="w-full" variant={step.completed ? "outline" : "default"}>
                        {step.completed ? "Review" : "Start"}
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {completedCount === steps.length && (
            <Card className="mt-8 border-0 shadow-lg bg-gradient-to-r from-green-500 to-emerald-600">
              <CardContent className="p-8 text-center text-white">
                <Rocket className="w-16 h-16 mx-auto mb-4" />
                <h2 className="text-2xl font-bold mb-2">You're All Set!</h2>
                <p className="mb-6 text-green-100">
                  Congratulations! You've completed all onboarding steps. You're ready to start using CateringMS.
                </p>
                <Link href="/admin/dashboard">
                  <Button size="lg" className="bg-white text-green-600 hover:bg-green-50">
                    Go to Dashboard
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}
        </div>

        <Footer />
      </div>

      <ChatBot userRole="admin" companyId={user?.user_metadata?.company_id} />
    </>
  );
}