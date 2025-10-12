import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, ArrowRight, Calendar, Mail, Zap } from "lucide-react";

export default function SubscriptionSuccessPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-slate-600">Processing your subscription...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full border-0 shadow-2xl">
        <CardHeader className="text-center space-y-4 pb-8">
          <div className="flex justify-center">
            <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center">
              <CheckCircle className="w-12 h-12 text-white" />
            </div>
          </div>
          
          <div className="space-y-2">
            <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0 px-4 py-1.5">
              Subscription Activated
            </Badge>
            <CardTitle className="text-3xl font-bold">Welcome Aboard!</CardTitle>
            <CardDescription className="text-lg">
              Your free trial has started successfully
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-8">
          <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-6 space-y-4">
            <h3 className="font-semibold text-lg">What happens next?</h3>
            
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <Mail className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h4 className="font-medium mb-1">Check your email</h4>
                  <p className="text-sm text-slate-600">
                    We have sent you a confirmation email with your account details and getting started guide.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h4 className="font-medium mb-1">Explore your dashboard</h4>
                  <p className="text-sm text-slate-600">
                    Start setting up your catering business profile, add team members, and configure your settings.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h4 className="font-medium mb-1">14 days of full access</h4>
                  <p className="text-sm text-slate-600">
                    You will not be charged until your trial ends. Cancel anytime before then at no cost.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Quick Start Guide</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-slate-600">Set up your company profile and branding</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-slate-600">Import your existing inventory and menu items</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-slate-600">Create your first quote and send it to a client</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-slate-600">Add team members and assign roles</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-600" />
                <span className="text-slate-600">Connect your payment gateway</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <Link href="/" className="flex-1">
              <Button className="w-full h-12 bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90">
                Go to Dashboard
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <Link href="/blog" className="flex-1">
              <Button variant="outline" className="w-full h-12">
                View Getting Started Guide
              </Button>
            </Link>
          </div>

          <div className="text-center text-sm text-slate-600 border-t pt-6">
            Need help? Contact our support team at{" "}
            <a href="mailto:support@cateringplatform.co.za" className="text-purple-600 hover:underline">
              support@cateringplatform.co.za
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}