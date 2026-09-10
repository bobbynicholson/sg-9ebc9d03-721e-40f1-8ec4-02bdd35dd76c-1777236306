/* eslint-disable @typescript-eslint/no-explicit-any */

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type StaffPaymentLedger = Database["public"]["Tables"]["staff_payment_ledger"]["Row"];

export const paymentLedgerService = {
  /**
   * Get payment ledger summary for dashboard.
   *
   * MUST be called with the caller's companyId. RLS scopes the table
   * by tenant, but defence-in-depth: filter explicitly so a regression
   * or a service-role caller can't surface another tenant's wages.
   */
  async getPaymentLedger(companyId?: string) {
    try {
      let query = supabase
        .from("staff_work_sessions")
        .select("*, staff:profiles!staff_work_sessions_staff_id_fkey(id, full_name, role, created_at)")
        .eq("payment_status", "unpaid");

      if (companyId) {
        query = query.eq("company_id", companyId);
      }

      const { data: unpaidSessions, error } = await query;

      if (error) {
        console.error("Error fetching unpaid sessions:", error);
        return { totalOwed: 0, unpaidSessions: [], staffCount: 0 };
      }

      // Defence against seed / phantom rows. A legitimate work session
      // cannot predate its staff member's profile.created_at. Spit Braai
      // Delivery had 20 fixture rows clocked in days before the matching
      // profile was created, which surfaced as R11280 of phantom wages
      // owed on a brand-new tenant. Anything that fails the sanity
      // check is dropped from the rollup AND logged so a real data
      // inconsistency still shows up in the console.
      const sane = (unpaidSessions || []).filter((s: any) => {
        const profileCreated = s.staff?.created_at ? new Date(s.staff.created_at).getTime() : null;
        const clockIn = s.clock_in ? new Date(s.clock_in).getTime() : null;
        if (profileCreated == null || clockIn == null) return true;
        // Allow a 1-hour grace window in case the staff was added the
        // same minute they clocked in via a same-touch flow.
        const ok = clockIn >= profileCreated - 60 * 60 * 1000;
        if (!ok) {
          console.warn(
            `[paymentLedger] dropping session ${s.id}: clock_in ${s.clock_in} predates staff ${s.staff_id} created_at ${s.staff?.created_at}`,
          );
        }
        return ok;
      });

      const totalOwed = sane.reduce((sum: number, session: any) => {
        return sum + Number(session.total_earnings || 0);
      }, 0);

      return {
        totalOwed: Math.round(totalOwed * 100) / 100,
        unpaidSessions: sane,
        staffCount: new Set(sane.map((s: any) => s.staff_id)).size,
      };
    } catch (error) {
      console.error("Error getting payment ledger:", error);
      return { totalOwed: 0, unpaidSessions: [], staffCount: 0 };
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
      } as any)
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
    // Preflight read so we can compute totals before claiming. The
    // payment_status='unpaid' filter is duplicated on the atomic
    // claim below; this read is the source of truth for the ledger
    // amount.
    const { data: sessions, error: sessionsErr } = await supabase
      .from("staff_work_sessions")
      .select("*")
      .in("id", sessionIds)
      .eq("staff_id", staffId)
      .eq("payment_status", "unpaid");
    if (sessionsErr) console.error("[paymentLedgerService] staff_work_sessions lookup failed:", sessionsErr);

    if (!sessions || sessions.length === 0) {
      throw new Error("No unpaid sessions found");
    }

    const totalHours = sessions.reduce((sum, s) => sum + Number(s.total_hours || 0), 0);
    const totalAmount = sessions.reduce((sum, s) => sum + Number(s.total_earnings || 0), 0);
    // Schema audit (2026-07-02): staff_work_sessions has NO hourly_rate
    // column - the old read (sessions[0].hourly_rate) was always
    // undefined and wrote 0 onto every ledger row. Derive the effective
    // rate from the totals we actually have so the ledger line
    // ("X hours @ R Y/hr") reconciles with its own total.
    const hourlyRate = totalHours > 0 ? totalAmount / totalHours : 0;

    // Schema audit (2026-07-02): the column is clock_in, not
    // clock_in_time. The old read produced Invalid Date on every row,
    // so Math.min/max returned NaN and recordPayment's .toISOString()
    // threw RangeError AFTER the sessions were claimed - every
    // "Process Payment" attempt failed (then rolled back). Filter out
    // any unparseable timestamps and fall back to now so the period
    // stamps can never crash the payment again.
    const dateMs = sessions
      .map((s) => new Date((s as any).clock_in).getTime())
      .filter((t) => Number.isFinite(t));
    const nowMs = Date.now();
    const minDate = new Date(dateMs.length > 0 ? Math.min(...dateMs) : nowMs);
    const maxDate = new Date(dateMs.length > 0 ? Math.max(...dateMs) : nowMs);

    // TIGHTEN I.104 (2026-06-02): atomic claim BEFORE inserting the
    // ledger entry. Without this, two concurrent processStaffPayment
    // calls (operator double-click, or one tab + a cron) both read the
    // same unpaid sessions and both insert ledger rows - double-paying
    // the staff member. The claim is gated on payment_status='unpaid'
    // so only the winning call flips them to 'paid'.
    const claimedIds = sessions.map((s) => (s as any).id);
    const paidAtIso = new Date().toISOString();
    const { data: claimed, error: claimErr } = await supabase
      .from("staff_work_sessions")
      .update({
        payment_status: "paid",
        paid_at: paidAtIso,
      } as any)
      .in("id", claimedIds)
      .eq("payment_status", "unpaid")
      .select("id");
    if (claimErr) {
      throw new Error(`Session claim failed: ${claimErr.message}`);
    }
    if (!claimed || claimed.length !== claimedIds.length) {
      // Partial claim - someone else paid some of these sessions
      // concurrently. Revert any we did flip back to 'unpaid' so
      // finance can decide what to do.
      const winnerIds = (claimed || []).map((r: any) => r.id);
      if (winnerIds.length > 0) {
        await supabase
          .from("staff_work_sessions")
          .update({ payment_status: "unpaid", paid_at: null } as any)
          .in("id", winnerIds);
      }
      throw new Error(
        "Some sessions were paid concurrently by another request. No ledger row written.",
      );
    }

    // Claim is exclusive - safe to insert the ledger row. If recordPayment
    // throws, revert the claim so finance can retry.
    let ledgerEntry;
    try {
      ledgerEntry = await this.recordPayment(staffId, {
        payment_period_start: minDate,
        payment_period_end: maxDate,
        total_hours: totalHours,
        hourly_rate: Number(hourlyRate),
        total_amount: totalAmount,
        payment_method: paymentMethod,
        payment_reference: paymentReference,
        notes: notes,
      });
    } catch (recordErr) {
      await supabase
        .from("staff_work_sessions")
        .update({ payment_status: "unpaid", paid_at: null } as any)
        .in("id", claimedIds);
      throw recordErr;
    }

    return ledgerEntry;
  },
};
