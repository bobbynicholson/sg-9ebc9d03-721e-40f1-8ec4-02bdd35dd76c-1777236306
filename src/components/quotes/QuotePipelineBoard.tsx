import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle, ArrowRight, Banknote, Ban, BrainCircuit, CalendarDays, Check, ChevronDown, ChevronLeft,
  ChevronRight, Clock3, ExternalLink, Loader2, MapPin, Pin, RotateCcw, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTenantHref } from "@/lib/tenantUrl";
import { cn } from "@/lib/utils";
import type { DiaryEntry } from "@/lib/quoteDiarySignal";
import type { EventCapacitySettings } from "@/lib/eventCapacity";
import { isBookedPlanningOrder, pipelineCapacity, summarizePipelineDay, type PipelineEntry, type PipelineDay, type PlanningOrder } from "@/lib/quotes/quotePipeline";
import { PLANNING_MODES, planningWeek, shiftPlanningDate, type Opportunity, type OptimizationPlan, type PlanningAssumptions, type PlanningMode } from "@/lib/quotes/quoteOptimization";
import type { QuoteModelReview } from "@/lib/quotes/quoteOptimizationReview";

const dateLabel = (date: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) =>
  new Intl.DateTimeFormat("en-ZA", options).format(new Date(`${date}T12:00:00`));
const dateKey = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
const quoteExpiry = (validUntil: string, today: string) => {
  const expiryDate = validUntil.slice(0, 10);
  const remainingDays = Math.round((new Date(`${expiryDate}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86400000);
  const label = remainingDays < 0 ? `Expired ${dateLabel(expiryDate)}`
    : remainingDays === 0 ? "Expires today"
      : remainingDays === 1 ? "Expires tomorrow"
        : remainingDays <= 7 ? `Expires in ${remainingDays} days` : `Valid to ${dateLabel(expiryDate)}`;
  return { label, urgent: remainingDays <= 2, expired: remainingDays < 0 };
};
const shiftMonth = (date: string, amount: number) => {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(1);
  value.setMonth(value.getMonth() + amount);
  return dateKey(value);
};

const stateLabel = { accepted: "Booked", pending: "Pending", review: "Needs review", closed: "Closed" } as const;
const stateClass = {
  accepted: "bg-emerald-50 text-emerald-800",
  pending: "bg-brand-primary/10 text-brand-primary",
  review: "bg-amber-50 text-amber-900",
  closed: "bg-slate-100 text-slate-700",
} as const;

export function PipelineActivity({ entries, heading = "Needs attention" }: { entries: PipelineEntry[]; heading?: string }) {
  const { withSlug } = useTenantHref();
  return <section aria-label={heading}>
    <h4 className="flex items-center justify-between gap-3 text-sm font-semibold">
      <span>{heading}</span><span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs tabular-nums text-amber-900">{entries.length}</span>
    </h4>
    {entries.length > 0 ? <div className="mt-2 divide-y divide-slate-200 border-y border-slate-200">
      {entries.map((entry) => <details key={entry.key} className="py-3 first:pt-3">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary">
          <span className="min-w-0">
            <span className="block break-words text-sm font-semibold text-slate-900">{entry.label}</span>
            <span className="mt-1 block text-xs text-slate-600">{entry.guests ? `${entry.guests} guests` : "Guests to confirm"} · {entry.order?.order_number || entry.quotes[0]?.quote_number || "No quote yet"}</span>
          </span>
          <span className={cn("shrink-0 rounded px-2 py-1 text-[11px] font-medium", stateClass[entry.state])}>{stateLabel[entry.state]}</span>
        </summary>
        <div className="pl-1">
          {entry.reasons.length > 0 && <p className="mt-2 text-xs leading-relaxed text-slate-600">{entry.reasons.join(" ")}</p>}
          {entry.duplicateGroup && <p className="mt-2 text-xs leading-relaxed text-amber-900">Possible duplicate: {entry.duplicatePeers.length} other record{entry.duplicatePeers.length === 1 ? "" : "s"} share this contact and date. Compare before proceeding.</p>}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-brand-primary">
            {entry.order && <Link className="inline-flex items-center gap-1 underline-offset-4 hover:underline" href={`/order/${entry.order.id}`}>Review order <ExternalLink className="h-3 w-3" /></Link>}
            {entry.leads[0] && <Link className="inline-flex items-center gap-1 underline-offset-4 hover:underline" href={withSlug(`/admin/leads?leadId=${entry.leads[0].id}`)}>Review enquiry <ExternalLink className="h-3 w-3" /></Link>}
            {!entry.quotes.length && !entry.order && entry.leads[0] && entry.state !== "closed" && <Link className="inline-flex items-center gap-1 underline-offset-4 hover:underline" href={withSlug(`/admin/quotes/new?leadId=${entry.leads[0].id}`)}>Prepare quote <ArrowRight className="h-3 w-3" /></Link>}
            {entry.quotes.map((quote) => <Link key={quote.id} className="inline-flex items-center gap-1 underline-offset-4 hover:underline" href={withSlug(`/admin/quotes/new?fromQuoteId=${quote.id}`)}>{entry.quotes.length > 1 ? `Review ${quote.quote_number}` : "Review quote"} <ExternalLink className="h-3 w-3" /></Link>)}
          </div>
        </div>
      </details>)}
    </div> : <p className="mt-2 text-xs text-slate-500">None</p>}
  </section>;
}

function CapacityBar({ booked, proposed, limit }: { booked: number; proposed: number; limit: number }) {
  const scale = Math.max(limit, booked + proposed, 1);
  return <div className="flex h-2 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${booked} booked and ${proposed} recommended of ${limit} event slots`}>
    {booked > 0 && <span className={cn("h-full", booked > limit ? "bg-rose-600" : "bg-slate-400")} style={{ width: `${booked / scale * 100}%` }} />}
    {proposed > 0 && <span className="h-full bg-brand-primary" style={{ width: `${proposed / scale * 100}%` }} />}
  </div>;
}

export function PipelineDateSummary({ day, commitments, capacity, selected, opportunityCount, compactMoney, weeklyBookedHours, weeklyPlannedHours, weeklyBudgetHours, weeklyTeamHours, weeklyReservePercent, weeklyLabel, weeklyUnknownGuests }: {
  day: PipelineDay; commitments: DiaryEntry[]; capacity: EventCapacitySettings; selected: Opportunity[]; opportunityCount: number;
  compactMoney: (value: number) => string;
  weeklyBookedHours: number; weeklyPlannedHours: number; weeklyBudgetHours: number; weeklyTeamHours: number;
  weeklyReservePercent: number; weeklyLabel: string; weeklyUnknownGuests: number;
}) {
  const load = pipelineCapacity(day, commitments, capacity, selected);
  const prepHours = selected.reduce((sum, opportunity) => sum + opportunity.hours, 0);
  const contribution = selected.reduce((sum, opportunity) => sum + opportunity.profit, 0);
  const proposedGuests = selected.reduce((sum, opportunity) => sum + opportunity.guests, 0);
  const projectedGuests = load.bookedGuests + proposedGuests;
  const weeklyUsedHours = weeklyBookedHours + weeklyPlannedHours;
  const weeklyRemainingHours = weeklyBudgetHours - weeklyUsedHours;
  const weeklyOverflow = weeklyRemainingHours < -0.01;
  const weeklyScale = Math.max(weeklyBudgetHours, weeklyUsedHours, 1);
  const metrics = [
    { label: "Booked", value: `${load.booked} / ${capacity.maxConcurrentEvents}`, icon: CalendarDays },
    { label: "Opportunities", value: String(opportunityCount), icon: Users },
    { label: "In plan", value: String(selected.length), icon: Check },
    { label: "Plan contrib.", value: compactMoney(contribution), icon: Banknote },
    { label: "Plan prep", value: `${prepHours.toFixed(1)} h`, icon: Clock3 },
    { label: "Need review", value: String(day.review), icon: AlertCircle },
  ];
  return <section aria-label="Day at a glance" className="mt-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Day at a glance</h4>
    <div className="mt-2 grid grid-cols-2 gap-1.5 xl:grid-cols-3">
      {metrics.map(({ label, value, icon: Icon }) => <div key={label} className="flex min-w-0 items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1.5">
        <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-brand-primary" />
        <span className="min-w-0"><span className="block truncate text-[10px] text-slate-500">{label}</span><strong className="block truncate text-xs tabular-nums text-slate-900">{value}</strong></span>
      </div>)}
    </div>
    <div className="mt-3 flex items-center gap-3">
      <CapacityBar booked={load.booked} proposed={selected.length} limit={capacity.maxConcurrentEvents} />
      <span className="shrink-0 text-[11px] tabular-nums text-slate-600">{load.afterPlanEvents} slot{load.afterPlanEvents === 1 ? "" : "s"} free</span>
    </div>
    <div className="mt-3 border-t border-slate-100 pt-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-[11px]">
        <strong className="text-slate-800">Weekly prep · {weeklyLabel}</strong>
        <span className="tabular-nums text-slate-600">{weeklyBookedHours.toFixed(1)} h booked + {weeklyPlannedHours.toFixed(1)} h planned</span>
      </div>
      <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${weeklyUsedHours.toFixed(1)} of ${weeklyBudgetHours.toFixed(1)} allowed weekly prep hours used`}>
        {weeklyBookedHours > 0 && <span className={cn("h-full", weeklyOverflow && weeklyBookedHours >= weeklyBudgetHours ? "bg-rose-600" : "bg-slate-400")} style={{ width: `${Math.min(100, weeklyBookedHours / weeklyScale * 100)}%` }} />}
        {weeklyPlannedHours > 0 && <span className={cn("h-full", weeklyOverflow ? "bg-rose-600" : "bg-brand-primary")} style={{ width: `${Math.min(100, weeklyPlannedHours / weeklyScale * 100)}%` }} />}
      </div>
      <p className={cn("mt-1 text-[10px] leading-relaxed", weeklyOverflow ? "font-medium text-rose-800" : "text-slate-500")}>
        {weeklyOverflow ? `${Math.abs(weeklyRemainingHours).toFixed(1)} h over the planning limit` : `${weeklyRemainingHours.toFixed(1)} h remaining`}
        {` · ${weeklyBudgetHours.toFixed(1)} h limit from ${weeklyTeamHours.toFixed(1)} h team capacity`}
        {weeklyReservePercent > 0 ? ` with ${weeklyReservePercent}% reserve` : ""}
        {weeklyUnknownGuests > 0 ? ` · ${weeklyUnknownGuests} booking${weeklyUnknownGuests === 1 ? "" : "s"} missing guest counts` : ""}
      </p>
    </div>
    <p className="mt-2 text-xs leading-relaxed text-slate-600">
      {load.unknownGuests ? "Booked guest counts are incomplete." : capacity.maxKitchenLoadPerDay == null ? "Kitchen guest limit not set." : `${projectedGuests} / ${capacity.maxKitchenLoadPerDay} kitchen guests after plan.`}
      {load.remainingEvents === 0 && " Event slots are full."}
    </p>
  </section>;
}

interface QuoteLineDetail {
  name: string;
  category: string | null;
  description: string | null;
  dietaryTags: string[];
  quantity: number | null;
  quantityUnit: string;
  fromStock: number | null;
  fromHire: number | null;
}

function quoteLineDetails(value: unknown, equipment = false): QuoteLineDetail[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw): QuoteLineDetail[] => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const item = raw as Record<string, unknown>;
    const nameValue = item.item_name ?? item.name;
    const name = typeof nameValue === "string" ? nameValue.trim() : "";
    if (!name) return [];
    const category = typeof item.category === "string" && item.category.trim() ? item.category.trim().replace(/_/g, " ") : null;
    const tags = Array.isArray(item.dietary_tags) ? item.dietary_tags.filter((tag): tag is string => typeof tag === "string" && !!tag.trim()).map((tag) => tag.trim()) : [];
    const quantityValue = Number(item.quantity);
    const quantity = Number.isFinite(quantityValue) && quantityValue > 0 ? quantityValue : null;
    const mode = String(item.pricing_mode ?? item.pricingMode ?? "per_person");
    const description = typeof item.description === "string" && item.description.trim() ? item.description.trim() : null;
    const stockValue = item.from_stock_qty == null ? Number.NaN : Number(item.from_stock_qty);
    const hireValue = item.from_hire_qty == null ? Number.NaN : Number(item.from_hire_qty);
    return [{
      name, category, description, dietaryTags: tags, quantity,
      quantityUnit: equipment ? "units" : mode === "flat" ? "package" : mode === "per_portion" ? "portions" : "servings",
      fromStock: equipment && Number.isFinite(stockValue) ? stockValue : null,
      fromHire: equipment && Number.isFinite(hireValue) ? hireValue : null,
    }];
  });
}

function OrderRows({ orders, acceptedQuotes, money, withSlug }: { orders: PlanningOrder[]; acceptedQuotes: PipelineEntry[]; money: (amount: number, currency?: string | null) => string; withSlug: (path: string) => string }) {
  const dateOrders = orders.filter((order) => order.event_date && order.status && !order.deleted_at)
    .sort((a, b) => (a.event_time || "99").localeCompare(b.event_time || "99"));
  const accepted = acceptedQuotes.filter((entry) => !entry.order);
  const total = dateOrders.length + accepted.length;
  return <section aria-labelledby="calendar-orders-title">
    <h4 id="calendar-orders-title" className="flex items-center justify-between gap-3 text-sm font-semibold"><span>Orders & accepted quotes</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs tabular-nums text-slate-700">{total}</span></h4>
    <p className="mt-1 text-xs text-slate-500">Orders and accepted quotes on this date, with status</p>
    {total > 0 ? <div className="mt-2 space-y-1.5">
      {dateOrders.map((order) => <article key={`order-${order.id}`} className="rounded-lg border border-slate-200 bg-white p-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/order/${order.id}`} className="break-words text-sm font-semibold text-brand-primary underline-offset-4 hover:underline">{order.client_name || order.event_name || order.order_number || "Booking"}</Link>
            <p className="mt-1 text-xs tabular-nums text-slate-600">{order.order_number || "Order"} · {Number(order.guest_count) > 0 ? `${order.guest_count} guests` : "Guests to confirm"}{order.event_time ? ` · ${order.event_time.slice(0, 5)}` : " · Time to confirm"}</p>
            {order.event_name && order.client_name && order.event_name !== order.client_name && <p className="mt-1 text-xs text-slate-600">{order.event_name}</p>}
            {(order.venue_name || order.venue_address) && <div className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-slate-600">
              <MapPin aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="min-w-0">{order.venue_name && <span className="block font-medium text-slate-700">{order.venue_name}</span>}{order.venue_address && <span className="block break-words">{order.venue_address}</span>}
                <a className="mt-0.5 inline-flex items-center gap-1 font-medium text-brand-primary underline-offset-4 hover:underline" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.venue_lat != null && order.venue_lng != null ? `${order.venue_lat},${order.venue_lng}` : order.venue_address || order.venue_name || "")}`} target="_blank" rel="noreferrer">Open map <ExternalLink className="h-3 w-3" /></a>
              </span>
            </div>}
          </div>
          <div className="shrink-0 text-right"><strong className="block text-sm tabular-nums text-slate-900">{order.total_amount == null ? "—" : money(Number(order.total_amount), order.currency)}</strong><span className={cn("mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium", isBookedPlanningOrder(order) ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900")}>{order.status.replace(/_/g, " ")}</span></div>
        </div>
      </article>)}
      {accepted.map((entry) => <article key={entry.key} className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2.5">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link href={withSlug(`/admin/quotes/new?fromQuoteId=${entry.quotes[0]?.id}`)} className="break-words text-sm font-semibold text-brand-primary underline-offset-4 hover:underline">{entry.label}</Link><p className="mt-1 text-xs text-slate-600">{entry.quotes[0]?.quote_number || "Accepted quote"} · {entry.guests ? `${entry.guests} guests` : "Guests to confirm"}</p></div><span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">Accepted</span></div>
      </article>)}
    </div> : <p className="mt-2 rounded-md bg-slate-50 px-3 py-3 text-xs text-slate-600">No orders booked on this date.</p>}
  </section>;
}

function OpportunityRows({ opportunities, selected, plan, pinnedIds, excludedIds, costOverrides, currencyCode, compactMoney, reasonFor, assumptions, leadNotesByQuote, onTogglePin, onToggleExclude, onCostOverrideChange, withSlug }: {
  opportunities: Opportunity[]; selected: Opportunity[]; plan: OptimizationPlan; pinnedIds: ReadonlySet<string>; excludedIds: ReadonlySet<string>;
  costOverrides: Record<string, number>; currencyCode: string; compactMoney: (value: number) => string; reasonFor: (opportunity: Opportunity) => string;
  assumptions: PlanningAssumptions; leadNotesByQuote: ReadonlyMap<string, string[]>;
  onTogglePin: (id: string) => void; onToggleExclude: (id: string) => void; onCostOverrideChange: (id: string, raw: string) => void; withSlug: (path: string) => string;
}) {
  const sorted = [...opportunities].sort((a, b) => Number(plan.selectedIds.has(b.id)) - Number(plan.selectedIds.has(a.id)) || b.profit - a.profit);
  const highestContribution = Math.max(...opportunities.map((opportunity) => opportunity.profit), -Infinity);
  const strongestMargin = Math.max(...opportunities.map((opportunity) => opportunity.margin), -Infinity);
  const lowestPrep = Math.min(...opportunities.map((opportunity) => opportunity.hours), Infinity);
  const bestContributionPerPrepHour = Math.max(...opportunities.map((opportunity) => opportunity.profit / Math.max(opportunity.hours, 0.01)), -Infinity);
  const todayKey = dateKey(new Date());
  const groupedOpportunities = new Map<string, Opportunity[]>();
  sorted.forEach((opportunity) => groupedOpportunities.set(opportunity.group, [...(groupedOpportunities.get(opportunity.group) || []), opportunity]));
  return <section className="mt-4" aria-labelledby="calendar-opportunities-title">
    <h4 id="calendar-opportunities-title" className="flex items-center justify-between gap-3 text-sm font-semibold"><span>Quote opportunities</span><span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-xs tabular-nums text-brand-primary">{sorted.length}</span></h4>
    <p className="mt-1 text-xs text-slate-500">Compare value, workload and cost notes, then add with one click.</p>
    {sorted.length > 0 ? <div className="mt-2 space-y-1.5">
      {[...groupedOpportunities.entries()].map(([groupId, groupOptions]) => {
        const hasAlternatives = groupOptions.length > 1;
        const groupClient = groupOptions[0].quote.client_name || groupOptions[0].quote.quote_name || "Client options";
        const recommendedOption = groupOptions.find((option) => plan.selectedIds.has(option.id));
        return <section key={groupId} className={hasAlternatives ? "rounded-lg border border-slate-300 bg-slate-50/70 p-2" : "space-y-1.5"} aria-label={hasAlternatives ? `${groupOptions.length} quote options for ${groupClient}` : undefined}>
          {hasAlternatives && <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
            <div><h5 className="text-xs font-semibold text-slate-900">{groupClient}</h5><p className="text-[10px] text-slate-500">{groupOptions.length} quote options for this date · choose one</p></div>
            <span className="rounded bg-white px-2 py-1 text-[10px] font-medium text-slate-700">{recommendedOption ? `In plan: ${recommendedOption.quote.quote_number}` : "No option in plan"}</span>
          </div>}
          <div className="space-y-1.5">
      {groupOptions.map((opportunity) => {
        const inPlan = plan.selectedIds.has(opportunity.id);
        const compactAlternative = hasAlternatives && !inPlan;
        const pinned = pinnedIds.has(opportunity.id);
        const excluded = excludedIds.has(opportunity.id);
        const foodLines = quoteLineDetails(opportunity.quote.menu_items);
        const equipmentLines = quoteLineDetails(opportunity.quote.equipment_items, true);
        const dietaryTags = [...new Set(foodLines.flatMap((line) => line.dietaryTags))];
        const enquiryNotes = leadNotesByQuote.get(opportunity.id) || [];
        const expiry = opportunity.quote.valid_until ? quoteExpiry(opportunity.quote.valid_until, todayKey) : null;
        const opportunityCard = <article key={opportunity.id} className={cn("rounded-lg border p-2.5", inPlan ? "border-brand-primary/30 bg-brand-primary/[0.025]" : "border-slate-200 bg-white")}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={withSlug(`/admin/quotes/new?fromQuoteId=${opportunity.id}`)} className="break-words text-sm font-semibold text-slate-900 underline-offset-4 hover:text-brand-primary hover:underline">{hasAlternatives ? opportunity.quote.quote_number : opportunity.quote.client_name || opportunity.quote.quote_name || opportunity.quote.quote_number}</Link>
              <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-relaxed text-slate-600">
                {!hasAlternatives && <span>{opportunity.quote.quote_number}</span>}<span>{opportunity.guests} guests</span>
                {opportunity.quote.event_type && <span>{opportunity.quote.event_type}</span>}
                {opportunity.quote.event_time && <span>{opportunity.quote.event_time.slice(0, 5)}</span>}
                <span>{opportunity.hours.toFixed(1)} h prep</span>
                {expiry && <span className={cn("rounded px-1.5 py-0.5", expiry.expired ? "bg-rose-50 text-rose-800" : expiry.urgent ? "bg-amber-50 text-amber-900" : "bg-slate-100 text-slate-600")}>{expiry.label}</span>}
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500">Prep: {assumptions.setupHours.toFixed(1)} h setup + {opportunity.guests} guests x {assumptions.minutesPerGuest.toFixed(1)} min = {opportunity.hours.toFixed(1)} h; menu complexity excluded.</p>
            </div>
            <div className="shrink-0 text-right"><strong className={cn("block text-sm tabular-nums", opportunity.profit < 0 ? "text-rose-700" : "text-slate-900")}>{compactMoney(opportunity.profit)}</strong><span className="text-[11px] text-slate-500">est. contribution</span></div>
          </div>
          <div className="mt-2 grid grid-cols-3 divide-x divide-slate-200 border-y border-slate-200 py-1.5 text-xs">
            <div className="min-w-0 pr-2"><span className="block text-[10px] text-slate-500">Quote value</span><strong className="block truncate tabular-nums text-slate-900">{compactMoney(opportunity.revenue)}</strong></div>
            <div className="min-w-0 px-2"><span className="block text-[10px] text-slate-500">Est. costs</span><strong className="block truncate tabular-nums text-slate-900">{compactMoney(opportunity.cost)}</strong></div>
            <div className="min-w-0 pl-2"><span className="block text-[10px] text-slate-500">Margin</span><strong className="block truncate tabular-nums text-slate-900">{opportunity.margin.toFixed(0)}%</strong></div>
          </div>
          <div className="mt-2">
            {opportunities.length > 1 && <div className="flex flex-wrap gap-1">
              {opportunity.profit === highestContribution && <span className="rounded bg-white px-2 py-1 text-[10px] font-medium text-slate-700">Highest contribution</span>}
              {opportunity.margin === strongestMargin && <span className="rounded bg-white px-2 py-1 text-[10px] font-medium text-slate-700">Strongest margin</span>}
              {opportunity.hours === lowestPrep && <span className="rounded bg-white px-2 py-1 text-[10px] font-medium text-slate-700">Lowest prep load</span>}
              {opportunity.profit / Math.max(opportunity.hours, 0.01) === bestContributionPerPrepHour && <span className="rounded bg-white px-2 py-1 text-[10px] font-medium text-slate-700">Best contribution per prep hour</span>}
            </div>}
            <p className="mt-1 text-xs leading-snug text-slate-700"><span className="font-semibold">Why:</span> {reasonFor(opportunity)}</p>
          </div>
          <details open={compactAlternative} className="mt-2 rounded-md border border-slate-200 bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md px-2.5 py-2 text-xs font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary">
              <span className="min-w-0"><span className="block">Food and event needs</span><span className="block max-w-56 truncate text-[10px] font-normal text-slate-500" title={`${foodLines.map((line) => line.name).join(", ") || "No menu specified"} | Menu tags: ${dietaryTags.join(", ") || "none recorded"}`}>{foodLines.length ? foodLines.slice(0, 2).map((line) => line.name).join(", ") : "No menu specified"} | Menu tags: {dietaryTags.length ? dietaryTags.join(", ") : "none recorded"}</span></span>
              <span className="flex items-center gap-2 text-[11px] font-normal text-slate-500"><span>{foodLines.length} food | {equipmentLines.length} equipment</span><ChevronDown className="h-3.5 w-3.5" /></span>
            </summary>
            <div className="space-y-3 border-t border-slate-100 px-2.5 py-3 text-xs">
              <div className="grid grid-cols-2 gap-2 text-slate-600">
                {opportunity.quote.event_type && <p><span className="block text-[10px] text-slate-500">Event</span><strong className="font-medium text-slate-800">{opportunity.quote.event_type}</strong></p>}
                {opportunity.quote.event_time && <p><span className="block text-[10px] text-slate-500">Requested time</span><strong className="font-medium tabular-nums text-slate-800">{opportunity.quote.event_time.slice(0, 5)}</strong></p>}
                {(opportunity.quote.contact_name || opportunity.quote.client_email || opportunity.quote.client_phone) && <div className="col-span-2"><span className="block text-[10px] text-slate-500">Client contact</span><span className="text-slate-800">{opportunity.quote.contact_name || opportunity.quote.client_name || "Contact"}{opportunity.quote.client_company_name ? ` | ${opportunity.quote.client_company_name}` : ""}</span><div className="mt-0.5 flex flex-wrap gap-x-3">{opportunity.quote.client_email && <a className="font-medium text-brand-primary underline-offset-4 hover:underline" href={`mailto:${encodeURIComponent(opportunity.quote.client_email)}`}>{opportunity.quote.client_email}</a>}{opportunity.quote.client_phone && <a className="font-medium text-brand-primary underline-offset-4 hover:underline" href={`tel:${encodeURIComponent(opportunity.quote.client_phone)}`}>{opportunity.quote.client_phone}</a>}</div></div>}
                {(opportunity.quote.venue_address || opportunity.quote.venue_lat != null) && <p className="col-span-2"><span className="block text-[10px] text-slate-500">Venue</span><span className="text-slate-800">{opportunity.quote.venue_address || "Map location provided"}</span><a className="ml-2 font-medium text-brand-primary underline-offset-4 hover:underline" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(opportunity.quote.venue_lat != null && opportunity.quote.venue_lng != null ? `${opportunity.quote.venue_lat},${opportunity.quote.venue_lng}` : opportunity.quote.venue_address || "")}`} target="_blank" rel="noreferrer">Open map</a></p>}
              </div>
              <div>
                <p className="font-semibold text-slate-700">Menu</p>
                {foodLines.length ? <ul className="mt-1 space-y-2">{foodLines.map((line, index) => <li key={`${line.name}-${index}`} className="rounded bg-slate-50 px-2 py-1.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2"><strong className="text-slate-900">{line.name}</strong><span className="capitalize text-slate-600">{line.quantity != null ? `${line.quantity} ${line.quantityUnit}` : "Quantity not specified"}{line.category ? ` | ${line.category}` : ""}</span></div>
                  {line.description && <p className="mt-1 leading-relaxed text-slate-600">{line.description}</p>}
                  {line.dietaryTags.length > 0 && <p className="mt-1 text-slate-700">Menu catalogue tags: {line.dietaryTags.join(", ")}</p>}
                </li>)}</ul> : <p className="mt-1 text-slate-500">No menu items recorded on this quote.</p>}
                <p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-[11px] leading-relaxed text-amber-900"><strong>Client dietary needs:</strong> Menu tags describe catalogue items; they do not confirm the client&apos;s requirements. {enquiryNotes.length || opportunity.quote.notes ? "Review the notes below and verify with the client." : "No separate client requirement is recorded; confirm with the client."}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-700">Equipment</p>
                {equipmentLines.length ? <ul className="mt-1 space-y-1">{equipmentLines.map((line, index) => <li key={`${line.name}-${index}`} className="flex flex-wrap justify-between gap-x-2 rounded bg-slate-50 px-2 py-1.5"><span className="font-medium text-slate-800">{line.name}{line.category ? ` | ${line.category}` : ""}</span><span className="text-slate-600">{line.quantity != null ? `${line.quantity} ${line.quantityUnit}` : "Quantity not specified"}{line.fromStock != null ? ` | ${line.fromStock} from stock` : ""}{line.fromHire != null ? ` | ${line.fromHire} to hire` : ""}</span></li>)}</ul> : <p className="mt-1 text-slate-500">No equipment items recorded on this quote.</p>}
              </div>
              {opportunity.quote.notes && <div><p className="font-semibold text-slate-700">Quote notes</p><p className="mt-1 whitespace-pre-wrap leading-relaxed text-slate-600">{opportunity.quote.notes}</p></div>}
              {enquiryNotes.map((note, index) => <div key={`${opportunity.id}-note-${index}`}><p className="font-semibold text-slate-700">Enquiry notes</p><p className="mt-1 whitespace-pre-wrap leading-relaxed text-slate-600">{note}</p></div>)}
              <p className="border-t border-slate-100 pt-2 text-[11px] leading-relaxed text-slate-500">Prep uses guest count and planning assumptions. Menu complexity may require extra kitchen time.</p>
            </div>
          </details>
          {opportunity.warnings.length > 0 && <div className="mt-2 rounded-md bg-amber-50 px-2.5 py-2 text-xs leading-relaxed text-amber-950"><span className="font-semibold">Cost note:</span> {opportunity.warnings.join(" ")}</div>}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {!compactAlternative && <>
              <span className={cn("rounded px-2 py-1 text-[10px] font-medium", excluded ? "bg-rose-50 text-rose-800" : inPlan ? "bg-brand-primary/10 text-brand-primary" : "bg-slate-100 text-slate-600")}>
                {excluded ? "Held out" : inPlan ? "Recommended" : "Alternative"}
              </span>
              {pinned && <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-700">Kept by you</span>}
              <Button size="sm" variant={pinned ? "default" : "outline"} aria-pressed={pinned} aria-label={pinned ? "Remove this manual pin" : inPlan ? "Keep this quote in the plan" : "Add this quote to the plan"} title={pinned ? "Remove this manual pin" : inPlan ? "Keep this quote in the plan" : "Add this quote to the plan"} onClick={() => onTogglePin(opportunity.id)}><Pin className={pinned ? "fill-current" : ""} />{pinned ? "Pinned" : inPlan ? "Keep" : "Add to plan"}</Button>
              <Button size="sm" variant="ghost" aria-pressed={excluded} onClick={() => onToggleExclude(opportunity.id)}><Ban />{excluded ? "Restore" : "Hold out"}</Button>
            </>}
            <details open={compactAlternative} className={cn("text-xs", !compactAlternative && "ml-auto")}>
              <summary className="cursor-pointer rounded-sm py-2 font-medium text-slate-600 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary">Why / costs</summary>
              <div className="mt-2 w-full min-w-64 space-y-2 rounded-md border border-slate-200 bg-white p-3">
                <p className="leading-relaxed text-slate-600">{reasonFor(opportunity)}</p>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-y border-slate-100 py-2 text-xs"><dt className="text-slate-500">Verified costs</dt><dd className="text-right tabular-nums text-slate-800">{compactMoney(opportunity.knownCost)}</dd><dt className="text-slate-500">Cost allowance</dt><dd className="text-right tabular-nums text-slate-800">{compactMoney(opportunity.estimatedCost)}</dd><dt className="text-slate-500">Operations allowance</dt><dd className="text-right tabular-nums text-slate-800">{compactMoney(opportunity.operatingCost)}</dd><dt className="text-slate-500">Cost coverage</dt><dd className="text-right tabular-nums text-slate-800">{Math.round(opportunity.coverage * 100)}%</dd></dl>
                {opportunity.warnings.map((warning) => <p key={warning} className="leading-relaxed text-amber-900">{warning}</p>)}
                <label className="block space-y-1 font-medium text-slate-700">Optional total cost adjustment ({currencyCode}, before stress)
                  <span className="block font-normal text-slate-500">Leave blank to use the estimate.</span>
                  <Input type="number" min={0} step="0.01" placeholder="Use estimate" value={costOverrides[opportunity.id] ?? ""} onChange={(event) => onCostOverrideChange(opportunity.id, event.target.value)} />
                </label>
              </div>
            </details>
          </div>
        </article>;
        if (!compactAlternative) return opportunityCard;
        return <div key={opportunity.id} className="rounded-lg border border-slate-200 bg-white p-2.5">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5"><Link href={withSlug(`/admin/quotes/new?fromQuoteId=${opportunity.id}`)} className="text-xs font-semibold text-brand-primary underline-offset-4 hover:underline">{opportunity.quote.quote_number}</Link><span className={cn("rounded px-1.5 py-0.5 text-[9px] font-medium", pinned ? "bg-brand-primary/10 text-brand-primary" : excluded ? "bg-rose-50 text-rose-800" : "bg-slate-100 text-slate-600")}>{pinned ? "Kept by you" : excluded ? "Held out" : "Alternative"}</span></div>
              <p className="mt-0.5 text-[10px] text-slate-600">{opportunity.guests} guests · {opportunity.hours.toFixed(1)} h prep{opportunity.quote.event_time ? ` · ${opportunity.quote.event_time.slice(0, 5)}` : ""}</p>
              <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px]">
                <span className="text-slate-500">Quote value <strong className="ml-1 tabular-nums text-slate-800">{compactMoney(opportunity.revenue)}</strong></span>
                <span className="text-slate-500">Est. costs <strong className="ml-1 tabular-nums text-slate-800">{compactMoney(opportunity.cost)}</strong></span>
                <span className="text-slate-500">Contribution <strong className="ml-1 tabular-nums text-slate-800">{compactMoney(opportunity.profit)}</strong></span>
                <span className="text-slate-500">Margin <strong className="ml-1 tabular-nums text-slate-800">{opportunity.margin.toFixed(0)}%</strong></span>
              </div>
              <p className="mt-1 text-[10px] leading-snug text-slate-600"><strong>Why:</strong> {reasonFor(opportunity)}</p>
              {expiry && <span className={cn("mt-1 inline-block rounded px-1.5 py-0.5 text-[10px]", expiry.expired ? "bg-rose-50 text-rose-800" : expiry.urgent ? "bg-amber-50 text-amber-900" : "bg-slate-100 text-slate-600")}>{expiry.label}</span>}
            </div>
            <div className="flex shrink-0 gap-1">
              <Button size="sm" variant={pinned ? "default" : "outline"} aria-label={`${pinned ? "Remove pin for" : "Add"} ${opportunity.quote.quote_number} ${pinned ? "from plan" : "to plan"}`} title={pinned ? "Remove this manual pin" : "Add this quote to the plan"} aria-pressed={pinned} onClick={() => onTogglePin(opportunity.id)}><Pin />{pinned ? "Unpin" : "Add"}</Button>
              <Button size="sm" variant="ghost" aria-label={`${excluded ? "Restore" : "Hold out"} ${opportunity.quote.quote_number}`} title={excluded ? "Restore this quote" : "Hold out this quote"} aria-pressed={excluded} onClick={() => onToggleExclude(opportunity.id)}><Ban />{excluded ? "Restore" : "Hold"}</Button>
            </div>
          </div>
          <details className="mt-1.5 border-t border-slate-100 pt-1.5">
            <summary className="cursor-pointer text-[10px] font-medium text-slate-600">Full food, event and cost details</summary>
            {opportunityCard}
          </details>
        </div>;
      })}
          </div>
        </section>;
      })}
    </div> : <p className="mt-2 rounded-md bg-slate-50 px-3 py-3 text-xs text-slate-600">No priced quotes to compare on this date.</p>}
  </section>;
}

export default function QuotePipelineBoard({ entries, orders, undatedEntries, commitments, capacity, opportunities, selected, plan, assumptions, mode, selectedDate, start, end,
  onSelectDate, onTogglePin, onToggleExclude, pinnedIds, excludedIds, costOverrides, onCostOverrideChange, currencyCode, compactMoney, money, reasonFor,
  review, reviewTotal, reviewLoading, reviewError, canExplain, onExplainDate, onRefresh, refreshing, onReleaseAll,
}: {
  entries: PipelineEntry[]; orders: PlanningOrder[]; undatedEntries: PipelineEntry[]; commitments: DiaryEntry[]; capacity: EventCapacitySettings;
  opportunities: Opportunity[]; selected: Opportunity[]; plan: OptimizationPlan; assumptions: PlanningAssumptions; mode: PlanningMode; selectedDate: string; start: string; end: string;
  onSelectDate: (date: string) => void; onTogglePin: (id: string) => void; onToggleExclude: (id: string) => void;
  pinnedIds: ReadonlySet<string>; excludedIds: ReadonlySet<string>; costOverrides: Record<string, number>; onCostOverrideChange: (id: string, raw: string) => void;
  currencyCode: string; compactMoney: (value: number) => string; money: (value: number, currency?: string | null) => string;
  reasonFor: (opportunity: Opportunity) => string; review: QuoteModelReview | null; reviewTotal: number; reviewLoading: boolean; reviewError: string | null;
  canExplain: boolean; onExplainDate: () => void;
  onRefresh: () => void; refreshing: boolean; onReleaseAll: () => void;
}) {
  const { withSlug } = useTenantHref();
  const [calendarMonth, setCalendarMonth] = useState(`${selectedDate.slice(0, 7)}-01`);
  useEffect(() => { setCalendarMonth(`${selectedDate.slice(0, 7)}-01`); }, [selectedDate]);
  const firstOfMonth = new Date(`${calendarMonth}T12:00:00`);
  const monthName = new Intl.DateTimeFormat("en-ZA", { month: "long", year: "numeric" }).format(firstOfMonth);
  const monthFirst = dateKey(firstOfMonth);
  const nextMonth = shiftMonth(monthFirst, 1);
  const nextMonthLast = new Date(`${nextMonth}T12:00:00`);
  nextMonthLast.setDate(0);
  const monthLast = dateKey(nextMonthLast);
  const gridStartDate = new Date(`${monthFirst}T12:00:00`);
  gridStartDate.setDate(gridStartDate.getDate() - ((gridStartDate.getDay() + 6) % 7));
  const gridStart = dateKey(gridStartDate);
  const weekdayOffset = Math.round((firstOfMonth.getTime() - gridStartDate.getTime()) / 86400000);
  const monthDays = Number(monthLast.slice(-2));
  const gridLength = Math.ceil((weekdayOffset + monthDays) / 7) * 7;
  const todayKey = dateKey(new Date());
  const monthEntries = entries.filter((entry) => entry.date && entry.date >= monthFirst && entry.date <= monthLast);
  const monthOpportunities = opportunities.filter((opportunity) => opportunity.date >= monthFirst && opportunity.date <= monthLast);
  const monthOrders = orders.filter((order) => !order.deleted_at && order.event_date && order.event_date >= start && order.event_date <= end && order.event_date >= monthFirst && order.event_date <= monthLast).length;
  const monthBooked = commitments.filter((entry) => entry.date >= start && entry.date <= end && entry.date >= monthFirst && entry.date <= monthLast).length;
  const monthReview = monthEntries.filter((entry) => entry.state === "review").length;
  const monthSelected = selected.filter((opportunity) => opportunity.date >= monthFirst && opportunity.date <= monthLast).length;
  const canGoPrevious = shiftMonth(monthFirst, -1) >= `${start.slice(0, 7)}-01`;
  const canGoNext = nextMonth <= `${end.slice(0, 7)}-01`;
  const day = summarizePipelineDay(entries, selectedDate);
  const leadNotesByQuote = new Map<string, string[]>();
  day.entries.forEach((entry) => {
    const notes = entry.leads.map((lead) => lead.notes?.trim()).filter((note): note is string => !!note);
    entry.quotes.forEach((quote) => {
      if (notes.length) leadNotesByQuote.set(quote.id, [...new Set([...(leadNotesByQuote.get(quote.id) || []), ...notes])]);
    });
  });
  const dayOpportunities = opportunities.filter((opportunity) => opportunity.date === selectedDate);
  const daySelected = selected.filter((opportunity) => opportunity.date === selectedDate);
  const dayOrders = orders.filter((order) => !order.deleted_at && order.event_date === selectedDate);
  const acceptedQuotes = day.entries.filter((entry) => entry.state === "accepted" && !entry.order);
  const opportunityIds = new Set(dayOpportunities.map((opportunity) => opportunity.id));
  const attention = day.entries.filter((entry) => (entry.state === "pending" || entry.state === "review") && !entry.quotes.some((quote) => opportunityIds.has(quote.id)));
  const closed = day.entries.filter((entry) => entry.state === "closed");
  const selectedWeekStart = planningWeek(selectedDate);
  const selectedWeekEnd = shiftPlanningDate(selectedWeekStart, 6);
  const weeklyBookedHours = plan.weeklyBookedHours.get(selectedWeekStart) || 0;
  const weeklyPlannedHours = selected.filter((opportunity) => opportunity.week === selectedWeekStart).reduce((sum, opportunity) => sum + opportunity.hours, 0);
  const weeklyTeamHours = assumptions.weeklyHours;
  const weeklyReservePercent = PLANNING_MODES[mode].reserve * 100;
  const weeklyBudgetHours = weeklyTeamHours * (1 - PLANNING_MODES[mode].reserve);
  const seenWeeklyCommitments = new Set<string>();
  const weeklyUnknownGuests = commitments.reduce((count, entry) => {
    if (planningWeek(entry.date) !== selectedWeekStart) return count;
    const key = entry.sourceId ? `${entry.kind}:${entry.sourceId}` : null;
    if (key && seenWeeklyCommitments.has(key)) return count;
    if (key) seenWeeklyCommitments.add(key);
    return count + (Number(entry.guests) > 0 ? 0 : 1);
  }, 0);
  const weeklyLabel = `${dateLabel(selectedWeekStart, { day: "numeric", month: "short" })} - ${dateLabel(selectedWeekEnd, { day: "numeric", month: "short" })}`;
  const dateLabelText = dateLabel(selectedDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return <section className="grid min-w-0 border-b border-slate-200 xl:items-start xl:grid-cols-[minmax(0,1fr)_minmax(400px,0.46fr)] 2xl:grid-cols-[minmax(0,1fr)_minmax(440px,0.5fr)]" aria-label="Quote calendar">
    <div className="min-w-0 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold tracking-tight">Event calendar</h3>
        <Button size="icon" variant="ghost" onClick={onRefresh} disabled={refreshing} aria-label="Refresh calendar" title="Refresh calendar">
          <RotateCcw className={cn("h-4 w-4", refreshing && "animate-spin motion-reduce:animate-none")} />
        </Button>
      </div>
      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-y border-slate-200 py-3 text-xs">
        <span><strong className="tabular-nums text-slate-900">{monthOrders}</strong><span className="ml-1.5 text-slate-600">orders</span></span>
        <span><strong className="tabular-nums text-slate-600">{monthBooked}</strong><span className="ml-1.5 text-slate-600">booked work</span></span>
        <span><strong className="tabular-nums text-brand-primary">{monthOpportunities.length}</strong><span className="ml-1.5 text-slate-600">opportunities</span></span>
        <span><strong className="tabular-nums text-slate-900">{monthSelected}</strong><span className="ml-1.5 text-slate-600">in plan</span></span>
        <span><strong className="tabular-nums text-amber-900">{monthReview}</strong><span className="ml-1.5 text-slate-600">need review</span></span>
      </div>
      {monthOrders === 0 && monthBooked === 0 && monthOpportunities.length === 0 && monthReview === 0 && monthSelected === 0 &&
        <p role="status" className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">No upcoming bookings or quote opportunities this month.</p>}
      <div className="mt-3 flex items-center justify-center gap-2">
        <Button size="icon" variant="ghost" aria-label="Previous month" disabled={!canGoPrevious} onClick={() => setCalendarMonth(shiftMonth(monthFirst, -1))}><ChevronLeft /></Button>
        <h4 aria-live="polite" className="min-w-40 text-center text-sm font-semibold">{monthName}</h4>
        <Button size="icon" variant="ghost" aria-label="Next month" disabled={!canGoNext} onClick={() => setCalendarMonth(nextMonth)}><ChevronRight /></Button>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 sm:gap-1.5" role="grid" aria-label={`${monthName} quote and order calendar`}>
        {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((name) => <div key={name} role="columnheader" className="py-1 text-center text-[10px] font-medium text-slate-500 sm:text-xs">{name.slice(0, 3)}</div>)}
        {Array.from({ length: gridLength }, (_, index) => {
          const date = shiftPlanningDate(gridStart, index);
          const inMonth = date >= monthFirst && date <= monthLast;
          const inWindow = date >= start && date <= end;
          const dayEntry = summarizePipelineDay(entries, date);
          const load = pipelineCapacity(dayEntry, commitments, capacity);
          const orderCount = orders.filter((order) => !order.deleted_at && order.event_date === date).length;
          const dayOptions = opportunities.filter((opportunity) => opportunity.date === date);
          const picks = selected.filter((opportunity) => opportunity.date === date);
          const enabled = inMonth && inWindow;
          const label = `${dateLabel(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}: ${orderCount} orders, ${load.booked} booked work, ${dayOptions.length} quote opportunities, ${picks.length} in plan, ${dayEntry.review} needing review${date === selectedDate ? ", selected" : ""}`;
          return <button key={date} type="button" role="gridcell" disabled={!enabled} aria-pressed={date === selectedDate} aria-label={label} onClick={() => onSelectDate(date)}
            className={cn("flex min-h-[74px] min-w-0 flex-col rounded-md border p-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary/50 sm:min-h-[112px] sm:p-2", !inMonth && "border-transparent bg-transparent", inMonth && !inWindow && "border-slate-100 bg-slate-50/60 text-slate-400", enabled && date === selectedDate && "border-brand-primary bg-brand-primary/5 ring-1 ring-brand-primary/20", enabled && date !== selectedDate && "border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50")}>
            {inMonth && <>
              <span className="flex w-full items-center justify-between gap-0.5"><span className={cn("text-xs font-semibold tabular-nums sm:text-sm", date === todayKey && "text-brand-primary")}>{dateLabel(date, { day: "numeric" })}</span>{date === todayKey && <span className="hidden text-[10px] font-medium text-brand-primary sm:inline">Today</span>}</span>
              {enabled && <>
                <div className="mt-2 flex flex-col gap-1 text-[10px] tabular-nums sm:text-[11px]">
                  {orderCount > 0 && <span className="inline-flex items-center gap-1 text-slate-700"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500" /><span className="truncate"><span className="sm:hidden">O </span><span className="hidden sm:inline">Orders </span>{orderCount}</span></span>}
                  {dayOptions.length > 0 && <span className="inline-flex items-center gap-1 text-brand-primary"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary" /><span className="truncate"><span className="sm:hidden">Q </span><span className="hidden sm:inline">Quotes </span>{dayOptions.length}</span></span>}
                  {dayEntry.review > 0 && <span className="inline-flex items-center gap-1 text-amber-900"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-700" /><span className="truncate"><span className="sm:hidden">! </span><span className="hidden sm:inline">Review </span>{dayEntry.review}</span></span>}
                  {picks.length > 0 && <span className="inline-flex items-center gap-1 font-semibold text-slate-800"><Check className="h-3 w-3 shrink-0 text-brand-primary" /><span className="truncate"><span className="sm:hidden">Plan </span><span className="hidden sm:inline">In plan </span>{picks.length} · {compactMoney(picks.reduce((sum, opportunity) => sum + opportunity.profit, 0))}</span></span>}
                </div>
                <span className="mt-auto block w-full pt-1.5"><CapacityBar booked={load.booked} proposed={picks.length} limit={capacity.maxConcurrentEvents} /></span>
              </>}
              {inMonth && !inWindow && <span className="mt-2 text-[10px] text-slate-400">Outside plan</span>}
            </>}
          </button>;
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-slate-600" aria-label="Calendar key">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-500" />Orders</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand-primary" />Opportunities</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-700" />Need review</span>
      </div>
      {undatedEntries.length > 0 && <details className="mt-5 border-t border-slate-200 pt-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-sm text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"><span>Without an event date</span><span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs tabular-nums text-amber-900">{undatedEntries.length}</span></summary>
        <div className="mt-3"><PipelineActivity entries={undatedEntries} heading="Undated enquiries" /></div>
      </details>}
    </div>

    <aside className="min-w-0 border-t border-slate-200 bg-slate-50/50 p-4 sm:p-6 xl:rounded-tr-xl xl:border-l xl:border-t-0 xl:p-4" aria-label="Selected date details">
      <div className="xl:sticky xl:top-0 xl:z-10 xl:-mx-4 xl:-mt-4 xl:border-b xl:border-slate-200 xl:bg-slate-50/95 xl:px-4 xl:pb-3 xl:pt-4 xl:backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div><span className="text-[11px] font-semibold uppercase tracking-wide text-brand-primary">Selected day</span><h3 className="mt-0.5 text-lg font-semibold tracking-tight text-slate-950">{dateLabelText}</h3><span className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500"><CalendarDays className="h-3.5 w-3.5" />Orders, quotes & capacity</span></div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onExplainDate} disabled={!canExplain || reviewLoading} title="Explain these recommendations using verified quotes, costs and capacity">
            {reviewLoading ? <><Loader2 className="animate-spin motion-reduce:animate-none" />Reviewing</> : <><BrainCircuit />Explain picks</>}
          </Button>
          {selectedDate !== todayKey && <Button size="sm" variant="outline" onClick={() => onSelectDate(todayKey)}>Today</Button>}
        </div>
      </div>
      </div>
      <PipelineDateSummary day={day} commitments={commitments} capacity={capacity} selected={daySelected} opportunityCount={dayOpportunities.length} compactMoney={compactMoney}
        weeklyBookedHours={weeklyBookedHours} weeklyPlannedHours={weeklyPlannedHours} weeklyBudgetHours={weeklyBudgetHours} weeklyTeamHours={weeklyTeamHours}
        weeklyReservePercent={weeklyReservePercent} weeklyLabel={weeklyLabel} weeklyUnknownGuests={weeklyUnknownGuests} />
      {plan.conflicts.length > 0 && <div role="alert" className="mt-4 flex items-center justify-between gap-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900"><span>{plan.conflicts.length} plan capacity conflict{plan.conflicts.length === 1 ? "" : "s"}.</span><Button variant="outline" size="sm" onClick={onReleaseAll}>Release all</Button></div>}
      {reviewError && <p role="alert" className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{reviewError}</p>}

      <div className="mt-4 space-y-4">
        <OrderRows orders={dayOrders} acceptedQuotes={acceptedQuotes} money={money} withSlug={withSlug} />
        <OpportunityRows opportunities={dayOpportunities} selected={daySelected} plan={plan} assumptions={assumptions} leadNotesByQuote={leadNotesByQuote} pinnedIds={pinnedIds} excludedIds={excludedIds}
          costOverrides={costOverrides} currencyCode={currencyCode} compactMoney={compactMoney} reasonFor={reasonFor}
          onTogglePin={onTogglePin} onToggleExclude={onToggleExclude} onCostOverrideChange={onCostOverrideChange} withSlug={withSlug} />
        {attention.length > 0 && <PipelineActivity entries={attention} />}
        {closed.length > 0 && <details className="border-t border-slate-200 pt-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-sm text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"><span>Closed</span><span className="text-xs tabular-nums text-slate-500">{closed.length}</span></summary>
          <div className="mt-2"><PipelineActivity entries={closed} heading="Closed records" /></div>
        </details>}
        <details className="border-t border-slate-200 pt-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-sm text-xs font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"><span>AI explanation & risks</span><BrainCircuit className="h-4 w-4 text-brand-primary" /></summary>
          <p className="mt-2 text-xs text-slate-500">Advice from verified quotes, costs, pipeline records and capacity.</p>
          {review && <div className="mt-3 space-y-2" aria-live="polite"><p className="text-xs leading-relaxed text-slate-700">{review.summary}</p>{review.risks.length > 0 && <ul className="list-disc space-y-1 pl-4 text-xs text-amber-900">{review.risks.map((risk) => <li key={risk}>{risk}</li>)}</ul>}<p className="text-[11px] text-slate-500">{reviewTotal > 20 ? `Covers the first 20 of ${reviewTotal} quotes.` : "Based on verified planning data."}</p></div>}
        </details>
      </div>
    </aside>
  </section>;
}
