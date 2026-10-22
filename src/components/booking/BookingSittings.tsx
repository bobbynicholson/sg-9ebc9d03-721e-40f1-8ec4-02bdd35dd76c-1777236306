import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatClock } from "@/lib/portalTime";
import { ORDER_UPDATED_EVENT } from "@/lib/events/orderEvents";

export function BookingSittings({ bookingId, showOperations = false }: { bookingId: string; showOperations?: boolean }) {
  const [rows, setRows] = useState<Array<{ id: string; sequence_number: number; guest_count: number; service_time: string; return_required?: boolean; return_date?: string; return_time?: string; kitchen_ready_time?: string; dispatch_time?: string; packing_notes?: string; cleaning_reset_required?: boolean }>>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!/^[\da-f-]{36}$/i.test(bookingId)) return;
    let cancelled = false;
    const load = () => (supabase as any).from("service_sittings").select(`id,sequence_number,guest_count,service_time,return_required,return_date,return_time${showOperations ? ",kitchen_ready_time,dispatch_time,packing_notes,cleaning_reset_required" : ""}`)
      .or(`order_id.eq.${bookingId},quote_id.eq.${bookingId}`).order("sequence_number")
      .then(({ data, error }: any) => { if (!cancelled) { setRows(data || []); setError(!!error); } });
    void load();
    window.addEventListener(ORDER_UPDATED_EVENT, load);
    window.addEventListener("focus", load);
    return () => { cancelled = true; window.removeEventListener(ORDER_UPDATED_EVENT, load); window.removeEventListener("focus", load); };
  }, [bookingId, showOperations]);
  if (error) return <p role="alert" className="mt-3 text-sm">Serving times could not be loaded. Refresh to retry.</p>;
  if (rows.length < 2) return null;
  return <div className="mt-3 border-t border-current/20 pt-3 text-sm" aria-label="Serving times">
    <p className="font-semibold">{rows.length} service sittings</p>
    <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-3">{rows.map(s => <li key={s.id} className="min-w-0 break-words">Sitting {s.sequence_number}: <strong>{s.guest_count} guests</strong> at <strong>{formatClock(s.service_time.slice(0, 5))}</strong>
      {showOperations && s.kitchen_ready_time && <span className="block">Kitchen ready: {formatClock(s.kitchen_ready_time.slice(0,5))}</span>}
      {showOperations && s.dispatch_time && <span className="block">Depart kitchen: {formatClock(s.dispatch_time.slice(0,5))}</span>}
      {s.return_required && s.return_time && <span className="block">Equipment collection: {s.return_date} at {formatClock(s.return_time.slice(0,5))}</span>}
      {showOperations && s.cleaning_reset_required && <span className="block font-medium">Venue / equipment reset required</span>}
      {showOperations && s.packing_notes && <span className="block whitespace-pre-wrap">{s.packing_notes}</span>}
    </li>)}</ul>
  </div>;
}
