import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, ArrowRight, Calendar, Mail, Zap } from "lucide-react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { UserRole } from "@/types/app";

export default function SubscriptionSuccessPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const { profile, company } = useAuth();
  const [confirmed, setConfirmed] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(true);
  const companyId = company?.id || profile?.company_id;
  const isPlatformOwner = String(profile?.role || "").toLowerCase() === UserRole.SUPER_ADMIN;
  const dashboardUrl = isPlatformOwner
    ? "/admin/platform/dashboard"
    : company?.slug
      ? `/${company.slug}/admin/dashboard`
      : "/admin/dashboard";
  const merchantPaymentId = typeof router.query.m_payment_id === "string"
    ? router.query.m_payment_id
    : "";
  useEffect(() => {
    if (!router.isReady || !companyId) return;
    let cancelled = false;
    let attempts = 0;
    let checks = 0;
    const check = async () => {
      checks += 1;
      if (merchantPaymentId && attempts < 7) {
        attempts += 1;
        try {
          const response = await fetch("/api/subscription/reconcile-return", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ m_payment_id: merchantPaymentId }),
          });
          const result = await response.json().catch(() => null);
          if (!cancelled && result?.confirmed === true) {
            setConfirmed(true);
            setCheckingPayment(false);
            clearInterval(timer);
            return;
          }
        } catch (error) {
          console.warn("Could not verify the PayFast return yet:", error);
        }
      }

      const { data } = await supabase.from("companies").select("subscription_status").eq("id", companyId).maybeSingle();
      if (!cancelled && ["active", "trial"].includes(String(data?.subscription_status || "").toLowerCase())) {
        setConfirmed(true);
        setCheckingPayment(false);
        clearInterval(timer);
      } else if (!cancelled && (attempts >= 7 || checks >= 24)) {
        setCheckingPayment(false);
        clearInterval(timer);
      }
    };
    const timer = setInterval(() => { void check(); }, 5000);
    void check();
    return () => { cancelled = true; if (timer) clearInterval(timer); };
  }, [router.isReady, companyId, merchantPaymentId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  // Only leave this page after the server confirms the subscription. Keep
  // pending returns here so an unverified browser redirect cannot grant access.
  useEffect(() => {
    if (!router.isReady || !confirmed) return;
    const timer = window.setTimeout(() => {
      void router.replace(dashboardUrl);
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [router, router.isReady, confirmed, dashboardUrl]);

  if (isLoading) {
    return (
      <>
        <Header />
        <main className="flex min-h-[70vh] items-center justify-center bg-[linear-gradient(180deg,#eef2f6_0%,#f8fafc_260px,#f8fafc_100%)] p-4">
          <div className="text-center">
            <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-b-2 border-brand-primary"></div>
            <p className="text-slate-600">Processing your subscription...</p>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#eef2f6_0%,#f8fafc_260px,#f8fafc_100%)] p-4">
      <Card className="max-w-2xl w-full border-0 shadow-2xl">
        <CardHeader className="text-center space-y-4 pb-8">
          <div className="flex justify-center">
            <div className="w-20 h-20 bg-gradient-to-br from-brand-primary to-brand-secondary rounded-full flex items-center justify-center">
              <CheckCircle className="w-12 h-12 text-white" />
            </div>
          </div>
          
          <div className="space-y-2">
            <Badge className="bg-gradient-to-r from-slate-500 to-rose-500 text-white border-0 px-4 py-1.5">
              {confirmed ? "Subscription Confirmed" : "Payment Submitted"}
            </Badge>
            <CardTitle className="text-3xl font-bold">{confirmed ? "Your subscription is confirmed" : "Your subscription is being confirmed"}</CardTitle>
            <CardDescription className="text-lg">
              {confirmed
                ? "PayFast confirmed your payment. Your company workspace is ready."
                : checkingPayment
                  ? "CateringMS is checking PayFast for your payment and restoring access once it is verified."
                  : "We have not received PayFast confirmation yet. You can check again shortly or return to billing."}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-8">
          <div className="bg-gradient-to-br from-slate-50 to-rose-50 rounded-lg p-6 space-y-4">
            <h3 className="font-semibold text-lg">What happens next?</h3>
            
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-slate-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <Mail className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h4 className="font-medium mb-1">Check your email</h4>
                  <p className="text-sm text-slate-600">
                    Billing confirmation emails are sent after the provider notification is verified. If confirmation stays pending, contact support with your PayFast payment reference.
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
                    Once PayFast confirms the payment, access to your company workspace will be restored.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-brand-primary rounded-full flex items-center justify-center flex-shrink-0">
                  <Calendar className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h4 className="font-medium mb-1">Access after payment confirmation</h4>
                  <p className="text-sm text-slate-600">
                    This page checks PayFast directly if its notification is delayed, then restores access after the payment is verified.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Quick Start Guide</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-brand-primary" />
                <span className="text-slate-600">Set up your company profile and branding</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-brand-primary" />
                <span className="text-slate-600">Import your existing inventory and menu items</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-brand-primary" />
                <span className="text-slate-600">Create your first quote and send it to a client</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-brand-primary" />
                <span className="text-slate-600">Add team members and assign roles</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-brand-primary" />
                <span className="text-slate-600">Connect your payment gateway</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            {confirmed ? (
              <Link href={dashboardUrl} className="flex-1">
                <Button className="w-full h-12 bg-gradient-to-r from-slate-500 to-rose-500 hover:opacity-90">
                  Go to Dashboard
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            ) : (
              <>
                <Button variant="outline" className="flex-1 h-12" onClick={() => { setCheckingPayment(true); void router.reload(); }}>
                  Check payment status
                </Button>
                <Link
                  href={company?.slug
                    ? `/${company.slug}/admin/subscription?payment=pending`
                    : "/admin/subscription?payment=pending"}
                  className="flex-1"
                >
                  <Button variant="outline" className="w-full h-12">Return to billing</Button>
                </Link>
              </>
            )}
            <Link href="/blog" className="flex-1">
              <Button variant="outline" className="w-full h-12">
                View Getting Started Guide
              </Button>
            </Link>
          </div>

          {confirmed && (
            <p className="text-center text-sm text-slate-500" role="status">
              Returning to your {isPlatformOwner ? "platform" : "company"} dashboard shortly…
            </p>
          )}

          <div className="text-center text-sm text-slate-600 border-t pt-6">
            Need help? Contact our support team at{" "}
            <a href="mailto:support@cateringplatform.co.za" className="text-slate-600 hover:underline">
              support@cateringplatform.co.za
            </a>
          </div>
        </CardContent>
      </Card>
      </main>
      <Footer />
    </>
  );
}
