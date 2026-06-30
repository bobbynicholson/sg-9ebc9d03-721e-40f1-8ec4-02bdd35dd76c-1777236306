import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, CheckCircle, DollarSign, AlertCircle, Loader2, X, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { isValidEmail, validateNewPassword } from "@/lib/validation/authValidation";
import { roleService } from "@/services/roleService";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { UserRole } from "@/types/app";
import { Reveal } from "@/components/motion/Reveal";
import { EASE, iconChip, Eyebrow } from "@/components/motion/marketing";

// Slug availability states surfaced to the UI.
type SlugAvailability =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available" }
  | { state: "invalid_format" }
  | { state: "reserved" }
  | { state: "taken" }
  | { state: "empty" };

/**
 * BUG FIX: Retry profile operations with exponential backoff
 * The database trigger creates profiles asynchronously, causing race conditions
 */
async function retryProfileOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 5,
  operationName: string = "operation"
): Promise<T> {
  let lastError: any = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await operation();
      if (result) {
        console.log(`✅ ${operationName} succeeded on attempt ${attempt + 1}`);
        return result;
      }
      
      if (attempt < maxRetries - 1) {
        const delay = Math.min(100 * Math.pow(2, attempt), 2000);
        console.log(`⏳ ${operationName} returned null, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    } catch (error) {
      lastError = error;
      console.error(`❌ ${operationName} failed (attempt ${attempt + 1}/${maxRetries}):`, error);
      
      if (attempt < maxRetries - 1) {
        const delay = Math.min(100 * Math.pow(2, attempt), 2000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error(`${operationName} failed after ${maxRetries} attempts`);
}

const CURRENCIES = [
  { code: "ZAR", name: "South African Rand", symbol: "R" },
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" }
];

export default function CompanySignupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    companyName: "",
    ownerName: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    currency: "ZAR",
    customSlug: "" // Required, locked permanently after submit
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  // True when Supabase is configured to require email confirmation. We
  // detect this from a missing session after signUp + a failed auto-login,
  // and use it to show a "check your inbox" success state instead of a
  // misleading "you're logged in" - the latter sends users into routes
  // that 401 because they haven't verified yet.
  const [emailVerificationRequired, setEmailVerificationRequired] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [resendStatus, setResendStatus] = useState<"idle" | "sent" | "error">("idle");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugAvailability, setSlugAvailability] =
    useState<SlugAvailability>({ state: "idle" });

  // Block already-signed-in users from the public owner self-signup.
  // This page calls supabase.auth.signUp, which replaces the current
  // browser session with the brand-new owner's - a footgun an admin can
  // trigger just by opening it while logged in (they "become" the new
  // owner). Bounce them to their own area; a super_admin who wants to
  // create a company FOR someone else should use Platform -> Company
  // Database, which provisions via the service role and never touches
  // their session.
  const [checkingSession, setCheckingSession] = useState(true);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!cancelled && user) {
          router.replace("/");
          return;
        }
      } catch { /* treat as logged-out and show the form */ }
      if (!cancelled) setCheckingSession(false);
    })();
    return () => { cancelled = true; };
  }, [router]);

  // Live availability check via the SECURITY DEFINER RPC. Debounced so
  // we aren't pinging on every keystroke. The RPC returns only a
  // boolean + reason code - it never reveals which company holds a
  // taken slug.
  useEffect(() => {
    if (!formData.customSlug) {
      setSlugAvailability({ state: "idle" });
      return;
    }
    setSlugAvailability({ state: "checking" });
    const handle = setTimeout(async () => {
      try {
        // Cast to any: the auto-generated Supabase types don't yet
        // include the new is_company_slug_available RPC.
        const { data, error: rpcError } = await (supabase.rpc as any)(
          "is_company_slug_available",
          { p_slug: formData.customSlug },
        );
        if (rpcError) {
          // Don't block submission on a transient RPC failure --
          // server-side validation is the source of truth.
          setSlugAvailability({ state: "idle" });
          return;
        }
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) {
          setSlugAvailability({ state: "idle" });
          return;
        }
        if (row.available) {
          setSlugAvailability({ state: "available" });
        } else {
          const reason = (row.reason as string) || "invalid_format";
          if (
            reason === "taken" ||
            reason === "reserved" ||
            reason === "invalid_format" ||
            reason === "empty"
          ) {
            setSlugAvailability({ state: reason as any });
          } else {
            setSlugAvailability({ state: "invalid_format" });
          }
        }
      } catch {
        setSlugAvailability({ state: "idle" });
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [formData.customSlug]);

  const slugMessage = (() => {
    switch (slugAvailability.state) {
      case "checking":
        return { tone: "neutral" as const, text: "Checking availability..." };
      case "available":
        return { tone: "good" as const, text: "Available, this will be your permanent URL." };
      case "taken":
        return { tone: "bad" as const, text: "Already taken. Pick a different one." };
      case "reserved":
        return { tone: "bad" as const, text: "Reserved word. Pick something unique to your business." };
      case "invalid_format":
        return {
          tone: "bad" as const,
          text: "Use lowercase letters, numbers and hyphens only. 1-80 chars, no leading or trailing hyphen.",
        };
      case "empty":
        return { tone: "bad" as const, text: "Slug is required." };
      default:
        return null;
    }
  })();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Collect EVERY validation problem in one pass and summarise them
    // together, so the operator fixes everything at once instead of
    // resubmitting to discover the next error one at a time.
    const problems: string[] = [];
    if (!formData.companyName) problems.push("Enter your company name.");
    if (!formData.ownerName) problems.push("Enter the owner / contact name.");
    if (!formData.email) {
      problems.push("Enter an email address.");
    } else if (!isValidEmail(formData.email)) {
      problems.push("Enter a valid email address (e.g. name@company.co.za).");
    }
    if (!formData.phone) problems.push("Enter a phone number.");
    if (!formData.currency) problems.push("Pick a currency.");
    if (!formData.customSlug) {
      problems.push("Choose your company URL - this is your permanent web address.");
    } else if (slugAvailability.state === "checking") {
      problems.push("Hang on - we're still checking if your company URL is available.");
    } else if (slugAvailability.state !== "available") {
      problems.push("That company URL isn't available. Pick one that shows the green tick.");
    }
    if (!formData.password) {
      problems.push("Enter a password.");
    } else {
      const pwIssue = validateNewPassword(formData.password);
      if (pwIssue) problems.push(pwIssue);
    }
    if (formData.password && formData.password !== formData.confirmPassword) {
      problems.push("The two passwords don't match.");
    }

    if (problems.length > 0) {
      setError(problems.join("\n"));
      setLoading(false);
      // Scroll the summary into view so it's never missed below the fold.
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    let userId: string | null = null;
    let companyId: string | null = null;

    try {
      console.log("🚀 Starting company registration process...");

      // Step 1: Create auth user
      console.log("📝 Step 1: Creating auth user...");
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            full_name: formData.ownerName,
            // Company owners get the full company_admin role (admin is the
            // restricted, no-finance role intended for delegated managers).
            role: "company_admin",
            currency: formData.currency,
            phone_number: formData.phone,
            company_name: formData.companyName
          }
        }
      });

      if (signUpError) {
        console.error("❌ Signup error:", signUpError);
        
        if (signUpError.message.includes("already registered") || signUpError.message.includes("already exists")) {
          setError("An account with this email already exists. Please use a different email or try logging in.");
        } else if (signUpError.message.includes("email") && signUpError.message.includes("confirm")) {
          setError("Email confirmation is required. Please check your email inbox and verify your account before logging in.");
        } else {
          setError(signUpError.message);
        }
        setLoading(false);
        return;
      }

      if (!authData.user) {
        setError("Failed to create user account. Please try again.");
        setLoading(false);
        return;
      }

      userId = authData.user.id;
      console.log("✅ User created:", userId);

      // Step 2: Wait for profile to be created by database trigger (with retry)
      console.log("⏳ Step 2: Waiting for profile creation...");
      try {
        await retryProfileOperation(
          async () => {
            const { data: profileCheck, error: profileError } = await supabase
              .from("profiles")
              .select("id")
              .eq("id", userId)
              .maybeSingle();
            
            if (profileError) throw profileError;
            return profileCheck;
          },
          5,
          "Profile verification"
        );
        console.log("✅ Profile exists and verified");
      } catch (profileError) {
        console.error("❌ Profile verification failed:", profileError);
        setError("Account created but profile setup failed. Please contact support with your email address.");
        setLoading(false);
        return;
      }

      // Step 3: Create company + link profile + seed region, server-side.
      // This MUST run on the server with the service role: when email
      // confirmation is enabled, signUp returns no session, so a
      // browser-side insert runs as the anon role and the companies
      // INSERT policy (TO authenticated, owner_id = auth.uid()) rejects
      // it with "new row violates row-level security policy for table
      // companies". The route hard-binds owner_id to our verified userId.
      // The slug is permanent - trg_companies_slug_immutable blocks any
      // later change, and it becomes part of every URL the tenant sees.
      console.log("🏢 Step 3: Provisioning company (server-side)...");
      const companySlug = formData.customSlug;

      const provisionRes = await fetch("/api/auth/provision-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          email: formData.email,
          companyName: formData.companyName,
          slug: companySlug,
          currency: formData.currency,
          phone: formData.phone,
          ownerName: formData.ownerName,
        }),
      });
      const provisionJson = await provisionRes.json().catch(() => ({}));

      if (!provisionRes.ok || !provisionJson?.ok || !provisionJson?.company) {
        console.error("❌ Company provisioning failed:", provisionJson?.error);
        setError(provisionJson?.error || "Failed to create company. Please contact support.");
        setLoading(false);
        return;
      }

      companyId = provisionJson.company.id;
      console.log("✅ Company created + profile linked:", companyId);
      if (provisionJson.profileLinked === false) {
        console.warn("⚠️ Profile link reported incomplete; will reconcile on first login.");
      }

      // Step 5: Assign company_admin role (non-blocking)
      console.log("👤 Step 5: Assigning company_admin role...");
      try {
        await roleService.assignRole(userId, UserRole.COMPANY_ADMIN, userId, true);
        console.log("✅ Company admin role assigned");
      } catch (roleError) {
        console.warn("⚠️ Company admin role assignment failed (non-critical):", roleError);
      }

      // Fire-and-forget the branded owner welcome email. Doesn't block
      // signup completion - if Resend / SMTP isn't configured the API
      // simulates and logs, and the user still progresses.
      console.log("📧 Firing owner welcome email...");
      void fetch("/api/emails/owner-welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          companyId,
          ownerName: formData.ownerName,
          companyName: formData.companyName,
          email: formData.email,
          slug: companySlug,
        }),
      }).catch((err) => console.warn("Owner welcome email fire-and-forget failed:", err));

      // Step 6: Attempt auto-login. Detect email-verification-required
      // state from either:
      //   a) signUp came back without a session (Supabase's signal that
      //      email confirmation is enabled), or
      //   b) signInWithPassword fails with an email-confirmation error.
      // When we hit either, render the inbox-check success state instead
      // of pretending the user is already in.
      console.log("🔐 Step 6: Attempting auto-login...");
      let verificationRequired = !authData.session;
      if (!verificationRequired) {
        try {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: formData.email,
            password: formData.password
          });

          if (signInError) {
            console.warn("⚠️ Auto-login failed:", signInError);
            const msg = signInError.message.toLowerCase();
            if (msg.includes("email") && (msg.includes("confirm") || msg.includes("verif"))) {
              console.log("📧 Email confirmation required");
              verificationRequired = true;
            }
          } else {
            console.log("✅ User auto-logged in");
          }
        } catch (loginError) {
          console.warn("⚠️ Auto-login error:", loginError);
        }
      } else {
        console.log("📧 No session returned from signUp - email verification required");
      }
      setEmailVerificationRequired(verificationRequired);

      // Step 7: Show success page
      console.log("🎉 Step 7: Registration complete!");
      setSuccess(true);

    } catch (err) {
      console.error("💥 Unexpected registration error:", err);
      
      let errorMessage = "Registration failed. ";
      
      if (userId && !companyId) {
        errorMessage += "Your account was created but company setup failed. Please contact support with your email address.";
      } else if (userId && companyId) {
        errorMessage += "Your company was created but there was an issue with the final setup. Please try logging in or contact support.";
      } else {
        errorMessage += "Please try again or contact support if the problem persists.";
      }
      
      setError(errorMessage);
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Loader2 className="w-7 h-7 animate-spin text-slate-400" />
      </div>
    );
  }

  if (success) {
    // Two flavours of success: actually-logged-in vs verify-your-email.
    // The branch below renders both from the same card so the layout is
    // identical - only the copy + buttons differ.
    return (
      <AuthShell
        headline="Welcome aboard."
        subcopy="Your catering business is set up - let's get your first event in the door."
      >
        <Reveal className="w-full max-w-xl">
        <Card className="w-full border border-slate-200/80 shadow-xl rounded-2xl">
          <CardContent className="p-8 md:p-12">
            <div className="text-center mb-8">
              <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center shadow-lg mb-6 ${
                emailVerificationRequired
                  ? "bg-gradient-to-br from-amber-500 to-orange-500"
                  : "bg-gradient-to-br from-brand-primary to-brand-secondary animate-pulse"
              }`}>
                <CheckCircle className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                {emailVerificationRequired
                  ? "Almost there - check your inbox"
                  : "Welcome to CateringMS"}
              </h2>
              <p className="text-lg text-slate-600 mb-2">
                <strong>{formData.companyName}</strong> is registered.
              </p>
              <p className="text-sm text-slate-500">
                {emailVerificationRequired
                  ? <>We sent a confirmation link to <strong>{formData.email}</strong>. Click it to activate your login, then sign in.</>
                  : "Your account is ready and you're signed in."}
              </p>
            </div>

            {!emailVerificationRequired && (
              <div className="space-y-4 mb-8">
                <h3 className="text-lg font-semibold text-slate-900">What's next</h3>
                <div className="space-y-3">
                  {[
                    { n: "1", title: "Complete your onboarding", body: "Set up your company profile and preferences" },
                    { n: "2", title: "Invite your team", body: "Add drivers, kitchen staff, and other team members" },
                    { n: "3", title: "Start managing orders", body: "Create your first quote or order" },
                  ].map((step) => (
                    <div key={step.n} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5">
                      <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-amber-100">
                        <span className="text-sm font-bold text-amber-700">{step.n}</span>
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{step.title}</p>
                        <p className="text-sm text-slate-600">{step.body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {emailVerificationRequired && (
              <div className="space-y-4 mb-8">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-2">
                  <p className="font-medium text-slate-900">Didn't get the email?</p>
                  <ul className="text-sm text-slate-700 space-y-1 list-disc list-inside">
                    <li>Give it a minute - delivery isn't always instant</li>
                    <li>Check your spam / junk folder</li>
                    <li>Confirm <strong>{formData.email}</strong> is the right address</li>
                  </ul>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    disabled={resendingEmail || resendStatus === "sent"}
                    onClick={async () => {
                      setResendingEmail(true);
                      setResendStatus("idle");
                      try {
                        const { error: resendError } = await supabase.auth.resend({
                          type: "signup",
                          email: formData.email,
                        });
                        setResendStatus(resendError ? "error" : "sent");
                      } catch {
                        setResendStatus("error");
                      } finally {
                        setResendingEmail(false);
                      }
                    }}
                  >
                    {resendingEmail
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Resending...</>
                      : resendStatus === "sent"
                        ? "Sent - check your inbox"
                        : "Resend confirmation email"}
                  </Button>
                  {resendStatus === "error" && (
                    <p className="text-sm text-rose-600 mt-2">Couldn't resend right now. Try again in a minute or contact support.</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4">
              {emailVerificationRequired ? (
                <Button
                  size="lg"
                  className="h-12 flex-1 bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/25 hover:opacity-95 hover:shadow-xl"
                  onClick={() => router.push(`/${formData.customSlug}/login`)}
                >
                  Go to login
                </Button>
              ) : (
                <>
                  <Button
                    size="lg"
                    className="h-12 flex-1 bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-amber-500/25 hover:opacity-95 hover:shadow-xl"
                    onClick={() => router.push(`/${formData.customSlug}/admin/onboarding`)}
                  >
                    Start onboarding
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="flex-1 h-12"
                    onClick={() => router.push(`/${formData.customSlug}/admin/dashboard`)}
                  >
                    Go to dashboard
                  </Button>
                </>
              )}
            </div>

            <div className="mt-6 text-center">
              <p className="text-sm text-slate-500">
                Need help? Contact us at{" "}
                <a href="tel:+27836525755" className="font-medium text-amber-700 underline-offset-2 hover:text-amber-800 hover:underline">
                  083 652 5755
                </a>
              </p>
            </div>
          </CardContent>
        </Card>
        </Reveal>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      headline="Grow your catering business."
      subcopy="Set up your company in minutes - quotes, kitchen, delivery and payments, all in one place."
    >
      <Card className="group w-full max-w-xl rounded-2xl border border-slate-200/80 shadow-xl">
        <CardHeader className="space-y-3">
          <Reveal className="flex flex-col items-center space-y-3">
            <span className="mb-1">
              <Eyebrow icon={ShieldCheck} className="border-amber-200 bg-amber-50 text-amber-700">
                Free trial · No credit card
              </Eyebrow>
            </span>
            <div className={`${iconChip} h-14 w-14 bg-gradient-to-br from-amber-500 to-orange-500`}>
              <Building2 className="h-7 w-7 text-white" />
            </div>
            <CardTitle className="text-center text-2xl font-bold tracking-tight text-slate-900">
              Register your catering business
            </CardTitle>
            <CardDescription className="text-center text-sm text-slate-600">
              Join CateringMS and transform how you manage your operations
            </CardDescription>
          </Reveal>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="space-y-6">
            {error && (() => {
              // error may carry several newline-separated problems -
              // render a summary header + bulleted list so the operator
              // sees everything to fix at a glance. A single error
              // renders as one plain line.
              const lines = error.split("\n").filter(Boolean);
              return (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {lines.length > 1 ? (
                      <>
                        <p className="font-semibold mb-1">
                          Please fix {lines.length} {lines.length === 1 ? "thing" : "things"} before continuing:
                        </p>
                        <ul className="list-disc list-inside space-y-0.5">
                          {lines.map((l, i) => <li key={i}>{l}</li>)}
                        </ul>
                      </>
                    ) : (
                      lines[0]
                    )}
                  </AlertDescription>
                </Alert>
              );
            })()}

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm text-amber-900">
                <strong>For Catering Companies Only:</strong> This form is for catering businesses to register their company. If you're an employee or client, please use the regular registration link provided by your company.
              </p>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-slate-900">Company Information</h3>
              
              <div className="space-y-2">
                <Label htmlFor="companyName" className="text-slate-700 font-medium">
                  Company Name *
                </Label>
                <Input
                  id="companyName"
                  type="text"
                  placeholder="Spit Braai Delivery"
                  value={formData.companyName}
                  onChange={(e) => {
                    const newName = e.target.value;
                    // Auto-suggest a slug from the company name only while
                    // the user hasn't manually edited the slug field. The
                    // slug-touched flag stops us clobbering their choice.
                    if (!slugTouched) {
                      const autoSlug = newName
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                        .replace(/-+/g, "-")
                        .replace(/^-+|-+$/g, "");
                      setFormData((prev) => ({
                        ...prev,
                        companyName: newName,
                        customSlug: autoSlug,
                      }));
                    } else {
                      setFormData((prev) => ({ ...prev, companyName: newName }));
                    }
                  }}
                  className="h-12"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="customSlug" className="text-slate-700 font-medium">
                  Your Permanent Company URL *
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-3 text-sm text-slate-500 select-none">
                    cateringms.com/
                  </span>
                  <Input
                    id="customSlug"
                    type="text"
                    placeholder="spit-braai-delivery"
                    value={formData.customSlug}
                    onChange={(e) => {
                      // Lowercase, allow only a-z 0-9 and single hyphens.
                      // Strip leading hyphens; collapse runs of hyphens.
                      const slug = e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, "")
                        .replace(/-+/g, "-")
                        .replace(/^-+/, "");
                      setFormData({ ...formData, customSlug: slug });
                      setSlugTouched(true);
                    }}
                    onBlur={() => {
                      // Strip trailing hyphen on blur for cleanliness.
                      setFormData((prev) => ({
                        ...prev,
                        customSlug: prev.customSlug.replace(/-+$/, ""),
                      }));
                    }}
                    className="h-12 pl-[8.25rem] pr-10"
                    required
                  />
                  {/* Status indicator */}
                  {slugTouched && (
                    <div className="absolute right-3 top-3">
                      {slugAvailability.state === "checking" && (
                        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                      )}
                      {slugAvailability.state === "available" && (
                        <CheckCircle className="w-5 h-5 text-brand-primary" />
                      )}
                      {(slugAvailability.state === "taken" ||
                        slugAvailability.state === "reserved" ||
                        slugAvailability.state === "invalid_format" ||
                        slugAvailability.state === "empty") && (
                        <X className="w-5 h-5 text-rose-500" />
                      )}
                    </div>
                  )}
                </div>
                {slugTouched && slugMessage && (
                  <p
                    className={`text-xs ${
                      slugMessage.tone === "good"
                        ? "text-brand-primary"
                        : slugMessage.tone === "bad"
                        ? "text-rose-600"
                        : "text-slate-500"
                    }`}
                  >
                    {slugMessage.text}
                  </p>
                )}
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 leading-relaxed">
                  <strong>Permanent.</strong> This URL is locked once your
                  account is created, it appears in every link you'll
                  ever send to clients (booking confirmations, invoices,
                  the customer portal). Pick something short, on-brand,
                  and easy to type.
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency" className="text-slate-700 font-medium flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Business Currency *
                </Label>
                <Select
                  value={formData.currency}
                  onValueChange={(value) => setFormData({ ...formData, currency: value })}
                >
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Select your currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((currency) => (
                      <SelectItem key={currency.code} value={currency.code}>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{currency.symbol}</span>
                          <span>{currency.name} ({currency.code})</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-slate-900">Owner Information</h3>

              <div className="space-y-2">
                <Label htmlFor="ownerName" className="text-slate-700 font-medium">
                  Your Full Name *
                </Label>
                <Input
                  id="ownerName"
                  type="text"
                  placeholder="John Doe"
                  value={formData.ownerName}
                  onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                  className="h-12"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-700 font-medium">
                  Email Address *
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="owner@yourcompany.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="h-12"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="text-slate-700 font-medium">
                  Phone Number *
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+27 12 345 6789"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="h-12"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-700 font-medium">
                  Password *
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Min 8 chars, with a letter & a number"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="h-12"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-slate-700 font-medium">
                  Confirm Password *
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Re-enter your password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className="h-12"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              className={`h-12 w-full bg-gradient-to-r from-amber-500 to-orange-600 font-semibold text-white shadow-lg shadow-amber-500/25 transition-[opacity,box-shadow] duration-200 ${EASE} hover:opacity-95 hover:shadow-xl hover:shadow-amber-500/30`}
              // Block submit until the chosen slug is available.
              // Server-side trigger is the source of truth, but the
              // disabled state stops a wasted round-trip.
              disabled={
                loading ||
                slugAvailability.state === "checking" ||
                (formData.customSlug.length > 0 && slugAvailability.state !== "available")
              }
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Creating your company...
                </>
              ) : (
                "Register company"
              )}
            </Button>

            {/* Terms agreement - registering = acceptance. Links to the
                real /terms and /privacy pages (both ship in the app). */}
            <p className="text-center text-xs leading-relaxed text-slate-400">
              By registering you agree to our{" "}
              <Link href="/terms" className="font-medium text-amber-700 underline-offset-2 hover:text-amber-800 hover:underline">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="font-medium text-amber-700 underline-offset-2 hover:text-amber-800 hover:underline">
                Privacy Policy
              </Link>.
            </p>

            <div className="border-t border-slate-100 pt-2 text-center">
              <p className="mt-3 text-sm text-slate-500">
                Already have an account?{" "}
                <Link href="/auth/login" className="font-medium text-amber-700 underline-offset-2 hover:text-amber-800 hover:underline">
                  Sign in
                </Link>
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
