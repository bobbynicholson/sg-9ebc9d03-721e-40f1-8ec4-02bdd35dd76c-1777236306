/* eslint-disable @typescript-eslint/no-explicit-any */
import { shiftService } from "./shiftService";
/**
 * Dispatch service: the math layer behind the order-to-driver flywheel.
 *
 * Responsibilities:
 *   - score(driver, order)   weighted match score, 0-100
 *   - suggestDriversForOrder ranked candidates with reasons (caller sets the cap)
 *   - capacity check         driver max_jobs_per_shift on the event date
 *   - feasibility check      can the driver still arrive arrival_buffer_minutes
 *                            before event_time given current pipeline
 *   - assignDriverWithGate   the single safe write path: gates capacity + feasibility,
 *                            stamps assignment_score, writes audit row
 *   - bulkAssign             N orders -> one driver in a single round trip
 *   - getDispatchSettings    per-tenant config (sla, buffer, weights)
 *   - getDispatchKpis        median time-to-assign, at-risk count, etc.
 *
 * Nothing here mutates state silently. Every assignment writes to
 * order_assignment_audit so dispatch decisions are traceable.
 */
import { supabase } from "@/integrations/supabase/client";
import { toLocalISO } from "@/lib/localDate";

// ── Types ────────────────────────────────────────────────────────────────────

export interface DispatchSettings {
  slaAssignMinutes: number;          // event-T threshold below which unassigned glows red
  arrivalBufferMinutes: number;      // driver must arrive at least this many minutes before event_time
  autoAssignEnabled: boolean;        // legacy setting; assignment commits only through explicit actions
  autoSuggestEnabled: boolean;       // when true, page surfaces top suggestions
  /** Phase 3: max distance in km between two orders to qualify as a batch candidate. */
  batchDistanceKm: number;
  /** Phase 3: max time in minutes between two orders' event times to qualify. */
  batchTimeWindowMinutes: number;
  /** Rand per kilometre delivery fee, applied on the quote builder. */
  deliveryCostPerKm: number;
  /** Floor delivery fee. If distance × per-km falls below this, the floor wins. */
  minDeliveryFee: number;
  weights: {
    distance: number;
    currentLoad: number;
    regionMatch: number;
    onTimeRate: number;
    rating: number;
  };
}

const DEFAULT_SETTINGS: DispatchSettings = {
  slaAssignMinutes: 720,             // 12 hours
  arrivalBufferMinutes: 30,
  autoAssignEnabled: false,
  autoSuggestEnabled: true,
  batchDistanceKm: 2,
  batchTimeWindowMinutes: 60,
  deliveryCostPerKm: 8.5,            // SA market average; tenant overrides
  minDeliveryFee: 0,                 // off by default
  weights: {
    distance:     0.30,
    currentLoad:  0.20,
    regionMatch:  0.25,
    onTimeRate:   0.15,
    // Rating no longer influences driver selection (2026-06-17). Kept at 0
    // for settings back-compat; scoreDriverForOrder ignores it and
    // renormalises on the remaining factors.
    rating:       0,
  },
};

export interface DriverCandidate {
  id: string;
  full_name: string;
  email?: string;
  is_active?: boolean;
  max_jobs_per_shift?: number | null;
  regions_covered?: string[] | null;
  home_postcode?: string | null;
  region_id?: string | null;
  on_time_rate?: number | null;
  completed_jobs_30d?: number | null;
  average_rating?: number | null;
  rating_count?: number | null;
}

export interface OrderForDispatch {
  id: string;
  event_date: string;
  event_time?: string | null;
  region_id?: string | null;
  venue_lat?: number | null;
  venue_lng?: number | null;
  venue_address?: string | null;
  requires_refrigeration?: boolean;
  total_amount?: number | null;
  client_name?: string | null;
  status?: string | null;
}

export interface ScoreBreakdown {
  total: number;        // 0-100
  distance: number;     // 0-1 normalised
  currentLoad: number;
  regionMatch: number;
  onTimeRate: number;
  rating: number;
  reasons: string[];    // human-readable reasons for the score
}

export interface DispatchSuggestion {
  driver: DriverCandidate;
  score: ScoreBreakdown;
  capacity: { ok: boolean; current: number; max: number | null; reason?: string };
  feasibility: { ok: boolean; etaMinutes: number | null; reason?: string };
  vehicle: { ok: boolean; reason?: string; refrigerated?: boolean };
}

// ── Geo helpers ──────────────────────────────────────────────────────────────

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Average urban speed for ETA estimation (km/h). Conservative. Phase 3 plugs in real traffic.
const AVG_SPEED_KMH = 35;

function etaMinutesFromKm(km: number): number {
  return Math.round((km / AVG_SPEED_KMH) * 60);
}

// ── Public API ───────────────────────────────────────────────────────────────

export const dispatchService = {

  // ── Settings ──────────────────────────────────────────────────────────────

  async getDispatchSettings(companyId: string): Promise<DispatchSettings> {
    const { data, error } = await supabase
      .from("companies")
      .select("dispatch_settings")
      .eq("id", companyId)
      .maybeSingle();
    if (error || !data) return DEFAULT_SETTINGS;
    const raw = (data as any).dispatch_settings || {};
    return {
      slaAssignMinutes:       Number(raw.sla_assign_minutes        ?? DEFAULT_SETTINGS.slaAssignMinutes),
      arrivalBufferMinutes:   Number(raw.arrival_buffer_minutes    ?? DEFAULT_SETTINGS.arrivalBufferMinutes),
      autoAssignEnabled:      false,
      autoSuggestEnabled:     Boolean(raw.auto_suggest_enabled     ?? DEFAULT_SETTINGS.autoSuggestEnabled),
      batchDistanceKm:        Number(raw.batch_distance_km         ?? DEFAULT_SETTINGS.batchDistanceKm),
      batchTimeWindowMinutes: Number(raw.batch_time_window_minutes ?? DEFAULT_SETTINGS.batchTimeWindowMinutes),
      deliveryCostPerKm:      Number(raw.delivery_cost_per_km      ?? DEFAULT_SETTINGS.deliveryCostPerKm),
      minDeliveryFee:         Number(raw.min_delivery_fee          ?? DEFAULT_SETTINGS.minDeliveryFee),
      weights: {
        distance:    Number(raw.auto_assign_weights?.distance     ?? DEFAULT_SETTINGS.weights.distance),
        currentLoad: Number(raw.auto_assign_weights?.current_load ?? DEFAULT_SETTINGS.weights.currentLoad),
        regionMatch: Number(raw.auto_assign_weights?.region_match ?? DEFAULT_SETTINGS.weights.regionMatch),
        onTimeRate:  Number(raw.auto_assign_weights?.on_time_rate ?? DEFAULT_SETTINGS.weights.onTimeRate),
        rating:      0,
      },
    };
  },

  async updateDispatchSettings(companyId: string, s: DispatchSettings): Promise<boolean> {
    const payload = {
      sla_assign_minutes:        s.slaAssignMinutes,
      arrival_buffer_minutes:    s.arrivalBufferMinutes,
      auto_assign_enabled:       false,
      auto_suggest_enabled:      s.autoSuggestEnabled,
      batch_distance_km:         s.batchDistanceKm,
      batch_time_window_minutes: s.batchTimeWindowMinutes,
      delivery_cost_per_km:      s.deliveryCostPerKm,
      min_delivery_fee:          s.minDeliveryFee,
      auto_assign_weights: {
        distance:     s.weights.distance,
        current_load: s.weights.currentLoad,
        region_match: s.weights.regionMatch,
        on_time_rate: s.weights.onTimeRate,
        rating:       0,
      },
    };
    const { error } = await supabase
      .from("companies")
      .update({ dispatch_settings: payload })
      .eq("id", companyId);
    if (error) throw error;
    return true;
  },

  // ── Drivers + load ────────────────────────────────────────────────────────

  async getDriversForCompany(companyId: string): Promise<DriverCandidate[]> {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, is_active, max_jobs_per_shift, regions_covered, home_postcode, region_id, vehicle_id, vehicles:vehicle_id(id, plate, refrigerated, capacity_kg)")
      .eq("company_id", companyId)
      .eq("role", "driver")
      .order("full_name");
    if (error) {
      console.error("Error fetching drivers:", error);
      return [];
    }
    return (data || []).filter((d: any) => d.is_active !== false);
  },

  /**
   * Filter the company driver pool down to those who can deliver from a
   * given region. Used by suggestDriversForOrder to enforce branch
   * scoping before scoring - so the dispatcher doesn't see a JHB
   * driver as a candidate for a CPT order unless they explicitly opt
   * in to cross-region lending.
   *
   * Inclusion rules (any one is enough):
   *   * driver.regions_covered contains regionId
   *   * driver.region_id == regionId (legacy single-region setup)
   *   * driver has no scoping at all (regions_covered empty AND
   *     region_id null) - treated as "company-wide" so a tenant who
   *     hasn't carved up their drivers yet still gets candidates
   */
  filterDriversByRegion(drivers: DriverCandidate[], regionId: string | null | undefined): DriverCandidate[] {
    if (!regionId) return drivers;
    return drivers.filter((d: any) => {
      const covered: string[] | null = Array.isArray(d.regions_covered) ? d.regions_covered : null;
      const primary: string | null = d.region_id ?? null;
      if (covered && covered.length > 0) return covered.includes(regionId);
      if (primary) return primary === regionId;
      return true; // unscoped driver = company-wide pool
    });
  },

  /**
   * Driver load on a given date: count of confirmed/active orders assigned
   * to this driver whose event_date matches.
   */
  async getDriverLoadOnDate(driverId: string, eventDate: string): Promise<number> {
    const { data, error } = await supabase
      .from("orders")
      .select("id", { count: "exact" })
      .eq("assigned_driver_id", driverId)
      .eq("event_date", eventDate)
      .in("status", ["confirmed", "preparing", "ready", "in_transit"])
      .is("deleted_at", null);
    if (error) {
      console.warn("Error counting driver load:", error);
      return 0;
    }
    return (data || []).length;
  },

  async getDriverLoadMap(driverIds: string[], eventDate: string): Promise<Record<string, number>> {
    if (driverIds.length === 0) return {};
    const { data, error } = await supabase
      .from("orders")
      .select("assigned_driver_id")
      .in("assigned_driver_id", driverIds)
      .eq("event_date", eventDate)
      .in("status", ["confirmed", "preparing", "ready", "in_transit"])
      .is("deleted_at", null);
    if (error) return {};
    const map: Record<string, number> = {};
    for (const id of driverIds) map[id] = 0;
    for (const row of data || []) {
      const id = (row as any).assigned_driver_id;
      if (id) map[id] = (map[id] || 0) + 1;
    }
    return map;
  },

  // ── Scoring ───────────────────────────────────────────────────────────────

  /**
   * score(driver, order) -> 0-100. Higher is better.
   * Each component is normalised to 0-1, multiplied by its weight, summed,
   * then scaled to 0-100. Reasons are captured as human-readable strings.
   */
  scoreDriverForOrder(
    driver: DriverCandidate,
    order: OrderForDispatch,
    ctx: {
      currentLoad: number;
      driverLatLng?: { lat: number; lng: number } | null;
      onTimeRate?: number; // 0-1
      weights: DispatchSettings["weights"];
    },
  ): ScoreBreakdown {
    const reasons: string[] = [];

    // Distance component (0-1, where 1 = closest, 0 = ≥30km away)
    let distanceScore = 0.5;
    if (
      ctx.driverLatLng &&
      order.venue_lat != null &&
      order.venue_lng != null
    ) {
      const km = haversineKm(ctx.driverLatLng, { lat: order.venue_lat, lng: order.venue_lng });
      distanceScore = Math.max(0, Math.min(1, 1 - km / 30));
      reasons.push(`${km.toFixed(1)} km from venue`);
    } else {
      reasons.push("No GPS for distance");
    }

    // Load component (0-1, where 1 = no jobs today, 0 = at or over capacity)
    const max = driver.max_jobs_per_shift ?? 6;
    const loadScore = Math.max(0, Math.min(1, 1 - ctx.currentLoad / Math.max(1, max)));
    if (ctx.currentLoad === 0) reasons.push("No jobs today yet");
    else reasons.push(`${ctx.currentLoad} of ${max} jobs today`);

    // Region match component (0 or 1, plus partial via region_id fallback)
    let regionScore = 0;
    if (order.region_id) {
      if (Array.isArray(driver.regions_covered) && driver.regions_covered.includes(order.region_id)) {
        regionScore = 1;
        reasons.push("In driver's regions");
      } else if (driver.region_id === order.region_id) {
        regionScore = 0.7;
        reasons.push("Driver's home region");
      } else {
        reasons.push("Out of region");
      }
    } else {
      regionScore = 0.5;
    }

    // On-time rate (0-1). When unknown, treat as 0.85 (industry baseline) to avoid penalising new drivers.
    const onTimeScore = Math.max(0, Math.min(1, ctx.onTimeRate ?? 0.85));
    if (ctx.onTimeRate != null) reasons.push(`${Math.round(ctx.onTimeRate * 100)}% on-time`);
    else reasons.push("No on-time history yet");

    // Rating removed from selection (2026-06-17): drivers aren't chosen on
    // a star rating, so it no longer influences the score. We score on
    // distance, current load, region and on-time only, and renormalise by
    // the active weights so the total stays 0-100 regardless of any legacy
    // rating weight still stored in a tenant's settings.
    const w = ctx.weights;
    const activeWeightSum =
      (w.distance + w.currentLoad + w.regionMatch + w.onTimeRate) || 1;
    const weighted =
      (w.distance    * distanceScore +
       w.currentLoad * loadScore +
       w.regionMatch * regionScore +
       w.onTimeRate  * onTimeScore) / activeWeightSum;

    const total = Math.round(weighted * 100);

    return {
      total,
      distance:    distanceScore,
      currentLoad: loadScore,
      regionMatch: regionScore,
      onTimeRate:  onTimeScore,
      rating:      0,
      reasons,
    };
  },

  // ── Capacity + feasibility gates ──────────────────────────────────────────

  async checkCapacity(
    driverId: string,
    eventDate: string,
    maxJobs: number | null | undefined,
  ): Promise<{ ok: boolean; current: number; max: number | null; reason?: string }> {
    const current = await this.getDriverLoadOnDate(driverId, eventDate);
    const max = maxJobs ?? null;
    if (max == null) return { ok: true, current, max, reason: "No capacity limit set" };
    if (current >= max) {
      return { ok: false, current, max, reason: `At capacity (${current} of ${max})` };
    }
    return { ok: true, current, max };
  },

  /**
   * Same-day time-overlap check: would this driver land on two events
   * with overlapping service windows on the same date? Default window
   * is +/- bufferHours either side of `event_time` (3h covers prep,
   * load, drive, serve, return for the typical event).
   *
   * Returns the first conflicting order if any; the caller can refuse
   * (when enforceGates=true) or warn-and-allow.
   *
   * P1-08 + P1-18 from the 2026-05 audit: avoid silently double-booking
   * a driver across two simultaneous events.
   */
  async checkDoubleBooking(payload: {
    driverId: string;
    eventDate: string;
    eventTime: string | null;
    ignoreOrderId?: string;
    bufferHours?: number;
  }): Promise<{
    ok: boolean;
    conflictOrderId?: string;
    conflictOrderNumber?: string;
    conflictTime?: string;
    reason?: string;
  }> {
    const { driverId, eventDate, eventTime, ignoreOrderId } = payload;
    const buffer = payload.bufferHours ?? 3;

    if (!eventTime) {
      // No time on the order - can't compute a window. Return ok with
      // an explanatory reason so the dispatcher knows the gate didn't
      // apply rather than that it found nothing.
      return { ok: true, reason: "No event_time on order; time-conflict check skipped." };
    }

    let q = supabase
      .from("orders")
      .select("id, order_number, event_time")
      .eq("assigned_driver_id", driverId)
      .eq("event_date", eventDate)
      .in("status", ["confirmed", "preparing", "ready", "in_transit"])
      .is("deleted_at", null);
    if (ignoreOrderId) q = q.neq("id", ignoreOrderId);
    const { data, error } = await q;
    if (error) {
      console.warn("Error checking double-booking:", error);
      return { ok: true };
    }

    const minutesOf = (hhmm: string | null) => {
      if (!hhmm) return null;
      const [h, m] = hhmm.split(":").map((s) => parseInt(s, 10));
      if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
      return h * 60 + m;
    };

    const newMin = minutesOf(eventTime);
    if (newMin === null) return { ok: true };
    const bufMin = buffer * 60;

    for (const row of (data || []) as Array<{ id: string; order_number: string | null; event_time: string | null }>) {
      const otherMin = minutesOf(row.event_time);
      if (otherMin === null) continue;
      if (Math.abs(newMin - otherMin) < bufMin) {
        return {
          ok: false,
          conflictOrderId: row.id,
          conflictOrderNumber: row.order_number ?? row.id.slice(0, 8),
          conflictTime: row.event_time ?? undefined,
          reason: `Driver already on order ${row.order_number ?? row.id.slice(0, 8)} at ${row.event_time} (within ${buffer}h window).`,
        };
      }
    }

    return { ok: true };
  },

  /**
   * Time-window feasibility: can this driver still arrive
   * arrival_buffer_minutes before event_time? Best-effort - if we don't have
   * GPS or a venue lat/lng, returns ok=true with a "no GPS" reason so the
   * dispatcher can still proceed.
   */
  checkTimeWindowFeasibility(
    driverLatLng: { lat: number; lng: number } | null | undefined,
    order: OrderForDispatch,
    arrivalBufferMinutes: number,
  ): { ok: boolean; etaMinutes: number | null; reason?: string } {
    if (!driverLatLng || order.venue_lat == null || order.venue_lng == null) {
      return { ok: true, etaMinutes: null, reason: "No GPS to verify" };
    }
    if (!order.event_time) {
      return { ok: true, etaMinutes: null, reason: "Event time not set" };
    }
    const km = haversineKm(driverLatLng, { lat: order.venue_lat, lng: order.venue_lng });
    const etaMinutes = etaMinutesFromKm(km);
    const eventDateTime = new Date(`${order.event_date}T${order.event_time}`);
    if (isNaN(eventDateTime.getTime())) return { ok: true, etaMinutes, reason: "Bad event time" };
    const minutesUntilEvent = (eventDateTime.getTime() - Date.now()) / 60000;
    if (minutesUntilEvent <= 0) return { ok: false, etaMinutes, reason: "Event already started" };
    const slack = minutesUntilEvent - etaMinutes - arrivalBufferMinutes;
    if (slack < 0) return { ok: false, etaMinutes, reason: `Cannot arrive ${arrivalBufferMinutes}m before event` };
    return { ok: true, etaMinutes };
  },

  // ── Suggest ──────────────────────────────────────────────────────────────

  /**
   * Top N driver suggestions for an order, ranked by score and gated by
   * capacity + feasibility. The dispatcher sees this on the assign dialog.
   */
  async suggestDriversForOrder(
    companyId: string,
    order: OrderForDispatch,
    limit = 3,
    opts: { restrictToRegion?: boolean } = {},
  ): Promise<DispatchSuggestion[]> {
    const settings = await this.getDispatchSettings(companyId);
    let drivers = await this.getDriversForCompany(companyId);
    if (drivers.length === 0) return [];

    // Branch gating. Default behaviour: when the order belongs to a
    // branch, only suggest drivers who cover that branch. Dispatcher
    // can pass restrictToRegion=false to widen to the full company
    // pool ("lend" workflow).
    const shouldRestrict = opts.restrictToRegion !== false;
    if (shouldRestrict && order.region_id) {
      const filtered = this.filterDriversByRegion(drivers, order.region_id);
      // Fall back to the full pool if branch has no eligible drivers
      // (avoid silently returning zero suggestions and stranding the
      // order). The UI flags this as a cross-branch suggestion.
      drivers = filtered.length > 0 ? filtered : drivers;
    }

    const driverIds = drivers.map(d => d.id);
    const loadMap = await this.getDriverLoadMap(driverIds, order.event_date);
    const metricsByDriver = await this.getDriverDispatchMetrics(companyId, driverIds, 30);

    // Current location for each driver - single-row-per-driver lookup
    // off driver_locations (P1-23 split).
    const { data: gpsRows } = await (supabase as any)
      .from("driver_locations")
      .select("driver_id, latitude, longitude, updated_at")
      .in("driver_id", driverIds)
      .order("updated_at", { ascending: false });
    const latestGps: Record<string, { lat: number; lng: number }> = {};
    for (const row of gpsRows || []) {
      const did = (row as any).driver_id;
      const lat = Number((row as any).latitude);
      const lng = Number((row as any).longitude);
      if (!latestGps[did] && Number.isFinite(lat) && Number.isFinite(lng)) {
        latestGps[did] = {
          lat,
          lng,
        };
      }
    }

    const suggestions: DispatchSuggestion[] = drivers.map(d => {
      const currentLoad = loadMap[d.id] ?? 0;
      const driverLatLng = latestGps[d.id] || null;
      const metrics = metricsByDriver[d.id] || null;
      const driverWithMetrics: DriverCandidate = {
        ...d,
        on_time_rate: metrics?.onTimeRate ?? null,
        completed_jobs_30d: metrics?.completedJobs ?? 0,
        average_rating: metrics?.averageRating ?? null,
        rating_count: metrics?.ratingCount ?? 0,
      };
      const score = this.scoreDriverForOrder(d, order, {
        currentLoad,
        driverLatLng,
        onTimeRate: metrics?.onTimeRate ?? undefined,
        weights: settings.weights,
      });
      const max = d.max_jobs_per_shift ?? null;
      const capacity = max == null
        ? { ok: true, current: currentLoad, max, reason: "No capacity limit set" }
        : currentLoad >= max
          ? { ok: false, current: currentLoad, max, reason: `At capacity (${currentLoad} of ${max})` }
          : { ok: true, current: currentLoad, max };
      const feasibility = this.checkTimeWindowFeasibility(driverLatLng, order, settings.arrivalBufferMinutes);

      // Vehicle / cold-chain feasibility: when the order requires refrigeration,
      // the driver must have a vehicle and that vehicle must be refrigerated.
      // Otherwise the vehicle gate passes regardless of whether one is attached.
      const driverVehicle: any = (d as any).vehicles ?? null;
      const needsRefrigeration = !!order.requires_refrigeration;
      const vehicle = needsRefrigeration
        ? !driverVehicle
          ? { ok: false, reason: "No vehicle assigned" }
          : !driverVehicle.refrigerated
            ? { ok: false, reason: "Vehicle not refrigerated", refrigerated: false }
            : { ok: true, refrigerated: true }
        : { ok: true, refrigerated: !!driverVehicle?.refrigerated };

      return { driver: driverWithMetrics, score, capacity, feasibility, vehicle };
    });

    // Sort by score desc, demoting candidates that fail any hard gate.
    suggestions.sort((a, b) => {
      if (a.capacity.ok    !== b.capacity.ok)    return a.capacity.ok    ? -1 : 1;
      if (a.vehicle.ok     !== b.vehicle.ok)     return a.vehicle.ok     ? -1 : 1;
      if (a.feasibility.ok !== b.feasibility.ok) return a.feasibility.ok ? -1 : 1;
      return b.score.total - a.score.total;
    });

    return suggestions.slice(0, limit);
  },

  async getDriverDispatchMetrics(
    companyId: string,
    driverIds: string[],
    days = 30,
  ): Promise<Record<string, {
    completedJobs: number;
    onTimeRate: number | null;
    averageRating: number | null;
    ratingCount: number;
  }>> {
    const out: Record<string, {
      completedJobs: number;
      onTimeRate: number | null;
      averageRating: number | null;
      ratingCount: number;
    }> = {};
    for (const id of driverIds) {
      out[id] = { completedJobs: 0, onTimeRate: null, averageRating: null, ratingCount: 0 };
    }
    if (driverIds.length === 0) return out;

    const settings = await this.getDispatchSettings(companyId);
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceDate = since.toISOString().slice(0, 10);
    const todayDate = toLocalISO(new Date());
    const inList = driverIds.join(",");

    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, driver_id, assigned_driver_id, event_date, event_time, delivered_at, status")
      .eq("company_id", companyId)
      .gte("event_date", sinceDate)
      .lte("event_date", todayDate)
      .in("status", ["delivered", "completed"])
      .or(`driver_id.in.(${inList}),assigned_driver_id.in.(${inList})`)
      .is("deleted_at", null);
    if (error) {
      console.warn("[dispatchService] driver metrics order lookup failed:", error);
      return out;
    }

    const orderToDriver = new Map<string, string>();
    const onTimeCounts: Record<string, { total: number; onTime: number }> = {};
    for (const row of (orders || []) as any[]) {
      const driverId = driverIds.includes(row.assigned_driver_id)
        ? row.assigned_driver_id
        : row.driver_id;
      if (!driverId) continue;
      orderToDriver.set(row.id, driverId);
      out[driverId].completedJobs += 1;
      if (row.event_date && row.event_time && row.delivered_at) {
        if (!onTimeCounts[driverId]) onTimeCounts[driverId] = { total: 0, onTime: 0 };
        onTimeCounts[driverId].total += 1;
        const eventDt = new Date(`${row.event_date}T${row.event_time}`);
        const deadline = eventDt.getTime() + settings.arrivalBufferMinutes * 60_000;
        const delivered = new Date(row.delivered_at).getTime();
        if (!Number.isNaN(deadline) && !Number.isNaN(delivered) && delivered <= deadline) {
          onTimeCounts[driverId].onTime += 1;
        }
      }
    }
    for (const driverId of Object.keys(onTimeCounts)) {
      const stats = onTimeCounts[driverId];
      out[driverId].onTimeRate = stats.total > 0 ? stats.onTime / stats.total : null;
    }

    const orderIds = Array.from(orderToDriver.keys());
    if (orderIds.length === 0) return out;
    const { data: feedback, error: feedbackError } = await (supabase as any)
      .from("delivery_feedback")
      .select("order_id, overall_rating, driver_professionalism_rating")
      .eq("company_id", companyId)
      .in("order_id", orderIds);
    if (feedbackError) {
      console.warn("[dispatchService] driver metrics feedback lookup failed:", feedbackError);
      return out;
    }

    const ratings: Record<string, number[]> = {};
    for (const item of feedback || []) {
      const driverId = orderToDriver.get((item as any).order_id);
      if (!driverId) continue;
      const value = Number((item as any).driver_professionalism_rating ?? (item as any).overall_rating);
      if (!Number.isFinite(value) || value <= 0) continue;
      if (!ratings[driverId]) ratings[driverId] = [];
      ratings[driverId].push(value);
    }
    for (const driverId of Object.keys(ratings)) {
      const values = ratings[driverId];
      out[driverId].ratingCount = values.length;
      out[driverId].averageRating = Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
    }
    return out;
  },

  // ── Assign + audit ────────────────────────────────────────────────────────

  /**
   * The single safe assign path. Updates the order, writes the audit row,
   * captures the score, optionally enforces capacity gating.
   */
  async assignDriverWithGate(payload: {
    companyId: string;
    orderId: string;
    driverId: string;
    performedBy: string;
    score?: number;
    reason?: string;
    enforceGates?: boolean; // when true, refuse if capacity / feasibility fail. Default false (warn-and-allow).
    /** Optional: skip vehicle auto-booking when the operator wants to pick the vehicle by hand. */
    skipVehicleAutoBook?: boolean;
  }): Promise<{ ok: boolean; reason?: string; vehicleNote?: string; conflictWarning?: string }> {
    // Fetch existing assignment to capture from_driver_id
    const { data: existing } = await supabase
      .from("orders")
      .select("assigned_driver_id, event_date, event_time, venue_lat, venue_lng, requires_refrigeration, guest_count, requires_waiter, region_id, order_number")
      .eq("id", payload.orderId)
      .maybeSingle();

    const fromDriverId = existing?.assigned_driver_id ?? null;

    // Phase 2 #4: ALWAYS run the double-booking check, independent of
    // enforceGates. The old shape only ran the check on the strict
    // path; warn-and-allow callers (the entire dispatch UI today) got
    // no signal at all when a driver was already on a same-day
    // overlapping job, so the same driver could land two events three
    // hours apart with no warning. New shape:
    //   - enforceGates=true  -> refuse on conflict (current strict)
    //   - enforceGates=false -> assign anyway, attach conflictWarning
    //                            to the result, broadcast a high-
    //                            priority admin notification so the
    //                            operator sees it in the bell, not
    //                            just on the dispatch page.
    let conflictWarning: string | undefined;
    if (existing) {
      if (payload.enforceGates) {
        const { data: driverRow } = await supabase
          .from("profiles")
          .select("max_jobs_per_shift")
          .eq("id", payload.driverId)
          .maybeSingle();
        const maxJobs = (driverRow as any)?.max_jobs_per_shift ?? null;
        const cap = await this.checkCapacity(payload.driverId, existing.event_date, maxJobs);
        if (!cap.ok) return { ok: false, reason: cap.reason };
      }

      const conflict = await this.checkDoubleBooking({
        driverId: payload.driverId,
        eventDate: existing.event_date,
        eventTime: (existing as any).event_time ?? null,
        ignoreOrderId: payload.orderId,
      });
      if (!conflict.ok) {
        if (payload.enforceGates) {
          return { ok: false, reason: conflict.reason };
        }
        // Warn path: stash the message, fire an admin broadcast, and
        // keep going. The dispatcher chose this driver knowingly; we
        // just make sure no one is surprised later.
        conflictWarning = conflict.reason;
        try {
          const { notificationService } = await import("./notificationService");
          const { data: driverProfile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", payload.driverId)
            .maybeSingle();
          await notificationService.broadcastNotification({
            companyId: payload.companyId,
            regionId: (existing as any).region_id || null,
            targetRoles: ["company_admin" as any, "admin" as any, "owner" as any],
            title: `Driver double-booked`,
            message:
              `${(driverProfile as any)?.full_name || "Driver"} is now on order ` +
              `${(existing as any).order_number || payload.orderId.slice(0, 8)} ` +
              `at ${(existing as any).event_time || "?"}, but already has ` +
              `${conflict.conflictOrderNumber} at ${conflict.conflictTime}. ` +
              `Reassign one of them before the events clash.`,
            type: "driver_double_booked",
            priority: "high",
            link: `/order/${payload.orderId}?role=admin`,
            relatedEntityType: "order",
            relatedEntityId: payload.orderId,
            metadata: {
              driverId: payload.driverId,
              conflictOrderId: conflict.conflictOrderId,
            },
          } as any);
        } catch (notifErr) {
          console.warn("[assignDriverWithGate] conflict broadcast failed:", notifErr);
        }
      }
    }

    // Flow audit Leg E P0-12: the legacy `driver_id` column on
    // `orders` still exists and is read by several driver-side flows
    // (team-portal/driver/deliveries, dashboard subscriptions,
    // job-progress views). The dispatch path used to write only
    // `assigned_driver_id`, so newly-assigned orders were invisible
    // to those read paths and only the orders dispatched before the
    // column rename were ever shown. Write both columns in lockstep
    // until the legacy column is dropped to keep read paths coherent.
    //
    // Wave 43 T1: optimistic-locking concurrency guard. The previous
    // shape blind-wrote both columns with no stale-check, so two
    // admins clicking Assign in the same second both succeeded
    // silently and the second one won. Now we condition on the
    // assigned_driver_id we read above still being the current value;
    // a 0-row result means another writer raced us first.
    const updatePayload: {
      assigned_driver_id: string | null;
      driver_id: string | null;
      assignment_score: number | null;
      assigned_at?: string;
    } = {
      assigned_driver_id: payload.driverId,
      driver_id: payload.driverId,
      assignment_score: payload.score ?? null,
    };
    // Stamp assigned_at on the FIRST assignment only. getDispatchKpis
    // derives median time-to-assign from (assigned_at - confirmed_at);
    // this column was never written on the dispatch path, so the KPI was
    // permanently null. Gating on fromDriverId === null means a later
    // reassignment doesn't reset the clock and inflate the metric.
    if (fromDriverId === null) {
      updatePayload.assigned_at = new Date().toISOString();
    }
    let updateQ = supabase
      .from("orders")
      .update(updatePayload)
      .eq("id", payload.orderId);
    if (fromDriverId === null) {
      updateQ = updateQ.is("assigned_driver_id", null);
    } else {
      updateQ = updateQ.eq("assigned_driver_id", fromDriverId);
    }
    const { data: updRows, error: updErr } = await updateQ.select("id");
    if (updErr) {
      console.error("Error assigning driver:", updErr);
      return { ok: false, reason: updErr.message };
    }
    if (!updRows || updRows.length === 0) {
      return {
        ok: false,
        reason:
          "Order was assigned to a different driver while you were submitting. Refresh and try again.",
      };
    }

    await supabase.from("order_assignment_audit").insert([{
      company_id: payload.companyId,
      order_id: payload.orderId,
      from_driver_id: fromDriverId,
      to_driver_id: payload.driverId,
      performed_by: payload.performedBy,
      score: payload.score ?? null,
      reason: payload.reason ?? null,
    }]);

    // Wave 47 - write the formal driver_assignments row mirroring
    // the claim_order RPC pattern. Pre-Wave-47 only the self-claim
    // path created this row, so admin-driven dispatches caused two
    // silent bugs: (a) the readiness chip false-negatived "driver
    // assigned but hasn't accepted", and (b) driverPayService reads
    // driver_assignments to compute earnings - bulk-assigned orders
    // earned $0 driver pay forever. Reassignments need to clear the
    // old row first to avoid a UNIQUE conflict on (order_id,
    // driver_id) if there's an index, hence DELETE-then-INSERT.
    try {
      if (fromDriverId && fromDriverId !== payload.driverId) {
        await (supabase as any)
          .from("driver_assignments")
          .delete()
          .eq("order_id", payload.orderId)
          .eq("driver_id", fromDriverId)
          .eq("assignment_type", "delivery");
      }
      // Wave 64.4 - admin-pushed assignments are auto-accepted.
      // Pre-Wave-64.4 admin assignments inserted status='assigned' +
      // accepted_at=NULL, while the parallel claim_order RPC (driver
      // self-claim) inserted status='accepted' + accepted_at=NOW().
      // The readiness chip's driver_acknowledged signal interpreted
      // the admin path as "driver hasn't accepted" forever, even
      // when the dispatcher and driver both knew the run was on.
      // For CateringMS the admin IS the acceptance - drivers
      // don't sit in a separate consent flow before doing the run.
      // Now: parity with claim_order. Self-claim still flows through
      // the RPC and lands the same shape; this aligns the dispatch
      // path so the chip stops false-flagging.
      // Idempotent: if the row exists for this driver already (e.g.
      // a self-claim that an admin is "confirming" via assign), skip.
      const nowIso = new Date().toISOString();
      const { count: existingCount } = await (supabase as any)
        .from("driver_assignments")
        .select("id", { count: "exact", head: true })
        .eq("order_id", payload.orderId)
        .eq("driver_id", payload.driverId)
        .eq("assignment_type", "delivery");
      if (!existingCount || existingCount === 0) {
        const { error: daErr } = await supabase
          .from("driver_assignments")
          .insert([{
            company_id: payload.companyId,
            order_id: payload.orderId,
            driver_id: payload.driverId,
            status: "accepted",
            assigned_at: nowIso,
            accepted_at: nowIso,
            assignment_type: "delivery",
          }] as any);
        if (daErr) {
          console.error("[dispatchService] driver_assignments insert failed:", daErr);
        }
      }
    } catch (daCatch: any) {
      console.error("[dispatchService] driver_assignments write crashed:", daCatch);
    }

    // Communication: ping the assigned driver so they actually know they
    // have a run. Admin-pushed assignments are auto-accepted (no separate
    // consent flow that would otherwise notify them), so without this the
    // driver only finds out by checking email/SMS externally. The
    // self-claim RPC path is the driver's own action; this covers admin
    // dispatch. Best-effort + dedup so a re-assign doesn't double-ping.
    try {
      const { notificationService } = await import("./notificationService");
      await notificationService.createNotification({
        company_id: payload.companyId,
        recipient_id: payload.driverId,
        type: "driver_assigned",
        title: "New delivery assigned",
        message: `You're assigned order ${(existing as any)?.order_number || payload.orderId.slice(0, 8)}${(existing as any)?.event_time ? ` at ${(existing as any).event_time}` : ""}.`,
        priority: "high",
        link: "/team-portal/driver/dashboard",
        related_entity_type: "order",
        related_entity_id: payload.orderId,
        dedup: true,
      });
    } catch (notifyErr) {
      console.warn("[dispatchService] driver-assigned notification failed:", notifyErr);
    }

    // Auto-book the best vehicle for the run, unless the caller has
    // taken over vehicle picking themselves. Failure here is non-
    // fatal: the driver assignment already happened. We surface a
    // 'vehicleNote' on the result so the dispatcher can act on it.
    let vehicleNote: string | undefined;
    if (!payload.skipVehicleAutoBook && existing) {
      try {
        // Lazy-load to avoid a circular import on the cold path.
        const { vehicleService, computeOrderVehicleWindow, shouldRequireTwoDrivers } = await import("./vehicleService");
        const window = computeOrderVehicleWindow({
          eventDate: existing.event_date,
          eventTime: existing.event_time,
          requiresWaiter: !!(existing as any).requires_waiter,
        });
        const candidates = await vehicleService.findAvailableVehicles({
          companyId: payload.companyId,
          bookedFrom: window.booked_from.toISOString(),
          bookedUntil: window.booked_until.toISOString(),
          requiresRefrigeration: !!existing.requires_refrigeration,
          guestCount: existing.guest_count ?? null,
          driverId: payload.driverId,
          ignoreBookingForOrderId: payload.orderId,
        });
        if (candidates.length > 0) {
          const top = candidates[0];
          await vehicleService.upsertBookingForOrder({
            companyId: payload.companyId,
            orderId: payload.orderId,
            vehicleId: top.vehicle.id,
            driverId: payload.driverId,
            bookedFrom: window.booked_from,
            bookedUntil: window.booked_until,
            notes: top.driverOwned
              ? "Driver's own vehicle booked automatically."
              : "Best-fit company vehicle booked automatically.",
          });
          await supabase
            .from("orders")
            .update({ assigned_vehicle_id: top.vehicle.id })
            .eq("id", payload.orderId);

          // Two-driver heuristic: if the chosen vehicle requires it OR
          // the load is too big for one person, flag the order so the
          // dispatcher gets a 'second driver needed' chip.
          const needs = shouldRequireTwoDrivers({
            guestCount: existing.guest_count ?? null,
            vehicleRequiresTwoPeople: top.vehicle.requires_two_people,
            requiresWaiter: !!(existing as any).requires_waiter,
          });
          if (needs.required) {
            await supabase
              .from("orders")
              .update({ requires_two_drivers: true })
              .eq("id", payload.orderId);
            vehicleNote = `Booked ${top.vehicle.plate}. Two drivers needed: ${needs.reason}`;
          } else {
            vehicleNote = `Booked ${top.vehicle.plate}.`;
          }
        } else {
          vehicleNote = "No vehicle available for this window. Add or free one before the run.";
        }
      } catch (e) {
        console.warn("[dispatch] vehicle auto-book failed (non-fatal)", e);
      }
    }

    return { ok: true, vehicleNote, conflictWarning };
  },

  /**
   * Bulk assign N orders to one driver. Returns counts so the UI can show a
   * single summary toast. Per-order errors don't abort the loop.
   */
  async bulkAssign(payload: {
    companyId: string;
    orderIds: string[];
    driverId: string;
    performedBy: string;
    enforceGates?: boolean;
  }): Promise<{ assigned: number; errors: string[] }> {
    const errors: string[] = [];
    let assigned = 0;
    for (const orderId of payload.orderIds) {
      const r = await this.assignDriverWithGate({
        companyId: payload.companyId,
        orderId,
        driverId: payload.driverId,
        performedBy: payload.performedBy,
        reason: "Bulk assign",
        enforceGates: payload.enforceGates,
      });
      if (r.ok) assigned += 1;
      else errors.push(`${orderId}: ${r.reason}`);
    }
    return { assigned, errors };
  },

  /**
   * Unassign (clear assigned_driver_id). Preserves assigned_at for analytics.
   */
  async unassignDriver(payload: {
    companyId: string;
    orderId: string;
    performedBy: string;
    reason?: string;
  }): Promise<boolean> {
    const { data: existing } = await supabase
      .from("orders")
      .select("assigned_driver_id")
      .eq("id", payload.orderId)
      .maybeSingle();
    const fromDriverId = existing?.assigned_driver_id ?? null;

    // Mirror the unassign on the legacy column so reads that still
    // route through driver_id (deliveries view, dashboard
    // subscriptions) don't keep the stale link visible.
    const { error } = await supabase
      .from("orders")
      .update({ assigned_driver_id: null, driver_id: null, assignment_score: null })
      .eq("id", payload.orderId);
    if (error) throw error;

    // Flow audit Leg E P0-13: previously unassignDriver only flipped
    // the order column. The downstream cascade (release the vehicle
    // booking + cancel the driver's pre-event reminder rows) lived in
    // ad-hoc places or nowhere at all, so an unassign on a confirmed
    // order kept the vehicle booked and the driver got pinged for an
    // event they were no longer working. Trigger them inline now so
    // every unassign path picks the cleanup up for free.
    // (equipment_bookings has no driver_id column - drivers link to orders via
    // driver_assignments, not to equipment bookings - so there's nothing to
    // detach here. The vehicle-release + reminder-cancel cascade follows.)
    try {
      const { vehicleService } = await import("./vehicleService");
      await vehicleService.cancelBookingsForOrder(payload.orderId);
      // Clear the order's vehicle pointer so re-assign starts clean.
      await supabase
        .from("orders")
        .update({ assigned_vehicle_id: null } as any)
        .eq("id", payload.orderId);
    } catch (e) {
      console.warn("[dispatch] unassign vehicle release failed:", e);
    }

    await supabase.from("order_assignment_audit").insert([{
      company_id: payload.companyId,
      order_id: payload.orderId,
      from_driver_id: fromDriverId,
      to_driver_id: null,
      performed_by: payload.performedBy,
      reason: payload.reason ?? "Unassigned",
    }]);
    return true;
  },

  // ── KPIs ──────────────────────────────────────────────────────────────────

  /**
   * Top-line dispatch KPIs for the queue header. Cheap to compute - a few
   * COUNT queries plus one analytics rollup.
   */
  async getDispatchKpis(companyId: string, daysAhead = 30): Promise<{
    unassignedAtRisk: number;
    unassignedTotal: number;
    medianTimeToAssignMinutes: number | null;
    onShiftDrivers: number;
  }> {
    const settings = await this.getDispatchSettings(companyId);
    const todayISO = toLocalISO(new Date());
    // Wave 70.59: KPI horizon now matches the dispatch queue page's
    // selectable window (default 30d). Pre-fix the KPI tile counted
    // every future unassigned order with no upper bound while the
    // table was windowed by daysAhead - so a tenant with a wedding
    // booked 6 months out saw "1 No driver" in the tile but an
    // empty table at the default 30d window. Confusing for the
    // operator and arithmetically wrong.
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + daysAhead);
    const horizonISO = toLocalISO(horizon);

    // Unassigned + future + within horizon.
    // Wave 70.59: status set aligned with the queue table. Dropped
    // 'in_transit' - an in-transit order MUST already have a driver
    // (the truck is rolling); if it's unassigned + in_transit
    // that's a data inconsistency that belongs on a fix-it report,
    // not on the dispatch tile. confirmed / preparing / ready are
    // the three pre-dispatch states that legitimately need a
    // driver assigned.
    const { data: unassigned } = await supabase
      .from("orders")
      .select("id, event_date, event_time")
      .eq("company_id", companyId)
      .is("assigned_driver_id", null)
      .is("deleted_at", null)
      .gte("event_date", todayISO)
      .lte("event_date", horizonISO)
      .in("status", ["confirmed", "preparing", "ready"]);

    const slaCutoffMs = settings.slaAssignMinutes * 60_000;
    const now = Date.now();
    let atRisk = 0;
    for (const o of unassigned || []) {
      const dt = (o as any).event_time
        ? new Date(`${(o as any).event_date}T${(o as any).event_time}`)
        : new Date(`${(o as any).event_date}T12:00`);
      if (isNaN(dt.getTime())) continue;
      const diff = dt.getTime() - now;
      // Wave 70.59: at-risk now excludes past events. Previously
      // `diff <= slaCutoffMs` matched negative diffs too, so a
      // stale unassigned confirmed-but-cancelled-after-event order
      // would falsely register as "at risk" forever. New gate:
      // future event AND within the SLA cutoff window.
      if (diff > 0 && diff <= slaCutoffMs) atRisk += 1;
    }

    // Median time-to-assign over last 14 days, in minutes.
    // assigned_at - confirmed_at, where both are present.
    const fortnight = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: assignments } = await supabase
      .from("orders")
      .select("confirmed_at, assigned_at")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .gte("assigned_at", fortnight)
      .not("confirmed_at", "is", null)
      .not("assigned_at", "is", null)
      .limit(500);
    const deltas: number[] = [];
    for (const r of assignments || []) {
      const c = new Date((r as any).confirmed_at).getTime();
      const a = new Date((r as any).assigned_at).getTime();
      if (!isNaN(c) && !isNaN(a) && a >= c) deltas.push((a - c) / 60_000);
    }
    let median: number | null = null;
    if (deltas.length > 0) {
      deltas.sort((x, y) => x - y);
      const mid = Math.floor(deltas.length / 2);
      median = deltas.length % 2 === 0
        ? Math.round((deltas[mid - 1] + deltas[mid]) / 2)
        : Math.round(deltas[mid]);
    }

    // On-shift drivers: prefer the real shift table when entries exist for today.
    // Falls back to the GPS-ping proxy (last 60 minutes) when no shifts are
    // scheduled at all so the KPI never shows a confusing zero on a tenant
    // that hasn't started using the schedule yet.
    let onShift = 0;
    const activeFromShifts = await shiftService.getActiveDriverIdsForCompany(companyId);
    if (activeFromShifts.length > 0) {
      onShift = activeFromShifts.length;
    } else {
      const sixtyMinAgo = new Date(Date.now() - 60 * 60_000).toISOString();
      const { data: drivers } = await supabase
        .from("profiles")
        .select("id")
        .eq("company_id", companyId)
        .eq("role", "driver");
      const driverIds = (drivers || []).map((d: any) => d.id);
      if (driverIds.length > 0) {
        // Drivers whose current location row was updated in the last
        // hour count as on-shift (their GPS is reporting). Single-row-
        // per-driver lookup off driver_locations (P1-23 split).
        const { data: pings } = await (supabase as any)
          .from("driver_locations")
          .select("driver_id")
          .in("driver_id", driverIds)
          .gte("updated_at", sixtyMinAgo);
        onShift = (pings || []).length;
      }
    }

    return {
      unassignedAtRisk: atRisk,
      unassignedTotal: (unassigned || []).length,
      medianTimeToAssignMinutes: median,
      onShiftDrivers: onShift,
    };
  },

  /**
   * Audit trail for a single order. Drives the "Assignment history" section
   * of the order drawer.
   */
  async getAssignmentAudit(orderId: string, companyId?: string): Promise<any[]> {
    // Wave 70.59: optional companyId belt-and-braces filter so the
    // read doesn't rely solely on RLS to scope. RLS on
    // order_assignment_audit already filters by company, but a
    // defensive .eq() means a busted policy (or a service-role
    // client passed by mistake) can't leak cross-tenant audit rows.
    let q = supabase
      .from("order_assignment_audit")
      .select("id, from_driver_id, to_driver_id, performed_by, reason, score, created_at, from_driver:from_driver_id(full_name), to_driver:to_driver_id(full_name), actor:performed_by(full_name)")
      .eq("order_id", orderId);
    if (companyId) q = q.eq("company_id", companyId);
    const { data, error } = await q
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) {
      console.warn("Error fetching audit:", error);
      return [];
    }
    return data || [];
  },

  // ── Phase 3: auto-batching ────────────────────────────────────────────

  /**
   * Find batchable order pairs: two unassigned orders within batchDistanceKm
   * of each other AND within batchTimeWindowMinutes of each other. Same
   * driver can do both in one trip. Greedy pairing - once an order is in a
   * pair we don't try to add it to another. Phase 4 can upgrade to a
   * graph-clustering approach when there are 3+ tightly grouped orders.
   */
  async findBatchableOrders(companyId: string): Promise<Array<{
    primary: { id: string; client_name: string; event_date: string; event_time: string | null; venue_lat: number; venue_lng: number; venue_name: string | null; region_id: string | null; requires_refrigeration: boolean | null };
    secondary: { id: string; client_name: string; event_date: string; event_time: string | null; venue_lat: number; venue_lng: number; venue_name: string | null; region_id: string | null; requires_refrigeration: boolean | null };
    distance_km: number;
    minutes_apart: number;
  }>> {
    const settings = await this.getDispatchSettings(companyId);
    const todayISO = toLocalISO(new Date());

    const { data: orders } = await supabase
      .from("orders")
      .select("id, client_name, event_date, event_time, venue_lat, venue_lng, venue_name, region_id, requires_refrigeration")
      .eq("company_id", companyId)
      .is("assigned_driver_id", null)
      .is("deleted_at", null)
      .gte("event_date", todayISO)
      .in("status", ["confirmed", "preparing", "ready"])
      .not("venue_lat", "is", null)
      .not("venue_lng", "is", null)
      .order("event_date", { ascending: true })
      .order("event_time", { ascending: true, nullsFirst: false });

    const list = (orders || []) as any[];
    const used = new Set<string>();
    const pairs: any[] = [];

    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (used.has(a.id)) continue;
      let bestPair: any = null;
      let bestScore = Infinity;

      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (used.has(b.id)) continue;

        // Different days never batch.
        if (a.event_date !== b.event_date) continue;

        const km = haversineKm(
          { lat: Number(a.venue_lat), lng: Number(a.venue_lng) },
          { lat: Number(b.venue_lat), lng: Number(b.venue_lng) },
        );
        if (km > settings.batchDistanceKm) continue;

        // Time gap (event_time pair). Treat null as noon for comparison.
        const aT = a.event_time ? `${a.event_date}T${a.event_time}` : `${a.event_date}T12:00`;
        const bT = b.event_time ? `${b.event_date}T${b.event_time}` : `${b.event_date}T12:00`;
        const minutesApart = Math.abs(new Date(aT).getTime() - new Date(bT).getTime()) / 60_000;
        if (minutesApart > settings.batchTimeWindowMinutes) continue;

        // Score = distance + time penalty. Lower is better.
        const score = km + minutesApart / 30;
        if (score < bestScore) {
          bestScore = score;
          bestPair = { other: b, km, minutesApart };
        }
      }

      if (bestPair) {
        used.add(a.id);
        used.add(bestPair.other.id);
        pairs.push({
          primary: a,
          secondary: bestPair.other,
          distance_km: Math.round(bestPair.km * 10) / 10,
          minutes_apart: Math.round(bestPair.minutesApart),
        });
      }
    }

    return pairs;
  },

  // ── Per-driver performance analytics (Phase 2B) ──────────────────────────

  /**
   * Performance rollup for a single driver over the last N days.
   * Used by the Drivers page to surface real on-time rate, distance, earnings.
   *
   * On-time = delivered_at <= event_time + arrival_buffer (from settings).
   * Late = delivered_at > event_time + arrival_buffer.
   * Pending = no delivered_at yet (excluded from rate denominator).
   */
  async getDriverPerformance(
    companyId: string,
    driverId: string,
    days = 30,
  ): Promise<{
    completedJobs: number;
    onTimeRate: number | null;     // 0-1, null when no completed jobs
    totalKm: number;
    totalEarnings: number;
    declineCount: number;
    declineReasons: string[];
  }> {
    const settings = await this.getDispatchSettings(companyId);
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceISO = since.toISOString();

    // Completed orders + km (driver wears two columns - match either).
    const { data: orders } = await supabase
      .from("orders")
      .select("event_date, event_time, delivered_at, delivery_distance_km, status")
      .or(`assigned_driver_id.eq.${driverId},driver_id.eq.${driverId}`)
      .gte("event_date", sinceISO.slice(0, 10))
      .is("deleted_at", null);

    let completedJobs = 0;
    let onTime = 0;
    let totalKm = 0;
    for (const o of orders || []) {
      if ((o as any).status !== "delivered" && (o as any).status !== "completed") continue;
      completedJobs += 1;
      // delivery_distance_km is stored one-way (kitchen -> venue,
      // matches Google Maps). The driver actually drove both legs,
      // so the performance + earnings tiles need round-trip to
      // stay consistent with the round-trip client billing + driver
      // pay introduced in Phase 29 / Phase 30 #4.
      totalKm += Number((o as any).delivery_distance_km || 0) * 2;
      if ((o as any).event_date && (o as any).event_time && (o as any).delivered_at) {
        const eventDt = new Date(`${(o as any).event_date}T${(o as any).event_time}`);
        const deadline = eventDt.getTime() + settings.arrivalBufferMinutes * 60_000;
        const delivered = new Date((o as any).delivered_at).getTime();
        if (!isNaN(deadline) && !isNaN(delivered) && delivered <= deadline) onTime += 1;
      }
    }
    const onTimeRate = completedJobs > 0 ? onTime / completedJobs : null;

    // Earnings sum + decline reasons from driver_assignments.
    const { data: assignments } = await supabase
      .from("driver_assignments")
      .select("total_earnings, status, rejection_reason, created_at")
      .eq("driver_id", driverId)
      .gte("created_at", sinceISO);

    let totalEarnings = 0;
    let declineCount = 0;
    const declineReasons: string[] = [];
    for (const a of assignments || []) {
      // driver_assignments mirrors order status: delivered -> completed only
      // after the auto-complete cron. Count both so earnings aren't zeroed for
      // the delivered-but-not-yet-completed window.
      if ((a as any).status === "completed" || (a as any).status === "delivered") {
        totalEarnings += Number((a as any).total_earnings || 0);
      }
      if ((a as any).status === "rejected") {
        declineCount += 1;
        if ((a as any).rejection_reason) declineReasons.push((a as any).rejection_reason);
      }
    }

    return {
      completedJobs,
      onTimeRate,
      totalKm: Math.round(totalKm * 10) / 10,
      totalEarnings: Math.round(totalEarnings * 100) / 100,
      declineCount,
      declineReasons,
    };
  },
};

/**
 * Phase 4 risk model. Combines several signals into a 0-100 risk score plus
 * a tier label so the UI can render a single chip.
 *
 * Signals:
 *   - margin_minutes (negative = late)        contributes 0-60 points
 *   - last_ping_age_minutes (stale GPS)       contributes 0-25 points
 *   - driver_load (driver has many active)    contributes 0-15 points
 *   - has_no_pin (out for delivery, no GPS)   adds 25 points
 *
 * Tiers: <30 OK, 30-60 watch, 60-85 high, >=85 critical.
 */
export interface RiskInputs {
  marginMinutes: number | null;
  lastPingAgeMinutes: number | null;
  driverLoadToday: number | null;
  hasDriverPin: boolean;
  status: string | null;
}

export interface RiskResult {
  score: number;            // 0-100
  tier: "ok" | "watch" | "high" | "critical";
  reasons: string[];
}

export function computeRiskScore(input: RiskInputs): RiskResult {
  const reasons: string[] = [];
  let score = 0;

  // Margin component: 0 when comfortable (>30m slack), up to 60 when 60m late.
  if (input.marginMinutes != null) {
    if (input.marginMinutes < 0) {
      score += Math.min(60, 30 + Math.abs(input.marginMinutes));
      reasons.push(`${Math.abs(Math.round(input.marginMinutes))}m late`);
    } else if (input.marginMinutes < 15) {
      score += 25;
      reasons.push(`${Math.round(input.marginMinutes)}m slack only`);
    } else if (input.marginMinutes < 30) {
      score += 10;
    }
  }

  // Stale ping: 0 if fresh, up to 25 when 30 minutes stale.
  if (input.lastPingAgeMinutes != null) {
    if (input.lastPingAgeMinutes >= 30) {
      score += 25;
      reasons.push(`No GPS for ${Math.round(input.lastPingAgeMinutes)}m`);
    } else if (input.lastPingAgeMinutes >= 10) {
      score += Math.round((input.lastPingAgeMinutes - 10) * (15 / 20));
      reasons.push(`GPS ${Math.round(input.lastPingAgeMinutes)}m old`);
    }
  }

  // In-transit with no driver pin at all = blind spot
  const inMotion = input.status === "in_transit";
  if (inMotion && !input.hasDriverPin) {
    score += 25;
    reasons.push("No driver location");
  }

  // Driver overloaded: 4+ active jobs today adds risk
  if (input.driverLoadToday != null && input.driverLoadToday >= 4) {
    score += Math.min(15, (input.driverLoadToday - 3) * 5);
    reasons.push(`Driver has ${input.driverLoadToday} jobs today`);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const tier: RiskResult["tier"] =
    score >= 85 ? "critical" :
    score >= 60 ? "high"     :
    score >= 30 ? "watch"    :
                  "ok";

  return { score, tier, reasons };
}

// Re-export the SLA helper so the queue UI can compute "minutes until breach"
// without re-implementing the rule.
export function minutesUntilSlaBreach(
  eventDate: string,
  eventTime: string | null | undefined,
  slaMinutes: number,
): number {
  const dt = eventTime ? new Date(`${eventDate}T${eventTime}`) : new Date(`${eventDate}T12:00`);
  if (isNaN(dt.getTime())) return Number.POSITIVE_INFINITY;
  const minsToEvent = (dt.getTime() - Date.now()) / 60_000;
  return minsToEvent - slaMinutes;
}

export function formatMinutesAsCountdown(mins: number): string {
  if (!isFinite(mins)) return "-";
  const sign = mins < 0 ? "-" : "";
  const abs = Math.abs(mins);
  const days = Math.floor(abs / 1440);
  const hours = Math.floor((abs % 1440) / 60);
  const minutes = Math.floor(abs % 60);
  if (days > 0) return `${sign}${days}d ${hours}h`;
  if (hours > 0) return `${sign}${hours}h ${minutes}m`;
  return `${sign}${minutes}m`;
}
