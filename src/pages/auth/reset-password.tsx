import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { supabase } from "@/integrations/supabase/client";
import { authService } from "@/services/authService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye, EyeOff, Lock, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";

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
  const [canSetPassword, setCanSetPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [invalidInvite, setInvalidInvite] = useState(false);
  const initialUrlRef = useRef<string | null>(null);
  const processedUrlRef = useRef<string | null>(null);
  if (initialUrlRef.current === null && typeof window !== "undefined") {
    initialUrlRef.current = window.location.href;
  }
  // Staff-invite mode: the link is /auth/reset-password?invite=1, sent
  // when an admin adds a new staff member. Same set-password mechanic,
  // but invite-flavoured copy and a straight-into-the-app redirect.
  const [isInvite, setIsInvite] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    const currentUrl = initialUrlRef.current || (typeof window !== "undefined" ? window.location.href : "");
    if (processedUrlRef.current === currentUrl) return;
    processedUrlRef.current = currentUrl;

    const establish = async () => {
      try {
        if (typeof window !== "undefined") {
          // Capture callback details from the first render. The app-level
          // auth provider may finish URL detection before this effect runs.
          const url = new URL(currentUrl);
          const hashParams = new URLSearchParams(url.hash.slice(1));
          const invite = router.query.invite === "1" || router.query.type === "invite" || hashParams.get("type") === "invite";
          setIsInvite(invite);
          if (router.query.request === "1" && !invite) {
            setCanSetPassword(false);
            setInvalidInvite(false);
            setValidatingSession(false);
            return;
          }
          const accessToken = hashParams.get("access_token") || "";
          const refreshToken = hashParams.get("refresh_token") || "";
          const tokenHash = url.searchParams.get("token_hash") || "";
          const code = url.searchParams.get("code") || "";
          const authFlow = router.query.auth_flow;
          const callbackType = url.searchParams.get("type") || hashParams.get("type") || router.query.type;
          const tokenHashType = authFlow === "invite" || authFlow === "recovery"
            ? authFlow
            : callbackType === "invite" || callbackType === "recovery"
              ? callbackType
              : invite ? "invite" : "recovery";
          const hasAuthCallback = Boolean(accessToken || refreshToken || tokenHash || code);

          if (hashParams.has("error") || hashParams.has("error_description")) {
            const desc =
              hashParams.get("error_description") ||
              hashParams.get("error") ||
              "This link could not be used.";
            setError(`${desc} Please request a new link.`);
            setInvalidInvite(invite);
            setCanSetPassword(false);
            setValidatingSession(false);
            window.history.replaceState(null, "", url.pathname + url.search);
            return;
          }

          // createBrowserClient automatically detects PKCE codes from the URL.
          // Wait for that initialization to finish before attempting any
          // fallback; otherwise a valid one-time code can be exchanged twice.
          await supabase.auth.getSession();

          // The browser client handles PKCE links itself. Hash-style links are
          // rejected by our PKCE client, so seed those only if they remain in
          // the URL after initialization.
          const urlAfterInit = new URL(window.location.href);
          const hashAfterInit = new URLSearchParams(urlAfterInit.hash.slice(1));
          const pendingAccessToken = hashAfterInit.get("access_token") || "";
          const pendingRefreshToken = hashAfterInit.get("refresh_token") || "";
          if (pendingAccessToken && pendingRefreshToken) {
            const { error: setErr } = await supabase.auth.setSession({
              access_token: pendingAccessToken,
              refresh_token: pendingRefreshToken,
            });
            if (setErr) {
              setError("This link has expired. Request a new password reset link.");
              setInvalidInvite(invite);
              setCanSetPassword(false);
              setValidatingSession(false);
              return;
            }
            window.history.replaceState(null, "", urlAfterInit.pathname + urlAfterInit.search);
          }

          if (tokenHash) {
            const { error: verifyError } = await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: tokenHashType,
            });
            if (verifyError) {
              setError("This link has expired. Request a new password reset link.");
              setInvalidInvite(invite);
              setCanSetPassword(false);
              setValidatingSession(false);
              return;
            }
            const urlAfterVerify = new URL(window.location.href);
            urlAfterVerify.searchParams.delete("token_hash");
            window.history.replaceState(null, "", urlAfterVerify.pathname + urlAfterVerify.search + urlAfterVerify.hash);
          }

          // A successful automatic PKCE exchange removes `code` from the
          // address bar. Only retry if the code is still pending.
          const pendingCodeUrl = new URL(window.location.href);
          const pendingCode = pendingCodeUrl.searchParams.get("code");
          if (pendingCode) {
            const { error: exErr } = await supabase.auth.exchangeCodeForSession(pendingCode);
            if (exErr) {
              setError("This link has expired. Request a new password reset link.");
              setInvalidInvite(invite);
              setCanSetPassword(false);
              setValidatingSession(false);
              return;
            }
            pendingCodeUrl.searchParams.delete("code");
            window.history.replaceState(null, "", pendingCodeUrl.pathname + pendingCodeUrl.search + pendingCodeUrl.hash);
          }

          const { data: { session } } = await supabase.auth.getSession();
          if (!session) {
            setCanSetPassword(false);
            setInvalidInvite(invite);
            setError(invite
              ? "This invite link is invalid or has expired. Ask your administrator to resend it."
              : hasAuthCallback
                ? "This reset link is invalid or has expired. Enter your email below to request a new one."
                : "");
            setValidatingSession(false);
            return;
          }
          setCanSetPassword(true);
          setInvalidInvite(false);
          setValidatingSession(false);
        }
      } catch (err) {
        console.error("Session check error:", err);
        setError("Failed to validate the link. Please try again.");
        setCanSetPassword(false);
        setValidatingSession(false);
      }
    };

    void establish();
  }, [router.isReady, router.asPath, router.query.auth_flow, router.query.invite, router.query.request, router.query.type]);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setRequestLoading(true);
    try {
      const { error: requestError } = await authService.resetPasswordForEmail(resetEmail.trim());
      if (requestError) throw requestError;
      setRequestSent(true);
    } catch (err: any) {
      setError(err?.message || "Could not send a reset link. Please try again.");
    } finally {
      setRequestLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSetPassword) return;
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
      const { data: updatedAuth, error: updateError } = await supabase.auth.updateUser({
        password: password
      });

      if (updateError) {
        throw updateError;
      }

      if (isInvite && updatedAuth.user) {
        const { error: invitationError } = await supabase.from("staff_invitations")
          .update({ status: "accepted" }).eq("user_id", updatedAuth.user.id).eq("status", "pending");
        if (invitationError) console.warn("Could not mark portal invitation accepted:", invitationError);
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
      const missingSession = err?.name === "AuthSessionMissingError" || /auth session missing/i.test(err?.message || "");
      if (missingSession) {
        setCanSetPassword(false);
        setInvalidInvite(isInvite);
        setPassword("");
        setConfirmPassword("");
        setError(isInvite
          ? "This invite link has expired or lost its session. Ask your administrator to resend it."
          : "Your reset link has expired. Enter your email below to request another one.");
      } else {
        setError(err.message || "Failed to reset password. Please try again.");
      }
      setLoading(false);
    }
  };

  if (validatingSession) {
    return (
      <AuthShell headline="Secure account access." subcopy="We are validating your reset or invite link before showing the password form.">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mb-4"></div>
              <p className="text-slate-600">Validating reset link...</p>
            </div>
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  if (success) {
    return (
      <AuthShell headline="Your account is ready." subcopy="Your password was updated successfully.">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center py-8">
              <CheckCircle2 className="h-16 w-16 text-brand-primary mb-4" />
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
      </AuthShell>
    );
  }

  if (invalidInvite) {
    return (
      <AuthShell headline="Invitation link unavailable." subcopy="This link needs to be resent before you can set a password.">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="font-display text-2xl font-bold text-stone-900">Invite link expired</CardTitle>
            <CardDescription>Ask your administrator to resend your staff invitation, then open the new link from that message.</CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Link href="/auth/login" className="block text-center text-sm text-amber-700 hover:text-amber-800 hover:underline">
              Back to Login
            </Link>
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  if (!canSetPassword) {
    return (
      <AuthShell headline="Recover account access." subcopy="We’ll email you a secure link to choose a new password.">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <div className="bg-amber-100 p-3 rounded-full">
                <Lock className="h-8 w-8 text-amber-600" />
              </div>
            </div>
            <CardTitle className="font-display text-2xl font-bold text-stone-900">
              {requestSent ? "Check your email" : "Forgot your password?"}
            </CardTitle>
            <CardDescription>
              {requestSent
                ? "If an account uses that email, a password reset link is on its way."
                : "Enter the email address on your account and we’ll send a reset link."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {requestSent ? (
              <div className="flex flex-col items-center gap-4 py-2">
                <CheckCircle2 className="h-12 w-12 text-emerald-600" />
                <p className="text-center text-sm text-slate-600">The link will take you back here to set your new password.</p>
              </div>
            ) : (
              <form onSubmit={handleRequestReset} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="reset-email" className="text-sm font-medium text-slate-700">Email address</label>
                  <Input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    disabled={requestLoading}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:opacity-95 text-white font-semibold"
                  disabled={requestLoading}
                >
                  {requestLoading ? "Sending reset link..." : "Send reset link"}
                </Button>
              </form>
            )}
            <div className="mt-6 text-center">
              <Link href="/auth/login" className="text-sm text-amber-700 hover:text-amber-800 hover:underline">
                Back to Login
              </Link>
            </div>
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  return (
    <AuthShell headline="Set a secure password." subcopy="Use the form to finish account setup or recover access.">
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
    </AuthShell>
  );
}
