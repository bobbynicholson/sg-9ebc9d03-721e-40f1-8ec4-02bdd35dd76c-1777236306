/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/onboarding - the step-by-step setup wizard.
 *
 * Where new caterers land. The middleware redirects any admin/owner
 * with `companies.onboarding_completed_at IS NULL` here, so this page
 * is the first thing they see after signing up. Walks them through the
 * settings that matter most to render quotes / invoices / portals
 * properly:
 *
 *   1. Welcome              - what's coming + skip option
 *   2. Company basics       - name, email, phone, registration
 *   3. Kitchen / HQ address - delivery distance source of truth
 *   4. Branding             - primary + secondary colour, logo
 *   5. Banking (optional)   - enables EFT on the client portal
 *   6. VAT registration     - drives "Tax Invoice" doc title
 *   7. Done                 - mark complete + go to dashboard
 *
 * Per-step persistence: every Save & continue writes the relevant
 * companies columns immediately. If the user leaves mid-flow,
 * onboarding_completed_at stays null so middleware brings them
 * back, and their previously-saved fields are pre-populated.
 *
 * Importable spreadsheet flow lives separately at
 * /admin/onboarding/imports (the audit trail) and /admin/onboarding/import
 * (the actual importer). The wizard surfaces a "Skip + bulk import"
 * link for caterers who already have data they want to upload first.
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, ArrowLeft, Check, Loader2, Building2, MapPin, Palette, Landmark, Receipt, Sparkles, FileSpreadsheet, ShieldCheck, Users, Upload, PlayCircle } from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { onboardingProgressService } from "@/services/onboardingProgressService";
import { ImportRecordsModal } from "@/components/admin/ImportRecordsModal";
import { ResendDomainCard } from "@/components/admin/ResendDomainCard";
import { captureException } from "@/lib/observability";

interface CompanyForm {
  // Basics
  company_name: string;
  legal_name: string;
  email: string;
  phone: string;
  website: string;
  registration_number: string;
  tax_number: string;

  // Address
  address_line1: string;
  address_line2: string;
  city: string;
  state_province: string;
  postal_code: string;
  country: string;
  headquarters_lat: number | null;
  headquarters_lng: number | null;

  // Branding
  primary_color: string;
  secondary_color: string;
  logo_url: string;

  // Banking
  bank_name: string;
  bank_account_holder: string;
  bank_account_number: string;
  bank_branch_code: string;
  bank_account_type: string;
  eft_instructions: string;

  // VAT
  vat_registered: boolean;
  vat_number: string;
  vat_rate: number;
}

const EMPTY_FORM: CompanyForm = {
  company_name: "", legal_name: "", email: "", phone: "", website: "",
  registration_number: "", tax_number: "",
  address_line1: "", address_line2: "", city: "", state_province: "",
  postal_code: "", country: "South Africa",
  headquarters_lat: null, headquarters_lng: null,
  primary_color: "#9333ea", secondary_color: "#ec4899", logo_url: "",
  bank_name: "", bank_account_holder: "", bank_account_number: "",
  bank_branch_code: "", bank_account_type: "", eft_instructions: "",
  vat_registered: false, vat_number: "", vat_rate: 15,
};

// Step ids in order. Centralised so the progress bar, breadcrumb,
// and back/next nav all read from the same array.
const STEPS = [
  { id: "welcome",  label: "Welcome",   icon: Sparkles },
  { id: "company",  label: "Business",  icon: Building2 },
  { id: "address",  label: "Address",   icon: MapPin },
  { id: "branding", label: "Branding",  icon: Palette },
  { id: "banking",  label: "Banking",   icon: Landmark },
  { id: "vat",      label: "VAT",       icon: Receipt },
  { id: "email",    label: "Email",     icon: ShieldCheck },
  { id: "clients",  label: "Clients",   icon: Users },
  { id: "done",     label: "Finish",    icon: Check },
] as const;

type StepId = typeof STEPS[number]["id"];

// ONB-B (task #217, 2026-05-25): pure helper - is this step's
// key data already present on the companies row?  Drives the
// completion checklist on the Welcome step + the resume-at-last-
// incomplete CTA. Welcome and Done are never marked complete (they
// have no persisted state of their own).
function isStepComplete(stepId: StepId, form: CompanyForm): boolean {
  switch (stepId) {
    case "company":  return !!(form.company_name.trim() && form.email.trim());
    case "address":  return !!(form.address_line1.trim() && form.city.trim());
    case "branding": return !!form.primary_color && form.primary_color !== "#9333ea";
    case "banking":  return !!form.bank_name.trim();
    case "vat":      return form.vat_registered ? !!form.vat_number.trim() : true; // not-registered is a real answer
    case "email":    return false; // tracked in email_provider_settings, not on the form
    case "clients":  return false; // tracked via clients table count, not on the form
    case "welcome":
    case "done":
    default:         return false;
  }
}

function OnboardingWizard() {
  const router = useRouter();
  const { user, profile, refreshProfile } = useAuth() as any;
  const { toast } = useToast();

  const companyId = profile?.company_id || user?.company_id;
  const slug = (user as any)?.company_slug || (profile as any)?.companies?.slug || "";

  const [step, setStep] = useState<StepId>("welcome");
  const [form, setForm] = useState<CompanyForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ONB-B: ?step=<id> deep-linking. Lets support / Settings link
  // straight into a specific step without forcing the operator
  // through the wizard from scratch. Only honoured for known step
  // ids and only on the first router-ready render so a manual
  // setStep() inside the wizard isn't overwritten.
  const [stepLinkApplied, setStepLinkApplied] = useState(false);
  useEffect(() => {
    if (stepLinkApplied || !router.isReady) return;
    const q = router.query.step;
    const candidate = Array.isArray(q) ? q[0] : q;
    if (!candidate) { setStepLinkApplied(true); return; }
    if (STEPS.some((s) => s.id === candidate)) {
      setStep(candidate as StepId);
    }
    setStepLinkApplied(true);
  }, [router.isReady, router.query.step, stepLinkApplied]);

  // Initial load: pre-populate the wizard with whatever's already on
  // the companies row (signup may have stamped name + email, and a
  // returning user mid-onboarding gets to pick up where they left off).
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("companies")
        .select("*")
        .eq("id", companyId)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        const r = data as any;
        setForm({
          company_name: r.company_name || "",
          legal_name: r.legal_name || "",
          email: r.email || "",
          phone: r.phone || "",
          website: r.website || "",
          registration_number: r.registration_number || "",
          tax_number: r.tax_number || "",
          address_line1: r.address_line1 || "",
          address_line2: r.address_line2 || "",
          city: r.city || "",
          state_province: r.state_province || "",
          postal_code: r.postal_code || "",
          country: r.country || "South Africa",
          headquarters_lat: r.headquarters_lat,
          headquarters_lng: r.headquarters_lng,
          primary_color: r.primary_color || "#9333ea",
          secondary_color: r.secondary_color || "#ec4899",
          logo_url: r.logo_url || "",
          bank_name: r.bank_name || "",
          bank_account_holder: r.bank_account_holder || "",
          bank_account_number: r.bank_account_number || "",
          bank_branch_code: r.bank_branch_code || "",
          bank_account_type: r.bank_account_type || "",
          eft_instructions: r.eft_instructions || "",
          vat_registered: !!r.vat_registered,
          vat_number: r.vat_number || "",
          vat_rate: r.vat_rate ?? 15,
        });
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  const stepIndex = useMemo(() => STEPS.findIndex((s) => s.id === step), [step]);
  const totalSteps = STEPS.length;
  const progressPct = Math.round(((stepIndex + 1) / totalSteps) * 100);

  // Each step's "Save & continue" only persists the slice of fields
  // it owns. Keeps the round-trip small and means a partial save can't
  // accidentally clobber a later step's data with stale values.
  //
  // ONB-B: success now emits a short "Saved" toast so the operator
  // gets a real ack instead of a silent re-render. Errors route
  // through captureException too so they show up in Sentry with the
  // step id tagged.
  const saveStep = async (patch: Partial<CompanyForm>, stepLabel?: string): Promise<boolean> => {
    if (!companyId) return false;
    setSaving(true);
    try {
      // The Supabase types are narrow on `companies` so we cast through
      // any - the columns we're writing all exist on the table.
      const { error } = await (supabase as any)
        .from("companies")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", companyId);
      if (error) throw error;
      refreshProfile?.();
      toast({
        title: stepLabel ? `${stepLabel} saved` : "Saved",
        description: "You can edit any of this later in Settings.",
      });
      return true;
    } catch (e: any) {
      captureException(e, {
        tags: { route: "/admin/onboarding", step: stepLabel || step, companyId: companyId || "" },
      });
      toast({
        title: "Couldn't save",
        description: e?.message || "Try again.",
        variant: "destructive",
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const goNext = () => {
    const nextIdx = stepIndex + 1;
    if (nextIdx < totalSteps) setStep(STEPS[nextIdx].id);
  };
  const goBack = () => {
    const prevIdx = stepIndex - 1;
    if (prevIdx >= 0) setStep(STEPS[prevIdx].id);
  };

  const finalizeAndExit = async () => {
    if (!companyId) return;
    setSaving(true);
    const { error } = await onboardingProgressService.markComplete(companyId);
    setSaving(false);
    if (error) {
      captureException(new Error(error), {
        tags: { route: "/admin/onboarding", step: "finalize", companyId },
      });
      toast({
        title: "Couldn't finish setup",
        description: error,
        variant: "destructive",
      });
      return;
    }
    refreshProfile?.();
    router.push(slug ? `/${slug}/admin/dashboard` : "/admin/dashboard");
  };

  // ONB-B: "Skip the wizard" path now confirms first. Pre-fix one
  // mis-tap on the small underlined link silently dropped the
  // operator onto the dashboard with onboarding_completed_at set
  // and no data captured. The hurdle is one extra OK to stop that.
  const skipWizardWithConfirm = () => {
    if (!window.confirm(
      "Skip the setup wizard and go straight to the dashboard?\n\n"
      + "You can finish setup later from Settings, but quotes and "
      + "invoices won't have your business details on them until you do.",
    )) return;
    finalizeAndExit();
  };

  // ONB-B: jump to the first step whose data isn't yet on the
  // companies row. Skips Welcome + Done; if everything else is
  // complete, lands on Done so the operator can finish.
  const resumeAtFirstIncomplete = () => {
    const candidates: StepId[] = ["company", "address", "branding", "vat"];
    for (const id of candidates) {
      if (!isStepComplete(id, form)) {
        setStep(id);
        return;
      }
    }
    setStep("done");
  };

  if (loading) {
    return (
      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80 flex items-center justify-center">
        <AdminNav />
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <>
      <NoIndexMeta />
      <Head><title>Set up your business - CateringMS</title></Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80">
        <div className="px-4 sm:px-6 pt-20 lg:pt-8 pb-12 max-w-full">
          {/* Progress strip across the top - step pills + filled bar.
              On phones the labels collapse to icons only so the row
              doesn't crush. */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Setup wizard
                </p>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
                  Step {stepIndex + 1} of {totalSteps}: {STEPS[stepIndex].label}
                </h1>
              </div>
              <p className="text-sm text-slate-500">{progressPct}%</p>
            </div>
            <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-primary to-brand-secondary transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="hidden sm:flex items-center justify-between mt-3 px-1">
              {STEPS.map((s, idx) => {
                const Icon = s.icon;
                const past = idx < stepIndex;
                const active = idx === stepIndex;
                // ONB-B: any step with persisted data is now clickable
                // too, so a user who came back via ?step=branding can
                // hop back to address without rewinding the whole flow.
                const reachable = past || active || isStepComplete(s.id, form);
                const done = past || isStepComplete(s.id, form);
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={!reachable}
                    onClick={() => reachable && setStep(s.id)}
                    className={`flex items-center gap-1 text-[11px] transition ${
                      active
                        ? "text-orange-600 font-semibold"
                        : done
                          ? "text-brand-primary hover:text-brand-primary"
                          : "text-slate-400 cursor-not-allowed"
                    }`}
                    title={s.label}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-5 sm:p-7 space-y-5">
              {step === "welcome" && (
                <WelcomeStep
                  companyName={form.company_name}
                  form={form}
                  onStart={goNext}
                  onResume={resumeAtFirstIncomplete}
                  onJumpTo={(id) => setStep(id)}
                  onSkipToImports={() =>
                    router.push(slug ? `/${slug}/admin/onboarding/imports` : "/admin/onboarding/imports")
                  }
                  onSkipAll={skipWizardWithConfirm}
                  saving={saving}
                />
              )}

              {step === "company" && (
                <CompanyStep
                  form={form}
                  setForm={setForm}
                  saving={saving}
                  onBack={goBack}
                  onNext={async () => {
                    const ok = await saveStep({
                      company_name: form.company_name.trim() || null as any,
                      legal_name: form.legal_name.trim() || null as any,
                      email: form.email.trim() || null as any,
                      phone: form.phone.trim() || null as any,
                      website: form.website.trim() || null as any,
                      registration_number: form.registration_number.trim() || null as any,
                      tax_number: form.tax_number.trim() || null as any,
                    }, "Business basics");
                    if (ok) goNext();
                  }}
                />
              )}

              {step === "address" && (
                <AddressStep
                  form={form}
                  setForm={setForm}
                  saving={saving}
                  onBack={goBack}
                  onNext={async () => {
                    const ok = await saveStep({
                      address_line1: form.address_line1.trim() || null as any,
                      address_line2: form.address_line2.trim() || null as any,
                      city: form.city.trim() || null as any,
                      state_province: form.state_province.trim() || null as any,
                      postal_code: form.postal_code.trim() || null as any,
                      country: form.country.trim() || null as any,
                      headquarters_lat: form.headquarters_lat,
                      headquarters_lng: form.headquarters_lng,
                    }, "Kitchen address");
                    if (ok) goNext();
                  }}
                />
              )}

              {step === "branding" && (
                <BrandingStep
                  form={form}
                  setForm={setForm}
                  saving={saving}
                  onBack={goBack}
                  onNext={async () => {
                    const ok = await saveStep({
                      primary_color: form.primary_color || null as any,
                      secondary_color: form.secondary_color || null as any,
                      logo_url: form.logo_url.trim() || null as any,
                    }, "Branding");
                    if (ok) goNext();
                  }}
                />
              )}

              {step === "banking" && (
                <BankingStep
                  form={form}
                  setForm={setForm}
                  saving={saving}
                  onBack={goBack}
                  onNext={async () => {
                    const ok = await saveStep({
                      bank_name: form.bank_name.trim() || null as any,
                      bank_account_holder: form.bank_account_holder.trim() || null as any,
                      bank_account_number: form.bank_account_number.trim() || null as any,
                      bank_branch_code: form.bank_branch_code.trim() || null as any,
                      bank_account_type: form.bank_account_type || null as any,
                      eft_instructions: form.eft_instructions.trim() || null as any,
                    }, "Banking");
                    if (ok) goNext();
                  }}
                  onSkip={goNext}
                />
              )}

              {step === "vat" && (
                <VatStep
                  form={form}
                  setForm={setForm}
                  saving={saving}
                  onBack={goBack}
                  onNext={async () => {
                    const ok = await saveStep({
                      vat_registered: form.vat_registered,
                      vat_number: form.vat_registered ? (form.vat_number.trim() || null as any) : null as any,
                      // companies.vat_rate is NOT NULL - writing null when
                      // the caterer isn't VAT-registered threw and blocked
                      // the whole VAT onboarding step. Keep the rate; what
                      // gates VAT behaviour is vat_registered.
                      vat_rate: form.vat_registered ? (form.vat_rate ?? 15) : 0,
                    }, "VAT");
                    if (ok) goNext();
                  }}
                />
              )}

              {step === "email" && (
                <EmailStep
                  companyId={companyId}
                  onBack={goBack}
                  onNext={goNext}
                />
              )}

              {step === "clients" && (
                <ClientsStep onBack={goBack} onNext={goNext} />
              )}

              {step === "done" && (
                <DoneStep
                  form={form}
                  saving={saving}
                  onBack={goBack}
                  onFinish={finalizeAndExit}
                />
              )}
            </CardContent>
          </Card>

          <p className="text-center text-xs text-slate-500 mt-4">
            You can change any of this later under <strong>Settings</strong> in the sidebar.
          </p>
        </div>
      </div>
    </>
  );
}

// ── Step components ──────────────────────────────────────────────────

function WelcomeStep({
  companyName, form, onStart, onResume, onJumpTo, onSkipToImports, onSkipAll, saving,
}: {
  companyName: string;
  form: CompanyForm;
  onStart: () => void;
  onResume: () => void;
  onJumpTo: (id: StepId) => void;
  onSkipToImports: () => void;
  onSkipAll: () => void;
  saving: boolean;
}) {
  // ONB-B: derive completion against the live form so a returning
  // user sees what they've already entered. Welcome + Done sit
  // outside this list - they're navigation steps, not data.
  const checklist: Array<{ id: StepId; label: string; helper: string }> = [
    { id: "company",  label: "Business basics",  helper: "name, contact details, registration" },
    { id: "address",  label: "Kitchen address",  helper: "drives delivery distance + driver routing" },
    { id: "branding", label: "Branding",         helper: "logo + brand colours for your client portal" },
    { id: "banking",  label: "Banking",          helper: "optional - enables EFT as a payment option" },
    { id: "vat",      label: "VAT registration", helper: "changes your invoice document title" },
    { id: "email",    label: "Email sender",     helper: "use your domain or the shared CateringMS sender" },
    { id: "clients",  label: "Import clients",   helper: "optional - bulk upload your contact list" },
  ];
  const completed = checklist.filter((c) => isStepComplete(c.id, form)).length;
  const hasAnyProgress = completed > 0;

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="inline-flex w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-primary to-brand-secondary items-center justify-center shadow-lg mb-4">
          <Sparkles className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">
          {hasAnyProgress ? "Welcome back" : "Welcome"}{companyName ? `, ${companyName}` : ""}
        </h2>
        <p className="text-slate-600 mt-2 max-w-lg mx-auto">
          {hasAnyProgress
            ? `You've already filled in ${completed} of ${checklist.length} steps. Pick up where you left off or jump to any step below.`
            : "Let's get your business set up. This takes about 5 minutes. We'll cover the basics you need before you can quote, invoice and run your first event."}
        </p>
      </div>

      {/* ONB-B: live completion checklist. Each row links straight
          to its step so the operator doesn't have to walk the whole
          wizard to fix one missed field. */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            What we&apos;ll cover
          </p>
          {hasAnyProgress && (
            <p className="text-xs tabular-nums text-slate-500">
              {completed} / {checklist.length} complete
            </p>
          )}
        </div>
        <ul className="space-y-2 text-sm text-slate-700">
          {checklist.map((c) => {
            const done = isStepComplete(c.id, form);
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onJumpTo(c.id)}
                  disabled={saving}
                  className="w-full text-left flex items-start gap-2 px-2 -mx-2 py-1 rounded hover:bg-white transition-colors"
                >
                  <Check className={`w-4 h-4 mt-0.5 flex-shrink-0 ${done ? "text-brand-primary" : "text-slate-300"}`} />
                  <span className="flex-1">
                    <span className={done ? "font-medium text-slate-900" : "text-slate-700"}>{c.label}</span>
                    <span className="text-slate-500">: {c.helper}</span>
                  </span>
                  <ArrowRight className="w-3 h-3 text-slate-300 flex-shrink-0 mt-1" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        {hasAnyProgress ? (
          <Button onClick={onResume} disabled={saving} className="flex-1 bg-brand-primary hover:opacity-90">
            <PlayCircle className="w-4 h-4 mr-2" />
            Resume at next step
          </Button>
        ) : (
          <Button onClick={onStart} disabled={saving} className="flex-1 bg-brand-primary hover:opacity-90">
            Let&apos;s go <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        )}
        <Button
          variant="outline"
          onClick={onSkipToImports}
          disabled={saving}
          className="flex-1"
        >
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          I have data to import first
        </Button>
      </div>

      <button
        type="button"
        onClick={onSkipAll}
        disabled={saving}
        className="block mx-auto text-xs text-slate-500 hover:text-slate-700 underline-offset-2 hover:underline"
      >
        Skip the wizard, take me straight to the dashboard
      </button>
    </div>
  );
}

function CompanyStep({
  form, setForm, saving, onBack, onNext,
}: StepProps) {
  return (
    <StepShell
      icon={Building2}
      title="Tell us about your business"
      description="The basics that show up on every quote, invoice and email you send."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field id="company_name" label="Business name" required>
          <Input
            id="company_name"
            value={form.company_name}
            onChange={(e) => setForm({ ...form, company_name: e.target.value })}
            placeholder="e.g. Spit Braai Delivery"
          />
        </Field>
        <Field id="legal_name" label="Legal / trading name (optional)">
          <Input
            id="legal_name"
            value={form.legal_name}
            onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
          />
        </Field>
        <Field id="email" label="Contact email" required>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="hello@yourcompany.co.za"
          />
        </Field>
        <Field id="phone" label="Phone">
          <Input
            id="phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="+27 ..."
            inputMode="tel"
          />
        </Field>
        <Field id="website" label="Website (optional)">
          <Input
            id="website"
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
            placeholder="https://..."
          />
        </Field>
        <Field id="registration_number" label="Registration number (optional)">
          <Input
            id="registration_number"
            value={form.registration_number}
            onChange={(e) => setForm({ ...form, registration_number: e.target.value })}
          />
        </Field>
      </div>
      <NavRow onBack={onBack} onNext={onNext} saving={saving}
        canNext={!!form.company_name.trim() && !!form.email.trim()} />
    </StepShell>
  );
}

function AddressStep({
  form, setForm, saving, onBack, onNext,
}: StepProps) {
  return (
    <StepShell
      icon={MapPin}
      title="Where do you cook from?"
      description="Used as the starting point for every delivery distance and route plan. The more accurate, the more accurate your quotes."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field id="addr1" label="Address line 1">
          <Input
            id="addr1"
            value={form.address_line1}
            onChange={(e) => setForm({ ...form, address_line1: e.target.value })}
            placeholder="64 Kitchen Street"
          />
        </Field>
        <Field id="addr2" label="Address line 2 (optional)">
          <Input
            id="addr2"
            value={form.address_line2}
            onChange={(e) => setForm({ ...form, address_line2: e.target.value })}
          />
        </Field>
        <Field id="city" label="City / suburb">
          <Input
            id="city"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
          />
        </Field>
        <Field id="state" label="Province">
          <Input
            id="state"
            value={form.state_province}
            onChange={(e) => setForm({ ...form, state_province: e.target.value })}
          />
        </Field>
        <Field id="zip" label="Postal code">
          <Input
            id="zip"
            value={form.postal_code}
            onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
          />
        </Field>
        <Field id="country" label="Country">
          <Input
            id="country"
            value={form.country}
            onChange={(e) => setForm({ ...form, country: e.target.value })}
          />
        </Field>
      </div>
      <p className="text-xs text-slate-500">
        You can fine-tune the lat/lng later under <strong>Company Profile</strong>. Most caterers
        leave these blank now and let the address autocomplete fill them in once Google Maps is
        connected.
      </p>
      <NavRow onBack={onBack} onNext={onNext} saving={saving} />
    </StepShell>
  );
}

function BrandingStep({
  form, setForm, saving, onBack, onNext,
}: StepProps) {
  const gradient = `linear-gradient(135deg, ${form.primary_color} 0%, ${form.secondary_color} 100%)`;
  return (
    <StepShell
      icon={Palette}
      title="How do you want to look?"
      description="Your brand colours apply to the client portal, quotes, invoices and order tracking. You can change these any time."
    >
      {/* Live preview band - looks exactly like the client portal
          gradient header so the operator sees real impact, not a
          colour swatch. */}
      <div
        className="rounded-xl p-5 text-white shadow-lg"
        style={{ background: gradient }}
      >
        <p className="text-xs uppercase tracking-wide opacity-80">Preview</p>
        <h3 className="text-xl font-bold">{form.company_name || "Your business"}</h3>
        <p className="text-sm opacity-90 mt-1">This is what your clients will see.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field id="primary_color" label="Primary colour">
          <div className="flex gap-2">
            <input
              type="color"
              value={form.primary_color}
              onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
              className="w-12 h-10 rounded border border-slate-200 cursor-pointer"
            />
            <Input
              value={form.primary_color}
              onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
              className="font-mono"
            />
          </div>
        </Field>
        <Field id="secondary_color" label="Secondary colour">
          <div className="flex gap-2">
            <input
              type="color"
              value={form.secondary_color}
              onChange={(e) => setForm({ ...form, secondary_color: e.target.value })}
              className="w-12 h-10 rounded border border-slate-200 cursor-pointer"
            />
            <Input
              value={form.secondary_color}
              onChange={(e) => setForm({ ...form, secondary_color: e.target.value })}
              className="font-mono"
            />
          </div>
        </Field>
        <Field id="logo_url" label="Logo URL (optional)" hint="A direct link to your logo image. We'll show it in the client portal header.">
          <Input
            id="logo_url"
            value={form.logo_url}
            onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
            placeholder="https://..."
          />
        </Field>
      </div>
      <NavRow onBack={onBack} onNext={onNext} saving={saving} />
    </StepShell>
  );
}

function BankingStep({
  form, setForm, saving, onBack, onNext, onSkip,
}: StepProps & { onSkip: () => void }) {
  return (
    <StepShell
      icon={Landmark}
      title="Bank details for EFT"
      description="Optional. When set, your client portal shows these details (with the invoice number as a forced reference) for clients who pick EFT. Leave blank to hide EFT entirely."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field id="bank_name" label="Bank">
          <Input
            id="bank_name"
            value={form.bank_name}
            onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
            placeholder="e.g. FNB, Standard Bank, Capitec"
          />
        </Field>
        <Field id="bank_account_holder" label="Account holder">
          <Input
            id="bank_account_holder"
            value={form.bank_account_holder}
            onChange={(e) => setForm({ ...form, bank_account_holder: e.target.value })}
          />
        </Field>
        <Field id="bank_account_number" label="Account number">
          <Input
            id="bank_account_number"
            value={form.bank_account_number}
            onChange={(e) => setForm({ ...form, bank_account_number: e.target.value })}
            inputMode="numeric"
          />
        </Field>
        <Field id="bank_branch_code" label="Branch code">
          <Input
            id="bank_branch_code"
            value={form.bank_branch_code}
            onChange={(e) => setForm({ ...form, bank_branch_code: e.target.value })}
            placeholder="e.g. 250655"
            inputMode="numeric"
          />
        </Field>
        <Field id="bank_account_type" label="Account type">
          <select
            id="bank_account_type"
            value={form.bank_account_type}
            onChange={(e) => setForm({ ...form, bank_account_type: e.target.value })}
            className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm"
          >
            <option value="">Pick one</option>
            <option value="cheque">Cheque / current</option>
            <option value="savings">Savings</option>
            <option value="transmission">Transmission</option>
          </select>
        </Field>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 pt-4">
        <Button variant="outline" onClick={onBack} disabled={saving}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <Button variant="ghost" onClick={onSkip} disabled={saving} className="text-slate-500">
          Skip for now
        </Button>
        <Button onClick={onNext} disabled={saving} className="ml-auto bg-brand-primary hover:opacity-90">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Save & continue <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </StepShell>
  );
}

function VatStep({
  form, setForm, saving, onBack, onNext,
}: StepProps) {
  return (
    <StepShell
      icon={Receipt}
      title="VAT registration"
      description="South African rule: VAT-registered businesses issue 'Tax Invoice' documents with their VAT number. Switching this on changes your quote + invoice templates everywhere."
    >
      <label className="flex items-start gap-3 px-3 py-3 rounded-md border border-slate-200 cursor-pointer hover:bg-slate-50">
        <input
          type="checkbox"
          checked={form.vat_registered}
          onChange={(e) => setForm({ ...form, vat_registered: e.target.checked })}
          className="mt-0.5 w-4 h-4"
        />
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-900">This business is VAT registered</p>
          <p className="text-xs text-slate-500">
            When on, your quotes and invoices will say &quot;Tax Invoice&quot; with your VAT number on them.
          </p>
        </div>
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field id="vat_number" label="VAT number">
          <Input
            id="vat_number"
            value={form.vat_number}
            onChange={(e) => setForm({ ...form, vat_number: e.target.value })}
            placeholder="e.g. 4123456789"
            disabled={!form.vat_registered}
          />
        </Field>
        <Field id="vat_rate" label="VAT rate (%)">
          <Input
            id="vat_rate"
            type="number"
            step="0.01"
            value={form.vat_rate ?? 15}
            onChange={(e) =>
              setForm({ ...form, vat_rate: e.target.value === "" ? 15 : Number(e.target.value) })
            }
            disabled={!form.vat_registered}
          />
        </Field>
      </div>
      <NavRow onBack={onBack} onNext={onNext} saving={saving} />
    </StepShell>
  );
}

function EmailStep({
  companyId, onBack, onNext,
}: { companyId: string; onBack: () => void; onNext: () => void }) {
  // Two-card pattern: verified domain (recommended) vs shared sender.
  // Picking shared just stamps provider='resend' with no domain so the
  // smart-routing in emailService falls back to noreply@send.cateringms.com.
  const { toast } = useToast();
  const [mode, setMode] = useState<"choose" | "domain" | "shared">("choose");
  const [pickingShared, setPickingShared] = useState(false);

  const useSharedSender = async () => {
    if (!companyId) return;
    setPickingShared(true);
    try {
      const { error } = await (supabase as any)
        .from("email_provider_settings")
        .upsert({
          company_id: companyId,
          provider: "resend",
          updated_at: new Date().toISOString(),
        }, { onConflict: "company_id,provider" });
      if (error) throw error;
      toast({
        title: "Shared sender ready",
        description: "Emails will go out from noreply@send.cateringms.com until you verify your own domain.",
      });
      onNext();
    } catch (e: any) {
      toast({
        title: "Couldn't save",
        description: e?.message || "Try again.",
        variant: "destructive",
      });
    } finally {
      setPickingShared(false);
    }
  };

  return (
    <StepShell
      icon={ShieldCheck}
      title="Where do your invoice and quote emails come from?"
      description="Pick how CateringMS sends mail on your behalf. You can change this later under Settings."
    >
      {mode === "choose" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setMode("domain")}
            className="text-left p-5 rounded-xl border-2 border-purple-200 bg-purple-50/30 hover:border-purple-400 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-5 h-5 text-purple-600" />
              <p className="font-semibold text-slate-900">Use my own domain</p>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-brand-primary/15 text-brand-primary">
                Recommended
              </span>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              Your clients see emails from <code>you@yourdomain.com</code>. Takes 5 minutes to set up. We give you 3 DNS records to add at your domain host (cPanel / konsoleH / Vercel Domains / wherever) and verify automatically once they're live.
            </p>
            <p className="mt-3 text-xs font-semibold text-purple-700 inline-flex items-center gap-1">
              Set up my domain <ArrowRight className="w-3 h-3" />
            </p>
          </button>

          <button
            type="button"
            onClick={() => setMode("shared")}
            className="text-left p-5 rounded-xl border-2 border-slate-200 bg-white hover:border-slate-400 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-slate-600" />
              <p className="font-semibold text-slate-900">Use the CateringMS sender for now</p>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              Emails go out from <code>noreply@send.cateringms.com</code> with replies coming back to your inbox. Zero setup, but slightly less branded. You can switch to your own domain anytime in Settings.
            </p>
            <p className="mt-3 text-xs font-semibold text-slate-700 inline-flex items-center gap-1">
              Use shared sender <ArrowRight className="w-3 h-3" />
            </p>
          </button>
        </div>
      )}

      {mode === "domain" && (
        <div className="space-y-3">
          <div className="rounded-md border border-purple-200 bg-purple-50/40 p-3">
            <p className="text-xs text-slate-700">
              Enter your sending domain below. We'll create the entry in Resend and show you the DNS records to add at your domain host. Verification usually completes within an hour of the records going live.
            </p>
          </div>
          <ResendDomainCard companyId={companyId} compact />
          <div className="text-xs text-slate-500">
            Or, <button type="button" onClick={() => setMode("shared")} className="underline hover:text-purple-600">use the shared CateringMS sender</button> while DNS propagates.
          </div>
        </div>
      )}

      {mode === "shared" && (
        <div className="space-y-3">
          <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <p className="font-semibold mb-1">Shared sender</p>
            <p>
              Outgoing emails will come from <code>noreply@send.cateringms.com</code>. When clients hit reply, the message lands in <strong>{(""+(companyId)).slice(0,0) || "your inbox"}</strong> via the contact email on your company profile.
            </p>
          </div>
          <div className="text-xs text-slate-500">
            Or, <button type="button" onClick={() => setMode("domain")} className="underline hover:text-purple-600">verify your own domain instead</button>. 5 minutes, much more branded.
          </div>
          <Button onClick={useSharedSender} disabled={pickingShared} className="w-full sm:w-auto bg-brand-primary hover:opacity-90">
            {pickingShared ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
            Use shared sender and continue
          </Button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2 pt-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <Button variant="ghost" onClick={onNext} className="ml-auto">
          Skip for now <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </StepShell>
  );
}

function ClientsStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  // Tightly-scoped wrapper around ImportRecordsModal - the modal does
  // the heavy lifting (template download, upload, preview, dedup
  // decisions, commit). Step shell just frames it with onboarding
  // context and a clear "Skip" path for caterers starting fresh.
  const [open, setOpen] = useState(false);
  const [imported, setImported] = useState<number | null>(null);

  return (
    <StepShell
      icon={Users}
      title="Bring your existing clients across"
      description="Upload your customer list now so quotes, invoices and the client portal see them from day one. This is optional. Skip if you're starting fresh."
    >
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
        <p className="text-sm text-slate-700 leading-relaxed">
          Download the template, fill in your existing customer list (up to 10,000 rows),
          and upload. We'll preview every row, flag duplicates and only save what you confirm.
        </p>
        <ul className="text-xs text-slate-600 space-y-1">
          <li className="flex items-start gap-2">
            <Check className="w-3.5 h-3.5 text-brand-primary mt-0.5 flex-shrink-0" />
            <span>Required: client name, email or phone</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="w-3.5 h-3.5 text-brand-primary mt-0.5 flex-shrink-0" />
            <span>Existing customers (matched by email) are skipped automatically</span>
          </li>
          <li className="flex items-start gap-2">
            <Check className="w-3.5 h-3.5 text-brand-primary mt-0.5 flex-shrink-0" />
            <span>Test run option lets you preview before anything saves</span>
          </li>
        </ul>
      </div>

      {imported !== null && imported > 0 && (
        <div className="rounded-lg bg-brand-primary/10 border border-brand-primary/20 p-3 flex items-start gap-2">
          <Check className="w-4 h-4 text-brand-primary mt-0.5 flex-shrink-0" />
          <p className="text-sm text-brand-primary">
            Clients imported. You can run another import later from the Contacts page.
          </p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <Button
          onClick={() => setOpen(true)}
          className="flex-1 bg-brand-primary hover:opacity-90"
        >
          <Upload className="w-4 h-4 mr-2" />
          {imported !== null ? "Import another file" : "Import clients"}
        </Button>
        <Button variant="ghost" onClick={onNext}>
          {imported !== null ? "Continue" : "Skip for now"} <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>

      <ImportRecordsModal
        open={open}
        onOpenChange={setOpen}
        template="clients"
        recordLabel="client"
        recordLabelPlural="clients"
        onComplete={() => {
          // The modal exposes a granular summary; for the wizard we just
          // need to flip the "imported" flag so the CTA copy and skip
          // button update. If they want the count they can re-run from
          // Contacts.
          setImported((n) => (n ?? 0) + 1);
        }}
      />
    </StepShell>
  );
}

function DoneStep({
  form, saving, onBack, onFinish,
}: {
  form: CompanyForm;
  saving: boolean;
  onBack: () => void;
  onFinish: () => void;
}) {
  // Quick summary of what they entered, so the operator can sanity-
  // check before they hit the button. We show only the essentials
  // (business name, address city, brand colours, banking on/off,
  // VAT status). Specifics are still available via Settings later.
  const summary = [
    { label: "Business", value: form.company_name || "(not set)" },
    { label: "Email", value: form.email || "(not set)" },
    { label: "Address", value: form.city ? `${form.city}, ${form.country}` : "(not set)" },
    { label: "Brand", value: `${form.primary_color} / ${form.secondary_color}` },
    { label: "EFT bank", value: form.bank_name ? form.bank_name : "(skipped)" },
    { label: "VAT registered", value: form.vat_registered ? "Yes" : "No" },
  ];
  return (
    <StepShell
      icon={ShieldCheck}
      title="All set"
      description="Quick check before we wrap up. You can edit any of this later in Settings."
    >
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
          {summary.map((s) => (
            <div key={s.label} className="flex justify-between sm:block">
              <dt className="text-[10px] uppercase tracking-wide font-semibold text-slate-500">
                {s.label}
              </dt>
              <dd className="text-sm font-medium text-slate-800 sm:mt-0.5 truncate">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 pt-2">
        <Button variant="outline" onClick={onBack} disabled={saving}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Button>
        <Button onClick={onFinish} disabled={saving} className="flex-1 bg-brand-primary hover:bg-brand-primary/90">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
          Finish setup & go to dashboard
        </Button>
      </div>
    </StepShell>
  );
}

// ── Reusable bits ────────────────────────────────────────────────────

interface StepProps {
  form: CompanyForm;
  setForm: React.Dispatch<React.SetStateAction<CompanyForm>>;
  saving: boolean;
  onBack: () => void;
  onNext: () => void;
}

function StepShell({
  icon: Icon, title, description, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-orange-700" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-600 mt-0.5">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function Field({
  id, label, required, hint, children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs font-semibold text-slate-700">
        {label}{required ? <span className="text-rose-500"> *</span> : null}
      </Label>
      <div className="mt-1">{children}</div>
      {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

function NavRow({
  onBack, onNext, saving, canNext = true,
}: {
  onBack: () => void;
  onNext: () => void;
  saving: boolean;
  canNext?: boolean;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-2 pt-4">
      <Button variant="outline" onClick={onBack} disabled={saving}>
        <ArrowLeft className="w-4 h-4 mr-2" /> Back
      </Button>
      <Button
        onClick={onNext}
        disabled={saving || !canNext}
        className="ml-auto bg-brand-primary hover:opacity-90"
      >
        {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
        Save & continue <ArrowRight className="w-4 h-4 ml-2" />
      </Button>
    </div>
  );
}

export default function ProtectedOnboarding() {
  // ONB-B (task #217, 2026-05-25): admit OWNER. The wizard is the
  // first thing a brand-new tenant sees after signup, and the signup
  // user is typically OWNER (set in profileBootstrapService). Pre-
  // ONB-B the page hardcoded SUPER_ADMIN + COMPANY_ADMIN + ADMIN
  // which 403'd the founder off their own onboarding flow on day 1.
  return (
    <ProtectedRoute allowedRoles={[
      UserRole.SUPER_ADMIN,
      UserRole.OWNER,
      UserRole.COMPANY_ADMIN,
      UserRole.ADMIN,
    ]}>
      <OnboardingWizard />
    </ProtectedRoute>
  );
}
