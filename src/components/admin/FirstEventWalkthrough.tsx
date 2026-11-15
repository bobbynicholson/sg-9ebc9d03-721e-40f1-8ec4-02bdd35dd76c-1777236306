/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * "Your first event" walkthrough card.
 *
 * Appears on the admin dashboard for tenants who finished onboarding
 * (companies.onboarding_completed_at IS NOT NULL) but haven't booked
 * their first real event yet. Different from FirstStepsCard - that
 * one drives setup; this one drives the actual revenue-generating
 * workflow: build a quote, send it to a client, watch it convert.
 *
 * Steps are signal-derived from the same tables the rest of the app
 * reads, so progress shows up automatically as the owner moves
 * through the flow in another tab.
 *
 * Auto-hides once any order exists (whole walkthrough satisfied) and
 * supports manual dismissal via localStorage flag scoped per company.
 *
 * Why not in onboardingProgressService: that service models the
 * "set up your tenant" phase. The walkthrough is the next phase
 * (use the tenant). Keeping them separate so each can evolve without
 * the other's wireup churn.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2, Circle, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  companyId: string;
  slug: string;
}

interface WalkState {
  onboardingComplete: boolean;
  anyQuoteDrafted: boolean;
  anyQuoteSent: boolean;
  anyOrderExists: boolean;
}

const DISMISS_KEY = (companyId: string) => `first_event_walkthrough_dismissed_${companyId}`;

function isDismissed(companyId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DISMISS_KEY(companyId)) === "1";
  } catch {
    return false;
  }
}

function setDismissed(companyId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISS_KEY(companyId), "1");
  } catch {
    /* localStorage disabled - accept the loss */
  }
}

async function loadState(companyId: string): Promise<WalkState> {
  // Four small COUNT(*) HEAD queries in parallel. None of them pulls
  // rows; collectively this is single-digit ms even on a large tenant.
  const [companyRes, quoteAnyRes, quoteSentRes, orderAnyRes] = await Promise.all([
    (supabase as any)
      .from("companies")
      .select("onboarding_completed_at")
      .eq("id", companyId)
      .maybeSingle(),
    (supabase as any)
      .from("quotes")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("deleted_at", null),
    (supabase as any)
      .from("quotes")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .in("status", ["sent", "accepted"]),
    (supabase as any)
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .is("deleted_at", null),
  ]);
  return {
    onboardingComplete: !!companyRes?.data?.onboarding_completed_at,
    anyQuoteDrafted: (quoteAnyRes?.count ?? 0) > 0,
    anyQuoteSent: (quoteSentRes?.count ?? 0) > 0,
    anyOrderExists: (orderAnyRes?.count ?? 0) > 0,
  };
}

export function FirstEventWalkthrough({ companyId, slug }: Props) {
  const [state, setState] = useState<WalkState | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    if (isDismissed(companyId)) {
      setHidden(true);
      return;
    }
    let cancelled = false;
    void loadState(companyId).then((s) => {
      if (!cancelled) setState(s);
    });
    return () => { cancelled = true; };
  }, [companyId]);

  if (hidden || !state) return null;

  // Don't show until onboarding is complete. FirstStepsCard owns that
  // phase; we wait our turn so the dashboard isn't shouting two
  // different "start here" cards at the same time.
  if (!state.onboardingComplete) return null;

  // Auto-hide once an order exists. The whole walkthrough is satisfied
  // at that point - the tenant is in business, doesn't need a guide.
  if (state.anyOrderExists) return null;

  const tenantPath = slug ? `/${slug}` : "";

  const steps = [
    {
      id: "draft_quote",
      label: "Draft your first quote",
      description: "Pick a menu, set a guest count, name the event. Takes a couple of minutes.",
      href: `${tenantPath}/admin/quotes/new`,
      done: state.anyQuoteDrafted,
    },
    {
      id: "send_quote",
      label: "Send it to your client",
      description: "Hit send. They get a public link to view, accept, or ask for changes.",
      href: `${tenantPath}/admin/quotes`,
      done: state.anyQuoteSent,
    },
    {
      id: "first_order",
      label: "Watch it convert to an event",
      description: "When the client accepts, the quote becomes a confirmed order on this dashboard.",
      href: `${tenantPath}/admin/orders`,
      done: state.anyOrderExists,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;

  const handleDismiss = () => {
    setHidden(true);
    setDismissed(companyId);
  };

  return (
    <Card className="mb-6 min-w-0 max-w-full border-0 bg-gradient-to-br from-brand-primary/10 via-brand-secondary/10 to-blue-50 shadow-lg">
      <CardHeader className="pb-3">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_2rem] items-start gap-x-2 gap-y-1">
          <div className="min-w-0">
            <CardTitle className="flex min-w-0 flex-wrap items-center gap-2 text-base sm:text-lg">
              <Sparkles className="h-4 w-4 shrink-0 text-brand-primary sm:h-5 sm:w-5" />
              Land your first event
            </CardTitle>
            <p className="mt-1 break-words text-xs text-slate-600 sm:text-sm">
              You're set up. Here's the three-step path from a blank dashboard to a paying client.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-slate-500 hover:text-slate-900"
            aria-label="Dismiss walkthrough"
            onClick={handleDismiss}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 sm:space-y-3">
          {steps.map((step, i) => (
            <Link
              key={step.id}
              href={step.href}
              className={`grid min-w-0 grid-cols-[2rem_minmax(0,1fr)_1rem] items-start gap-x-3 gap-y-1 rounded-lg border p-3 transition-all group ${
                step.done
                  ? "bg-brand-primary/10 border-brand-primary/20"
                  : "bg-white border-slate-200 hover:border-brand-primary/30 hover:shadow-sm"
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold ${
                  step.done
                    ? "bg-brand-primary/15 text-brand-primary"
                    : "bg-brand-primary/15 text-brand-primary"
                }`}
              >
                {step.done ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
              </div>
              <div className="min-w-0">
                <p className={`break-words text-sm font-medium ${step.done ? "text-brand-primary line-through decoration-brand-primary/40" : "text-slate-900"}`}>
                  {step.label}
                </p>
                <p className="break-words text-xs leading-5 text-slate-500">{step.description}</p>
              </div>
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 group-hover:text-brand-primary" />
            </Link>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="flex min-w-0 flex-wrap items-center gap-1 text-slate-500">
            {doneCount > 0 ? (
              <><CheckCircle2 className="w-3 h-3 text-brand-primary" /> {doneCount} of 3 done</>
            ) : (
              <><Circle className="w-3 h-3" /> Three steps to your first event</>
            )}
          </span>
          <button
            onClick={handleDismiss}
            className="shrink-0 text-slate-500 underline hover:text-slate-800"
          >
            Hide this guide
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
