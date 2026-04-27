/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type StaffPaymentLedger = Database["public"]["Tables"]["staff_payment_ledger"]["Row"];

export const paymentLedgerService = {
  /**
   * Get payment ledger summary for dashboard
   */
  async getPaymentLedger() {
    try {
      // Get all unpaid work sessions
      const { data: unpaidSessions, error } = await supabase
        .from("staff_work_sessions")
        .select("*, staff:profiles!staff_work_sessions_staff_id_fkey(id, full_name, role)")
        .eq("payment_status", "unpaid");

      if (error) {
        console.error("Error fetching unpaid sessions:", error);
        return { totalOwed: 0, unpaidSessions: [] };
      }

      const totalOwed = (unpaidSessions || []).reduce((sum, session) => {
        return sum + Number(session.total_earnings || 0);
      }, 0);

      return {
        totalOwed: Math.round(totalOwed * 100) / 100,
        unpaidSessions: unpaidSessions || [],
        staffCount: new Set((unpaidSessions || []).map(s => s.staff_id)).size
      };
    } catch (error) {
      console.error("Error getting payment ledger:", error);
      return { totalOwed: 0, unpaidSessions: [] };
    }
  },

  async recordPayment(
    staffId: string,
    paymentData: {
      payment_period_start: Date;
      payment_period_end: Date;
      total_hours: number;
      hourly_rate: number;
      total_amount: number;
      payment_method: "cash" | "bank_transfer" | "eft" | "other";
      payment_reference?: string;
      notes?: string;
    }
  ) {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error("Not authenticated");

    const { data, error } = await supabase
      .from("staff_payment_ledger")
      .insert({
        user_id: user.user.id,
        staff_id: staffId,
        payment_period_start: paymentData.payment_period_start.toISOString().split("T")[0],
        payment_period_end: paymentData.payment_period_end.toISOString().split("T")[0],
        total_hours: paymentData.total_hours,
        hourly_rate: paymentData.hourly_rate,
        total_amount: paymentData.total_amount,
        payment_method: paymentData.payment_method,
        payment_reference: paymentData.payment_reference,
        payment_date: new Date().toISOString(),
        notes: paymentData.notes,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getStaffPayments(staffId: string, startDate?: Date, endDate?: Date) {
    let query = supabase
      .from("staff_payment_ledger")
      .select("*")
      .eq("staff_id", staffId)
      .order("payment_date", { ascending: false });

    if (startDate) {
      query = query.gte("payment_period_start", startDate.toISOString().split("T")[0]);
    }
    if (endDate) {
      query = query.lte("payment_period_end", endDate.toISOString().split("T")[0]);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async getAllPayments(startDate?: Date, endDate?: Date, companyId?: string) {
    let query = supabase
      .from("staff_payment_ledger")
      .select(`
        *,
        staff:profiles!staff_payment_ledger_staff_id_fkey (
          id,
          full_name,
          email,
          role,
          company_id
        )
      `)
      .order("payment_date", { ascending: false });

    if (startDate) {
      query = query.gte("payment_period_start", startDate.toISOString().split("T")[0]);
    }
    if (endDate) {
      query = query.lte("payment_period_end", endDate.toISOString().split("T")[0]);
    }

    const { data, error } = await query;
    if (error) throw error;
    if (!data) return [];
    if (!companyId) return data;
    return data.filter((row: any) => row?.staff?.company_id === companyId);
  },

  async getPaymentSummary(period: "week" | "month" | "quarter" | "year") {
    const now = new Date();
    const startDate = new Date();

    switch (period) {
      case "week":
        startDate.setDate(now.getDate() - 7);
        break;
      case "month":
        startDate.setMonth(now.getMonth() - 1);
        break;
      case "quarter":
        startDate.setMonth(now.getMonth() - 3);
        break;
      case "year":
        startDate.setFullYear(now.getFullYear() - 1);
        break;
    }

    const payments = await this.getAllPayments(startDate, now);

    const totalAmount = payments.reduce((sum, payment) => {
      return sum + Number(payment.total_amount || 0);
    }, 0);

    const totalHours = payments.reduce((sum, payment) => {
      return sum + Number(payment.total_hours || 0);
    }, 0);

    const paymentsByMethod = payments.reduce((acc, payment) => {
      const method = payment.payment_method;
      acc[method] = (acc[method] || 0) + Number(payment.total_amount || 0);
      return acc;
    }, {} as Record<string, number>);

    const uniqueStaff = new Set(payments.map(p => p.staff_id)).size;

    return {
      period,
      startDate,
      endDate: now,
      totalAmount: Math.round(totalAmount * 100) / 100,
      totalHours: Math.round(totalHours * 100) / 100,
      paymentsCount: payments.length,
      uniqueStaff,
      paymentsByMethod,
    };
  },

  async processStaffPayment(
    staffId: string,
    sessionIds: string[],
    paymentMethod: "cash" | "bank_transfer" | "eft" | "other",
    paymentReference?: string,
    notes?: string
  ) {
    const { data: sessions } = await supabase
      .from("staff_work_sessions")
      .select("*")
      .in("id", sessionIds)
      .eq("staff_id", staffId)
      .eq("payment_status", "unpaid");

    if (!sessions || sessions.length === 0) {
      throw new Error("No unpaid sessions found");
    }

    const totalHours = sessions.reduce((sum, s) => sum + Number(s.total_hours || 0), 0);
    const totalAmount = sessions.reduce((sum, s) => sum + Number(s.total_earnings || 0), 0);
    const hourlyRate = sessions[0]?.hourly_rate || 0;

    const dates = sessions.map(s => new Date(s.clock_in_time));
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));

    const ledgerEntry = await this.recordPayment(staffId, {
      payment_period_start: minDate,
      payment_period_end: maxDate,
      total_hours: totalHours,
      hourly_rate: Number(hourlyRate),
      total_amount: totalAmount,
      payment_method: paymentMethod,
      payment_reference: paymentReference,
      notes: notes,
    });

    const { error: updateError } = await supabase
      .from("staff_work_sessions")
      .update({
        payment_status: "paid",
        paid_at: new Date().toISOString(),
      })
      .in("id", sessionIds);

    if (updateError) throw updateError;

    return ledgerEntry;
  },
};
