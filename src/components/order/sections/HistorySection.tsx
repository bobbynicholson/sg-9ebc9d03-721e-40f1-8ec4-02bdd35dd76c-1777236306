/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC: history section - audit log entries scoped to this order.
 * Defaults closed - it's the "who changed what when" trail you
 * dig into when something looks off, not the main story.
 */
import { useEffect, useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { History, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Props {
  orderId: string;
  defaultOpen?: boolean;
  forceOpen?: boolean;
}

interface AuditEntry {
  id: string;
  action: string | null;
  details: any;
  performed_by: string | null;
  created_at: string;
  actor?: { full_name: string | null } | null;
}

export function HistorySection({ orderId, defaultOpen, forceOpen }: Props) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // audit_logs is the canonical write-time trail. Filter by
        // entity_type='order' + entity_id. If the table doesn't
        // exist for a tenant, we get an empty list (caught below).
        const { data, error } = await (supabase as any)
          .from("audit_logs")
          .select("id, action, details, performed_by, created_at, actor:performed_by(full_name)")
          .eq("entity_type", "order")
          .eq("entity_id", orderId)
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        if (!cancelled) setEntries((data || []) as AuditEntry[]);
      } catch (e: any) {
        captureException(e, { tags: { route: "/order/[id]", step: "loadHistorySection", orderId } });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId]);

  const summary = loading
    ? "Loading..."
    : entries.length === 0
      ? "No audit entries"
      : `${entries.length} change${entries.length === 1 ? "" : "s"}`;

  return (
    <CollapsibleSection
      id="section-history"
      title="History"
      summary={summary}
      icon={History}
      accent="slate"
      defaultOpen={defaultOpen}
      forceOpen={forceOpen}
    >
      {loading ? (
        <div className="flex items-center justify-center py-6 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading history...
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-slate-500 py-2">No audit entries for this order.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {entries.map((e) => (
            <li key={e.id} className="flex items-start gap-2 border-l-2 border-slate-200 pl-3 py-1">
              <div className="min-w-0 flex-1">
                <p className="text-slate-900">
                  <span className="font-medium">{e.actor?.full_name || "System"}</span>
                  <span className="text-slate-500"> · </span>
                  <span className="text-slate-700">{e.action || "changed something"}</span>
                </p>
                <p className="text-xs text-slate-500 tabular-nums">
                  {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </CollapsibleSection>
  );
}
