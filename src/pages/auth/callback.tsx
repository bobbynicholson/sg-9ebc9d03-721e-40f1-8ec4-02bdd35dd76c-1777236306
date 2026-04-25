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
    const handleAuthCallback = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.error("Auth callback error:", error);
          router.push("/auth/login?error=callback_failed");
          return;
        }

        if (session) {
          // Check if this is a password recovery session
          const { data: { user } } = await supabase.auth.getUser();
          
          if (user) {
            // Check URL params to see if this is a password reset
            const hashParams = new URLSearchParams(window.location.hash.substring(1));
            const type = hashParams.get("type");
            
            if (type === "recovery") {
              // Redirect to password reset page
              router.push("/auth/reset-password");
              return;
            }
          }

          // Regular login callback - redirect to appropriate dashboard
          const { data: profile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", session.user.id)
            .single();

          if (profile?.active_role) {
            // Redirect based on role
            switch (profile.active_role) {
              case "super_admin":
                router.push("/super-admin");
                break;
              case "company_admin":
                router.push("/admin/dashboard");
                break;
              case "driver":
                router.push("/team-portal/driver/dashboard");
                break;
              case "kitchen_staff":
                router.push("/team-portal/kitchen/dashboard");
                break;
              case "shopping_staff":
                router.push("/team-portal/shopping/dashboard");
                break;
              case "cleaning_staff":
                router.push("/team-portal/cleaning/dashboard");
                break;
              case "client":
                router.push("/client-portal/dashboard");
                break;
              default:
                router.push("/");
            }
          } else {
            router.push("/");
          }
        } else {
          router.push("/auth/login");
        }
      } catch (error) {
        console.error("Callback handling error:", error);
        router.push("/auth/login?error=unknown");
      }
    };

    handleAuthCallback();
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