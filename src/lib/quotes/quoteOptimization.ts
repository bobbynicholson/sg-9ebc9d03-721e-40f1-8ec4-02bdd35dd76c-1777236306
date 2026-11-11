import type { Quote } from "@/types";
import type { DiaryEntry } from "@/lib/quoteDiarySignal";
import { toLocalDateKey, toLocalISO } from "@/lib/localDate";
import type { EventCapacitySettings } from "@/lib/eventCapacity";
import { OPEN_QUOTE_STATUSES } from "@/lib/eventCapacity";
import { isAutomatedTestQuote } from "@/lib/testDataDetection";

export type PlanningMode = "profit" | "balanced" | "space";
export const PLANNING_MODES = {
  profit: { label: "Maximum contribution", reserve: 0, description: "Use the available capacity to pursue more contribution." },
  balanced: { label: "Balanced", reserve: 0.1, description: "Keep 10% of kitchen and weekly prep capacity free." },
  space: { label: "More breathing room", reserve: 0.25, description: "Keep 25% of kitchen and weekly prep capacity free." },
} as const;

export interface PlanningAssumptions {
  weeklyHours: number;
  minutesPerGuest: number;
  setupHours: number;
  unknownCostPercent: number;
  operatingPercent: number;
  minimumMargin: number;
  costShockPercent: number;
}

/** These are editable planning assumptions, never company settings. */
export const DEFAULT_PLANNING_ASSUMPTIONS: PlanningAssumptions = {
  weeklyHours: 80, minutesPerGuest: 6, setupHours: 2,
  unknownCostPercent: 40, operatingPercent: 15, minimumMargin: 10, costShockPercent: 0,
};

export interface Opportunity {
  id: string;
  quote: Quote;
  date: string;
  week: string;
  group: string;
  guests: number;
  hours: number;
  revenue: number;
  knownCost: number;
  estimatedCost: number;
  operatingCost: number;
  cost: number;
  profit: number;
  margin: number;
  coverage: number;
  warnings: string[];
}

export interface DayLoad {
  date: string;
  bookedEvents: number;
  bookedGuests: number;
  bookedHours: number;
  unknownGuests: boolean;
}

export interface OptimizationInput {
  opportunities: Opportunity[];
  commitments: DiaryEntry[];
  capacity: EventCapacitySettings;
  assumptions: PlanningAssumptions;
  mode: PlanningMode;
  pinned?: ReadonlySet<string>;
  excluded?: ReadonlySet<string>;
}

export interface OptimizationPlan {
  selected: Opportunity[];
  selectedIds: Set<string>;
  profit: number;
  revenue: number;
  hours: number;
  guests: number;
  conflicts: string[];
  days: Map<string, DayLoad>;
  weeklyBookedHours: Map<string, number>;
  searched: number;
  approximate: boolean;
}

const positive = (value: unknown) => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
const round = (value: number) => Math.round(value * 100) / 100;
type CostLine = Record<string, unknown>;
const lines = (value: unknown): CostLine[] => Array.isArray(value)
  ? value.filter((line) => line && typeof line === "object") : [];

export function shiftPlanningDate(date: string, offset: number): string {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + offset);
  return toLocalISO(value);
}

export function planningWeek(date: string): string {
  const value = new Date(`${date}T12:00:00`);
  return shiftPlanningDate(date, -((value.getDay() + 6) % 7));
}

export function estimatedPrepHours(guests: number, assumptions: PlanningAssumptions): number {
  return round(assumptions.setupHours + guests * assumptions.minutesPerGuest / 60);
}

/** Same-client, same-date options are mutually exclusive, as on the quotes value tile. */
export function opportunityGroup(quote: Quote, date: string): string {
  const identity = quote.client_email?.trim() ? `email:${quote.client_email.trim().toLowerCase()}`
    : quote.client_id ? `id:${quote.client_id}`
    : quote.client_name?.trim() ? `name:${quote.client_name.trim().toLowerCase()}` : `quote:${quote.id}`;
  return `${date}|${identity}`;
}

export function buildOpportunities(
  quotes: Quote[], catalogueCosts: ReadonlyMap<string, number>, assumptions: PlanningAssumptions,
  currency: string, today: string,
): { opportunities: Opportunity[]; omitted: number } {
  const opportunities: Opportunity[] = [];
  let omitted = 0;
  for (const quote of quotes) {
    if (!OPEN_QUOTE_STATUSES.includes(quote.status as typeof OPEN_QUOTE_STATUSES[number])
      || quote.deleted_at || quote.converted_to_order_id || isAutomatedTestQuote(quote)) continue;
    const date = toLocalDateKey(quote.event_date);
    const expiry = toLocalDateKey(quote.valid_until);
    const guests = positive(quote.guest_count);
    const revenue = positive(quote.subtotal ?? (Number(quote.total_amount ?? quote.total) - positive(quote.tax_amount ?? quote.tax)));
    if (!date || date < today || (expiry && expiry < today) || !guests || !revenue
      || (quote.currency && quote.currency.toUpperCase() !== currency.toUpperCase())) { omitted++; continue; }

    // Attribute the ex-tax revenue proportionally to menu lines so discounts,
    // delivery, hire and VAT conventions do not inflate the missing-cost basis.
    const menu = lines(quote.menu_items);
    const equipment = lines(quote.equipment_items);
    const quantity = (line: CostLine) => line.pricing_mode === "flat" ? 1 : positive(line.quantity) || guests;
    const value = (line: CostLine) => positive(line.line_total
      ?? positive(line.unit_price ?? line.pricePerPerson ?? line.rentalPrice) * quantity(line));
    const lineRevenue = menu.reduce((sum, line) => sum + value(line), 0)
      + equipment.reduce((sum, line) => sum + value(line), 0)
      + positive(quote.delivery_fee) + positive((quote as Quote & { collection_fee?: number }).collection_fee)
      + positive((quote as Quote & { waiter_total_fee?: number }).waiter_total_fee);
    let knownCost = 0;
    let coveredRevenue = 0;
    let missingLines = 0;
    for (const line of menu) {
      const raw = line.cost_per_unit ?? line.unit_cost ?? catalogueCosts.get(String(line.menu_item_id || ""));
      const unitCost = raw == null ? null : Number(raw);
      if (unitCost != null && Number.isFinite(unitCost) && unitCost >= 0) {
        knownCost += unitCost * quantity(line);
        coveredRevenue += value(line);
      } else missingLines++;
    }
    // Only the saved hire-in split is evidence of external hire cost.
    for (const line of equipment) {
      knownCost += positive(line.hire_in_cost_total
        ?? positive(line.from_hire_qty) * positive(line.hire_in_cost_per_unit));
    }
    const covered = lineRevenue > 0 ? Math.min(1, coveredRevenue / lineRevenue) : 0;
    // Uncosted revenue includes equipment, delivery and service. This intentionally
    // keeps a cost allowance for these services rather than treating them as free.
    const estimatedCost = revenue * (1 - covered) * assumptions.unknownCostPercent / 100;
    const operatingCost = revenue * assumptions.operatingPercent / 100;
    const cost = (knownCost + estimatedCost + operatingCost) * (1 + assumptions.costShockPercent / 100);
    const profit = round(revenue - cost);
    opportunities.push({
      id: quote.id, quote, date, week: planningWeek(date), group: opportunityGroup(quote, date), guests,
      hours: estimatedPrepHours(guests, assumptions), revenue, knownCost: round(knownCost),
      estimatedCost: round(estimatedCost), operatingCost: round(operatingCost), cost: round(cost),
      profit, margin: profit / revenue * 100, coverage: covered,
      warnings: [
        ...(missingLines ? [`${missingLines} menu line${missingLines === 1 ? " uses" : "s use"} the missing-cost assumption.`] : []),
        ...(!menu.length ? ["No menu costing available; the missing-cost assumption applies."] : []),
      ],
    });
  }
  return { opportunities, omitted };
}

interface SearchState {
  selected: Opportunity[];
  profit: number;
  hours: number;
  days: Map<string, { events: number; guests: number }>;
  groups: Set<string>;
}

const commitmentGuards = new WeakMap<OptimizationInput, { unknownWeeks: Set<string>; clientsByDate: Set<string> }>();
function baselineGuards(input: OptimizationInput) {
  const cached = commitmentGuards.get(input);
  if (cached) return cached;
  const unknownWeeks = new Set<string>();
  const clientsByDate = new Set<string>();
  for (const entry of input.commitments) {
    if (!positive(entry.guests)) unknownWeeks.add(planningWeek(entry.date));
    clientsByDate.add(`${entry.date}|${entry.label.trim().toLowerCase()}`);
  }
  const result = { unknownWeeks, clientsByDate };
  commitmentGuards.set(input, result);
  return result;
}

function add(state: SearchState, opportunity: Opportunity): SearchState {
  const days = new Map(state.days);
  const load = days.get(opportunity.date) || { events: 0, guests: 0 };
  days.set(opportunity.date, { events: load.events + 1, guests: load.guests + opportunity.guests });
  return { selected: [...state.selected, opportunity], profit: state.profit + opportunity.profit,
    hours: state.hours + opportunity.hours, days, groups: new Set([...state.groups, opportunity.group]) };
}

function exclusionReason(
  opportunity: Opportunity, state: SearchState, input: OptimizationInput,
  days: Map<string, DayLoad>, weeklyBooked: number,
): string | null {
  const { assumptions, capacity, mode } = input;
  const reserve = 1 - PLANNING_MODES[mode].reserve;
  const booked = days.get(opportunity.date);
  const proposed = state.days.get(opportunity.date);
  if (booked?.unknownGuests) return "A booked event has no guest count; complete it before planning this date.";
  const guards = baselineGuards(input);
  if (guards.unknownWeeks.has(opportunity.week)) {
    return "A booking in this week is missing its guest count; weekly workload cannot be checked.";
  }
  const name = opportunity.quote.client_name?.trim().toLowerCase();
  if (name && guards.clientsByDate.has(`${opportunity.date}|${name}`)) {
    return "This client already has a commitment on this date; review whether this quote is another option for it.";
  }
  if (state.groups.has(opportunity.group)) return "Another option for this client and date is already in the plan.";
  if (capacity.maxGuestsPerEvent != null && opportunity.guests > capacity.maxGuestsPerEvent) return "Exceeds the per-event guest limit.";
  if ((booked?.bookedEvents || 0) + (proposed?.events || 0) + 1 > capacity.maxConcurrentEvents) return "No daily event slots left.";
  if (capacity.maxKitchenLoadPerDay != null
    && (booked?.bookedGuests || 0) + (proposed?.guests || 0) + opportunity.guests > Math.floor(capacity.maxKitchenLoadPerDay * reserve)) {
    return "Exceeds the daily kitchen limit or the planning reserve.";
  }
  if (weeklyBooked + state.hours + opportunity.hours > assumptions.weeklyHours * reserve + 0.001) {
    return "Exceeds the weekly prep-hour budget or the planning reserve.";
  }
  return null;
}

/** Weeks are independent resource pools. A bounded beam retains competing
 * portfolios, with greedy seeds guaranteeing at least a feasible starting plan.
 * It is intentionally described as 'best plan found', never a proven optimum. */
export function optimizeQuotes(input: OptimizationInput): OptimizationPlan {
  const { opportunities, assumptions, pinned = new Set<string>(), excluded = new Set<string>() } = input;
  const days = new Map<string, DayLoad>();
  const weeklyBookedHours = new Map<string, number>();
  const seen = new Set<string>();
  for (const entry of input.commitments) {
    const key = entry.sourceId ? `${entry.kind}:${entry.sourceId}` : null;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    const guests = positive(entry.guests);
    const hours = estimatedPrepHours(guests, assumptions);
    const day = days.get(entry.date) || { date: entry.date, bookedEvents: 0, bookedGuests: 0, bookedHours: 0, unknownGuests: false };
    day.bookedEvents++; day.bookedGuests += guests; day.bookedHours += hours;
    day.unknownGuests ||= !guests;
    days.set(entry.date, day);
    const week = planningWeek(entry.date);
    weeklyBookedHours.set(week, (weeklyBookedHours.get(week) || 0) + hours);
  }
  const conflicts: string[] = [];
  const weekGroups = new Map<string, Opportunity[]>();
  for (const opportunity of opportunities) {
    const week = weekGroups.get(opportunity.week) || [];
    week.push(opportunity); weekGroups.set(opportunity.week, week);
  }
  let selected: Opportunity[] = [];
  let searched = 0;
  let approximate = false;
  const empty = (): SearchState => ({ selected: [], profit: 0, hours: 0, days: new Map(), groups: new Set() });
  for (const [week, options] of weekGroups) {
    const booked = weeklyBookedHours.get(week) || 0;
    let seed = empty();
    for (const opportunity of options.filter((o) => pinned.has(o.id)).sort((a, b) => a.id.localeCompare(b.id))) {
      const reason = excluded.has(opportunity.id) ? "Also excluded from this plan."
        : exclusionReason(opportunity, seed, input, days, booked);
      if (reason) conflicts.push(`${opportunity.quote.quote_number}: ${reason}`);
      else seed = add(seed, opportunity);
    }
    const eligible = options.filter((o) => !pinned.has(o.id) && !excluded.has(o.id)
      && o.profit > 0 && o.margin >= assumptions.minimumMargin);
    eligible.sort((a, b) => b.profit / Math.max(b.hours, 0.01) - a.profit / Math.max(a.hours, 0.01) || a.id.localeCompare(b.id));

    // Retain several deterministic greedy seeds so pruning never loses them.
    const seeds = [eligible, [...eligible].sort((a, b) => b.profit - a.profit), [...eligible].sort((a, b) => b.revenue - a.revenue)]
      .map((order) => order.reduce((state, o) => exclusionReason(o, state, input, days, booked) ? state : add(state, o), seed));
    let states: SearchState[] = [seed];
    // Bound work for very large pipelines. Wider search for smaller weeks.
    const width = eligible.length > 100 ? 64 : 256;
    for (const opportunity of eligible) {
      const next = [...states];
      for (const state of states) {
        searched++;
        if (!exclusionReason(opportunity, state, input, days, booked)) next.push(add(state, opportunity));
      }
      next.sort((a, b) => b.profit - a.profit || a.hours - b.hours);
      if (next.length > width) approximate = true;
      states = next.slice(0, width);
    }
    const best = [...states, ...seeds].sort((a, b) => b.profit - a.profit || a.hours - b.hours)[0];
    selected.push(...best.selected);
  }
  // A conflicting forced portfolio must never be presented as feasible.
  if (conflicts.length) selected = [];
  selected.sort((a, b) => a.date.localeCompare(b.date) || b.profit - a.profit);
  return {
    selected, selectedIds: new Set(selected.map((o) => o.id)), conflicts, days, weeklyBookedHours, searched, approximate,
    profit: round(selected.reduce((sum, o) => sum + o.profit, 0)),
    revenue: round(selected.reduce((sum, o) => sum + o.revenue, 0)),
    hours: round(selected.reduce((sum, o) => sum + o.hours, 0)),
    guests: selected.reduce((sum, o) => sum + o.guests, 0),
  };
}

export function explainOpportunity(opportunity: Opportunity, plan: OptimizationPlan, input: OptimizationInput): string {
  if (input.excluded?.has(opportunity.id)) return "You excluded this quote from the scenario.";
  if (plan.selectedIds.has(opportunity.id)) return input.pinned?.has(opportunity.id)
    ? "Included by you; other quotes are optimized around this commitment." : "Fits the constraints in the best contribution portfolio found.";
  if (opportunity.profit <= 0) return "Estimated costs consume the full quote value.";
  if (opportunity.margin < input.assumptions.minimumMargin) return "Below your minimum contribution margin.";
  const selected = plan.selected.filter((o) => o.week === opportunity.week);
  const state = selected.reduce(add, { selected: [], profit: 0, hours: 0, days: new Map(), groups: new Set() } as SearchState);
  return exclusionReason(opportunity, state, input, plan.days, plan.weeklyBookedHours.get(opportunity.week) || 0)
    || "Another combination yields more contribution in the search. Try including this quote to compare.";
}
