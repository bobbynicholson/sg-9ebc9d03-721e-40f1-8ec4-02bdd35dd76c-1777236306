import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatClock } from "@/lib/portalTime";
import { emitOrderUpdated } from "@/lib/events/orderEvents";

export type SittingOperations = {
  id: string; sequence_number: number; guest_count: number; service_time: string;
  kitchenReadyTime: string; dispatchTime: string; returnDate: string; returnTime: string;
  packingNotes: string; cleaningResetRequired: boolean; deliveryDriverIds: string[]; collectionDriverIds: string[];
};
type Driver = { id: string; full_name: string };
const openTrip = (a: any) => !["cancelled", "rejected"].includes(a.status);

export function ServiceSittingsOperations({ orderId, companyId, canEdit = false }: { orderId: string; companyId: string; canEdit?: boolean }) {
  const uid = useId();
  const [rows, setRows] = useState<SittingOperations[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [returnPlan, setReturnPlan] = useState("final_collection");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const db = supabase as any;
      const results = await Promise.all([
        db.from("service_sittings").select("*").eq("order_id", orderId).eq("company_id", companyId).order("sequence_number"),
        db.from("driver_assignments").select("id,service_sitting_id,driver_id,assignment_type,status").eq("order_id", orderId),
        db.from("orders").select("event_date,equipment_return_plan,assigned_driver_id,secondary_driver_id").eq("id", orderId).single(),
        db.from("profiles").select("id,full_name").eq("company_id", companyId).eq("role", "driver").or("is_active.is.null,is_active.eq.true").order("full_name"),
      ]);
      for (const result of results) if (result.error) throw result.error;
      const [sittings, assignments, order, pool] = results;
      setReturnPlan(order.data.equipment_return_plan || "final_collection");
      setDrivers(pool.data || []);
      setRows((sittings.data || []).map((s: any,index: number) => ({
        ...s, kitchenReadyTime: s.kitchen_ready_time?.slice(0, 5) || "", dispatchTime: s.dispatch_time?.slice(0, 5) || "",
        returnDate: s.return_date || order.data.event_date, returnTime: s.return_time?.slice(0, 5) || "",
        packingNotes: s.packing_notes || "", cleaningResetRequired: !!s.cleaning_reset_required,
        deliveryDriverIds: (assignments.data || []).some((a: any) => a.service_sitting_id === s.id && a.assignment_type === "delivery" && openTrip(a)) ? (assignments.data || []).filter((a: any) => a.service_sitting_id === s.id && a.assignment_type === "delivery" && openTrip(a)).map((a: any) => a.driver_id) : index === 0 ? [order.data.assigned_driver_id,order.data.secondary_driver_id].filter(Boolean) : [],
        collectionDriverIds: (assignments.data || []).filter((a: any) => a.service_sitting_id === s.id && a.assignment_type === "collection" && openTrip(a)).map((a: any) => a.driver_id),
      })));
    } catch (e: any) { setError(e.message || "The sitting schedule could not be loaded. Please retry."); }
    finally { setLoading(false); }
  }, [orderId, companyId, canEdit]);
  useEffect(() => { void load(); }, [load]);
  const edit = (id: string, patch: Partial<SittingOperations>) => { setRows(previous => previous.map(s => s.id === id ? { ...s, ...patch } : s)); setSaved(false); };
  async function save() {
    setSaving(true); setError(""); setSaved(false);
    try {
      const response = await fetch(`/api/orders/${orderId}/service-plan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sittings: rows, returnPlan }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "The sitting schedule could not be saved.");
      await load(); setSaved(true); emitOrderUpdated(orderId, "sitting-schedule");
    } catch (e: any) { setError(e.message || "Please retry saving the schedule."); }
    finally { setSaving(false); }
  }
  if (loading && !rows.length) return <p className="text-sm text-slate-600" role="status">Loading service sittings…</p>;
  if (rows.length < 2 && !error) return null;
  return <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby={`${uid}-title`}>
    <h2 id={`${uid}-title`} className="text-lg font-semibold text-slate-950">Service sittings &amp; trips</h2>
    <p className="mt-1 text-sm leading-6 text-slate-600">One booking, {rows.length} sitting{rows.length === 1 ? "" : "s"}. Schedule each kitchen batch, delivery and equipment return here.</p>
    {error && <div role="alert" className="mt-3 text-sm text-red-800">{error} <button type="button" className="underline underline-offset-4" onClick={() => void load()}>Reload saved schedule</button></div>}
    {!!rows.length && <>
      <label className="mt-4 block text-sm font-medium text-slate-900">Equipment returns
        <select value={returnPlan} disabled={!canEdit || saving} onChange={e => { setReturnPlan(e.target.value); setSaved(false); }} className="mt-1 block min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-base">
          <option value="final_collection">One collection after the final sitting</option>
          <option value="per_sitting_collection">Separate collection after each sitting</option>
          <option value="on_site_return">On-site team brings equipment back</option>
          <option value="client_return">Client returns equipment / nothing to collect</option>
        </select>
      </label>
      <div className="mt-5 divide-y divide-slate-200">{rows.map((s, index) => {
        const collection = returnPlan === "per_sitting_collection" || (returnPlan === "final_collection" && index === rows.length - 1);
        const driverPicker = (leg: "delivery" | "collection") => {
          const key = leg === "delivery" ? "deliveryDriverIds" : "collectionDriverIds";
          return <fieldset disabled={!canEdit || saving} className="mt-3 min-w-0"><legend className="text-sm font-semibold text-slate-900">{leg === "delivery" ? "Delivery drivers" : "Collection drivers"}</legend>
            {canEdit ? <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">{drivers.length ? drivers.map(d => <label key={d.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-brand-primary" checked={s[key].includes(d.id)} onChange={e => edit(s.id, { [key]: e.target.checked ? [...s[key], d.id] : s[key].filter(id => id !== d.id) })} />{d.full_name || "Driver"}</label>) : <p className="text-sm text-slate-600">No active drivers found.</p>}</div> : <p className="mt-1 text-sm text-slate-700">{s[key].length ? s[key].map(id => drivers.find(d => d.id === id)?.full_name || "Assigned driver").join(", ") : "Not assigned yet"}</p>}
          </fieldset>;
        };
        return <article key={s.id} className="min-w-0 py-5 first:pt-0">
          <h3 className="text-base font-semibold text-slate-950">Sitting {s.sequence_number} · {s.guest_count} guests · {formatClock(s.service_time.slice(0, 5))}</h3>
          <fieldset disabled={!canEdit || saving} className="mt-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="min-w-0 text-sm text-slate-700">Kitchen ready by<Input type="time" value={s.kitchenReadyTime} onChange={e => edit(s.id, { kitchenReadyTime: e.target.value })} className="mt-1 min-w-0 text-base" /></label>
            <label className="min-w-0 text-sm text-slate-700">Depart kitchen at<Input type="time" value={s.dispatchTime} onChange={e => edit(s.id, { dispatchTime: e.target.value })} className="mt-1 min-w-0 text-base" /></label>
          </fieldset>
          {driverPicker("delivery")}
          {collection && <>
            <fieldset disabled={!canEdit || saving} className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="min-w-0 text-sm text-slate-700">Equipment collection date<Input type="date" value={s.returnDate} onChange={e => edit(s.id, { returnDate: e.target.value })} className="mt-1 min-w-0 text-base" /></label>
              <label className="min-w-0 text-sm text-slate-700">Equipment collection time<Input type="time" value={s.returnTime} onChange={e => edit(s.id, { returnTime: e.target.value })} className="mt-1 min-w-0 text-base" /></label>
            </fieldset>
            {driverPicker("collection")}
          </>}
          {!collection && <p className="mt-3 text-sm text-slate-600">{returnPlan === "final_collection" ? "Equipment stays on site until the final sitting collection." : "No driver collection for this sitting."}</p>}
          <fieldset disabled={!canEdit || saving} className="mt-3 space-y-3">
            <label className="flex min-h-11 items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="h-4 w-4 accent-brand-primary" checked={s.cleaningResetRequired} onChange={e => edit(s.id, { cleaningResetRequired: e.target.checked })} />Venue / equipment reset needed between sittings</label>
            <label className="block text-sm text-slate-700">Packing &amp; reset instructions<textarea maxLength={2000} value={s.packingNotes} onChange={e => edit(s.id, { packingNotes: e.target.value })} className="mt-1 block min-h-20 w-full rounded-md border border-slate-300 p-3 text-base" /></label>
          </fieldset>
        </article>;
      })}</div>
      {canEdit && <div className="flex flex-wrap items-center gap-3"><Button type="button" disabled={saving || loading} onClick={() => void save()}>{saving ? "Saving schedule…" : "Save sitting schedule"}</Button>{saved && <p className="text-sm text-green-800" role="status">Schedule saved. Driver trip lists updated.</p>}</div>}
    </>}
  </section>;
}
