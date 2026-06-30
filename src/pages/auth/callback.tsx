import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell } from "@/components/auth/AuthShell";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        if (typeof window !== "undefined") {
          const hash = window.location.hash || "";

          if (hash.includes("error=")) {
            const params = new URLSearchParams(hash.slice(1));
            setError(
              params.get("error_description") ||
              params.get("error") ||
              "Sign-in link could not be used.",
            );
            setTimeout(() => router.push("/auth/login?error=callback_failed"), 1500);
            return;
          }

          if (hash.includes("access_token=")) {
            const params = new URLSearchParams(hash.slice(1));
            const access_token = params.get("access_token") || "";
            const refresh_token = params.get("refresh_token") || "";

            if (access_token && refresh_token) {
              const { error: setSessionError } = await supabase.auth.setSession({
                access_token,
                refresh_token,
              });

              if (setSessionError) {
                setError(setSessionError.message || "Sign-in link could not be used.");
                setTimeout(() => router.push("/auth/login?error=callback_failed"), 1500);
                return;
              }

              window.history.replaceState(null, "", window.location.pathname + window.location.search);
            }
          }

          const code = new URL(window.location.href).searchParams.get("code");
          if (code) {
            const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeError) {
              setError(exchangeError.message || "Sign-in code could not be used.");
              setTimeout(() => router.push("/auth/login?error=callback_failed"), 1500);
              return;
            }
          }
        }

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

          // Regular login callback - hard-navigate to "/" and let middleware
          // handle the slug-aware role landing redirect.
          window.location.assign("/");
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
    <AuthShell headline="Finalizing your sign in." subcopy="We are checking your session and sending you to the right workspace.">
      <Card className="w-full max-w-md border-0 shadow-2xl">
        <CardContent className="p-12 text-center">
          {error ? (
            <div className="space-y-4">
              <div className="w-16 h-16 rounded-full bg-rose-100 mx-auto flex items-center justify-center">
                <svg className="w-8 h-8 bg-rose-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-slate-900">Authentication Failed</h2>
              <p className="text-slate-600">{error}</p>
              <p className="text-sm text-slate-500">Redirecting to login...</p>
            </div>
          ) : (
            <div className="space-y-4">
              <Loader2 className="w-16 h-16 animate-spin text-slate-600 mx-auto" />
              <h2 className="text-2xl font-bold text-slate-900">Completing Sign In</h2>
              <p className="text-slate-600">Please wait while we set up your account...</p>
            </div>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  );
}
