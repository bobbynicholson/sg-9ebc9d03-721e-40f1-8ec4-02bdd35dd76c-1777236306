import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  PartyPopper,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { DASHBOARD_TODO_CHANGED_EVENT, dashboardTodoService } from "@/services/dashboardTodoService";
import { onboardingProgressService } from "@/services/onboardingProgressService";
import { SETUP_TASKS, type SetupTaskId } from "@/lib/setupChecklist";

interface Props {
  companyId: string;
  slug: string;
}

interface TodoItem {
  id: SetupTaskId;
  title: string;
  description: string;
  href: string;
  icon: (typeof SETUP_TASKS)[number]["icon"];
}

export function DashboardTodoList({ companyId, slug }: Props) {
  const tenantPath = slug ? `/${slug}` : "";
  const [checked, setChecked] = useState<Partial<Record<SetupTaskId, boolean>>>({});
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [celebrationVisible, setCelebrationVisible] = useState(false);
  const [saving, setSaving] = useState<SetupTaskId | null>(null);
  const { toast } = useToast();

  const todos = useMemo<TodoItem[]>(
    () => SETUP_TASKS.map((task) => ({ ...task, href: `${tenantPath}${task.href}` })),
    [tenantPath],
  );

  useEffect(() => {
    setMounted(true);
    if (!companyId) return;
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      dashboardTodoService.getForCompany(companyId),
      onboardingProgressService.getState(companyId, slug),
    ])
      .then(([rows, onboarding]) => {
        if (cancelled) return;
        setChecked(Object.fromEntries(rows.map((row) => [row.task_id, row.completed])));
        setOnboardingComplete(Boolean(onboarding.completedAt || onboarding.allRequiredComplete));
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("[dashboard-todos] load failed:", error);
        toast({ title: "Could not load setup progress", description: "Your checklist could not be loaded. Please refresh and try again.", variant: "destructive" });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [companyId, slug, toast]);

  useEffect(() => {
    if (!companyId || typeof window === "undefined") return;
    const onTodoChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ companyId?: string; taskId?: string; completed?: boolean }>).detail;
      if (detail?.companyId !== companyId || !detail.taskId) return;
      setChecked((current) => ({ ...current, [detail.taskId as string]: Boolean(detail.completed) }));
    };
    window.addEventListener(DASHBOARD_TODO_CHANGED_EVENT, onTodoChanged);
    return () => window.removeEventListener(DASHBOARD_TODO_CHANGED_EVENT, onTodoChanged);
  }, [companyId]);

  const completedCount = todos.filter((todo) => checked[todo.id]).length;
  const complete = mounted && onboardingComplete === true && completedCount === todos.length;
  const completionSignature = complete
    ? `${onboardingComplete ? "onboarding" : "pending"}:${SETUP_TASKS.map((task) => `${task.id}-${checked[task.id] ? "1" : "0"}`).join(",")}`
    : "";

  useEffect(() => {
    if (!complete || !companyId || typeof window === "undefined") {
      setCelebrationVisible(false);
      if (companyId) window.sessionStorage.removeItem(`dashboard_setup_celebrated_v2_${companyId}`);
      return;
    }

    const key = `dashboard_setup_celebrated_v2_${companyId}`;
    if (window.sessionStorage.getItem(key) === completionSignature) {
      setCelebrationVisible(false);
      return;
    }

    setCelebrationVisible(true);
    // Record the completion immediately so navigating away and back during
    // the animation does not replay it for the same completed signature.
    window.sessionStorage.setItem(key, completionSignature);
    const timer = window.setTimeout(() => {
      setCelebrationVisible(false);
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [complete, companyId, completionSignature]);

  const toggle = (id: SetupTaskId, value: boolean) => {
    const previous = Boolean(checked[id]);
    const next = { ...checked, [id]: value };
    setChecked(next);
    setSaving(id);
    void dashboardTodoService.setCompleted(companyId, id, value)
      .catch((error) => {
        console.error("[dashboard-todos] save failed:", error);
        setChecked((current) => ({ ...current, [id]: previous }));
        toast({ title: "Could not save checklist progress", description: "Please try that checkbox again.", variant: "destructive" });
      })
      .finally(() => setSaving(null));
  };

  // The real onboarding gate comes first. The post-onboarding task list
  // should not compete with the wizard or claim setup is complete while
  // required onboarding steps are still unfinished.
  if (!mounted || loading || onboardingComplete === null || !onboardingComplete) return null;

  if (complete && celebrationVisible) {
    return (
      <Card className="relative mb-6 overflow-hidden border-0 bg-gradient-to-br from-brand-primary via-brand-secondary to-brand-accent text-white shadow-lg">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-30">
          <span className="absolute left-[8%] top-5 text-2xl">✦</span>
          <span className="absolute left-[28%] top-14 text-xl">•</span>
          <span className="absolute right-[20%] top-7 text-3xl">✦</span>
          <span className="absolute right-[8%] bottom-8 text-xl">•</span>
          <span className="absolute left-[55%] bottom-5 text-2xl">✦</span>
        </div>
        <CardContent className="relative flex flex-col items-center gap-3 px-6 py-8 text-center sm:py-10">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 ring-4 ring-white/10">
            <PartyPopper className="h-7 w-7" />
          </div>
          <h2 className="text-xl font-bold sm:text-2xl">Congratulations — you’re ready to go!</h2>
          <p className="max-w-xl text-sm leading-6 text-white/90">
            You’ve completed the essential setup. Your team, brand, communications, clients, menu, and payments are ready for everyday work.
          </p>
          <div className="mt-1 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold">
            <Sparkles className="h-3.5 w-3.5" /> Setup complete
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6 border-brand-primary/20 bg-gradient-to-br from-brand-primary/10 via-white to-brand-secondary/10 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <CheckCircle2 className="h-5 w-5 text-brand-primary" />
              Your dashboard to-do list
            </CardTitle>
            <p className="mt-1 text-xs leading-5 text-slate-600 sm:text-sm">
              A few simple things will help you get the most from CateringMS. Open each task, finish it, then tick it off here.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 shadow-sm">
            {completedCount}/{todos.length} done
          </span>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {todos.map((todo) => {
          const Icon = todo.icon;
          const isChecked = Boolean(checked[todo.id]);
          return (
            <div
              key={todo.id}
              className={`flex items-start gap-3 rounded-lg border bg-white p-3 transition-colors ${
                isChecked ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 hover:border-brand-primary/40"
              }`}
            >
              <Checkbox
                id={`dashboard-todo-${todo.id}`}
                checked={isChecked}
                onCheckedChange={(value) => toggle(todo.id, value === true)}
                disabled={saving === todo.id}
                className="mt-1"
                aria-label={`Mark ${todo.title} complete`}
              />
              <div className="min-w-0 flex-1">
                <Link href={todo.href} className="group block" aria-label={`Open task: ${todo.title}`}>
                  <p className={`flex items-center gap-1.5 text-sm font-semibold ${isChecked ? "text-emerald-800 line-through" : "text-slate-900"}`}>
                    <Icon className="h-4 w-4 shrink-0 text-brand-primary" />
                    <span className="truncate">{todo.title}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{todo.description}</p>
                </Link>
              </div>
              {isChecked && <Check className="mt-1 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
