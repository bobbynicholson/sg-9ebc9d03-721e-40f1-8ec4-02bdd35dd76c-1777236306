import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell } from "@/components/auth/AuthShell";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const initialUrlRef = useRef<string | null>(null);
  const processedUrlRef = useRef<string | null>(null);
  if (initialUrlRef.current === null && typeof window !== "undefined") {
    initialUrlRef.current = window.location.href;
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const startingUrl = initialUrlRef.current || window.location.href;
    if (processedUrlRef.current === startingUrl) return;
    processedUrlRef.current = startingUrl;

    const handleAuthCallback = async () => {
      try {
        const initialUrl = new URL(startingUrl);
        const initialHashParams = new URLSearchParams(initialUrl.hash.slice(1));
        const callbackType = initialHashParams.get("type") || initialUrl.searchParams.get("type");
        const callbackError =
          initialHashParams.get("error_description") ||
          initialHashParams.get("error") ||
          initialUrl.searchParams.get("error_description") ||
          initialUrl.searchParams.get("error");

        if (callbackError) {
          setError(callbackError);
          setTimeout(() => router.push("/auth/login?error=callback_failed"), 1500);
          return;
        }

        // Let Supabase finish its automatic PKCE/hash callback handling first.
        // A successful PKCE exchange removes `code` from the URL. Only use the
        // manual fallback if a credential is still pending afterward.
        await supabase.auth.getSession();

        const pendingUrl = new URL(window.location.href);
        const pendingHash = new URLSearchParams(pendingUrl.hash.slice(1));
        const accessToken = pendingHash.get("access_token") || "";
        const refreshToken = pendingHash.get("refresh_token") || "";
        if (accessToken && refreshToken) {
          const { error: setSessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (setSessionError) {
            setError(setSessionError.message || "Sign-in link could not be used.");
            setTimeout(() => router.push("/auth/login?error=callback_failed"), 1500);
            return;
          }
          window.history.replaceState(null, "", pendingUrl.pathname + pendingUrl.search);
        }

        const pendingCodeUrl = new URL(window.location.href);
        const pendingCode = pendingCodeUrl.searchParams.get("code");
        if (pendingCode) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(pendingCode);
          if (exchangeError) {
            setError(exchangeError.message || "Sign-in code could not be used.");
            setTimeout(() => router.push("/auth/login?error=callback_failed"), 1500);
            return;
          }
          pendingCodeUrl.searchParams.delete("code");
          window.history.replaceState(null, "", pendingCodeUrl.pathname + pendingCodeUrl.search + pendingCodeUrl.hash);
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
            // The auth client removes callback hashes after parsing them, so
            // use the type captured from the original URL above.
            if (callbackType === "recovery") {
              // Redirect to password reset page
              router.push("/auth/reset-password");
              return;
            }
          }

          // Regular staff login callback - let the authenticated user choose
          // among every portal assigned to this email.
          window.location.assign("/auth/select-role");
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
