/* eslint-disable @typescript-eslint/no-explicit-any */

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type TimeClockEntry = Database["public"]["Tables"]["time_clock_entries"]["Row"];
type StaffWorkSession = Database["public"]["Tables"]["staff_work_sessions"]["Row"];

export const timeClockService = {
  async clockIn(staffId: string, notes?: string, location?: { lat: number; lng: number }) {
    // Look up the staff's company so the work session is properly tenant-scoped.
    const { data: staffProfile, error: staffProfileErr } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", staffId)
      .maybeSingle();
    if (staffProfileErr) {
      console.error("[timeClockService] profiles fetch failed:", staffProfileErr);
    }
    const companyId = staffProfile?.company_id ?? null;
    if (!companyId) {
      throw new Error("Cannot clock in: profile has no company_id. Set the staff member's company before clocking in.");
    }

    // Guard: refuse a second clock-in while an open session exists.
    // Audit (May 2026) found that double-tap or stale-tab clock-in
    // bloated unpaid-hour totals because the next clockOut only
    // closed the latest session, orphaning prior ones.
    const { data: existingOpen, error: existingOpenErr } = await supabase
      .from("staff_work_sessions")
      .select("id")
      .eq("staff_id", staffId)
      .eq("company_id", companyId)
      .is("clock_out", null)
      .limit(1)
      .maybeSingle();
    if (existingOpenErr) {
      console.error("[timeClockService] staff_work_sessions fetch failed:", existingOpenErr);
    }
    if (existingOpen) {
      throw new Error("This staff member already has an open session. Clock out first before clocking in again.");
    }

    const { data: entry, error: entryError } = await supabase
      .from("time_clock_entries")
      .insert({
        staff_id: staffId,
        entry_type: "clock_in",
        timestamp: new Date().toISOString(),
        location_lat: location?.lat,
        location_lng: location?.lng,
        notes,
      } as any)
      .select()
      .single();

    if (entryError) throw entryError;

    const now = new Date();
    const { data: session, error: sessionError } = await supabase
      .from("staff_work_sessions")
      .insert({
        staff_id: staffId,
        company_id: companyId,
        clock_in: now.toISOString(),
        session_date: now.toISOString().slice(0, 10),
        payment_status: "unpaid",
      })
      .select()
      .single();

    if (sessionError) throw sessionError;

    return { entry, session };
  },

  async clockOut(staffId: string, notes?: string, location?: { lat: number; lng: number }) {
    // Resolve the staff's company up front so we can scope every read
    // and write. Audit (May 2026) found that clockOut was matching the
    // first open session by staff_id alone - if a staff record existed
    // across tenants (super-admin, re-invited user) it could close the
    // wrong tenant's session and stamp earnings on the wrong tenant.
    const { data: staffProfile, error: staffProfileErr2 } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", staffId)
      .maybeSingle();
    if (staffProfileErr2) {
      console.error("[timeClockService] profiles fetch failed:", staffProfileErr2);
    }
    const companyId = staffProfile?.company_id ?? null;
    if (!companyId) {
      throw new Error("Cannot clock out: profile has no company_id.");
    }

    const { data: entry, error: entryError } = await supabase
      .from("time_clock_entries")
      .insert({
        staff_id: staffId,
        entry_type: "clock_out",
        timestamp: new Date().toISOString(),
        location_lat: location?.lat,
        location_lng: location?.lng,
        notes,
      } as any)
      .select()
      .single();

    if (entryError) throw entryError;

    const { data: openSession, error: sessionError } = await supabase
      .from("staff_work_sessions")
      .select("*")
      .eq("staff_id", staffId)
      .eq("company_id", companyId)
      .is("clock_out", null)
      .order("clock_in", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sessionError || !openSession) {
      throw new Error("No open work session found");
    }

    const clockInTime = new Date(openSession.clock_in);
    const clockOutTime = new Date();
    const totalHours = (clockOutTime.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);

    // Pull the staff member's real hourly rate from their profile +
    // matching kitchen/driver/staff row. Previously hardcoded at R150
    // which silently overpaid lower-rate staff and underpaid senior
    // ones. The fallback chain is:
    //   1. profiles.hourly_rate (canonical, set by /admin/users)
    //   2. kitchen_staff_members.hourly_rate (kitchen-staff page)
    //   3. drivers.hourly_rate / hourly_rate_normal (driver page)
    //   4. Final fallback: 0 (clearly wrong; surfaces as an obvious
    //      bug on the wage roll-up so the operator notices and sets
    //      a rate, rather than silently paying a default that's
    //      likely wrong)
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("hourly_rate, role")
      .eq("id", staffId)
      .single();
    if (profileErr) {
      console.error("[timeClockService] profiles fetch failed:", profileErr);
    }

    let hourlyRate = Number((profile as any)?.hourly_rate) || 0;
    if (hourlyRate <= 0) {
      // Walk the role-specific tables that store rate independently.
      const { data: ks, error: ksErr } = await (supabase as any)
        .from("kitchen_staff_members")
        .select("hourly_rate")
        .eq("profile_id", staffId)
        .maybeSingle();
      if (ksErr) {
        console.error("[timeClockService] kitchen_staff_members fetch failed:", ksErr);
      }
      if (ks && Number((ks as any).hourly_rate) > 0) {
        hourlyRate = Number((ks as any).hourly_rate);
      }
    }
    if (hourlyRate <= 0) {
      const { data: dr, error: drErr } = await (supabase as any)
        .from("drivers")
        .select("hourly_rate, hourly_rate_normal")
        .eq("profile_id", staffId)
        .maybeSingle();
      if (drErr) {
        console.error("[timeClockService] drivers fetch failed:", drErr);
      }
      const r = Number((dr as any)?.hourly_rate) || Number((dr as any)?.hourly_rate_normal) || 0;
      if (r > 0) hourlyRate = r;
    }
    if (hourlyRate <= 0) {
      console.warn(
        `[timeClockService.clockOut] no hourly_rate set for staff ${staffId}; earnings recorded as 0. Set a rate on /admin/users so wages compute correctly.`,
      );
    }
    const totalEarnings = totalHours * hourlyRate;

    const { data: updatedSession, error: updateError } = await supabase
      .from("staff_work_sessions")
      .update({
        clock_out: clockOutTime.toISOString(),
        total_hours: totalHours,
        total_earnings: totalEarnings,
      })
      .eq("id", openSession.id)
      .select()
      .single();

    if (updateError) throw updateError;

    return { entry, session: updatedSession };
  },

  async getCurrentSession(staffId: string) {
    const { data, error } = await supabase
      .from("staff_work_sessions")
      .select("*")
      .eq("staff_id", staffId)
      .is("clock_out", null)
      .order("clock_in", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async getStaffWorkSessions(staffId: string, startDate?: Date, endDate?: Date) {
    let query = supabase
      .from("staff_work_sessions")
      .select("*")
      .eq("staff_id", staffId)
      .order("clock_in", { ascending: false });

    if (startDate) {
      query = query.gte("clock_in", startDate.toISOString());
    }
    if (endDate) {
      query = query.lte("clock_in", endDate.toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async getAllStaffWorkSessions(startDate?: Date, endDate?: Date, companyId?: string) {
    let query = supabase
      .from("staff_work_sessions")
      .select(`
        *,
        staff:profiles!staff_work_sessions_staff_id_fkey (
          id,
          full_name,
          email,
          role,
          company_id
        )
      `)
      .order("clock_in", { ascending: false });

    if (startDate) {
      query = query.gte("clock_in", startDate.toISOString());
    }
    if (endDate) {
      query = query.lte("clock_in", endDate.toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;
    if (!data) return [];
    if (!companyId) return data;
    // Filter by company at the application layer (Supabase doesn't let us
    // filter by a joined column inline without an RPC).
    return data.filter((row: any) => row?.staff?.company_id === companyId);
  },

  async getStaffHoursSummary(staffId: string, period: "week" | "month") {
    const now = new Date();
    const startDate = new Date();

    if (period === "week") {
      startDate.setDate(now.getDate() - 7);
    } else {
      startDate.setMonth(now.getMonth() - 1);
    }

    const sessions = await this.getStaffWorkSessions(staffId, startDate, now);
    
    const totalHours = sessions.reduce((sum, session) => {
      return sum + (session.total_hours || 0);
    }, 0);

    const totalEarnings = sessions.reduce((sum, session) => {
      return sum + (session.total_earnings || 0);
    }, 0);

    return {
      period,
      startDate,
      endDate: now,
      totalHours: Math.round(totalHours * 100) / 100,
      totalEarnings: Math.round(totalEarnings * 100) / 100,
      sessionsCount: sessions.length,
    };
  },

  async markSessionAsPaid(sessionId: string) {
    const { data, error } = await supabase
      .from("staff_work_sessions")
      .update({
        payment_status: "paid",
        paid_at: new Date().toISOString(),
      } as any)
      .eq("id", sessionId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async markMultipleSessionsAsPaid(sessionIds: string[]) {
    const { data, error } = await supabase
      .from("staff_work_sessions")
      .update({
        payment_status: "paid",
        paid_at: new Date().toISOString(),
      } as any)
      .in("id", sessionIds)
      .select();

    if (error) throw error;
    return data;
  },
};
