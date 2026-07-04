/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * "Who actually helped" on this order, per area (kitchen / cleaning / ...).
 * Reads order_work_contributors (populated by the record_* RPCs when staff
 * start/complete work) and shows the distinct people who touched it.
 *
 * Best-effort: if the table/RPC isn't deployed yet the query errors and we
 * render nothing, so the order doc never breaks pre-migration.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users } from "lucide-react";

interface Props {
  orderId: string;
  area: "kitchen" | "cleaning" | "shopping" | "driver" | "waiter" | "service";
  /** Leading label, e.g. "Helped by" / "Cleaned by". */
  label?: string;
}

interface Contributor {
  userId: string;
  name: string;
  lastAt: string | null;
}

export function OrderContributors({ orderId, area, label = "Helped by" }: Props) {
  const [people, setPeople] = useState<Contributor[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: rows, error } = await (supabase as any)
          .from("order_work_contributors")
          .select("user_id, last_at")
          .eq("order_id", orderId)
          .eq("area", area)
          .order("last_at", { ascending: true });
        if (error || !rows || rows.length === 0) {
          if (!cancelled) setPeople([]);
          return;
        }
        const ids = Array.from(new Set(rows.map((r: any) => r.user_id).filter(Boolean)));
        const { data: profs } = await (supabase as any)
          .from("profiles")
          .select("id, full_name, email")
          .in("id", ids.length ? ids : ["_"]);
        const nameById = new Map<string, string>(
          (profs || []).map((p: any) => [p.id, p.full_name || p.email || "Unknown"]),
        );
        const list: Contributor[] = rows.map((r: any) => ({
          userId: r.user_id,
          name: nameById.get(r.user_id) || "Unknown",
          lastAt: r.last_at || null,
        }));
        if (!cancelled) setPeople(list);
      } catch {
        if (!cancelled) setPeople([]);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, area]);

  if (people.length === 0) return null;

  return (
    <div className="mt-2 flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
      <Users className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-slate-400" />
      <span>
        <span className="font-medium text-slate-500 dark:text-slate-400">{label}: </span>
        {people.map((p, i) => (
          <span key={p.userId}>
            {i > 0 ? ", " : ""}
            <span title={p.lastAt ? new Date(p.lastAt).toLocaleString("en-ZA") : undefined}>{p.name}</span>
          </span>
        ))}
      </span>
    </div>
  );
}

export default OrderContributors;
