import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatClock } from "@/lib/portalTime";
import { ORDER_UPDATED_EVENT } from "@/lib/events/orderEvents";

export function BookingSittings({ bookingId }: { bookingId: string }) {
  const [rows, setRows] = useState<Array<{ id: string; sequence_number: number; guest_count: number; service_time: string; return_required?: boolean; return_date?: string; return_time?: string }>>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!/^[\da-f-]{36}$/i.test(bookingId)) return;
    let cancelled = false;
    const load = () => (supabase as any).from("service_sittings").select("id,sequence_number,guest_count,service_time,return_required,return_date,return_time")
      .or(`order_id.eq.${bookingId},quote_id.eq.${bookingId}`).order("sequence_number")
      .then(({ data, error }: any) => { if (!cancelled) { setRows(data || []); setError(!!error); } });
    void load();
    window.addEventListener(ORDER_UPDATED_EVENT, load);
    window.addEventListener("focus", load);
    return () => { cancelled = true; window.removeEventListener(ORDER_UPDATED_EVENT, load); window.removeEventListener("focus", load); };
  }, [bookingId]);
  if (error) return <p role="alert" className="mt-3 text-sm">Serving times could not be loaded. Refresh to retry.</p>;
  if (rows.length < 2) return null;
  return <div className="mt-3 border-t border-current/20 pt-3 text-sm" aria-label="Serving times">
    <p className="font-semibold">{rows.length} service sittings</p>
    <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-1">{rows.map(s => <li key={s.id}>Sitting {s.sequence_number}: <strong>{s.guest_count} guests</strong> at <strong>{formatClock(s.service_time.slice(0, 5))}</strong>{s.return_required && s.return_time && <span className="block text-sm">Equipment collection: {s.return_date} at {formatClock(s.return_time.slice(0,5))}</span>}</li>)}</ul>
  </div>;
}
