/* eslint-disable @typescript-eslint/no-explicit-any */

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type DeliveryRouteStop = Database["public"]["Tables"]["delivery_route_stops"]["Row"];

export const routeStopService = {
  async addStop(
    orderId: string,
    driverId: string,
    stopData: {
      stop_type: "emergency" | "last_minute_purchase" | "fuel" | "other";
      stop_name: string;
      stop_address: string;
      stop_lat?: number;
      stop_lng?: number;
      reason?: string;
      amount_spent?: number;
      receipt_url?: string;
      added_by_admin?: boolean;
    }
  ) {
    const { data, error } = await supabase
      .from("delivery_route_stops")
      .insert({
        order_id: orderId,
        driver_id: driverId,
        ...stopData,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateStopArrival(stopId: string) {
    const { data, error } = await supabase
      .from("delivery_route_stops")
      .update({
        arrival_time: new Date().toISOString(),
      })
      .eq("id", stopId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateStopDeparture(stopId: string) {
    const { data: stop, error: stopErr } = await supabase
      .from("delivery_route_stops")
      .select("arrival_time")
      .eq("id", stopId)
      .single();
    if (stopErr) console.error("[routeStopService/updateStopDeparture] delivery_route_stops lookup failed:", stopErr);

    if (!stop?.arrival_time) {
      throw new Error("Cannot depart without arrival time");
    }

    const departureTime = new Date();

    const { data, error } = await supabase
      .from("delivery_route_stops")
      // delivery_route_stops has no duration_minutes column; arrival_time +
      // departure_time capture the dwell, derivable on read.
      .update({
        departure_time: departureTime.toISOString(),
      } as any)
      .eq("id", stopId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getOrderStops(orderId: string) {
    const { data, error } = await supabase
      .from("delivery_route_stops")
      .select(`
        *,
        driver:profiles!delivery_route_stops_driver_id_fkey (
          id,
          full_name,
          email
        )
      `)
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async getDriverStops(driverId: string, orderId?: string) {
    let query = supabase
      .from("delivery_route_stops")
      .select("*")
      .eq("driver_id", driverId)
      .order("created_at", { ascending: false });

    if (orderId) {
      query = query.eq("order_id", orderId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async updateStop(stopId: string, updates: Partial<DeliveryRouteStop>) {
    const { data, error } = await supabase
      .from("delivery_route_stops")
      .update(updates)
      .eq("id", stopId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteStop(stopId: string) {
    const { error } = await supabase
      .from("delivery_route_stops")
      .delete()
      .eq("id", stopId);

    if (error) throw error;
    return true;
  },
};
