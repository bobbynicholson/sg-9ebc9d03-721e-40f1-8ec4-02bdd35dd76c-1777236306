import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye, EyeOff, Lock, CheckCircle2 } from "lucide-react";
import Link from "next/link";

export default function ResetPassword() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [validatingSession, setValidatingSession] = useState(true);
  // Staff-invite mode: the link is /auth/reset-password?invite=1, sent
  // when an admin adds a new staff member. Same set-password mechanic,
  // but invite-flavoured copy and a straight-into-the-app redirect.
  const [isInvite, setIsInvite] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    const invite = router.query.invite === "1" || router.query.type === "invite";
    setIsInvite(invite);

    // Establish the session from the link BEFORE calling getSession.
    // Supabase recovery/invite links arrive as #access_token=... hash
    // tokens (or a ?code= for PKCE); the browser client auto-detects
    // them asynchronously, which races a bare getSession() and made the
    // page report "invalid or expired link" for valid links. Seed the
    // session ourselves first (same pattern as the magic-link callback).
    const establish = async () => {
      try {
        if (typeof window !== "undefined") {
          const hash = window.location.hash || "";
          if (hash.includes("error=")) {
            const params = new URLSearchParams(hash.slice(1));
            const desc =
              params.get("error_description") ||
              params.get("error") ||
              "This link could not be used.";
            setError(
              decodeURIComponent(desc.replace(/\+/g, " ")) +
                " Please request a new link.",
            );
            setValidatingSession(false);
            return;
          }
          if (hash.includes("access_token=")) {
            const params = new URLSearchParams(hash.slice(1));
            const access_token = params.get("access_token") || "";
            const refresh_token = params.get("refresh_token") || "";
            if (access_token && refresh_token) {
              const { error: setErr } = await supabase.auth.setSession({ access_token, refresh_token });
              if (setErr) {
                setError("Invalid or expired link. Please request a new one.");
                setValidatingSession(false);
                return;
              }
              try {
                window.history.replaceState(null, "", window.location.pathname + window.location.search);
              } catch { /* non-fatal */ }
            }
          }
          const url = new URL(window.location.href);
          const code = url.searchParams.get("code");
          if (code) {
            const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
            if (exErr) {
              setError("Invalid or expired link. Please request a new one.");
              setValidatingSession(false);
              return;
            }
          }
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setError(
            invite
              ? "This invite link is invalid or has expired. Ask your administrator to resend it."
              : "Invalid or expired reset link. Please request a new password reset.",
          );
          setValidatingSession(false);
          if (!invite) setTimeout(() => router.push("/auth/login"), 3000);
          return;
        }
        setValidatingSession(false);
      } catch (err) {
        console.error("Session check error:", err);
        setError("Failed to validate the link. Please try again.");
        setValidatingSession(false);
      }
    };

    establish();
  }, [router.isReady, router.query.invite, router.query.type, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Validation
    if (password.length < 8) {
      setError("Password must be at least 8 characters long");
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    try {
      // Update password using Supabase Auth
      const { error: updateError } = await supabase.auth.updateUser({
        password: password
      });

      if (updateError) {
        throw updateError;
      }

      setSuccess(true);

      // After setting the password the user already has a live session.
      // Invite flow: send them straight to "/" so middleware lands them
      // in their role's portal. Normal reset: back to login to re-auth.
      setTimeout(() => {
        if (isInvite) router.replace("/");
        else router.push("/auth/login?reset=success");
      }, 2000);

    } catch (err: any) {
      console.error("Password reset error:", err);
      setError(err.message || "Failed to reset password. Please try again.");
      setLoading(false);
    }
  };

  if (validatingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-white to-orange-50">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mb-4"></div>
              <p className="text-slate-600">Validating reset link...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-white to-orange-50">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-8">
              <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
              <h2 className="text-2xl font-bold text-slate-900 mb-2">
                {isInvite ? "You're all set!" : "Password Reset Successful!"}
              </h2>
              <p className="text-slate-600 text-center mb-4">
                {isInvite
                  ? "Your password is set and your account is active."
                  : "Your password has been updated successfully."}
              </p>
              <p className="text-sm text-slate-500">
                {isInvite ? "Taking you to your portal..." : "Redirecting to login page..."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-white to-orange-50 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-amber-100 p-3 rounded-full">
              <Lock className="h-8 w-8 text-amber-600" />
            </div>
          </div>
          <CardTitle className="font-display text-2xl font-bold text-stone-900">
            {isInvite ? "Set Your Password" : "Reset Your Password"}
          </CardTitle>
          <CardDescription>
            {isInvite
              ? "Choose a password to activate your account"
              : "Enter your new password below"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                New Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="pl-10 pr-10"
                  required
                  minLength={8}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-slate-500">
                Must be at least 8 characters long
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="pl-10 pr-10"
                  required
                  minLength={8}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-95 hover:shadow-lg hover:shadow-amber-500/25 text-white font-semibold"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Updating Password...
                </>
              ) : (
                "Reset Password"
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <Link
              href="/auth/login"
              className="text-sm text-amber-700 hover:text-amber-800 hover:underline"
            >
              ← Back to Login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}