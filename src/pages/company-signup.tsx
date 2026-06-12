import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, CheckCircle, DollarSign, AlertCircle, Loader2, X } from "lucide-react";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { companyService } from "@/services/companyService";
import { roleService } from "@/services/roleService";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { UserRole } from "@/types/app";

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

    // Validation
    if (!formData.companyName || !formData.ownerName || !formData.email || !formData.phone || !formData.password || !formData.currency) {
      setError("Please fill in all required fields");
      setLoading(false);
      return;
    }

    if (!formData.customSlug) {
      setError("A custom URL is required. This is your permanent company URL.");
      setLoading(false);
      return;
    }

    if (slugAvailability.state !== "available") {
      setError("Your custom URL isn't available yet. Pick one that shows the green tick before submitting.");
      setLoading(false);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters long");
      setLoading(false);
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

      // Step 3: Create company record.
      // The slug here is permanent - the trigger
      // trg_companies_slug_immutable rejects any later UPDATE that
      // tries to change it, and the slug becomes part of every URL the
      // tenant will ever see.
      console.log("🏢 Step 3: Creating company record...");
      const companySlug = formData.customSlug;
      
      const companyResult = await companyService.createCompany({
        name: formData.companyName,
        owner_id: userId,
        currency: formData.currency,
        phone: formData.phone,
        email: formData.email,
        company_slug: companySlug,
      });

      if (!companyResult.success || !companyResult.company) {
        console.error("❌ Company creation failed:", companyResult.error);
        setError(companyResult.error || "Failed to create company. Please contact support.");
        setLoading(false);
        return;
      }

      companyId = companyResult.company.id;
      console.log("✅ Company created:", companyId);

      // Step 4: Link profile to company (with retry)
      console.log("🔗 Step 4: Linking profile to company...");
      try {
        await retryProfileOperation(
          async () => {
            const { data: updateResult, error: profileUpdateError } = await supabase
              .from("profiles")
              .update({
                company_id: companyId,
                role: "company_admin",
                active_role: "company_admin",
                full_name: formData.ownerName,
                phone: formData.phone,
              })
              .eq("id", userId)
              .select()
              .single();

            if (profileUpdateError) throw profileUpdateError;
            return updateResult;
          },
          5,
          "Profile company linkage"
        );
        console.log("✅ Profile linked to company");
      } catch (linkError) {
        console.error("❌ Profile linking failed:", linkError);
        setError("Company created but failed to link your account. Please contact support.");
        setLoading(false);
        return;
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

  if (success) {
    // Two flavours of success: actually-logged-in vs verify-your-email.
    // The branch below renders both from the same card so the layout is
    // identical - only the copy + buttons differ.
    return (
      <AuthShell
        headline="Welcome aboard."
        subcopy="Your catering business is set up — let's get your first event in the door."
      >
        <Card className="w-full max-w-xl border border-slate-200/80 shadow-xl rounded-2xl">
          <CardContent className="p-8 md:p-12">
            <div className="text-center mb-8">
              <div className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center shadow-lg mb-6 ${
                emailVerificationRequired
                  ? "bg-gradient-to-br from-amber-500 to-orange-500"
                  : "bg-gradient-to-br from-green-500 to-emerald-500 animate-pulse"
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
                  <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-slate-200">
                    <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-sm font-bold text-purple-600">1</span>
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">Complete your onboarding</p>
                      <p className="text-sm text-slate-600">Set up your company profile and preferences</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-slate-200">
                    <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-sm font-bold text-purple-600">2</span>
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">Invite your team</p>
                      <p className="text-sm text-slate-600">Add drivers, kitchen staff, and other team members</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-white rounded-lg border border-slate-200">
                    <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-sm font-bold text-purple-600">3</span>
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">Start managing orders</p>
                      <p className="text-sm text-slate-600">Create your first quote or order</p>
                    </div>
                  </div>
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
                  className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 text-white h-12"
                  onClick={() => router.push(`/${formData.customSlug}/login`)}
                >
                  Go to login
                </Button>
              ) : (
                <>
                  <Button
                    size="lg"
                    className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 text-white h-12"
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
                <a href="tel:+27836525755" className="text-purple-600 hover:text-purple-700 underline">
                  083 652 5755
                </a>
              </p>
            </div>
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      headline="Grow your catering business."
      subcopy="Set up your company in minutes — quotes, kitchen, delivery and payments, all in one place."
    >
      <Card className="w-full max-w-xl border border-slate-200/80 shadow-xl rounded-2xl">
        <CardHeader className="space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 mx-auto flex items-center justify-center shadow-lg">
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <CardTitle className="text-2xl font-bold text-center text-slate-900">
            Register your catering business
          </CardTitle>
          <CardDescription className="text-center text-slate-600 text-sm">
            Join CateringMS and transform how you manage your operations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
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
                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                      )}
                      {(slugAvailability.state === "taken" ||
                        slugAvailability.state === "reserved" ||
                        slugAvailability.state === "invalid_format" ||
                        slugAvailability.state === "empty") && (
                        <X className="w-5 h-5 text-red-500" />
                      )}
                    </div>
                  )}
                </div>
                {slugTouched && slugMessage && (
                  <p
                    className={`text-xs ${
                      slugMessage.tone === "good"
                        ? "text-emerald-600"
                        : slugMessage.tone === "bad"
                        ? "text-red-600"
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
                  placeholder="At least 6 characters"
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
              className="w-full h-12 bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90 transition-opacity text-white font-semibold"
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
            <p className="text-center text-xs text-slate-400 leading-relaxed">
              By registering you agree to our{" "}
              <Link href="/terms" className="text-purple-600 hover:text-purple-700 font-medium">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="text-purple-600 hover:text-purple-700 font-medium">
                Privacy Policy
              </Link>.
            </p>

            <div className="text-center pt-2 border-t border-slate-100">
              <p className="text-sm text-slate-500 mt-3">
                Already have an account?{" "}
                <Link href="/auth/login" className="text-purple-600 hover:text-purple-700 font-medium">
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
