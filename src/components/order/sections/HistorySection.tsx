/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC: history section - audit log entries scoped to this order.
 * Defaults closed - it's the "who changed what when" trail you
 * dig into when something looks off, not the main story.
 */
import { useEffect, useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { Eye, History, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { historyActionLabel, isAmendmentAction } from "@/lib/amendmentSummary";
import { AmendmentDetailsDialog, AmendmentInlineSummary } from "./AmendmentDetailsDialog";

interface Props {
  orderId: string;
  companyId: string;
  defaultOpen?: boolean;
  forceOpen?: boolean;
}

interface AuditEntry {
  id: string;
  action: string | null;
  details: any;
  user_id: string | null;
  created_at: string;
  actor?: { full_name: string | null } | null;
}

export function HistorySection({ orderId, companyId, defaultOpen, forceOpen }: Props) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<AuditEntry | null>(null);
  // Change requests on this order, so amendment rows can say what changed.
  const [amendments, setAmendments] = useState<Record<string, { proposed: any; before: any }>>({});

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
          .select("id, action, details, user_id, created_at, actor:user_id(full_name)")
          .eq("company_id", companyId)
          .eq("entity_type", "order")
          .eq("entity_id", orderId)
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        if (!cancelled) setEntries((data || []) as AuditEntry[]);
        if (((data || []) as AuditEntry[]).some((e) => isAmendmentAction(e.action))) {
          const { data: reqs } = await (supabase as any)
            .from("order_amendment_requests")
            .select("id, proposed_changes, applied_snapshot")
            .eq("order_id", orderId);
          if (!cancelled) {
            setAmendments(Object.fromEntries(((reqs || []) as any[]).map((r) => [r.id, { proposed: r.proposed_changes, before: r.applied_snapshot?.before ?? null }])));
          }
        }
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
        <p role="status" className="flex items-center gap-2 py-4 text-sm text-slate-600">
          <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" /> Loading history…
        </p>
      ) : entries.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No changes recorded for this order.</p>
      ) : (
        <ol aria-label="Recent order changes" className="divide-y divide-slate-200 border-t border-slate-200">
          {entries.map((entry) => {
            const action = historyActionLabel(entry.action);
            const amendment = isAmendmentAction(entry.action) ? amendments[entry.details?.request_id] : null;
            const date = new Date(entry.created_at);
            return (
              <li key={entry.id} className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3 [overflow-wrap:anywhere]">
                <div className="min-w-0 flex-[1_1_14rem]">
                  <p className="text-base font-semibold leading-snug text-slate-950">{action}</p>
                  <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-slate-600">
                    <span>{actorName(entry)}</span>
                    <time className="tabular-nums" dateTime={entry.created_at} title={date.toLocaleString("en-ZA")}>
                      {formatDistanceToNow(date, { addSuffix: true })}
                    </time>
                  </p>
                  {amendment && <AmendmentInlineSummary proposed={amendment.proposed} before={amendment.before} />}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setViewing(entry)}
                  className="h-auto min-h-[44px] max-w-full whitespace-normal print:hidden"
                  aria-label={`View details: ${action}`}
                >
                  <Eye /> View details
                </Button>
              </li>
            );
          })}
        </ol>
      )}

      {viewing && isAmendmentAction(viewing.action) ? (
        <AmendmentDetailsDialog
          open
          onOpenChange={(o) => { if (!o) setViewing(null); }}
          orderId={orderId}
          companyId={companyId}
          requestId={viewing.details?.request_id || null}
        />
      ) : (
        <Dialog open={!!viewing} onOpenChange={(o) => { if (!o) setViewing(null); }}>
          <DialogContent className="min-w-0 [overflow-wrap:anywhere] sm:max-w-xl">
            <DialogHeader className="min-w-0 pr-12 text-left">
              <DialogTitle>{historyActionLabel(viewing?.action)}</DialogTitle>
              <DialogDescription>
                By <strong>{viewing ? actorName(viewing) : ""}</strong>
                {viewing ? ` on ${new Date(viewing.created_at).toLocaleString("en-ZA")}` : ""}
              </DialogDescription>
            </DialogHeader>
            <AuditDetails details={viewing?.details} />
          </DialogContent>
        </Dialog>
      )}
    </CollapsibleSection>
  );
}

// A client acting through their order link has no staff profile.
const actorName = (e: AuditEntry) =>
  e.actor?.full_name || (e.action === "amendment_requested_magic" ? "Client" : "System");

// Internal keys that mean nothing to the team reading the history.
const HIDDEN_DETAIL_KEYS = /(^|_)(id|ids|cascade|before|snapshot|applied_keys|request_id|user_id)$/;
const detailLabel = (k: string) => k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const detailValue = (v: any): string | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.every((x) => typeof x !== "object") ? v.map(String).join(", ") : `${v.length} item${v.length === 1 ? "" : "s"}`;
  if (typeof v === "object") return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(String(v))) return new Date(String(v)).toLocaleString("en-ZA");
  return String(v);
};

/** Readable view of an audit row's details: plain labels and values only. */
function AuditDetails({ details }: { details: any }) {
  const rows = details && typeof details === "object"
    ? Object.entries(details)
        .filter(([k]) => !HIDDEN_DETAIL_KEYS.test(k))
        .map(([k, v]) => [detailLabel(k), detailValue(v)] as const)
        .filter(([, v]) => v !== null)
    : [];
  if (rows.length === 0) {
    return <p className="text-sm text-slate-600">No further details were recorded for this change.</p>;
  }
  return (
    <dl className="divide-y divide-slate-200 border-y border-slate-200 text-sm dark:divide-slate-700 dark:border-slate-700">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] gap-2 py-3">
          <dt className="font-semibold text-slate-900 dark:text-white">{label}</dt>
          <dd className="min-w-0 whitespace-pre-wrap break-words text-slate-700 dark:text-slate-300">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
