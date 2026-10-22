import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantHref } from "@/lib/tenantUrl";
import { staffOrderHref } from "@/lib/orderUrls";
import { Button } from "@/components/ui/button";
import { formatClock } from "@/lib/portalTime";

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
        .select("id,assignment_type,status,scheduled_for,notes,order_id,sitting:service_sittings(sequence_number,guest_count,service_time,packing_notes),order:orders!driver_assignments_order_id_fkey(order_number,client_name,event_date,venue_address,status)")
        .eq("company_id", user.company_id).eq("driver_id", user.id).not("service_sitting_id", "is", null)
        .not("status", "in", "(cancelled,rejected,completed)").order("scheduled_for");
      if (loadError) throw loadError;
      setTrips((data || []).filter((t: any) => t.order && !["cancelled", "postponed", "completed"].includes(t.order.status)));
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
      return <li key={t.id} className="min-w-0 py-4 first:pt-0">
        <h3 className="text-base font-semibold text-slate-950">{t.assignment_type === "collection" ? "Equipment collection" : "Delivery"} · Sitting {t.sitting?.sequence_number}</h3>
        <p className="mt-1 text-sm text-slate-700">{t.order.order_number} · {t.order.client_name} · {t.sitting?.guest_count} guests at {formatClock(String(t.sitting?.service_time || "").slice(0, 5))}</p>
        <p className="mt-1 text-sm font-medium text-slate-900">Trip scheduled: {t.scheduled_for ? new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(t.scheduled_for)) : "Awaiting dispatch time"}</p>
        <p className="mt-1 break-words text-sm text-slate-600">{t.order.venue_address}</p>
        {t.sitting?.packing_notes && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700">{t.sitting.packing_notes}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-3"><span className="text-sm capitalize text-slate-600">{t.status.replaceAll("_", " ")}</span>
          {next && <Button type="button" disabled={!!busy} onClick={() => void advance(t, next[0])}>{busy === t.id ? "Saving…" : next[1]}</Button>}
          <Link className="text-sm font-medium text-brand-primary underline underline-offset-4" href={withSlug(staffOrderHref(t.order_id, "driver"))}>Open booking</Link>
        </div>
      </li>;
    })}</ul>
  </section>;
}
