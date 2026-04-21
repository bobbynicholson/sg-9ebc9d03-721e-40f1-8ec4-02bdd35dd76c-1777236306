import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { authService } from "@/services/authService";
import { profileService } from "@/services/profileService";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get the authenticated user from the callback
        const { user, error: callbackError } = await authService.handleOAuthCallback();

        if (callbackError || !user) {
          setError(callbackError?.message || "Authentication failed");
          setTimeout(() => router.push("/auth/login"), 3000);
          return;
        }

        // Get user profile to determine redirect
        const profile = await profileService.getProfile(user.id);

        if (!profile) {
          setError("User profile not found");
          setTimeout(() => router.push("/auth/login"), 3000);
          return;
        }

        // Redirect based on role
        const activeRole = profile.active_role || profile.role || "client";
        let dashboardUrl = "/";

        switch (activeRole) {
          case "company_admin":
          case "super_admin":
            dashboardUrl = `/admin/dashboard`;
            break;
          case "driver":
            dashboardUrl = `/team-portal/driver/dashboard`;
            break;
          case "kitchen_staff":
            dashboardUrl = `/team-portal/kitchen/dashboard`;
            break;
          case "shopping_staff":
            dashboardUrl = `/team-portal/shopping/dashboard`;
            break;
          case "cleaning_staff":
            dashboardUrl = `/team-portal/cleaning/dashboard`;
            break;
          case "client":
            dashboardUrl = "/client-portal/dashboard";
            break;
          default:
            dashboardUrl = "/";
        }

        router.push(dashboardUrl);
      } catch (err) {
        console.error("Callback error:", err);
        setError("An unexpected error occurred");
        setTimeout(() => router.push("/auth/login"), 3000);
      }
    };

    handleCallback();
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-pink-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-0 shadow-2xl">
        <CardContent className="p-12 text-center">
          {error ? (
            <div className="space-y-4">
              <div className="w-16 h-16 rounded-full bg-red-100 mx-auto flex items-center justify-center">
                <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Authentication Failed</h2>
              <p className="text-slate-600">{error}</p>
              <p className="text-sm text-slate-500">Redirecting to login...</p>
            </div>
          ) : (
            <div className="space-y-4">
              <Loader2 className="w-16 h-16 animate-spin text-purple-600 mx-auto" />
              <h2 className="text-2xl font-bold text-slate-900">Completing Sign In</h2>
              <p className="text-slate-600">Please wait while we set up your account...</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}