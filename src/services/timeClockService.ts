// @ts-nocheck

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type TimeClockEntry = Database["public"]["Tables"]["time_clock_entries"]["Row"];
type StaffWorkSession = Database["public"]["Tables"]["staff_work_sessions"]["Row"];

export const timeClockService = {
  async clockIn(staffId: string, notes?: string, location?: { lat: number; lng: number }) {
    const { data: entry, error: entryError } = await supabase
      .from("time_clock_entries")
      .insert({
        staff_id: staffId,
        user_id: staffId,
        entry_type: "clock_in",
        timestamp: new Date().toISOString(),
        location_lat: location?.lat,
        location_lng: location?.lng,
        notes,
      })
      .select()
      .single();

    if (entryError) throw entryError;

    const { data: session, error: sessionError } = await supabase
      .from("staff_work_sessions")
      .insert({
        staff_id: staffId,
        user_id: staffId,
        clock_in_time: new Date().toISOString(),
      })
      .select()
      .single();

    if (sessionError) throw sessionError;

    return { entry, session };
  },

  async clockOut(staffId: string, notes?: string, location?: { lat: number; lng: number }) {
    const { data: entry, error: entryError } = await supabase
      .from("time_clock_entries")
      .insert({
        staff_id: staffId,
        user_id: staffId,
        entry_type: "clock_out",
        timestamp: new Date().toISOString(),
        location_lat: location?.lat,
        location_lng: location?.lng,
        notes,
      })
      .select()
      .single();

    if (entryError) throw entryError;

    const { data: openSession, error: sessionError } = await supabase
      .from("staff_work_sessions")
      .select("*")
      .eq("staff_id", staffId)
      .is("clock_out_time", null)
      .order("clock_in_time", { ascending: false })
      .limit(1)
      .single();

    if (sessionError || !openSession) {
      throw new Error("No open work session found");
    }

    const clockInTime = new Date(openSession.clock_in_time);
    const clockOutTime = new Date();
    const totalHours = (clockOutTime.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", staffId)
      .single();

    const hourlyRate = 150;
    const totalEarnings = totalHours * hourlyRate;

    const { data: updatedSession, error: updateError } = await supabase
      .from("staff_work_sessions")
      .update({
        clock_out_time: clockOutTime.toISOString(),
        total_hours: totalHours,
        hourly_rate: hourlyRate,
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
      .is("clock_out_time", null)
      .order("clock_in_time", { ascending: false })
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
      .order("clock_in_time", { ascending: false });

    if (startDate) {
      query = query.gte("clock_in_time", startDate.toISOString());
    }
    if (endDate) {
      query = query.lte("clock_in_time", endDate.toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async getAllStaffWorkSessions(startDate?: Date, endDate?: Date) {
    let query = supabase
      .from("staff_work_sessions")
      .select(`
        *,
        staff:profiles!staff_work_sessions_staff_id_fkey (
          id,
          full_name,
          email,
          role
        )
      `)
      .order("clock_in_time", { ascending: false });

    if (startDate) {
      query = query.gte("clock_in_time", startDate.toISOString());
    }
    if (endDate) {
      query = query.lte("clock_in_time", endDate.toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
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
      })
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
      })
      .in("id", sessionIds)
      .select();

    if (error) throw error;
    return data;
  },
};
