import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  CreditCard,
  Mail,
  Palette,
  Upload,
  Users,
  Utensils,
  X,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { dashboardTodoService } from "@/services/dashboardTodoService";
import { onboardingProgressService, type OnboardingState } from "@/services/onboardingProgressService";
import { getTenantSlugFromPathname } from "@/lib/tenantRoute";

type SetupTaskId = "team" | "branding" | "email" | "clients" | "menu" | "payments";

const SETUP_TASKS: Array<{
  id: SetupTaskId;
  title: string;
  description: string;
  href: string;
  icon: typeof Users;
}> = [
  { id: "team", title: "Add your team", description: "Invite the people who help run events.", href: "/admin/users", icon: Users },
  { id: "branding", title: "Set your branding", description: "Logo, colours, fonts, and client-facing identity.", href: "/admin/white-label", icon: Palette },
  { id: "email", title: "Set up company email", description: "Choose the sender and reply address clients see.", href: "/admin/email-settings", icon: Mail },
  { id: "clients", title: "Bring in your clients", description: "Import an existing list or add the first client.", href: "/admin/onboarding/clients", icon: Upload },
  { id: "menu", title: "Add your menu and prices", description: "Create dishes and packages for quotes and orders.", href: "/admin/menu", icon: Utensils },
  { id: "payments", title: "Connect online payments", description: "Configure a gateway so clients can pay online.", href: "/admin/payment-gateways", icon: CreditCard },
];

function tenantHref(slug: string, href: string): string {
  return slug ? `/${slug}${href}` : href;
}

function relativeTenantHref(slug: string, href: string): string {
  if (!slug) return href;
  const prefix = `/${slug}`;
  return href === prefix ? "/" : href.startsWith(`${prefix}/`) ? href.slice(prefix.length) : href;
}

export function AdminSetupSticky() {
  const router = useRouter();
  const { user, profile, company, companySlug: authCompanySlug, loading: authLoading } = useAuth() as any;
  const { toast } = useToast();
  const routeSlug = getTenantSlugFromPathname(router.asPath);
  const slug = routeSlug || authCompanySlug || profile?.company_slug || user?.company_slug || "";
  const companyId = company?.id || profile?.company_id || user?.company_id;
  const normalizedPath = (router.asPath || "").split(/[?#]/)[0].replace(/^\/[^/]+(?=\/admin(?:\/|$))/, "");
  const isTenantAdmin = normalizedPath === "/admin" || normalizedPath.startsWith("/admin/");
  const isPlatformAdmin = normalizedPath === "/admin/platform" || normalizedPath.startsWith("/admin/platform/");

  const [open, setOpen] = useState(false);
  const [onboarding, setOnboarding] = useState<OnboardingState | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<SetupTaskId | null>(null);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [progress, rows] = await Promise.all([
        onboardingProgressService.getState(companyId, slug),
        dashboardTodoService.getForCompany(companyId),
      ]);
      setOnboarding(progress);
      setChecked(Object.fromEntries(rows.map((row) => [row.task_id, row.completed])));
      setOpen((current) => current || !progress.allRequiredComplete);
    } catch (error) {
      console.error("[admin-setup-sticky] load failed:", error);
      toast({ title: "Could not load setup progress", description: "Refresh the page to see the latest checklist.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isTenantAdmin || isPlatformAdmin || !companyId) return;
    void load();
    const refresh = () => void load();
    router.events.on("routeChangeComplete", refresh);
    return () => router.events.off("routeChangeComplete", refresh);
    // The checklist should reload when the active tenant changes, not on
    // every render caused by unrelated admin page data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, slug, isTenantAdmin, isPlatformAdmin]);

  const incompleteOnboarding = useMemo(
    () => onboarding?.steps.filter((step) => step.required && !step.completed) ?? [],
    [onboarding],
  );
  const pendingTasks = SETUP_TASKS.filter((task) => !checked[task.id]);
  const onboardingComplete = Boolean(onboarding?.allRequiredComplete);
  // Onboarding is the first gate. Until its required steps are complete,
  // keep the sticky panel focused on those steps instead of competing with
  // the optional post-onboarding setup list.
  const totalChecks = onboardingComplete ? SETUP_TASKS.length : (onboarding?.requiredSteps || 0);
  const completedChecks = onboardingComplete
    ? SETUP_TASKS.filter((task) => checked[task.id]).length
    : (onboarding?.completedRequiredSteps || 0);
  const allComplete = Boolean(onboardingComplete && pendingTasks.length === 0);

  const toggleTask = (id: SetupTaskId, value: boolean) => {
    if (!companyId) return;
    const previous = Boolean(checked[id]);
    setChecked((current) => ({ ...current, [id]: value }));
    setSaving(id);
    void dashboardTodoService.setCompleted(companyId, id, value)
      .catch((error) => {
        console.error("[admin-setup-sticky] save failed:", error);
        setChecked((current) => ({ ...current, [id]: previous }));
        toast({ title: "Could not save setup progress", description: "Please try that checkbox again.", variant: "destructive" });
      })
      .finally(() => setSaving(null));
  };

  if (authLoading || !isTenantAdmin || isPlatformAdmin || !companyId || loading || !onboarding) return null;

  return (
    <aside className="fixed inset-x-3 bottom-3 z-40 sm:inset-x-auto sm:right-5 sm:w-[380px]" aria-label="Company setup checklist">
      {open ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-2xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-brand-primary/10 via-white to-brand-secondary/10 px-4 py-3 dark:border-slate-700 dark:via-slate-900">
            <div>
              <p className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <ClipboardCheck className="h-4 w-4 text-brand-primary" />
                {onboardingComplete ? "Setup checklist" : "Finish onboarding"}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{completedChecks}/{totalChecks} checks complete across your company.</p>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void load()} aria-label="Refresh setup checklist">
                <ChevronDown className="h-4 w-4 rotate-180" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)} aria-label="Collapse setup checklist">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="max-h-[min(70vh,560px)] space-y-4 overflow-y-auto p-3">
            {!onboardingComplete && incompleteOnboarding.length > 0 && (
              <section>
                <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Onboarding essentials</p>
                <div className="space-y-1.5">
                  {incompleteOnboarding.map((step) => (
                    <Link key={step.id} href={tenantHref(slug, relativeTenantHref(slug, step.href))} className="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-2 transition-colors hover:border-brand-primary/50 dark:border-amber-900/60 dark:bg-amber-950/20">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-amber-400 text-[10px] font-bold text-amber-700">!</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{step.label}</span>
                        <span className="block truncate text-[11px] text-slate-500">{step.description}</span>
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {onboardingComplete && <section>
              <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Day-to-day essentials</p>
              <div className="space-y-1.5">
                {SETUP_TASKS.map((task) => {
                  const done = Boolean(checked[task.id]);
                  const Icon = task.icon;
                  return (
                    <div key={task.id} className={`flex items-start gap-2.5 rounded-lg border px-2.5 py-2 ${done ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/20" : "border-slate-200 dark:border-slate-700"}`}>
                      <Checkbox checked={done} onCheckedChange={(value) => toggleTask(task.id, value === true)} disabled={saving === task.id} className="mt-0.5" aria-label={`Mark ${task.title} complete`} />
                      <Link href={tenantHref(slug, task.href)} className="group min-w-0 flex-1">
                        <span className={`flex items-center gap-1.5 text-xs font-semibold ${done ? "text-emerald-800 line-through dark:text-emerald-300" : "text-slate-800 dark:text-slate-100"}`}>
                          <Icon className="h-3.5 w-3.5 shrink-0 text-brand-primary" />
                          <span className="truncate">{task.title}</span>
                          <ArrowRight className="h-3 w-3 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-slate-500">{task.description}</span>
                      </Link>
                      {done && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />}
                    </div>
                  );
                })}
              </div>
            </section>}

            {allComplete && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4" /> Essential setup is complete.
              </div>
            )}
            <Link href={tenantHref(slug, "/admin/onboarding")} className="flex items-center justify-center gap-1 py-1 text-xs font-semibold text-brand-primary hover:underline">
              {onboardingComplete ? "Review full onboarding checklist" : "Continue onboarding"} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="ml-auto flex items-center gap-2 rounded-full border border-brand-primary/25 bg-white/95 px-3.5 py-2.5 text-xs font-bold text-slate-800 shadow-xl backdrop-blur transition hover:-translate-y-0.5 hover:shadow-2xl dark:bg-slate-900/95 dark:text-white" aria-label="Open setup checklist">
          <ClipboardCheck className="h-4 w-4 text-brand-primary" />
          <span>Setup {completedChecks}/{totalChecks}</span>
          {allComplete ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <ChevronUp className="h-4 w-4 text-slate-400" />}
        </button>
      )}
    </aside>
  );
}
