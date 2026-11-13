import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantHref } from "@/lib/tenantUrl";
import { staffOrderHref } from "@/lib/orderUrls";
import { Button } from "@/components/ui/button";
import { formatClock } from "@/lib/portalTime";
import { allocateSittingQuantities, menuLineSittingSequence } from "@/lib/serviceSittings";

const nextStage = (trip: any): [string, string] | undefined => {
  const stages = trip.assignment_type === "collection"
    ? [["assigned", "Accept collection"], ["accepted", "Start collection trip"], ["en_route", "Equipment collected"], ["picked_up", "Equipment back at base"]]
    : [["assigned", "Accept delivery"], ["accepted", "Depart kitchen"], ["en_route", "Arrived at venue"], ["at_venue", "Delivery complete"], ["delivered", "Finish delivery trip"]];
  const states = trip.assignment_type === "collection" ? ["accepted", "en_route", "picked_up", "completed"] : ["accepted", "en_route", "at_venue", "delivered", "completed"];
  const index = stages.findIndex(([status]) => status === trip.status);
  return index < 0 ? undefined : [states[index], stages[index][1]];
};

export function SittingTrips() {
  const { user } = useAuth();
  const { withSlug } = useTenantHref();
  const [trips, setTrips] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    if (!user?.id || !user.company_id) return;
    setError("");
    try {
      const { data, error: loadError } = await (supabase as any).from("driver_assignments")
        .select("id,assignment_type,status,scheduled_for,notes,order_id,sitting:service_sittings(sequence_number,guest_count,service_time,packing_notes,venue_name,venue_address,venue_lat,venue_lng,delivery_fee,collection_fee),order:orders!driver_assignments_order_id_fkey(order_number,client_name,event_date,venue_name,venue_address,status,service_sittings(sequence_number,guest_count),order_items(item_name,quantity,description))")
        .eq("company_id", user.company_id).eq("driver_id", user.id).not("service_sitting_id", "is", null)
        .not("status", "in", "(cancelled,rejected,completed)").order("scheduled_for");
      if (loadError) throw loadError;
      const activeTrips = (data || [])
        .filter((t: any) => t.order && !["cancelled", "postponed", "completed"].includes(t.order.status))
        .sort((a: any, b: any) => new Date(a.scheduled_for || 0).getTime() - new Date(b.scheduled_for || 0).getTime()
          || String(a.sitting?.service_time || "").localeCompare(String(b.sitting?.service_time || ""))
          || Number(a.sitting?.sequence_number || 0) - Number(b.sitting?.sequence_number || 0)
          || String(a.order?.order_number || "").localeCompare(String(b.order?.order_number || "")));
      const orderIds = Array.from(new Set(activeTrips.map((trip: any) => trip.order_id)));
      const runCounts = new Map<string, number>();
      for (const trip of activeTrips) {
        const runKey = `${trip.assignment_type}:${trip.scheduled_for || "unscheduled"}`;
        runCounts.set(runKey, (runCounts.get(runKey) || 0) + 1);
      }
      const equipmentResult = orderIds.length
        ? await (supabase as any).from("equipment_bookings").select("id,order_id,quantity,service_sitting_sequence,status,equipment:equipment_id(name)").in("order_id", orderIds).neq("status", "cancelled")
        : { data: [], error: null };
      if (equipmentResult.error) throw equipmentResult.error;
      const equipmentRows = equipmentResult.data || [];
      setTrips(activeTrips.map((trip: any) => ({
        ...trip,
        sharedRunSize: runCounts.get(`${trip.assignment_type}:${trip.scheduled_for || "unscheduled"}`) || 1,
        equipmentItems: equipmentRows.filter((item: any) => Number(item.service_sitting_sequence) === Number(trip.sitting?.sequence_number) && item.equipment?.name),
        sharedEquipmentCount: equipmentRows.filter((item: any) => item.service_sitting_sequence == null && item.equipment?.name).length,
        foodItems: (trip.order?.order_items || []).flatMap((line: any) => {
          const assignedSequence = menuLineSittingSequence(line);
          if (assignedSequence && assignedSequence !== Number(trip.sitting?.sequence_number)) return [];
          const sittingRows = [...(trip.order?.service_sittings || [])].sort((a: any, b: any) => a.sequence_number - b.sequence_number);
          const index = sittingRows.findIndex((sitting: any) => Number(sitting.sequence_number) === Number(trip.sitting?.sequence_number));
          const quantity = assignedSequence ? Number(line.quantity || 0) : allocateSittingQuantities(Number(line.quantity || 0), sittingRows.map((sitting: any) => Number(sitting.guest_count || 0)))[index] || 0;
          return quantity > 0 ? [{ name: line.item_name, quantity }] : [];
        }),
      })));
    } catch (e: any) { setError(e.message || "Your sitting trips could not be loaded."); }
    finally { setLoading(false); }
  }, [user?.id, user?.company_id]);
  useEffect(() => { void load(); const timer = setInterval(() => { void load(); }, 30000); return () => clearInterval(timer); }, [load]);
  async function advance(trip: any, status: string) {
    setBusy(trip.id); setError("");
    try {
      const response = await fetch("/api/driver/sitting-trip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assignmentId: trip.id, status }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Trip progress could not be saved.");
      await load();
    } catch (e: any) { setError(e.message); }
    finally { setBusy(""); }
  }
  if (loading || (!trips.length && !error)) return null;
  return <section className="mb-5 min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-label="Your sitting trips">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold text-slate-950">Your sitting deliveries &amp; collections</h2><Button type="button" variant="outline" onClick={() => void load()}>Refresh trips</Button></div>
    <p className="mt-1 text-sm text-slate-600">Each trip has its own time and progress. Completing one trip leaves the other sittings open.</p>
    {error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
    <ul className="mt-4 divide-y divide-slate-200">{trips.map(t => {
      const next = nextStage(t);
      const venueName = t.sitting?.venue_name || t.order.venue_name;
      const venueAddress = t.sitting?.venue_address || t.order.venue_address;
      const mapDestination = t.sitting?.venue_lat != null && t.sitting?.venue_lng != null
        ? `${t.sitting.venue_lat},${t.sitting.venue_lng}`
        : venueAddress;
      return <li key={t.id} className="min-w-0 py-4 first:pt-0">
        <h3 className="text-base font-semibold text-slate-950">{t.assignment_type === "collection" ? "Equipment collection" : "Delivery"} · Sitting {t.sitting?.sequence_number}</h3>
        <p className="mt-1 text-sm text-slate-700">{t.order.order_number} · {t.order.client_name} · {t.sitting?.guest_count} guests at {formatClock(String(t.sitting?.service_time || "").slice(0, 5))}</p>
        <p className="mt-1 text-sm font-medium text-slate-900">Trip scheduled: {t.scheduled_for ? new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(t.scheduled_for)) : "Awaiting dispatch time"}</p>
        {t.sharedRunSize > 1 && <p className="mt-1 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">Shared run · {t.sharedRunSize} stops have this departure time. Deliver or collect each stop in its listed service-time order.</p>}
        {(venueName || venueAddress) && <p className="mt-1 break-words text-sm text-slate-600">{venueName && <strong>{venueName}: </strong>}{venueAddress}</p>}
        {t.assignment_type === "delivery" && <p className="mt-1 text-xs text-slate-600">Sitting delivery fee on the single invoice: R {Number(t.sitting?.delivery_fee || 0).toFixed(2)}</p>}
        {t.assignment_type === "collection" && <p className="mt-1 text-xs text-slate-600">Sitting collection fee on the single invoice: R {Number(t.sitting?.collection_fee || 0).toFixed(2)}</p>}
        {t.assignment_type === "delivery" && !!t.foodItems?.length && <div className="mt-2 rounded-md border border-slate-200 bg-white p-3 text-sm"><p className="font-semibold text-slate-800">Planned food for this sitting</p><p className="mt-1 text-xs text-slate-600">Confirm the actual ready load with the kitchen before leaving.</p><ul className="mt-2 space-y-0.5 text-slate-700">{t.foodItems.map((item: any, index: number) => <li key={`${item.name}-${index}`}>{item.quantity} × {item.name}</li>)}</ul></div>}
        {!!t.equipmentItems?.length && <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm"><p className="font-semibold text-slate-800">{t.assignment_type === "collection" ? "Equipment to collect from this sitting" : "Equipment to deliver to this sitting"}</p><ul className="mt-1 space-y-0.5 text-slate-700">{t.equipmentItems.map((item: any) => <li key={item.id}>{item.quantity} × {item.equipment.name}</li>)}</ul></div>}
        {t.sharedEquipmentCount > 0 && <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">There {t.sharedEquipmentCount === 1 ? "is 1 unassigned equipment line" : `are ${t.sharedEquipmentCount} unassigned equipment lines`} for the primary venue. Confirm whether it belongs on this {t.assignment_type === "collection" ? "collection" : "delivery"} with dispatch.</p>}
        {t.sitting?.packing_notes && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">{t.sitting.packing_notes}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-3"><span className="text-sm capitalize text-slate-600">{t.status.replaceAll("_", " ")}</span>
          {next && <Button type="button" disabled={!!busy} onClick={() => void advance(t, next[0])}>{busy === t.id ? "Saving…" : next[1]}</Button>}
          {mapDestination && <a className="text-sm font-medium text-brand-primary underline underline-offset-4" href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapDestination)}`} target="_blank" rel="noreferrer">Navigate</a>}
          <Link className="text-sm font-medium text-brand-primary underline underline-offset-4" href={withSlug(staffOrderHref(t.order_id, "driver"))}>Open booking</Link>
        </div>
      </li>;
    })}</ul>
  </section>;
}
