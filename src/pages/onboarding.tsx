
import { useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function OnboardingRedirect() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.push("/auth/login?redirect=/onboarding");
      return;
    }

    if (user.company_slug) {
      router.push(`/${user.company_slug}/admin/onboarding`);
    } else {
      console.error("User has no company_slug - redirecting to home");
      router.push("/");
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 via-white to-pink-50">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6 text-center">
          <Loader2 className="w-12 h-12 animate-spin text-purple-500 mx-auto mb-4" />
          <p className="text-slate-600">Redirecting to your onboarding...</p>
        </CardContent>
      </Card>
    </div>
  );
}
