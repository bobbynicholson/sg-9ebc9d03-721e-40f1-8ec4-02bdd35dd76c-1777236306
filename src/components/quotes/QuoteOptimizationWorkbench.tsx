import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight, ChevronDown,
  Download, Info, Loader2, Settings2,
} from "lucide-react";
import type { Quote } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { useTenantHref } from "@/lib/tenantUrl";
import type { TenantCurrency } from "@/hooks/useTenantCurrency";
import { toLocalISO } from "@/lib/localDate";
import { cn } from "@/lib/utils";
import { ORDER_UPDATED_EVENT } from "@/lib/events/orderEvents";
import { loadQuoteOptimizationData, type QuoteOptimizationData } from "@/services/quoteOptimizationService";
import {
  buildOpportunities, DEFAULT_PLANNING_ASSUMPTIONS, explainOpportunity as explainFromConstraints, optimizeQuotes,
  PLANNING_MODES, shiftPlanningDate,
  type Opportunity, type PlanningAssumptions, type PlanningMode,
} from "@/lib/quotes/quoteOptimization";
import type { QuoteModelReview } from "@/lib/quotes/quoteOptimizationReview";
import { buildQuotePipeline, pipelineDaySignature, summarizePipelineDay } from "@/lib/quotes/quotePipeline";
import QuotePipelineBoard from "@/components/quotes/QuotePipelineBoard";

interface Props {
  companyId: string;
  currency: TenantCurrency;
  regionId?: string | null;
  /** Parent realtime refreshes invalidate this separate, fully paginated read. */
  quotes: Quote[];
}

const modes: PlanningMode[] = ["profit", "balanced", "space"];
const fieldLimits: Record<keyof PlanningAssumptions, [number, number]> = {
  weeklyHours: [1, 10000], minutesPerGuest: [0.1, 120], setupHours: [0, 48],
  unknownCostPercent: [0, 100], operatingPercent: [0, 100], minimumMargin: [0, 100], costShockPercent: [0, 50],
};
const validCost = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1e12;

function NumberField({ label, value, onChange, min, max, step = 1, hint }: {
  label: string; value: number; onChange: (value: number) => void;
  min: number; max: number; step?: number; hint?: string;
}) {
  return <label className="block space-y-1.5 text-xs font-medium text-slate-700">
    <span>{label}</span>
    <Input type="number" min={min} max={max} step={step} value={value}
      onChange={(event) => {
        if (event.target.value === "") return;
        const next = Number(event.target.value);
        if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
      }} className="tabular-nums" />
    {hint && <span className="block text-xs font-normal leading-relaxed text-slate-500">{hint}</span>}
  </label>;
}

export default function QuoteOptimizationWorkbench({ companyId, currency, regionId, quotes }: Props) {
  const { withSlug } = useTenantHref();
  const money = (value: number, code?: string | null) => {
    const resolved = code?.trim().toUpperCase();
    if (!resolved || resolved === currency.code) return currency.format(value, 2);
    try { return new Intl.NumberFormat("en-ZA", { style: "currency", currency: resolved, maximumFractionDigits: 0 }).format(value); }
    catch { return `${resolved} ${value.toLocaleString("en-ZA", { maximumFractionDigits: 0 })}`; }
  };
  const compactMoney = (value: number) => `${currency.symbol} ${new Intl.NumberFormat("en-ZA", { notation: "compact", maximumFractionDigits: 1 }).format(value)}`;
  const open = true;
  const horizon = 0;
  const [mode, setMode] = useState<PlanningMode>("balanced");
  const [assumptions, setAssumptions] = useState<PlanningAssumptions>({ ...DEFAULT_PLANNING_ASSUMPTIONS });
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const [costOverrides, setCostOverrides] = useState<Record<string, number>>({});
  const [restoredCompany, setRestoredCompany] = useState<string | null>(null);
  const [data, setData] = useState<QuoteOptimizationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [dateFilter, setDateFilter] = useState<string | null>(null);
  const [today, setToday] = useState(() => toLocalISO(new Date()));
  const [modelReview, setModelReview] = useState<{ key: string; review: QuoteModelReview; total: number } | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const reviewController = useRef<AbortController | null>(null);
  const requestedEnd = horizon === 0 ? "all" : shiftPlanningDate(today, horizon - 1);
  const end = horizon === 0 ? (data?.companyId === companyId && data.allUpcoming ? data.end : shiftPlanningDate(today, 29)) : requestedEnd;
  const storageKey = `cateringms.quoteOptimizer.v1.${companyId}`;

  useEffect(() => {
    setAssumptions({ ...DEFAULT_PLANNING_ASSUMPTIONS }); setMode("balanced");
    setPinnedIds([]); setExcludedIds([]); setCostOverrides({}); setDateFilter(null);
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || "null");
      if (saved && typeof saved === "object") {
        const next = { ...DEFAULT_PLANNING_ASSUMPTIONS };
        for (const key of Object.keys(fieldLimits) as (keyof PlanningAssumptions)[]) {
          const value = saved.assumptions?.[key];
          const [min, max] = fieldLimits[key];
          if (typeof value === "number" && Number.isFinite(value) && value >= min && value <= max) next[key] = value;
        }
        setAssumptions(next);
        if (modes.includes(saved.mode)) setMode(saved.mode);
        if (Array.isArray(saved.pinnedIds)) setPinnedIds(saved.pinnedIds.filter((id: unknown) => typeof id === "string"));
        if (Array.isArray(saved.excludedIds)) setExcludedIds(saved.excludedIds.filter((id: unknown) => typeof id === "string"));
        if (saved.costOverrides && typeof saved.costOverrides === "object") {
          setCostOverrides(Object.fromEntries(Object.entries(saved.costOverrides).filter(([, value]) => validCost(value)).map(([id, value]) => [id, Number(value)])));
        }
      }
    } catch { /* Storage may be blocked or contain an older scenario. */ }
    setRestoredCompany(companyId);
  }, [companyId, storageKey]);

  useEffect(() => {
    if (restoredCompany !== companyId) return;
    try { window.localStorage.setItem(storageKey, JSON.stringify({ assumptions, mode, pinnedIds, excludedIds, costOverrides })); }
    catch { /* The scenario still works when browser storage is unavailable. */ }
  }, [assumptions, mode, pinnedIds, excludedIds, costOverrides, companyId, restoredCompany, storageKey]);

  useEffect(() => {
    if (!open || !companyId) return;
    let cancelled = false;
    reviewController.current?.abort(); reviewController.current = null;
    setReviewLoading(false); setReviewError(null); setModelReview(null);
    setLoading(true); setError(null);
    loadQuoteOptimizationData(supabase, companyId, today, requestedEnd)
      .then((next) => { if (!cancelled) setData(next); })
      .catch((failure) => {
        if (cancelled) return;
        if (process.env.NODE_ENV !== "production") console.error("[quote-opportunity-calendar] data load failed", failure);
        setError("Enquiries, bookings, costs or capacity settings could not be loaded. Refresh the calendar to try again.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, companyId, today, requestedEnd, refresh, quotes]);

  useEffect(() => {
    if (!open) return;
    const update = () => { setToday(toLocalISO(new Date())); setRefresh((value) => value + 1); };
    window.addEventListener("focus", update);
    window.addEventListener(ORDER_UPDATED_EVENT, update);
    return () => { window.removeEventListener("focus", update); window.removeEventListener(ORDER_UPDATED_EVENT, update); };
  }, [open]);

  useEffect(() => {
    if (!open || !companyId) return;
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setRefresh((value) => value + 1), 400);
    };
    const channel = supabase.channel(`quote-optimizer-pipeline:${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "leads", filter: `company_id=eq.${companyId}` }, update)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `company_id=eq.${companyId}` }, update)
      .subscribe();
    // Polling also covers installations that have not enabled leads realtime.
    const interval = setInterval(() => { if (document.visibilityState === "visible") update(); }, 60000);
    return () => { clearTimeout(timer); clearInterval(interval); void supabase.removeChannel(channel); };
  }, [open, companyId]);

  const deferredAssumptions = useDeferredValue(assumptions);
  const ready = open && !currency.loading && restoredCompany === companyId
    && data?.companyId === companyId && data.start === today
    && (horizon === 0 ? data.allUpcoming : !data.allUpcoming && data.end === end);
  const prepared = useMemo(() => {
    if (!ready) return { opportunities: [] as Opportunity[], omitted: 0 };
    const scoped = data.quotes.filter((quote) => !regionId || quote.region_id === regionId);
    const result = buildOpportunities(scoped, data.catalogueCosts, deferredAssumptions, currency.code, today);
    result.opportunities = result.opportunities.map((opportunity) => {
      const override = costOverrides[opportunity.id];
      if (!validCost(override)) return opportunity;
      const cost = override * (1 + deferredAssumptions.costShockPercent / 100);
      const profit = Math.round((opportunity.revenue - cost) * 100) / 100;
      return { ...opportunity, cost, profit, margin: profit / opportunity.revenue * 100, warnings: ["Uses your total cost override."] };
    });
    return result;
  }, [ready, data, regionId, deferredAssumptions, currency.code, today, costOverrides]);
  const pipeline = useMemo(() => ready ? buildQuotePipeline({
    leads: data.leads || [], quotes: data.relatedQuotes || data.quotes, orders: data.orders || [],
    commitments: data.commitments, opportunities: prepared.opportunities, start: today, end,
    regionId, currency: currency.code,
  }) : [], [ready, data, prepared, today, end, regionId, currency.code]);
  const undated = pipeline.filter((entry) => !entry.date);
  const pinned = useMemo(() => new Set(pinnedIds), [pinnedIds]);
  const excluded = useMemo(() => new Set(excludedIds), [excludedIds]);
  const input = useMemo(() => ready ? {
    opportunities: prepared.opportunities, commitments: data.commitments, capacity: data.capacity,
    assumptions: deferredAssumptions, mode, pinned, excluded,
  } : null, [ready, prepared, data, deferredAssumptions, mode, pinned, excluded]);
  const plans = useMemo(() => {
    if (!input) return null;
    return {
      profit: optimizeQuotes({ ...input, mode: "profit" }),
      balanced: optimizeQuotes({ ...input, mode: "balanced" }),
      space: optimizeQuotes({ ...input, mode: "space" }),
    };
  }, [input]);
  const plan = plans?.[mode];
  const baseline = useMemo(() => input ? optimizeQuotes({ ...input, pinned: new Set(), excluded: new Set() }) : null, [input]);
  const firstActivityDate = useMemo(() => {
    const dates = [
      ...(data?.orders || []).map((order) => order.event_date),
      ...prepared.opportunities.map((opportunity) => opportunity.date),
      ...pipeline.map((entry) => entry.date),
    ].filter((date): date is string => !!date && date >= today && date <= end);
    return dates.sort()[0] || today;
  }, [data?.orders, prepared.opportunities, pipeline, today, end]);
  const inspectedDate = dateFilter && dateFilter >= today && dateFilter <= end ? dateFilter : firstActivityDate;
  const dayOptions = prepared.opportunities.filter((opportunity) => opportunity.date === inspectedDate);
  const dayPipeline = summarizePipelineDay(pipeline, inspectedDate);
  const inspectDate = (date: string) => setDateFilter(date);
  const reviewKey = JSON.stringify([companyId, today, end, inspectedDate, mode, assumptions, pinnedIds, excludedIds, costOverrides, data?.loadedAt, regionId, ready]);
  const activeReview = modelReview?.key === reviewKey ? modelReview : null;
  const reviewDecisions = new Map(activeReview?.review.decisions.map((decision) => [decision.quoteId, decision]) || []);
  const explainOpportunity = (opportunity: Opportunity) =>
    reviewDecisions.get(opportunity.id)?.reason || explainFromConstraints(opportunity, plan, input);
  useEffect(() => {
    reviewController.current?.abort(); reviewController.current = null;
    setReviewLoading(false); setReviewError(null);
    return () => { reviewController.current?.abort(); };
  }, [reviewKey]);
  const requestModelReview = async () => {
    if (!ready || !plan || !dayPipeline.entries.length) return;
    reviewController.current?.abort();
    const controller = new AbortController(); reviewController.current = controller;
    const timeout = setTimeout(() => controller.abort(), 115000);
    setReviewLoading(true); setReviewError(null);
    try {
      const response = await fetch("/api/admin/quotes/optimize-review", {
        method: "POST", credentials: "same-origin", signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start: today, horizon, date: inspectedDate, mode, regionId,
          assumptions, pinnedIds, excludedIds, costOverrides }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The model could not review this date. Try again shortly.");
      if (Math.abs(result.portfolioContribution - plan.profit) > 0.01 || result.totalOnDate !== dayOptions.length
        || result.pipelineSignature !== pipelineDaySignature(dayPipeline)
        || !Array.isArray(result.facts) || result.facts.some((fact: { id: string; contribution: number; hours: number; guests: number; selected: boolean }) => {
          const opportunity = prepared.opportunities.find((item) => item.id === fact.id);
          return !opportunity || Math.abs(opportunity.profit - fact.contribution) > 0.01 || opportunity.hours !== fact.hours
            || opportunity.guests !== fact.guests || plan.selectedIds.has(fact.id) !== fact.selected;
        })) throw new Error("The live data changed while this review was being prepared. Refresh the plan, then request a new review.");
      if (!controller.signal.aborted) setModelReview({ key: reviewKey, review: result.review, total: result.totalOnDate });
    } catch (failure) {
      if (reviewController.current === controller) setReviewError(controller.signal.aborted
        ? "The model review took too long. Try again; your optimizer decisions are still available."
        : failure instanceof Error ? failure.message : "Model review is unavailable. Please try again.");
    } finally {
      clearTimeout(timeout);
      if (reviewController.current === controller) { setReviewLoading(false); reviewController.current = null; }
    }
  };
  const changeAssumption = (key: keyof PlanningAssumptions, value: number) => setAssumptions((previous) => ({ ...previous, [key]: value }));
  const togglePin = (id: string) => {
    setPinnedIds((previous) => previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id]);
    setExcludedIds((previous) => previous.filter((value) => value !== id));
  };
  const toggleExclude = (id: string) => {
    setExcludedIds((previous) => previous.includes(id) ? previous.filter((value) => value !== id) : [...previous, id]);
    setPinnedIds((previous) => previous.filter((value) => value !== id));
  };
  const exportPlan = () => {
    if (!plan || plan.conflicts.length || !plan.selected.length) return;
    const text = (value: string) => `"${(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;
    const headers = ["Quote", "Client", "Event date", "Guests", "Currency", "Ex-tax revenue", "Estimated total cost", "Estimated contribution", "Margin %", "Prep hours", "Pinned", "Cost basis", "Mode", "Weekly prep budget", "Minutes per guest", "Setup hours", "Missing cost %", "Operating allowance %", "Cost stress %", "Snapshot"];
    const rows = plan.selected.map((opportunity) => [
      text(opportunity.quote.quote_number), text(opportunity.quote.client_name || ""), opportunity.date, opportunity.guests,
      currency.code, opportunity.revenue.toFixed(2), opportunity.cost.toFixed(2), opportunity.profit.toFixed(2),
      opportunity.margin.toFixed(1), opportunity.hours, pinned.has(opportunity.id) ? "Yes" : "No",
      text(validCost(costOverrides[opportunity.id]) ? "Manual total cost" : "Catalogue/snapshot costs plus assumptions"),
      text(PLANNING_MODES[mode].label), assumptions.weeklyHours, assumptions.minutesPerGuest, assumptions.setupHours,
      assumptions.unknownCostPercent, assumptions.operatingPercent, assumptions.costShockPercent, data.loadedAt,
    ].join(","));
    const url = URL.createObjectURL(new Blob(["\uFEFF", headers.join(","), "\n", rows.join("\n")], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url;
    anchor.download = `quote-plan-${today}-${mode}.csv`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <section id="quote-optimizer" aria-label="Quote opportunity calendar"
    data-chat-section="admin.quotes.optimizer" data-chat-section-label="Quote opportunity calendar"
    className="mb-6 min-w-0 rounded-xl border border-slate-200 bg-white text-slate-900 selection:bg-brand-primary/15">
    <div id="quote-optimizer-workspace">
      {loading && ready && <div role="status" className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600 sm:px-6"><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none text-brand-primary" />Refreshing live bookings and quotes…</div>}
      {loading && !ready && !error && <div role="status" aria-label="Loading quote calendar" className="space-y-5 px-4 py-8 sm:px-6">
        <p className="text-sm text-slate-600">Loading the calendar…</p>
        <div className="animate-pulse space-y-3" aria-hidden="true"><div className="h-10 rounded-md bg-slate-100" /><div className="h-80 rounded-md bg-slate-100" /></div>
      </div>}
      {error && !ready && <div role="alert" className="m-6 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><span>{error}</span><Button variant="outline" onClick={() => setRefresh((value) => value + 1)}>Try again</Button></div>}
      {error && ready && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950 sm:px-6"><span>Showing the last loaded plan. Live data could not refresh.</span><Button size="sm" variant="outline" onClick={() => setRefresh((value) => value + 1)}>Try again</Button></div>}

      {ready && plan && <>
        <QuotePipelineBoard entries={pipeline} orders={data.orders} undatedEntries={undated} commitments={data.commitments} capacity={data.capacity}
          opportunities={prepared.opportunities} selected={plan.selected} plan={plan} assumptions={deferredAssumptions} mode={mode} selectedDate={inspectedDate} start={today} end={end}
          onSelectDate={inspectDate} onTogglePin={togglePin} onToggleExclude={toggleExclude} pinnedIds={pinned} excludedIds={excluded}
          onRefresh={() => setRefresh((value) => value + 1)} refreshing={loading} onReleaseAll={() => setPinnedIds([])}
          costOverrides={costOverrides} onCostOverrideChange={(id, raw) => setCostOverrides((previous) => {
            const next = { ...previous };
            if (!raw) delete next[id]; else if (validCost(Number(raw))) next[id] = Number(raw);
            return next;
          })}
          currencyCode={currency.code} compactMoney={compactMoney} money={money} reasonFor={explainOpportunity}
          review={activeReview?.review || null} reviewTotal={activeReview?.total || 0} reviewLoading={reviewLoading} reviewError={reviewError}
          canExplain={!!dayPipeline.entries.length && assumptions === deferredAssumptions} onExplainDate={requestModelReview} />

        <details className="group border-t border-slate-200">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-primary sm:px-6 [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2 font-semibold"><Settings2 className="h-4 w-4 text-brand-primary" />Planning options <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" /></span>
            <span className="text-xs text-slate-600">{PLANNING_MODES[mode].label} · costs +{assumptions.costShockPercent}%</span>
          </summary>
          <div className="grid gap-0 border-t border-slate-200 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="p-4 sm:p-6">
              <div className="mb-4 flex items-start gap-2 text-xs leading-relaxed text-slate-600"><Info className="mt-0.5 h-4 w-4 shrink-0" /><p>Editable estimates saved in this browser for your company. Prep hours = setup + guests × minutes per guest. Contribution is ex-tax revenue less modeled costs, before fixed overhead and tax.</p></div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <label className="block space-y-1.5 text-xs font-medium text-slate-700"><span>Planning approach</span><select value={mode} onChange={(event) => setMode(event.target.value as PlanningMode)} className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/40">{modes.map((choice) => <option key={choice} value={choice}>{PLANNING_MODES[choice].label}</option>)}</select><span className="block text-xs font-normal leading-relaxed text-slate-500">Choose contribution, balance, or more capacity reserve.</span></label>
                <NumberField label="Team prep hours / week" value={assumptions.weeklyHours} min={1} max={10000} onChange={(value) => changeAssumption("weeklyHours", value)} hint="Total staff-hours, including confirmed work." />
                <NumberField label="Prep minutes / guest" value={assumptions.minutesPerGuest} min={0.1} max={120} step={0.5} onChange={(value) => changeAssumption("minutesPerGuest", value)} />
                <NumberField label="Setup hours / event" value={assumptions.setupHours} min={0} max={48} step={0.5} onChange={(value) => changeAssumption("setupHours", value)} />
                <NumberField label="Missing-cost allowance (%)" value={assumptions.unknownCostPercent} min={0} max={100} onChange={(value) => changeAssumption("unknownCostPercent", value)} />
                <NumberField label="Operating allowance (%)" value={assumptions.operatingPercent} min={0} max={100} onChange={(value) => changeAssumption("operatingPercent", value)} />
                <NumberField label="Minimum contribution margin (%)" value={assumptions.minimumMargin} min={0} max={100} onChange={(value) => changeAssumption("minimumMargin", value)} />
              </div>
              <p className="mt-4 text-xs text-slate-600">Capacity: <strong>{data.capacity.maxConcurrentEvents} events / day</strong> · <strong>{data.capacity.maxKitchenLoadPerDay == null ? "Kitchen guest limit not set" : `${data.capacity.maxKitchenLoadPerDay} kitchen guests / day`}</strong> · {data.capacity.maxGuestsPerEvent == null ? "No per-event guest limit" : `${data.capacity.maxGuestsPerEvent} guests / event`}. <Link className="font-medium text-brand-primary underline underline-offset-4" href={withSlug("/admin/settings")}>Company settings</Link></p>
              <div className="mt-5 border-t border-slate-200 pt-4"><Button size="sm" variant="outline" onClick={exportPlan} disabled={!plan.selected.length || !!plan.conflicts.length || assumptions !== deferredAssumptions}><Download />Export plan</Button><span className="ml-3 text-xs text-slate-500">{plan.selected.length} quotes · {compactMoney(plan.profit)} estimated contribution · {plan.hours.toFixed(1)} prep h</span></div>
            </div>
            <div className="border-t border-slate-200 bg-slate-50/50 p-4 sm:p-6 lg:border-l lg:border-t-0">
              <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Cost stress</h3><span className="text-sm font-semibold tabular-nums">+{assumptions.costShockPercent}%</span></div>
              <Slider aria-label="Increase modeled costs by percent" value={[assumptions.costShockPercent]} min={0} max={50} step={1} onValueChange={([value]) => changeAssumption("costShockPercent", value)} />
              <div className="mt-2 flex justify-between text-xs text-slate-500"><span>0%</span><span>50%</span></div>
            </div>
          </div>
        </details>
        <details className="border-t border-slate-200 px-4 py-4 sm:px-6"><summary className="cursor-pointer text-xs font-medium text-slate-600 focus-visible:ring-2 focus-visible:ring-brand-primary">How recommendations work</summary>
          <div className="mt-3 space-y-2 border-t border-slate-200 pt-3 text-xs leading-relaxed text-slate-600">
            <p>The optimizer respects daily events, kitchen guests, per-event limits, weekly prep hours, and one quote per client per date. {plan.searched.toLocaleString()} combinations evaluated. {plan.approximate ? "The search was bounded; a better combination may exist." : "Best feasible combination found for the modeled inputs."}</p>
            <p>Recommendations are planning choices, not quote acceptance. Confirm service times, staffing, drivers, and equipment through the quote workflow.</p>
            {baseline && !plan.conflicts.length && (pinnedIds.length > 0 || excludedIds.length > 0) && <p className="inline-flex items-center gap-1.5"><ArrowUpRight className="h-3.5 w-3.5" />Your choices change estimated contribution by {money(plan.profit - baseline.profit)} from the default scenario.</p>}
          </div>
        </details>
      </>}
    </div>
  </section>;
}
