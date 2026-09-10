/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";

export interface DriverInterestSummary {
  id: string;
  order_id: string;
  driver_id: string;
  driver_name: string;
  created_at: string;
  average_rating: number | null;
  rating_count: number;
}

function roundOne(n: number): number {
  return Math.round(n * 10) / 10;
}

export const orderDriverInterestService = {
  async markInterested(payload: {
    companyId: string;
    orderId: string;
    driverId: string;
  }): Promise<void> {
    const { error } = await (supabase as any)
      .from("order_driver_interest")
      .upsert(
        {
          company_id: payload.companyId,
          order_id: payload.orderId,
          driver_id: payload.driverId,
          status: "interested",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "order_id,driver_id" },
      );
    if (error) throw error;
  },

  async getMyInterestedOrderIds(
    companyId: string,
    driverId: string,
    orderIds: string[],
  ): Promise<Set<string>> {
    if (orderIds.length === 0) return new Set();
    const { data, error } = await (supabase as any)
      .from("order_driver_interest")
      .select("order_id")
      .eq("company_id", companyId)
      .eq("driver_id", driverId)
      .eq("status", "interested")
      .in("order_id", orderIds);
    if (error) {
      console.warn("[orderDriverInterest] my interest fetch failed:", error);
      return new Set();
    }
    return new Set(((data || []) as Array<{ order_id: string }>).map((row) => row.order_id));
  },

  async getInterestedDriversForOrders(
    companyId: string,
    orderIds: string[],
  ): Promise<Record<string, DriverInterestSummary[]>> {
    if (orderIds.length === 0) return {};

    const { data: interests, error } = await (supabase as any)
      .from("order_driver_interest")
      .select("id, order_id, driver_id, created_at, driver:driver_id(full_name)")
      .eq("company_id", companyId)
      .eq("status", "interested")
      .in("order_id", orderIds)
      .order("created_at", { ascending: true });
    if (error) {
      console.warn("[orderDriverInterest] admin interest fetch failed:", error);
      return {};
    }

    const rows = ((interests || []) as any[]).map((row) => ({
      id: row.id as string,
      order_id: row.order_id as string,
      driver_id: row.driver_id as string,
      driver_name: row.driver?.full_name || "Driver",
      created_at: row.created_at as string,
      average_rating: null as number | null,
      rating_count: 0,
    }));
    const driverIds = Array.from(new Set(rows.map((row) => row.driver_id)));
    if (driverIds.length === 0) return {};

    const { data: deliveredOrders, error: ordersError } = await (supabase as any)
      .from("orders")
      .select("id, driver_id, assigned_driver_id, event_date")
      .eq("company_id", companyId)
      .in("status", ["delivered", "completed"])
      .or(`driver_id.in.(${driverIds.join(",")}),assigned_driver_id.in.(${driverIds.join(",")})`)
      .order("event_date", { ascending: false })
      .limit(1000);

    const orderToDriver = new Map<string, string>();
    if (!ordersError) {
      for (const order of deliveredOrders || []) {
        const driverId = driverIds.includes((order as any).driver_id)
          ? (order as any).driver_id
          : (order as any).assigned_driver_id;
        if (driverId) orderToDriver.set((order as any).id, driverId);
      }
    } else {
      console.warn("[orderDriverInterest] rating order lookup failed:", ordersError);
    }

    if (orderToDriver.size > 0) {
      const { data: feedback, error: feedbackError } = await (supabase as any)
        .from("delivery_feedback")
        .select("order_id, overall_rating, driver_professionalism_rating")
        .eq("company_id", companyId)
        .in("order_id", Array.from(orderToDriver.keys()));
      if (!feedbackError) {
        const ratings: Record<string, number[]> = {};
        for (const item of feedback || []) {
          const driverId = orderToDriver.get((item as any).order_id);
          if (!driverId) continue;
          const value = Number((item as any).driver_professionalism_rating ?? (item as any).overall_rating);
          if (!Number.isFinite(value) || value <= 0) continue;
          if (!ratings[driverId]) ratings[driverId] = [];
          ratings[driverId].push(value);
        }
        for (const row of rows) {
          const values = ratings[row.driver_id] || [];
          if (values.length > 0) {
            row.rating_count = values.length;
            row.average_rating = roundOne(values.reduce((sum, value) => sum + value, 0) / values.length);
          }
        }
      } else {
        console.warn("[orderDriverInterest] rating feedback lookup failed:", feedbackError);
      }
    }

    return rows.reduce<Record<string, DriverInterestSummary[]>>((acc, row) => {
      if (!acc[row.order_id]) acc[row.order_id] = [];
      acc[row.order_id].push(row);
      return acc;
    }, {});
  },
};
