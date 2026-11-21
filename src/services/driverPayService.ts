/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * driverPayService - the single source of truth for "what does this
 * driver get paid?".
 *
 * Three pay components combine into a driver's total earnings:
 *
 *   1. Hourly  - on-shift hours (from driver_shifts.hours_worked)
 *                 multiplied by the driver's effective hourly rate.
 *                 BCEA rate_multiplier applied if set (Stage 4
 *                 stamps 2x for Sundays + public holidays).
 *   2. Distance-- delivery_distance_km from the order multiplied by
 *                 the driver's effective per-km rate.
 *   3. Callout - a flat fee per delivery the driver was dispatched
 *                 to. Effective fee per driver / company default.
 *
 * "Effective" rate = driver-specific override (profiles.hourly_rate
 * etc.) when set, otherwise the company default
 * (companies.default_driver_hourly_rate etc.). Caller passes a single
 * resolveEffectiveRates() result; nothing here re-fetches.
 *
 * Stage 2 surface: read shifts, write manual shifts, compute pay for
 * a driver across a date range. Stage 3 will hook this into delivery
 * completion to stamp driver_assignments.base_fee / distance_fee /
 * total_earnings.
 */
import { supabase as defaultClient } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  beginRoleClock,
  endCurrentRoleClock,
  promptForAutomaticRoleClockNote,
  promptForRoleHandoffNote,
  saveRoleHandoffNote,
} from "@/services/roleClockService";
import { getDriverTripDistance, type DriverTripDistance } from "@/services/driver/tripDistance";

type Sb = SupabaseClient<any> | any;

export interface DriverPayRates {
  hourly_rate: number;          // ZAR per hour
  distance_rate_per_km: number; // ZAR per km
  base_callout_fee: number;     // ZAR flat per dispatch
}

export interface DriverPayProfile {
  hourly_rate?: number | null;
  distance_rate_per_km?: number | null;
  base_callout_fee?: number | null;
}

export interface CompanyPayDefaults {
  default_driver_hourly_rate?: number | null;
  default_distance_rate_per_km?: number | null;
  default_base_callout_fee?: number | null;
}

export interface DriverShift {
  id: string;
  company_id: string;
  driver_id: string;
  shift_date: string | null;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  status: "scheduled" | "active" | "completed" | "missed" | "cancelled";
  source: "manual" | "auto";
  order_id: string | null;
  notes: string | null;
  rate_multiplier: number | null;
  hours_worked: number | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ShiftPayLine {
  shift_id: string;
  actual_start?: string | null;
  actual_end?: string | null;
  notes?: string | null;
  /** Driver-portal restructure: calendar date of the shift so pay
   *  surfaces (earnings table, CSV payslip export) can label the
   *  line with a human date instead of an opaque shift id. Optional
   *  so existing callers of calculateShiftPay stay compatible. */
  shift_date?: string | null;
  hours: number;
  multiplier: number;
  hourly_rate: number;
  pay: number;
  /** Invalid or stale clock rows remain visible for correction but never
   *  contribute to settlement until their timestamps are reviewed. */
  needs_review?: boolean;
  review_reason?: string | null;
  /** Phase 3 #2: per-day BCEA buckets when the shift crosses
   *  midnight or includes overtime. NULL on shifts that don't have
   *  actual_start + actual_end timestamps (legacy / manual rows). */
  bcea_buckets?: Array<{
    date: string;
    hours: number;
    dayMultiplier: number;
    overtimeHours: number;
    pay: number;
  }>;
}

export interface DeliveryPayLine {
  order_id: string;
  /** Distinguishes multiple driver-assigned sitting trips on one order. */
  line_id?: string;
  sitting_sequence?: number | null;
  /** Identifies whether distance came from route estimate, sitting allocation, or GPS. */
  distance_source?: "order" | "booking_route_split" | "gps_actual";
  gps_distance_km?: number | null;
  gps_trip_duration_minutes?: number | null;
  gps_distance_status?: "complete" | "partial" | "not_available" | string | null;
  gps_expected_distance_km?: number | null;
  gps_distance_review_required?: boolean;
  gps_distance_review_reason?: string | null;
  /** Driver-portal restructure: human order number (ORD-xxxxxx) so
   *  the earnings page can render something a driver recognises
   *  instead of a UUID fragment. Optional - the bulk-totals path
   *  and legacy callers don't populate it. */
  order_number?: string | null;
  event_date?: string | null;
  /** Event name off the order when set. May be the literal
   *  "Untitled" placeholder; render-side should filter that. */
  event_name?: string | null;
  distance_km: number;
  distance_rate: number;
  distance_pay: number;
  callout_fee: number;
  total: number;
}

export interface DriverPaySummary {
  rates: DriverPayRates;
  shifts: ShiftPayLine[];
  deliveries: DeliveryPayLine[];
  totals: {
    hours_total: number;
    hourly_pay: number;
    distance_total_km: number;
    distance_unrecorded_deliveries?: number;
    distance_pay: number;
    callout_pay: number;
    grand_total: number;
    shifts_needing_review?: number;
  };
}

/**
 * Merge per-driver overrides over company defaults. Anything still
 * unset becomes 0 - the operator hasn't told us a rate, so don't
 * invent one. The downstream pay sum just stays low instead of
 * silently using a fabricated default.
 */
export function resolveEffectiveRates(
  driver: DriverPayProfile | null | undefined,
  companyDefaults: CompanyPayDefaults | null | undefined,
): DriverPayRates {
  const num = (v: any): number => {
    if (v == null) return 0;
    const n = Number(v);
    return isNaN(n) || n < 0 ? 0 : n;
  };
  return {
    hourly_rate:
      num(driver?.hourly_rate) ||
      num(companyDefaults?.default_driver_hourly_rate),
    distance_rate_per_km:
      num(driver?.distance_rate_per_km) ||
      num(companyDefaults?.default_distance_rate_per_km),
    base_callout_fee:
      num(driver?.base_callout_fee) ||
      num(companyDefaults?.default_base_callout_fee),
  };
}

/**
 * Compute the pay line for a single completed shift. Multiplier
 * defaults to 1 when NULL (no BCEA bump).
 */
export function calculateShiftPay(
  shift: Pick<DriverShift, "id" | "hours_worked" | "rate_multiplier">,
  rates: DriverPayRates,
): ShiftPayLine {
  const hours = Number(shift.hours_worked || 0);
  const multiplier = Number(shift.rate_multiplier || 1);
  const pay = +(hours * multiplier * rates.hourly_rate).toFixed(2);
  return {
    shift_id: shift.id,
    hours: +hours.toFixed(2),
    multiplier: +multiplier.toFixed(2),
    hourly_rate: rates.hourly_rate,
    pay,
  };
}

/** Use the same clock-duration checks as the staff-hours audit before a
 *  driver shift can contribute money to settlement. Valid shifts use the
 *  timestamp duration (hours_worked is a generated DB column, but legacy
 *  imports and stale rows still need a guard). */
export function driverShiftReviewReason(shift: DriverShift, now = Date.now()): string | null {
  const start = shift.actual_start ? new Date(shift.actual_start).getTime() : NaN;
  const end = shift.actual_end ? new Date(shift.actual_end).getTime() : NaN;
  if (!Number.isFinite(start)) return "Missing or invalid clock-in time";
  if (!Number.isFinite(end)) {
    if (shift.status === "completed") return "Completed shift has no clock-out time";
    return now - start > 14 * 60 * 60 * 1000 ? "Open shift is older than 14 hours" : null;
  }
  const elapsedHours = (end - start) / 3_600_000;
  if (elapsedHours <= 0) return "Clock-out is before clock-in";
  if (elapsedHours > 24) return "Shift exceeds 24 hours";
  if (shift.hours_worked == null) return "Stored shift hours are missing";
  if (Math.abs(elapsedHours - Number(shift.hours_worked)) > 0.05) {
    return "Clock duration differs from stored hours";
  }
  return null;
}

function buildDriverShiftPayLines(
  shifts: DriverShift[],
  rates: DriverPayRates,
): ShiftPayLine[] {
  const lines: ShiftPayLine[] = [];
  for (const shift of shifts) {
    const reviewReason = driverShiftReviewReason(shift)
      || (shift.actual_end && shift.status !== "completed" ? "Shift has clock-out time but is not marked completed" : null);
    const completed = shift.status === "completed";
    const staleOpen = shift.status === "active" && !shift.actual_end && !!shift.actual_start && !!reviewReason;
    const endedButNotCompleted = !!shift.actual_end && shift.status !== "completed" && !!reviewReason;
    if (!completed && !staleOpen && !endedButNotCompleted) continue;

    if (reviewReason) {
      const start = shift.actual_start ? new Date(shift.actual_start).getTime() : NaN;
      const end = shift.actual_end ? new Date(shift.actual_end).getTime() : NaN;
      const elapsed = Number.isFinite(start) && Number.isFinite(end) && end > start
        ? (end - start) / 3_600_000
        : Number.isFinite(start) && !Number.isFinite(end)
          ? (Math.min(Date.now(), start + 14 * 60 * 60 * 1000) - start) / 3_600_000
          : Number(shift.hours_worked || 0);
      lines.push({
        ...calculateShiftPay({ ...shift, hours_worked: 0 }, rates),
        shift_date: shift.shift_date,
        actual_start: shift.actual_start,
        actual_end: shift.actual_end,
        notes: shift.notes,
        hours: +Math.max(0, elapsed).toFixed(2),
        pay: 0,
        needs_review: true,
        review_reason: reviewReason,
      });
      continue;
    }

    const start = new Date(shift.actual_start!).getTime();
    const end = new Date(shift.actual_end!).getTime();
    const elapsedHours = (end - start) / 3_600_000;
    lines.push({
      ...calculateShiftPay({ ...shift, hours_worked: elapsedHours }, rates),
      shift_date: shift.shift_date,
      actual_start: shift.actual_start,
      actual_end: shift.actual_end,
      notes: shift.notes,
      needs_review: false,
      review_reason: null,
    });
  }
  return lines;
}

/**
 * Phase 2 #9: split a shift that may cross midnight into per-day
 * buckets so each calendar day can carry its own BCEA multiplier.
 * Returns an array of { date: 'YYYY-MM-DD', hours: number }.
 *
 * Used for the Sunday + public-holiday 2x rule (BCEA s16) so a
 * Saturday-night-into-Sunday-morning shift correctly gets paid
 * 1x for the Saturday hours and 2x for the Sunday hours, instead
 * of slapping a single multiplier on the whole shift based on
 * which day actual_end happened to fall on.
 *
 * Pure: doesn't read from anywhere, takes a (start, end) and emits
 * the bucket list. Always uses the local-time day boundary the way
 * the operator running the company experiences it - not UTC. The
 * tenant timezone handling is a future Phase 3 item; for now SAST
 * matches every live tenant.
 */
export function splitShiftIntoDayBuckets(
  startIso: string,
  endIso: string,
): Array<{ date: string; hours: number }> {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return [];
  if (end.getTime() <= start.getTime()) return [];

  const buckets: Array<{ date: string; hours: number }> = [];
  let cursor = new Date(start);
  while (cursor.getTime() < end.getTime()) {
    // Midnight at the end of the current local-time day.
    const dayEnd = new Date(cursor);
    dayEnd.setHours(24, 0, 0, 0);
    const sliceEnd = dayEnd.getTime() < end.getTime() ? dayEnd : end;
    const hours = (sliceEnd.getTime() - cursor.getTime()) / 3_600_000;
    if (hours > 0) {
      // Local-date key 'YYYY-MM-DD'. toLocalISO would also work but
      // we're constraint-free here so do it inline.
      const yyyy = cursor.getFullYear();
      const mm = String(cursor.getMonth() + 1).padStart(2, "0");
      const dd = String(cursor.getDate()).padStart(2, "0");
      buckets.push({ date: `${yyyy}-${mm}-${dd}`, hours: +hours.toFixed(4) });
    }
    cursor = sliceEnd;
  }
  return buckets;
}

/**
 * Phase 2 #9: BCEA-aware pay calc for a shift defined by
 * actual_start + actual_end. Walks per-day buckets and applies:
 *   - 2x for Sundays + public holidays (BCEA s16)
 *   - 1.5x for hours over 9 in any single bucket (BCEA s10 overtime)
 * The 1.5x stacks on top of the day multiplier, e.g. a 10-hour
 * Sunday shift pays 9h at 2x + 1h at 3x (2x * 1.5).
 *
 * holidayDateSet is a Set of 'YYYY-MM-DD' for one-off holidays
 * specific to the year + a Set of 'MM-DD' for recurring annual ones.
 * autoClockOut already builds these from public_holidays; this
 * helper is pure so the caller hands them in.
 */
export interface BceaPayResult {
  totalHours: number;
  pay: number;
  dominantMultiplier: number; // largest multiplier used (for rate_multiplier stamp)
  buckets: Array<{
    date: string;
    hours: number;
    dayMultiplier: number;
    overtimeHours: number;
    pay: number;
  }>;
}

export function calculateBceaShiftPay(
  startIso: string,
  endIso: string,
  hourlyRate: number,
  holidays: { oneOff: Set<string>; recurringMD: Set<string> },
  options: { overtimeThresholdHours?: number; overtimeMultiplier?: number } = {},
): BceaPayResult {
  const overtimeThreshold = options.overtimeThresholdHours ?? 9; // BCEA s10
  const overtimeMultiplier = options.overtimeMultiplier ?? 1.5;
  const buckets = splitShiftIntoDayBuckets(startIso, endIso);
  let pay = 0;
  let totalHours = 0;
  let dominantMultiplier = 1;
  const resultBuckets: BceaPayResult["buckets"] = [];

  for (const b of buckets) {
    const md = b.date.slice(5);
    const dow = new Date(b.date + "T12:00:00").getDay(); // 0 = Sunday
    const isSundayOrPH =
      dow === 0 || holidays.oneOff.has(b.date) || holidays.recurringMD.has(md);
    const dayMul = isSundayOrPH ? 2 : 1;
    const regularHours = Math.min(b.hours, overtimeThreshold);
    const overtimeHours = Math.max(0, b.hours - overtimeThreshold);
    const bucketPay =
      regularHours * dayMul * hourlyRate +
      overtimeHours * dayMul * overtimeMultiplier * hourlyRate;
    pay += bucketPay;
    totalHours += b.hours;
    if (dayMul > dominantMultiplier) dominantMultiplier = dayMul;
    if (overtimeHours > 0 && dayMul * overtimeMultiplier > dominantMultiplier) {
      dominantMultiplier = dayMul * overtimeMultiplier;
    }
    resultBuckets.push({
      date: b.date,
      hours: +b.hours.toFixed(4),
      dayMultiplier: dayMul,
      overtimeHours: +overtimeHours.toFixed(4),
      pay: +bucketPay.toFixed(2),
    });
  }

  return {
    totalHours: +totalHours.toFixed(4),
    pay: +pay.toFixed(2),
    dominantMultiplier: +dominantMultiplier.toFixed(2),
    buckets: resultBuckets,
  };
}

/**
 * Compute the pay line for a single delivery. Reads
 * delivery_distance_km off the order (already snapshot at quote /
 * order time) and adds the flat callout fee on top.
 *
 * delivery_distance_km is stored as the ONE-WAY kitchen-to-venue
 * distance (matches what the operator sees on Google Maps). The
 * Phase 29 client-billing change moved the customer-side fee to
 * round-trip (distance * 2 * rate). Driver pay needs the same ×2
 * because the driver actually drives both legs - otherwise the
 * tenant silently underpays half the kilometres while billing
 * the customer for the lot. distance_km on the receipt also
 * reflects the round-trip total so payslip arithmetic is
 * obvious.
 */
export function calculateDeliveryPay(
  order: { id: string; delivery_distance_km?: number | null },
  rates: DriverPayRates,
): DeliveryPayLine {
  const oneWay = Number(order.delivery_distance_km || 0);
  const billable = oneWay * 2;
  const distancePay = +(billable * rates.distance_rate_per_km).toFixed(2);
  const callout = +rates.base_callout_fee.toFixed(2);
  return {
    order_id: order.id,
    distance_km: +billable.toFixed(2),
    distance_rate: rates.distance_rate_per_km,
    distance_pay: distancePay,
    callout_fee: callout,
    total: +(distancePay + callout).toFixed(2),
  };
}

type DeliveryDistanceSource = {
  delivery_distance_km?: number | null;
  quote?: { delivery_distance_km?: number | null } | Array<{ delivery_distance_km?: number | null }> | null;
};

/** Prefer the order snapshot, then recover legacy orders from their quote. */
function resolveDeliveryDistanceKm(order: DeliveryDistanceSource): number {
  const positiveKm = (value: unknown) => {
    const km = Number(value);
    return Number.isFinite(km) && km > 0 ? km : 0;
  };
  const orderKm = positiveKm(order.delivery_distance_km);
  if (orderKm > 0) return orderKm;
  const quote = Array.isArray(order.quote) ? order.quote[0] : order.quote;
  return positiveKm(quote?.delivery_distance_km);
}

function resolveRoundTripDistanceKm(
  storedDistanceKm: number | null | undefined,
  oneWayDistanceKm: number,
): number {
  const storedKm = Number(storedDistanceKm);
  return Number.isFinite(storedKm) && storedKm > 0
    ? +storedKm.toFixed(2)
    : +(oneWayDistanceKm * 2).toFixed(2);
}

type DeliveryPaySource = {
  id: string;
  line_id?: string;
  order_number?: string | null;
  event_date?: string | null;
  event_name?: string | null;
  sitting_sequence?: number | null;
  distance_source?: "order" | "booking_route_split" | "gps_actual";
  delivery_distance_km: number;
  gps_distance_km?: number | null;
  gps_trip_duration_minutes?: number | null;
  gps_distance_status?: "complete" | "partial" | "not_available" | string | null;
  gps_expected_distance_km?: number | null;
  gps_distance_review_required?: boolean;
  gps_distance_review_reason?: string | null;
  locked_distance_fee?: number | null;
  locked_base_fee?: number | null;
  locked_total?: number | null;
  locked_calculated_distance?: number | null;
};

function calculateDeliveryPayLine(source: DeliveryPaySource, rates: DriverPayRates): DeliveryPayLine {
  const oneWayKm = Math.max(0, Number(source.delivery_distance_km) || 0);
  const label = {
    order_number: source.order_number ?? null,
    event_date: source.event_date ?? null,
    event_name: source.event_name ?? null,
    line_id: source.line_id || source.id,
    sitting_sequence: source.sitting_sequence ?? null,
    distance_source: source.gps_distance_status === "complete" && Number(source.gps_distance_km) > 0
      ? "gps_actual" as const
      : source.distance_source || "order" as const,
    gps_distance_km: source.gps_distance_km ?? null,
    gps_trip_duration_minutes: source.gps_trip_duration_minutes ?? null,
    gps_distance_status: source.gps_distance_status ?? "not_available",
    gps_expected_distance_km: source.gps_expected_distance_km ?? null,
    gps_distance_review_required: !!source.gps_distance_review_required,
    gps_distance_review_reason: source.gps_distance_review_reason ?? null,
  };

  if (source.locked_total != null) {
    const hasCompleteGpsDistance = source.gps_distance_status === "complete"
      && Number(source.gps_distance_km) >= 0;
    const distanceKm = hasCompleteGpsDistance
      ? Number(source.gps_distance_km)
      : resolveRoundTripDistanceKm(source.locked_calculated_distance, oneWayKm);
    const incompleteDistanceSnapshot = Number(source.locked_calculated_distance || 0) <= 0 && oneWayKm > 0;
    const distancePay = hasCompleteGpsDistance
      ? source.locked_distance_fee != null
        ? +Number(source.locked_distance_fee).toFixed(2)
        : +(distanceKm * rates.distance_rate_per_km).toFixed(2)
      : incompleteDistanceSnapshot
      ? +(distanceKm * rates.distance_rate_per_km).toFixed(2)
      : +Number(source.locked_distance_fee || 0).toFixed(2);
    const calloutFee = +Number(source.locked_base_fee || 0).toFixed(2);
    return {
      order_id: source.id,
      ...label,
      distance_km: distanceKm,
      distance_rate: !incompleteDistanceSnapshot && distanceKm > 0 && source.locked_distance_fee != null
        ? +(Number(source.locked_distance_fee) / distanceKm).toFixed(2)
        : rates.distance_rate_per_km,
      distance_pay: distancePay,
      callout_fee: calloutFee,
      total: incompleteDistanceSnapshot
        ? +(distancePay + calloutFee).toFixed(2)
        : +Number(source.locked_total || 0).toFixed(2),
    };
  }

  if (source.gps_distance_status === "complete" && Number(source.gps_distance_km) >= 0) {
    const distanceKm = Number(source.gps_distance_km);
    const distancePay = +(distanceKm * rates.distance_rate_per_km).toFixed(2);
    const calloutFee = +rates.base_callout_fee.toFixed(2);
    return {
      order_id: source.id,
      ...label,
      distance_km: distanceKm,
      distance_rate: rates.distance_rate_per_km,
      distance_pay: distancePay,
      callout_fee: calloutFee,
      total: +(distancePay + calloutFee).toFixed(2),
    };
  }

  return {
    ...calculateDeliveryPay({ id: source.id, delivery_distance_km: oneWayKm }, rates),
    ...label,
  };
}

type SittingOrderForPay = {
  id: string;
  event_date: string;
  status: string;
  order_number: string | null;
  event_name: string | null;
  delivery_distance_km: number | null;
  region_id: string | null;
  venue_lat: number | null;
  venue_lng: number | null;
  quote?: DeliveryDistanceSource["quote"];
  service_sittings?: Array<{
    id: string;
    sequence_number: number;
    status?: string;
    venue_lat: number | null;
    venue_lng: number | null;
  }>;
};

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Multi-address quotes save one exact total across all sitting routes. Older
 * rows did not save each sitting's leg separately, so split that already
 * saved total by the sitting's straight-line share from its assigned kitchen.
 * The split preserves the booking total; it does not claim to be GPS mileage.
 */
function splitBookingDistanceAcrossSittings(
  order: SittingOrderForPay,
  origin: { lat: number; lng: number } | null,
): Map<string, number> {
  const sittings = (order.service_sittings || [])
    .filter((sitting) => sitting.status !== "cancelled")
    .sort((a, b) => a.sequence_number - b.sequence_number);
  const totalKm = resolveDeliveryDistanceKm(order);
  const output = new Map<string, number>();
  if (sittings.length === 0 || totalKm <= 0) return output;

  const coords = sittings.map((sitting) => {
    const lat = sitting.venue_lat ?? order.venue_lat;
    const lng = sitting.venue_lng ?? order.venue_lng;
    return typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)
      ? { lat, lng }
      : null;
  });
  const useGeographicWeights = Boolean(origin && coords.every(Boolean));
  const rawWeights = useGeographicWeights && origin
    ? coords.map((coord) => coord ? haversineKm(origin.lat, origin.lng, coord.lat, coord.lng) : 0)
    : sittings.map(() => 1);
  const weightTotal = rawWeights.reduce((sum, weight) => sum + weight, 0);
  const weights = weightTotal > 0 ? rawWeights : sittings.map(() => 1);
  const normalizer = weights.reduce((sum, weight) => sum + weight, 0);
  const cents = Math.round(totalKm * 100);
  let allocatedCents = 0;
  let lastPositiveIndex = weights.length - 1;
  for (let index = 0; index < weights.length; index++) {
    if (weights[index] > 0) lastPositiveIndex = index;
  }
  sittings.forEach((sitting, index) => {
    const shareCents = index === lastPositiveIndex
      ? cents - allocatedCents
      : Math.round(cents * weights[index] / normalizer);
    allocatedCents += shareCents;
    output.set(sitting.id, shareCents / 100);
  });
  return output;
}

async function listCompletedSittingDeliveries(
  opts: { companyId: string; driverIds: string[]; range: DateRange },
  client: Sb,
): Promise<Array<DeliveryPaySource & { driver_id: string }>> {
  if (opts.driverIds.length === 0) return [];
  const { data, error } = await (client as any)
    .from("driver_assignments")
    .select("id,order_id,driver_id,service_sitting_id,base_fee,distance_fee,total_earnings,calculated_distance,gps_distance_km,gps_trip_duration_minutes,gps_expected_distance_km,gps_distance_status,gps_distance_review_required,gps_distance_review_reason,sitting:service_sittings!driver_assignments_service_sitting_id_fkey(id,sequence_number,venue_lat,venue_lng),order:orders!driver_assignments_order_id_fkey(id,event_date,status,order_number,event_name,delivery_distance_km,region_id,venue_lat,venue_lng,quote:quotes!orders_quote_id_fkey(delivery_distance_km),service_sittings(id,sequence_number,status,venue_lat,venue_lng))")
    .eq("company_id", opts.companyId)
    .in("driver_id", opts.driverIds)
    .eq("assignment_type", "delivery")
    .not("service_sitting_id", "is", null)
    .in("status", ["delivered", "completed"]);
  if (error) {
    console.warn("[driverPayService] sitting delivery assignments fetch failed:", error);
    return [];
  }

  const assignments = (data || []).flatMap((row: any) => {
    const order = relationOne(row.order) as SittingOrderForPay | null;
    const sitting = relationOne(row.sitting) as { id: string; sequence_number: number } | null;
    if (!order || !sitting || order.event_date < opts.range.from || order.event_date > opts.range.to) return [];
    return [{ row, order, sitting }];
  });
  if (assignments.length === 0) return [];

  const regionIds = [...new Set(assignments.map(({ order }) => order.region_id).filter(Boolean))] as string[];
  const [regionResult, companyResult] = await Promise.all([
    regionIds.length
      ? (client as any).from("regions").select("id,lat,lng").eq("company_id", opts.companyId).in("id", regionIds)
      : Promise.resolve({ data: [], error: null }),
    (client as any).from("companies").select("headquarters_lat,headquarters_lng").eq("id", opts.companyId).maybeSingle(),
  ]);
  if (regionResult.error) console.warn("[driverPayService] sitting route origins fetch failed:", regionResult.error);
  const regionById = new Map<string, { lat: number | null; lng: number | null }>(
    ((regionResult.data || []) as Array<{ id: string; lat: number | null; lng: number | null }>).map((region) => [region.id, region] as const),
  );
  if (companyResult.error) console.warn("[driverPayService] company route origin fetch failed:", companyResult.error);
  const company = companyResult.data as { headquarters_lat: number | null; headquarters_lng: number | null } | null;

  const distanceByOrder = new Map<string, Map<string, number>>();
  for (const { order } of assignments) {
    if (distanceByOrder.has(order.id)) continue;
    const region = order.region_id ? regionById.get(order.region_id) : null;
    const origin = region?.lat != null && region.lng != null
      ? { lat: Number(region.lat), lng: Number(region.lng) }
      : company?.headquarters_lat != null && company.headquarters_lng != null
        ? { lat: Number(company.headquarters_lat), lng: Number(company.headquarters_lng) }
        : null;
    distanceByOrder.set(order.id, splitBookingDistanceAcrossSittings(order, origin));
  }

  return assignments.map(({ row, order, sitting }) => ({
    id: order.id,
    line_id: row.id,
    driver_id: row.driver_id,
    order_number: order.order_number ?? null,
    event_date: order.event_date ?? null,
    event_name: order.event_name ?? null,
    sitting_sequence: sitting.sequence_number,
    distance_source: row.gps_distance_status === "complete" ? "gps_actual" : "booking_route_split",
    delivery_distance_km: distanceByOrder.get(order.id)?.get(sitting.id) || 0,
    gps_distance_km: row.gps_distance_km == null ? null : Number(row.gps_distance_km),
    gps_trip_duration_minutes: row.gps_trip_duration_minutes == null ? null : Number(row.gps_trip_duration_minutes),
    gps_expected_distance_km: row.gps_expected_distance_km == null ? null : Number(row.gps_expected_distance_km),
    gps_distance_status: row.gps_distance_status || "not_available",
    gps_distance_review_required: !!row.gps_distance_review_required,
    gps_distance_review_reason: row.gps_distance_review_reason || null,
    locked_distance_fee: row.distance_fee ?? null,
    locked_base_fee: row.base_fee ?? null,
    locked_total: row.total_earnings ?? null,
    locked_calculated_distance: row.calculated_distance ?? null,
  }));
}

export interface DateRange {
  /** ISO date string (inclusive). */
  from: string;
  /** ISO date string (inclusive). */
  to: string;
}

export const driverPayService = {
  /** Fetch the company-wide pay defaults in one round trip. */
  async getCompanyDefaults(
    companyId: string,
    client: Sb = defaultClient,
  ): Promise<CompanyPayDefaults> {
    const { data, error } = await (client as any)
      .from("companies")
      .select("default_driver_hourly_rate, default_distance_rate_per_km, default_base_callout_fee")
      .eq("id", companyId)
      .maybeSingle();
    if (error) {
      console.warn("[driverPayService.getCompanyDefaults]", error);
      return {};
    }
    return (data || {}) as CompanyPayDefaults;
  },

  /** Driver row with the rate columns we care about. */
  async getDriverProfile(
    driverId: string,
    client: Sb = defaultClient,
  ): Promise<DriverPayProfile | null> {
    const { data, error } = await (client as any)
      .from("profiles")
      .select("hourly_rate, distance_rate_per_km, base_callout_fee")
      .eq("id", driverId)
      .maybeSingle();
    if (error) {
      console.warn("[driverPayService.getDriverProfile]", error);
      return null;
    }
    return (data || null) as DriverPayProfile | null;
  },

  /** List shifts for a driver, optionally filtered by date range. */
  async listShifts(
    opts: { companyId: string; driverId: string; range?: DateRange },
    client: Sb = defaultClient,
  ): Promise<DriverShift[]> {
    let q = (client as any)
      .from("driver_shifts")
      .select("*")
      .eq("company_id", opts.companyId)
      .eq("driver_id", opts.driverId)
      .is("deleted_at", null)
      .order("actual_start", { ascending: false, nullsFirst: false });
    if (opts.range) {
      q = q.gte("shift_date", opts.range.from).lte("shift_date", opts.range.to);
    }
    const { data, error } = await q;
    if (error) {
      console.warn("[driverPayService.listShifts]", error);
      return [];
    }
    return (data || []) as DriverShift[];
  },

  /**
   * Manual shift entry from the admin UI. Required: company_id,
   * driver_id, actual_start, actual_end. All else optional.
   *
   * Returns a flat shape (`{ ok, shift?, error? }`) rather than a
   * discriminated union - TS narrowing across the module boundary
   * can't track the union into the consumer's reachability check, so
   * `if (!result.ok) throw new Error(result.error)` fails the
   * compiler. Flat is plain.
   */
  async createManualShift(
    payload: {
      company_id: string;
      driver_id: string;
      actual_start: string;     // ISO timestamp
      actual_end: string;       // ISO timestamp
      notes?: string | null;
      created_by_user_id?: string | null;
      rate_multiplier?: number | null;
      /** Phase 6 #6: opt-in bypass for the overlap check. Used when
       *  the operator has reviewed the conflict and wants to log
       *  the shift anyway (e.g. two short jobs that share a 5-min
       *  window). Default behaviour refuses the insert. */
      allow_overlap?: boolean;
    },
    client: Sb = defaultClient,
  ): Promise<{
    ok: boolean;
    shift?: DriverShift;
    error?: string;
    conflict?: { id: string; actual_start: string | null; actual_end: string | null };
    /** Phase 7 #2: BCEA fatigue warning. Set when the shift exceeds
     *  12h or the gap to the previous shift is under 12h. The
     *  insert still succeeded; the operator just gets a heads-up
     *  toast on the UI side. */
    fatigueWarning?: string;
  }> {
    const start = new Date(payload.actual_start);
    const end = new Date(payload.actual_end);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return { ok: false, error: "Invalid clock-in or clock-out time" };
    }
    if (end < start) {
      return { ok: false, error: "Clock-out must be after clock-in" };
    }
    // Phase 6 #6: driver shift overlap check. A driver can't be on
    // two shifts at the same time - it's nonsense for hour
    // tracking and downstream BCEA pay calc would double-count.
    // We refuse the insert unless allow_overlap is set, in which
    // case the operator gets the conflicting shift's id + window
    // back so they can decide whether to merge / extend / split.
    if (!payload.allow_overlap) {
      const { data: overlaps } = await (client as any)
        .from("driver_shifts")
        .select("id, actual_start, actual_end")
        .eq("driver_id", payload.driver_id)
        .is("deleted_at", null)
        .lt("actual_start", payload.actual_end)
        .or(`actual_end.gt.${payload.actual_start},actual_end.is.null`)
        .limit(1);
      if (overlaps && (overlaps as any[]).length > 0) {
        const c = (overlaps as any[])[0];
        return {
          ok: false,
          error:
            "This driver already has a shift that overlaps the window you're trying to log. Resolve the existing one or pass allow_overlap to proceed.",
          conflict: {
            id: c.id,
            actual_start: c.actual_start,
            actual_end: c.actual_end,
          },
        };
      }
    }

    // Phase 7 #2: BCEA s9 fatigue cap. The Act limits ordinary daily
    // hours to 12h with a mandatory 12h consecutive rest break
    // between shifts. We don't refuse the insert (some real
    // operations push past 12h on a one-off basis) but we surface
    // a soft warning the operator must acknowledge. Skipped when
    // allow_overlap is set since the operator already chose to
    // override the related overlap check.
    let fatigueWarning: string | null = null;
    if (!payload.allow_overlap) {
      const startMs = new Date(payload.actual_start).getTime();
      const endMs = new Date(payload.actual_end).getTime();
      const hoursThisShift = (endMs - startMs) / 3_600_000;
      // (a) shift over 12h
      if (hoursThisShift > 12) {
        fatigueWarning = `BCEA cap: this shift is ${hoursThisShift.toFixed(1)}h. Ordinary daily limit is 12h.`;
      } else {
        // (b) less than 12h gap since the last completed shift on
        // the same driver. Pull the most recent closed shift in
        // the 24h before this one.
        const lookbackIso = new Date(startMs - 24 * 3_600_000).toISOString();
        const { data: prior, error: priorErr } = await (client as any)
          .from("driver_shifts")
          .select("actual_end")
          .eq("driver_id", payload.driver_id)
          .is("deleted_at", null)
          .not("actual_end", "is", null)
          .gte("actual_end", lookbackIso)
          .lte("actual_end", payload.actual_start)
          .order("actual_end", { ascending: false })
          .limit(1);
        if (priorErr) {
          console.error("[driverPayService] driver_shifts fetch failed:", priorErr);
        }
        const lastEnd = (prior as any)?.[0]?.actual_end;
        if (lastEnd) {
          const gapHours = (startMs - new Date(lastEnd).getTime()) / 3_600_000;
          if (gapHours < 12) {
            fatigueWarning =
              `BCEA cap: only ${gapHours.toFixed(1)}h between this shift and the driver's last one. ` +
              `S15 requires 12h consecutive rest between shifts.`;
          }
        }
      }
    }
    const insertRow: any = {
      company_id: payload.company_id,
      driver_id: payload.driver_id,
      shift_date: payload.actual_start.slice(0, 10),
      actual_start: payload.actual_start,
      actual_end: payload.actual_end,
      status: "completed",
      source: "manual",
      notes: payload.notes ?? null,
      created_by_user_id: payload.created_by_user_id ?? null,
      rate_multiplier: payload.rate_multiplier ?? null,
    };
    const { data, error } = await (client as any)
      .from("driver_shifts")
      .insert(insertRow)
      .select("*")
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, shift: data as DriverShift, fatigueWarning: fatigueWarning || undefined };
  },

  async updateShift(
    id: string,
    patch: Partial<Pick<DriverShift, "actual_start" | "actual_end" | "notes" | "rate_multiplier" | "status">>,
    client: Sb = defaultClient,
    actorUserId?: string | null,
  ): Promise<{ ok: boolean; error?: string }> {
    // Phase 8 #1: snapshot the row before we mutate it so the
    // audit log can record both before + after. Best-effort - a
    // missing snapshot doesn't block the edit.
    let before: any = null;
    try {
      const { data, error: error2 } = await (client as any)
        .from("driver_shifts")
        .select("id, company_id, driver_id, actual_start, actual_end, notes, rate_multiplier, status")
        .eq("id", id)
        .maybeSingle();
      if (error2) {
        console.error("[driverPayService] driver_shifts fetch failed:", error2);
      }
      before = data || null;
    } catch {
      /* non-blocking */
    }
    const { error } = await (client as any)
      .from("driver_shifts")
      .update(patch)
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
    // Best-effort audit row. Settlement view + payroll reads
    // driver_shifts directly, so the immutable trail of who
    // changed what + when sits in audit_logs.
    if (before?.company_id) {
      try {
        await (client as any).from("audit_logs").insert({
          company_id: before.company_id,
          user_id: actorUserId ?? null,
          action: "driver_shift_edited",
          entity_type: "driver_shift",
          entity_id: id,
          details: { before, patch },
        });
      } catch {
        /* non-blocking */
      }
    }
    return { ok: true };
  },

  /** Soft delete - preserves historical shifts in reports. */
  async deleteShift(
    id: string,
    client: Sb = defaultClient,
    actorUserId?: string | null,
    reason?: string | null,
  ): Promise<{ ok: boolean; error?: string }> {
    let before: any = null;
    try {
      const { data, error: error3 } = await (client as any)
        .from("driver_shifts")
        .select("id, company_id, driver_id, actual_start, actual_end, notes, rate_multiplier, status")
        .eq("id", id)
        .maybeSingle();
      if (error3) {
        console.error("[driverPayService] driver_shifts fetch failed:", error3);
      }
      before = data || null;
    } catch {
      /* non-blocking */
    }
    const { error } = await (client as any)
      .from("driver_shifts")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };
    if (before?.company_id) {
      try {
        await (client as any).from("audit_logs").insert({
          company_id: before.company_id,
          user_id: actorUserId ?? null,
          action: "driver_shift_deleted",
          entity_type: "driver_shift",
          entity_id: id,
          details: { before, reason: reason?.trim() || null },
        });
      } catch {
        /* non-blocking */
      }
    }
    return { ok: true };
  },

  /**
   * Compute the full pay summary for a driver across a date range.
   * One round trip per source: shifts (hourly), orders (distance +
   * callout). Aggregates client-side because the row counts in a
   * fortnight or month are small.
   */
  async getPaySummary(
    opts: { companyId: string; driverId: string; range: DateRange },
    client: Sb = defaultClient,
  ): Promise<DriverPaySummary> {
    const [defaults, profile, shifts, orders, sittingDeliveries, holidayRows] = await Promise.all([
      this.getCompanyDefaults(opts.companyId, client),
      this.getDriverProfile(opts.driverId, client),
      this.listShifts({ ...opts, range: opts.range }, client),
      this._listCompletedDeliveries(opts, client),
      listCompletedSittingDeliveries({ ...opts, driverIds: [opts.driverId] }, client),
      // Phase 3 #2: pull holidays once so we can render per-bucket
      // BCEA breakdowns per shift. Cheap (sub-100 rows per tenant).
      (client as any)
        .from("public_holidays")
        .select("date, is_recurring")
        .eq("company_id", opts.companyId)
        .then((r: any) => r.data || []),
    ]);
    const rates = resolveEffectiveRates(profile, defaults);

    // Holiday sets for the per-shift BCEA breakdown.
    const oneOffSet = new Set<string>();
    const recurringMDSet = new Set<string>();
    for (const h of (holidayRows || []) as Array<{ date: string; is_recurring: boolean }>) {
      if (!h.date) continue;
      if (h.is_recurring) recurringMDSet.add(h.date.slice(5));
      else oneOffSet.add(h.date);
    }

    const shiftLines = buildDriverShiftPayLines(shifts, rates).map((line) => {
      const shift = shifts.find((candidate) => candidate.id === line.shift_id);
      // A row held for review has no payable value and no BCEA breakdown.
      if (line.needs_review || !shift?.actual_start || !shift.actual_end) return line;
      try {
        const bcea = calculateBceaShiftPay(
          shift.actual_start,
          shift.actual_end,
          rates.hourly_rate,
          { oneOff: oneOffSet, recurringMD: recurringMDSet },
        );
        return { ...line, bcea_buckets: bcea.buckets };
      } catch {
        return line;
      }
    });
    // Prefer the rate-locked snapshot when present (stamped on
    // delivery completion via autoClockOut). Falls back to a live
    // calc for legacy orders that closed before snapshotting shipped.
    const deliveryLines: DeliveryPayLine[] = [
      ...orders.map((delivery) => calculateDeliveryPayLine(delivery, rates)),
      ...sittingDeliveries.map((delivery) => calculateDeliveryPayLine(delivery, rates)),
    ];

    const payableShiftLines = shiftLines.filter((shift) => !shift.needs_review);
    const hoursTotal = +payableShiftLines.reduce((sum, s) => sum + s.hours, 0).toFixed(2);
    const hourlyPay = +payableShiftLines.reduce((sum, s) => sum + s.pay, 0).toFixed(2);
    const distanceTotalKm = +deliveryLines.reduce((sum, d) => sum + d.distance_km, 0).toFixed(2);
    const distancePay = +deliveryLines.reduce((sum, d) => sum + d.distance_pay, 0).toFixed(2);
    const calloutPay = +deliveryLines.reduce((sum, d) => sum + d.callout_fee, 0).toFixed(2);

    return {
      rates,
      shifts: shiftLines,
      deliveries: deliveryLines,
      totals: {
        hours_total: hoursTotal,
        hourly_pay: hourlyPay,
        distance_total_km: distanceTotalKm,
        distance_unrecorded_deliveries: deliveryLines.filter((delivery) => delivery.distance_km <= 0).length,
        distance_pay: distancePay,
        callout_pay: calloutPay,
        grand_total: +(hourlyPay + distancePay + calloutPay).toFixed(2),
        shifts_needing_review: shiftLines.filter((shift) => shift.needs_review).length,
      },
    };
  },

  /**
   * WAGE-B (wages deferred, 2026-05-23): one-shot pay totals for
   * many drivers in a single fetch wave. Replaces the N+1 pattern
   * the /admin/wages page used (1 round trip per driver via
   * getPaySummary). For a 20-driver tenant that's 20+ round trips
   * vs 5 with the bulk call.
   *
   * Returns the same totals shape getPaySummary surfaces, keyed by
   * driver_id. Per-shift / per-delivery breakdowns are NOT computed
   * here - the wages dashboard only consumes the totals. Callers
   * that need per-shift detail (the driver-detail drawer) keep
   * using getPaySummary.
   */
  async getBulkPayTotals(
    opts: { companyId: string; driverIds: string[]; range: DateRange },
    client: Sb = defaultClient,
  ): Promise<Map<string, {
    rates: ReturnType<typeof resolveEffectiveRates>;
    hours_total: number;
    hourly_pay: number;
    distance_total_km: number;
    distance_unrecorded_deliveries: number;
    distance_pay: number;
    callout_pay: number;
    grand_total: number;
    shifts_needing_review: number;
  }>> {
    const out = new Map<string, {
      rates: ReturnType<typeof resolveEffectiveRates>;
      hours_total: number;
      hourly_pay: number;
      distance_total_km: number;
      distance_unrecorded_deliveries: number;
      distance_pay: number;
      callout_pay: number;
      grand_total: number;
      shifts_needing_review: number;
    }>();
    if (opts.driverIds.length === 0) return out;

    // Five parallel fetches, regardless of driver count.
    const [defaults, profileRows, shiftRows, orderRows, sittingDeliveries, holidayRows] = await Promise.all([
      this.getCompanyDefaults(opts.companyId, client),
      (client as any)
        .from("profiles")
        .select("id, hourly_rate, distance_rate_per_km, base_callout_fee")
        .in("id", opts.driverIds)
        .then((r: any) => (r.data || []) as Array<{
          id: string;
          hourly_rate: number | null;
          distance_rate_per_km: number | null;
          base_callout_fee: number | null;
        }>),
      (client as any)
        .from("driver_shifts")
        .select("*")
        .eq("company_id", opts.companyId)
        .in("driver_id", opts.driverIds)
        .is("deleted_at", null)
        .gte("shift_date", opts.range.from)
        .lte("shift_date", opts.range.to)
        .then((r: any) => (r.data || []) as DriverShift[]),
      (client as any)
        .from("orders")
        .select("id, assigned_driver_id, status, delivered_at, completed_at, delivery_distance_km, quote:quotes!orders_quote_id_fkey(delivery_distance_km)")
        .eq("company_id", opts.companyId)
        .in("assigned_driver_id", opts.driverIds)
        .is("deleted_at", null)
        .gte("event_date", opts.range.from)
        .lte("event_date", opts.range.to)
        .then((r: any) => (r.data || []) as Array<{
          id: string;
          assigned_driver_id: string;
          status: string | null;
          delivered_at: string | null;
          completed_at: string | null;
          delivery_distance_km: number | null;
          quote?: { delivery_distance_km: number | null } | Array<{ delivery_distance_km: number | null }> | null;
        }>),
      listCompletedSittingDeliveries(opts, client),
      (client as any)
        .from("public_holidays")
        .select("date, is_recurring")
        .eq("company_id", opts.companyId)
        .then((r: any) => (r.data || []) as Array<{ date: string; is_recurring: boolean }>),
    ]);

    // Holiday sets (shared across every driver in the batch).
    const oneOffSet = new Set<string>();
    const recurringMDSet = new Set<string>();
    for (const h of holidayRows) {
      if (!h.date) continue;
      if (h.is_recurring) recurringMDSet.add(h.date.slice(5));
      else oneOffSet.add(h.date);
    }

    const profileById = new Map(profileRows.map((p) => [p.id, p] as const));

    // One bulk fetch for the locked-rate snapshots across every
    // order the batch hit. Without this we'd otherwise pay per-
    // driver again to resolve assignments.
    const orderIds = orderRows.map((o) => o.id);
    type AssignmentRow = {
      order_id: string; driver_id: string; status: string | null; delivered_at: string | null; completed_at: string | null; base_fee: number | null; distance_fee: number | null;
      total_earnings: number | null; calculated_distance: number | null; gps_distance_km: number | null;
      gps_trip_duration_minutes: number | null;
      gps_expected_distance_km: number | null; gps_distance_status: string | null;
      gps_distance_review_required: boolean | null; gps_distance_review_reason: string | null;
    };
    let assignmentRows: AssignmentRow[] = [];
    if (orderIds.length > 0) {
      const { data } = await (client as any)
        .from("driver_assignments")
        .select("order_id, driver_id, status, delivered_at, completed_at, base_fee, distance_fee, total_earnings, calculated_distance, gps_distance_km, gps_trip_duration_minutes, gps_expected_distance_km, gps_distance_status, gps_distance_review_required, gps_distance_review_reason")
        .in("driver_id", opts.driverIds)
        .in("order_id", orderIds)
        .eq("assignment_type", "delivery")
        .is("service_sitting_id", null);
      assignmentRows = ((data || []) as AssignmentRow[]);
    }
    const assignmentByKey = new Map<string, AssignmentRow>();
    for (const a of assignmentRows) {
      assignmentByKey.set(`${a.driver_id}::${a.order_id}`, a);
    }
    let sittingOrderIds = new Set<string>();
    if (orderIds.length > 0) {
      const { data: sittingAssignments, error: sittingAssignmentsError } = await (client as any)
        .from("driver_assignments")
        .select("order_id")
        .eq("company_id", opts.companyId)
        .eq("assignment_type", "delivery")
        .not("service_sitting_id", "is", null)
        .in("order_id", orderIds);
      if (sittingAssignmentsError) console.warn("[driverPayService] bulk sitting assignment lookup failed:", sittingAssignmentsError);
      sittingOrderIds = new Set<string>((sittingAssignments || []).map((assignment: any) => assignment.order_id));
    }

    // Group rows by driver_id then run the same calc the per-
    // driver path uses.
    const shiftsByDriver = new Map<string, DriverShift[]>();
    for (const s of shiftRows) {
      const list = shiftsByDriver.get(s.driver_id) || [];
      list.push(s);
      shiftsByDriver.set(s.driver_id, list);
    }
    const ordersByDriver = new Map<string, DeliveryPaySource[]>();
    for (const o of orderRows) {
      if (sittingOrderIds.has(o.id)) continue;
      const snap = assignmentByKey.get(`${o.assigned_driver_id}::${o.id}`);
      const orderCompleted = ["delivered", "completed"].includes(String(o.status || "").toLowerCase())
        || !!o.delivered_at || !!o.completed_at;
      const assignmentCompleted = ["delivered", "completed"].includes(String(snap?.status || "").toLowerCase())
        || !!snap?.delivered_at || !!snap?.completed_at;
      if (!orderCompleted && !assignmentCompleted) continue;
      const list = ordersByDriver.get(o.assigned_driver_id) || [];
      list.push({
        id: o.id,
        line_id: o.id,
        order_number: null,
        event_name: null,
        delivery_distance_km: resolveDeliveryDistanceKm(o),
        locked_distance_fee: snap?.distance_fee ?? null,
        locked_base_fee: snap?.base_fee ?? null,
        locked_total: snap?.total_earnings ?? null,
        locked_calculated_distance: snap?.calculated_distance ?? null,
        gps_distance_km: snap?.gps_distance_km ?? null,
        gps_trip_duration_minutes: snap?.gps_trip_duration_minutes ?? null,
        gps_expected_distance_km: snap?.gps_expected_distance_km ?? null,
        gps_distance_status: snap?.gps_distance_status ?? "not_available",
        gps_distance_review_required: !!snap?.gps_distance_review_required,
        gps_distance_review_reason: snap?.gps_distance_review_reason ?? null,
      });
      ordersByDriver.set(o.assigned_driver_id, list);
    }
    for (const delivery of sittingDeliveries) {
      const list = ordersByDriver.get(delivery.driver_id) || [];
      list.push(delivery);
      ordersByDriver.set(delivery.driver_id, list);
    }

    for (const driverId of opts.driverIds) {
      const profile = profileById.get(driverId) || null;
      const rates = resolveEffectiveRates(profile, defaults);
      const shifts = shiftsByDriver.get(driverId) || [];
      const shiftLines = buildDriverShiftPayLines(shifts, rates);
      const deliveries = ordersByDriver.get(driverId) || [];
      const deliveryLines = deliveries.map((delivery) => calculateDeliveryPayLine(delivery, rates));

      const payableShiftLines = shiftLines.filter((shift) => !shift.needs_review);
      const hoursTotal = +payableShiftLines.reduce((sum, s) => sum + s.hours, 0).toFixed(2);
      const hourlyPay = +payableShiftLines.reduce((sum, s) => sum + s.pay, 0).toFixed(2);
      const distanceTotalKm = +deliveryLines.reduce((sum, d) => sum + d.distance_km, 0).toFixed(2);
      const distancePay = +deliveryLines.reduce((sum, d) => sum + d.distance_pay, 0).toFixed(2);
      const calloutPay = +deliveryLines.reduce((sum, d) => sum + d.callout_fee, 0).toFixed(2);

      out.set(driverId, {
        rates,
        hours_total: hoursTotal,
        hourly_pay: hourlyPay,
        distance_total_km: distanceTotalKm,
        distance_unrecorded_deliveries: deliveryLines.filter((delivery) => delivery.distance_km <= 0).length,
        distance_pay: distancePay,
        callout_pay: calloutPay,
        grand_total: +(hourlyPay + distancePay + calloutPay).toFixed(2),
        shifts_needing_review: shiftLines.filter((shift) => shift.needs_review).length,
      });
    }

    return out;
  },

  /**
   * Auto clock-in - called from the dispatch flow when a driver
   * marks an order as picked up. Idempotent: if an open shift
   * already exists for this driver + order, do nothing.
   *
   * Stage 4 wiring point. The shift gets:
   *   source     = 'auto'
   *   status     = 'active'
   *   actual_start = now
   *   order_id   = the picked-up order
   * The matching auto clock-out closes it.
   */
  async autoClockIn(
    opts: {
      companyId: string;
      driverId: string;
      orderId: string;
      driverAssignmentId?: string | null;
      serviceSittingId?: string | null;
      assignmentType?: string;
    },
    client: Sb = defaultClient,
  ): Promise<{ ok: boolean; shiftId?: string | null; error?: string }> {
    try {
      const assignmentType = opts.assignmentType || "delivery";
      let driverAssignmentId = opts.driverAssignmentId || null;
      let serviceSittingId = opts.serviceSittingId || null;
      let assignmentScopeSupported = true;
      if (!driverAssignmentId) {
        let assignmentQuery = (client as any)
          .from("driver_assignments")
          .select("id,service_sitting_id")
          .eq("company_id", opts.companyId)
          .eq("driver_id", opts.driverId)
          .eq("order_id", opts.orderId)
          .eq("assignment_type", assignmentType);
        assignmentQuery = serviceSittingId
          ? assignmentQuery.eq("service_sitting_id", serviceSittingId)
          : assignmentQuery.is("service_sitting_id", null);
        const { data: assignment, error: assignmentError } = await assignmentQuery.maybeSingle();
        if (assignmentError && /column .* does not exist|schema cache/i.test(assignmentError.message || "")) {
          assignmentScopeSupported = false;
        }
        driverAssignmentId = assignment?.id || null;
        serviceSittingId = assignment?.service_sitting_id || serviceSittingId;
      }
      // Pickup/in-transit is an order-context start, so it must claim the
      // driver's single active role before the legacy delivery row is opened.
      const roleClock = await beginRoleClock({
        client,
        companyId: opts.companyId,
        userId: opts.driverId,
        role: "driver",
        orderId: opts.orderId,
      });
      if (roleClock.closed.length > 0) {
        await saveRoleHandoffNote(
          roleClock.closed,
          await promptForRoleHandoffNote(roleClock.closed, "driver"),
          client,
        );
      }
      // Check the exact assignment's open timer. Sitting stops on the same
      // order must never reuse one another's timer or GPS trail.
      let existingQuery = (client as any)
        .from("driver_shifts")
        .select("id, driver_assignment_id, service_sitting_id, assignment_type")
        .eq("company_id", opts.companyId)
        .eq("driver_id", opts.driverId)
        .eq("order_id", opts.orderId)
        .is("actual_end", null)
        .is("deleted_at", null);
      if (assignmentScopeSupported) {
        existingQuery = existingQuery.eq("assignment_type", assignmentType);
        existingQuery = driverAssignmentId
          ? existingQuery.eq("driver_assignment_id", driverAssignmentId)
          : serviceSittingId
            ? existingQuery.eq("service_sitting_id", serviceSittingId)
            : existingQuery.is("service_sitting_id", null);
      }
      let { data: existing, error: existingErr } = await existingQuery.maybeSingle();
      // Older installations may not yet have the assignment-attribution
      // migration. Keep basic order timers working until it is applied.
      if (existingErr && /column .* does not exist|schema cache/i.test(existingErr.message || "")) {
        assignmentScopeSupported = false;
        const fallback = await (client as any)
          .from("driver_shifts")
          .select("id")
          .eq("company_id", opts.companyId)
          .eq("driver_id", opts.driverId)
          .eq("order_id", opts.orderId)
          .is("actual_end", null)
          .is("deleted_at", null)
          .limit(1)
          .maybeSingle();
        existing = fallback.data;
        existingErr = fallback.error;
      }
      if (existingErr) {
        console.error("[driverPayService] driver_shifts fetch failed:", existingErr);
      }
      if (existing) return { ok: true, shiftId: (existing as any).id };

      const nowIso = new Date().toISOString();
      const shiftPayload: Record<string, unknown> = {
        company_id: opts.companyId,
        driver_id: opts.driverId,
        shift_date: nowIso.slice(0, 10),
        actual_start: nowIso,
        status: "active",
        source: "auto",
        order_id: opts.orderId,
      };
      if (assignmentScopeSupported) {
        shiftPayload.driver_assignment_id = driverAssignmentId;
        shiftPayload.service_sitting_id = serviceSittingId;
        shiftPayload.assignment_type = assignmentType;
      }
      const { data, error } = await (client as any)
        .from("driver_shifts")
        .insert(shiftPayload)
        .select("id")
        .single();
      if (error) return { ok: false, error: error.message };
      return { ok: true, shiftId: (data as any).id };
    } catch (e: any) {
      return { ok: false, error: e?.message || "autoClockIn failed" };
    }
  },

  /**
   * Auto clock-out - called when an order transitions to delivered.
   * Closes the open auto-shift for this order, computes BCEA
   * rate_multiplier based on the day of week + public_holidays
   * table.
   *
   * BCEA s16: ordinary work on Sundays + public holidays = 2x.
   * Anything else = 1x (NULL in our schema, treated as 1 by the
   * pay calc).
   */
  async autoClockOut(
    opts: {
      companyId: string;
      driverId: string;
      orderId: string;
      driverAssignmentId?: string | null;
      serviceSittingId?: string | null;
      /** Wave 49 B6 - which leg is closing. Defaults to 'delivery'
       *  for back-compat callers; the collection close-out path
       *  (completeCollection) passes 'collection' so the snapshot
       *  lands in its own driver_assignments row instead of
       *  overwriting the delivery leg's pay. */
      assignmentType?: string;
    },
    client: Sb = defaultClient,
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      let openShiftQuery = (client as any)
        .from("driver_shifts")
        .select("id, actual_start, driver_assignment_id, service_sitting_id, assignment_type")
        .eq("company_id", opts.companyId)
        .eq("driver_id", opts.driverId)
        .eq("order_id", opts.orderId)
        .is("actual_end", null)
        .is("deleted_at", null);
      if (opts.driverAssignmentId || opts.serviceSittingId || opts.assignmentType) {
        openShiftQuery = openShiftQuery.eq("assignment_type", opts.assignmentType || "delivery");
        openShiftQuery = opts.driverAssignmentId
          ? openShiftQuery.eq("driver_assignment_id", opts.driverAssignmentId)
          : opts.serviceSittingId
            ? openShiftQuery.eq("service_sitting_id", opts.serviceSittingId)
            : openShiftQuery.is("service_sitting_id", null);
      }
      let { data: openShift, error: openShiftErr } = await openShiftQuery.maybeSingle();
      if (openShiftErr && /column .* does not exist|schema cache/i.test(openShiftErr.message || "")) {
        const fallback = await (client as any)
          .from("driver_shifts")
          .select("id, actual_start")
          .eq("company_id", opts.companyId)
          .eq("driver_id", opts.driverId)
          .eq("order_id", opts.orderId)
          .is("actual_end", null)
          .is("deleted_at", null)
          .limit(1)
          .maybeSingle();
        openShift = fallback.data;
        openShiftErr = fallback.error;
      }
      if (openShiftErr) {
        console.error("[driverPayService] driver_shifts fetch failed:", openShiftErr);
      }
      if (!openShift) return { ok: true }; // nothing to close, fine

      const nowIso = new Date().toISOString();
      const startIso = (openShift as any).actual_start as string | null;
      const gpsDistance = await getDriverTripDistance(client, {
        shiftId: (openShift as any).id,
        driverId: opts.driverId,
        startedAt: startIso,
        endedAt: nowIso,
      });
      const closeNote = await promptForAutomaticRoleClockNote(
        "driver",
        "This delivery timer is closing automatically because the delivery is complete.",
      );

      // Phase 2 #9: BCEA multiplier needs to look across every day the
      // shift touches, not just the day actual_end falls on. A
      // Sat-23:00 -> Sun-04:00 shift used to get a single 1x or 2x
      // multiplier based on which side of midnight the clock-out
      // happened to land. We now pull the holiday set once and split
      // the shift into per-day buckets; the dominant multiplier
      // (largest bucket's day*overtime factor) is what we stamp on
      // rate_multiplier so the legacy calculateShiftPay still works.
      // The detailed per-bucket pay is computed by calculateBceaShiftPay
      // when the summary view wants the breakdown.
      const oneOffSet = new Set<string>();
      const recurringMDSet = new Set<string>();
      const { data: holidays, error: holidaysErr } = await (client as any)
        .from("public_holidays")
        .select("date, is_recurring")
        .eq("company_id", opts.companyId);
      if (holidaysErr) {
        console.error("[driverPayService] public_holidays fetch failed:", holidaysErr);
      }
      for (const h of (holidays || []) as Array<{ date: string; is_recurring: boolean }>) {
        if (!h.date) continue;
        if (h.is_recurring) recurringMDSet.add(h.date.slice(5));
        else oneOffSet.add(h.date);
      }

      let multiplier: number | null = null;
      let hoursWorked: number | null = null;
      if (startIso) {
        const startMs = new Date(startIso).getTime();
        const endMs = new Date(nowIso).getTime();
        if (Number.isFinite(startMs) && endMs > startMs) {
          hoursWorked = Number(((endMs - startMs) / 3_600_000).toFixed(4));
          // hourlyRate=1 here - we only need the dominant multiplier,
          // not the actual pay (rates get applied at summary time).
          const bcea = calculateBceaShiftPay(startIso, nowIso, 1, {
            oneOff: oneOffSet,
            recurringMD: recurringMDSet,
          });
          multiplier = bcea.dominantMultiplier > 1 ? bcea.dominantMultiplier : null;
        }
      }

      const { error } = await (client as any)
        .from("driver_shifts")
        .update({
          actual_end: nowIso,
          status: "completed",
          rate_multiplier: multiplier,
          hours_worked: hoursWorked,
          notes: closeNote,
        })
        .eq("id", (openShift as any).id);
      if (error) return { ok: false, error: error.message };

      // Keep the shared one-timer record in lockstep with the legacy driver
      // shift. This is also where the automatic-close note is stored for the
      // order-specific user timer.
      try {
        await endCurrentRoleClock({
          client,
          companyId: opts.companyId,
          userId: opts.driverId,
          role: "driver",
          endedAt: nowIso,
          reason: "auto_order_complete",
          note: closeNote,
        });
      } catch (roleErr) {
        console.warn("[autoClockOut] shared driver role clock close failed (non-fatal):", roleErr);
      }

      // Rate-locking. Snapshot the distance + callout pay onto
      // driver_assignments now that the delivery is closing. Once
      // stamped, getPaySummary prefers these values over the live
      // calc - so changing a driver's rates next week doesn't
      // retroactively shift this delivery's pay.
      try {
        await snapshotDriverAssignmentForOrder(client, {
          companyId: opts.companyId,
          driverId: opts.driverId,
          orderId: opts.orderId,
          assignmentType: opts.assignmentType || "delivery",
          driverAssignmentId: (openShift as any).driver_assignment_id || opts.driverAssignmentId || null,
          serviceSittingId: (openShift as any).service_sitting_id || opts.serviceSittingId || null,
          gpsDistance,
          tripDurationMinutes: startIso
            ? Math.max(0, Math.round((new Date(nowIso).getTime() - new Date(startIso).getTime()) / 60_000))
            : null,
        });
      } catch (snapshotErr) {
        // Snapshot is bookkeeping; never block the clock-out on it.
        console.warn("[autoClockOut] snapshot failed (non-fatal):", snapshotErr);
      }

      // Tell the driver their shift was closed FOR them. A driver who
      // forgot to clock out after the last drop shouldn't keep accruing
      // hours; this confirms the shift ended and their pay is locked.
      // Only reached when an open shift actually existed and closed above.
      try {
        const { notificationService } = await import("@/services/notificationService");
        let orderNumber: string | null = null;
        try {
          const { data: ord } = await (client as any)
            .from("orders")
            .select("order_number")
            .eq("id", opts.orderId)
            .maybeSingle();
          orderNumber = (ord as any)?.order_number || null;
        } catch { /* best-effort label only */ }
        const legLabel = (opts.assignmentType || "delivery") === "collection" ? "collection" : "delivery";
        await notificationService.createNotification({
          company_id: opts.companyId,
          recipient_id: opts.driverId,
          user_id: opts.driverId,
          notification_type: "driver_clock_out",
          title: "You've been clocked out",
          message: `Your shift was closed automatically now that the ${legLabel}${orderNumber ? ` for ${orderNumber}` : ""} is complete.`,
          priority: "normal",
          link: "/team-portal/driver/earnings",
          related_entity_type: "order",
          related_entity_id: opts.orderId,
        }, client);
      } catch (notifyErr) {
        console.warn("[autoClockOut] driver notify failed (non-fatal):", notifyErr);
      }

      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || "autoClockOut failed" };
    }
  },

  /**
   * Internal: deliveries this driver completed in the range. Uses
   * orders.assigned_driver_id + status in (delivered, completed) - both
   * terminal states, since orders auto-flip delivered->completed ~24h
   * after delivery. delivery_distance_km already lives on orders.
   *
   * Returns shape includes optional locked snapshot from
   * driver_assignments. When `locked_total` is set, the calc layer
   * uses the snapshot instead of recomputing, so old deliveries
   * don't shift when a driver's rates change going forward.
   */
  async _listCompletedDeliveries(
    opts: { companyId: string; driverId: string; range: DateRange },
    client: Sb = defaultClient,
  ): Promise<DeliveryPaySource[]> {
    // Pull orders + assignment snapshot in parallel. The join goes
    // through driver_assignments by (order_id, driver_id) so each
    // order gets its own snapshot, even if the same order was
    // re-assigned to another driver later.
    const { data: orderRows, error: orderErr } = await (client as any)
      .from("orders")
      .select("id, event_date, order_number, event_name, status, delivered_at, completed_at, delivery_distance_km, quote:quotes!orders_quote_id_fkey(delivery_distance_km)")
      .eq("company_id", opts.companyId)
      .eq("assigned_driver_id", opts.driverId)
      .is("deleted_at", null)
      .gte("event_date", opts.range.from)
      .lte("event_date", opts.range.to);
    if (orderErr) {
      console.warn("[driverPayService._listCompletedDeliveries]", orderErr);
      return [];
    }
    const orders = (orderRows || []) as Array<{ id: string; event_date: string | null; order_number: string | null; event_name: string | null; status: string | null; delivered_at: string | null; completed_at: string | null; delivery_distance_km: number | null; quote?: { delivery_distance_km: number | null } | Array<{ delivery_distance_km: number | null }> | null }>;
    if (orders.length === 0) return [];

    const orderIds = orders.map((o) => o.id);
    // Wave 49 B6 - restrict the join to assignment_type='delivery'.
    // Without this filter the snapshot from the collection leg
    // (different fee structure) could be picked up as the delivery
    // pay locked total. Now each leg owns its own row.
    const { data: assignmentRows, error: assignmentRowsErr } = await (client as any)
      .from("driver_assignments")
      .select("order_id, status, delivered_at, completed_at, base_fee, distance_fee, total_earnings, calculated_distance, gps_distance_km, gps_trip_duration_minutes, gps_expected_distance_km, gps_distance_status, gps_distance_review_required, gps_distance_review_reason")
      .eq("driver_id", opts.driverId)
      .eq("assignment_type", "delivery")
      .is("service_sitting_id", null)
      .in("order_id", orderIds);
    if (assignmentRowsErr) {
      console.error("[driverPayService] driver_assignments fetch failed:", assignmentRowsErr);
    }
    const { data: sittingAssignmentRows, error: sittingAssignmentError } = await (client as any)
      .from("driver_assignments")
      .select("order_id")
      .eq("company_id", opts.companyId)
      .eq("assignment_type", "delivery")
      .not("service_sitting_id", "is", null)
      .in("order_id", orderIds);
    if (sittingAssignmentError) console.warn("[driverPayService] sitting assignment lookup failed:", sittingAssignmentError);
    const sittingOrderIds = new Set<string>((sittingAssignmentRows || []).map((row: any) => row.order_id));
    const lockedByOrder = new Map<string, {
      status: string | null; deliveredAt: string | null; completedAt: string | null;
      base: number | null; distance: number | null; total: number | null; calculated: number | null;
      gpsDistance: number | null; gpsExpected: number | null; gpsStatus: string | null;
      gpsDuration: number | null;
      reviewRequired: boolean | null; reviewReason: string | null;
    }>();
    for (const a of (assignmentRows || []) as Array<{
      order_id: string;
      status: string | null;
      delivered_at: string | null;
      completed_at: string | null;
      base_fee: number | null;
      distance_fee: number | null;
      total_earnings: number | null;
      calculated_distance: number | null;
      gps_distance_km: number | null;
      gps_trip_duration_minutes: number | null;
      gps_expected_distance_km: number | null;
      gps_distance_status: string | null;
      gps_distance_review_required: boolean | null;
      gps_distance_review_reason: string | null;
    }>) {
      lockedByOrder.set(a.order_id, {
        status: a.status,
        deliveredAt: a.delivered_at,
        completedAt: a.completed_at,
        base: a.base_fee,
        distance: a.distance_fee,
        total: a.total_earnings,
        calculated: a.calculated_distance,
        gpsDistance: a.gps_distance_km,
        gpsDuration: a.gps_trip_duration_minutes,
        gpsExpected: a.gps_expected_distance_km,
        gpsStatus: a.gps_distance_status,
        reviewRequired: a.gps_distance_review_required,
        reviewReason: a.gps_distance_review_reason,
      });
    }

    return orders.filter((o) => {
      if (sittingOrderIds.has(o.id)) return false;
      const assignment = lockedByOrder.get(o.id);
      const orderCompleted = ["delivered", "completed"].includes(String(o.status || "").toLowerCase())
        || !!o.delivered_at || !!o.completed_at;
      const assignmentCompleted = ["delivered", "completed"].includes(String(assignment?.status || "").toLowerCase())
        || !!assignment?.deliveredAt || !!assignment?.completedAt;
      return orderCompleted || assignmentCompleted;
    }).map((o) => {
      const locked = lockedByOrder.get(o.id);
      return {
        id: o.id,
        line_id: o.id,
        order_number: o.order_number ?? null,
        event_date: o.event_date,
        event_name: o.event_name ?? null,
        delivery_distance_km: resolveDeliveryDistanceKm(o),
        locked_distance_fee: locked?.distance ?? null,
        locked_base_fee: locked?.base ?? null,
        locked_total: locked?.total ?? null,
        locked_calculated_distance: locked?.calculated ?? null,
        gps_distance_km: locked?.gpsDistance ?? null,
        gps_trip_duration_minutes: locked?.gpsDuration ?? null,
        gps_expected_distance_km: locked?.gpsExpected ?? null,
        gps_distance_status: locked?.gpsStatus ?? "not_available",
        gps_distance_review_required: !!locked?.reviewRequired,
        gps_distance_review_reason: locked?.reviewReason ?? null,
      };
    });
  },
};

/**
 * Snapshot the calculated distance + callout pay onto
 * driver_assignments for a given (driver, order, assignment_type).
 * Idempotent: looks for an existing assignment row first, updates
 * it; if absent, inserts a fresh one.
 *
 * Wave 49 B6 - now keyed on (order_id, driver_id, assignment_type).
 * Pre-Wave-49 the lookup was (order_id, driver_id) only, which
 * meant the second autoClockOut on the same order overwrote the
 * first leg's snapshot. Same driver doing both delivery and
 * collection lost a leg's pay every time.
 *
 * Called from autoClockOut on delivery + collection completion so
 * the values get locked at the rates in force at that moment.
 * Future getPaySummary calls prefer these locked values over the
 * live calc.
 */
async function snapshotDriverAssignmentForOrder(
  client: Sb,
  opts: {
    companyId: string;
    driverId: string;
    orderId: string;
    assignmentType?: string;
    driverAssignmentId?: string | null;
    serviceSittingId?: string | null;
    gpsDistance?: DriverTripDistance;
    tripDurationMinutes?: number | null;
  },
): Promise<void> {
  const assignmentType = opts.assignmentType || "delivery";

  // Load the route estimate and enough sitting geometry to allocate a
  // multi-address booking's saved distance to this exact stop.
  const { data: orderRow, error: orderRowErr } = await (client as any)
    .from("orders")
    .select("id, delivery_distance_km, region_id, venue_lat, venue_lng, quote:quotes!orders_quote_id_fkey(delivery_distance_km), service_sittings(id,sequence_number,status,venue_lat,venue_lng)")
    .eq("id", opts.orderId)
    .maybeSingle();
  if (orderRowErr) {
    console.error("[driverPayService] orders fetch failed:", orderRowErr);
  }
  if (!orderRow) return;

  let expectedOneWayKm = resolveDeliveryDistanceKm(orderRow as DeliveryDistanceSource);
  if (opts.serviceSittingId) {
    let origin: { lat: number; lng: number } | null = null;
    if (orderRow.region_id) {
      const { data: region } = await (client as any)
        .from("regions").select("lat,lng").eq("id", orderRow.region_id).maybeSingle();
      if (region?.lat != null && region?.lng != null) origin = { lat: Number(region.lat), lng: Number(region.lng) };
    }
    if (!origin) {
      const { data: company } = await (client as any)
        .from("companies").select("headquarters_lat,headquarters_lng").eq("id", opts.companyId).maybeSingle();
      if (company?.headquarters_lat != null && company?.headquarters_lng != null) {
        origin = { lat: Number(company.headquarters_lat), lng: Number(company.headquarters_lng) };
      }
    }
    const orderForSplit = {
      ...orderRow,
      event_date: "",
      status: "",
      order_number: null,
      event_name: null,
    } as SittingOrderForPay;
    expectedOneWayKm = splitBookingDistanceAcrossSittings(orderForSplit, origin).get(opts.serviceSittingId)
      ?? expectedOneWayKm;
  }

  const [defaults, profile] = await Promise.all([
    driverPayService.getCompanyDefaults(opts.companyId, client),
    driverPayService.getDriverProfile(opts.driverId, client),
  ]);
  const rates = resolveEffectiveRates(profile, defaults);
  const gpsDistance = opts.gpsDistance || { distanceKm: null, status: "not_available" as const, acceptedPoints: 0 };
  const expectedRoundTripKm = +(Math.max(0, expectedOneWayKm) * 2).toFixed(2);
  const hasCompleteGpsDistance = gpsDistance.status === "complete" && gpsDistance.distanceKm != null;
  const billableDistanceKm = hasCompleteGpsDistance ? gpsDistance.distanceKm as number : expectedRoundTripKm;
  const distancePay = +(billableDistanceKm * rates.distance_rate_per_km).toFixed(2);
  const calloutFee = +rates.base_callout_fee.toFixed(2);
  const total = +(distancePay + calloutFee).toFixed(2);
  const materialRouteOverage = hasCompleteGpsDistance && expectedRoundTripKm > 0
    && billableDistanceKm > expectedRoundTripKm * 1.5
    && billableDistanceKm - expectedRoundTripKm >= 5;
  const reviewReason = materialRouteOverage
    ? `GPS recorded ${billableDistanceKm.toFixed(1)} km against an estimated ${expectedRoundTripKm.toFixed(1)} km round trip. Review the route before approving settlement.`
    : null;

  let existingQuery = (client as any)
    .from("driver_assignments")
    .select("id")
    .eq("company_id", opts.companyId)
    .eq("order_id", opts.orderId)
    .eq("driver_id", opts.driverId)
    .eq("assignment_type", assignmentType);
  existingQuery = opts.driverAssignmentId
    ? existingQuery.eq("id", opts.driverAssignmentId)
    : opts.serviceSittingId
      ? existingQuery.eq("service_sitting_id", opts.serviceSittingId)
      : existingQuery.is("service_sitting_id", null);
  const { data: existing, error: existingErr2 } = await existingQuery.maybeSingle();
  if (existingErr2) {
    console.error("[driverPayService] driver_assignments fetch failed:", existingErr2);
  }

  // Wave 49 B6 - only the delivery leg stamps delivered_at; the
  // collection leg uses completed_at. Otherwise reading delivered_at
  // would mean "delivery happened" or "collection trip closed",
  // which is a different fact each row.
  const nowIso = new Date().toISOString();
  const payload: any = {
    base_fee: calloutFee,
    distance_fee: distancePay,
    total_earnings: total,
    calculated_distance: billableDistanceKm,
    gps_distance_km: gpsDistance.distanceKm,
    gps_trip_duration_minutes: opts.tripDurationMinutes ?? null,
    gps_expected_distance_km: expectedRoundTripKm > 0 ? expectedRoundTripKm : null,
    gps_distance_status: gpsDistance.status,
    gps_distance_review_required: materialRouteOverage,
    gps_distance_review_reason: reviewReason,
    gps_distance_checked_at: nowIso,
  };
  if (assignmentType === "delivery") {
    payload.delivered_at = nowIso;
  } else {
    payload.completed_at = nowIso;
  }

  if (existing) {
    await (client as any)
      .from("driver_assignments")
      .update(payload)
      .eq("id", (existing as any).id);
  } else {
    await (client as any)
      .from("driver_assignments")
      .insert({
        company_id: opts.companyId,
        driver_id: opts.driverId,
        order_id: opts.orderId,
        assignment_type: assignmentType,
        service_sitting_id: opts.serviceSittingId || undefined,
        status: "completed",
        ...payload,
      });
  }
}
