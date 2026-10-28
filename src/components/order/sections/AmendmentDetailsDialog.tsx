/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Full details of a client change request (order_amendment_requests),
 * opened from the order's History and Communications rows. Shows who
 * asked, when, the review outcome and a plain-language list of what
 * changed versus the order before approval. Read-only.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { formatCurrency, type CurrencyCode } from "@/lib/currencyUtils";
import { useTenantCurrency } from "@/hooks/useTenantCurrency";
import { summariseAmendment, summaryPhrases, amendmentNextSteps, hasChanges, type AmendmentLineChange, type AmendmentLine } from "@/lib/amendmentSummary";
import { Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  companyId: string;
  /** A specific request; when omitted, every request on the order is shown. */
  requestId?: string | null;
}

interface RequestRow {
  id: string;
  requested_at: string | null;
  requested_by_user_id: string | null;
  status: string | null;
  proposed_changes: any;
  client_notes: string | null;
  reviewed_at: string | null;
  reviewed_by_user_id: string | null;
  review_notes: string | null;
  applied_snapshot: any;
}

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-ZA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

const STATUS_TEXT: Record<string, { label: string; tone: string }> = {
  pending: { label: "Waiting for review", tone: "bg-amber-50 text-amber-800 border-amber-200" },
  approved: { label: "Approved", tone: "bg-brand-primary/10 text-brand-primary border-brand-primary/20" },
  rejected: { label: "Declined", tone: "bg-rose-50 text-rose-800 border-rose-200" },
};

export function AmendmentDetailsDialog({ open, onOpenChange, orderId, companyId, requestId }: Props) {
  const { code } = useTenantCurrency(companyId);
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        let q = (supabase as any)
          .from("order_amendment_requests")
          .select("id, requested_at, requested_by_user_id, status, proposed_changes, client_notes, reviewed_at, reviewed_by_user_id, review_notes, applied_snapshot")
          .eq("order_id", orderId)
          .order("requested_at", { ascending: false });
        if (requestId) q = q.eq("id", requestId);
        const { data, error: err } = await q;
        if (err) throw err;
        const list = (data || []) as RequestRow[];
        const ids = Array.from(new Set(list.flatMap((r) => [r.reviewed_by_user_id, r.requested_by_user_id]).filter(Boolean))) as string[];
        let nameMap: Record<string, string> = {};
        if (ids.length) {
          const { data: people } = await (supabase as any).from("profiles").select("id, full_name").in("id", ids);
          nameMap = Object.fromEntries(((people || []) as any[]).map((p) => [p.id, p.full_name || "A team member"]));
        }
        if (!cancelled) { setRows(list); setNames(nameMap); }
      } catch (e: any) {
        captureException(e, { tags: { route: "/order/[id]", step: "loadAmendmentDetails", orderId } });
        if (!cancelled) setError("Couldn't load the change request. Close this and try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, orderId, requestId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Change request details</DialogTitle>
          <DialogDescription>What the client asked to change on this order, and what happened to the request.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-slate-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading change request...
          </div>
        ) : error ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-600">No change requests are recorded for this order.</p>
        ) : (
          <div className="space-y-5">
            {rows.map((r) => (
              <RequestCard key={r.id} row={r} names={names} currency={code} />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RequestCard({ row, names, currency }: { row: RequestRow; names: Record<string, string>; currency: CurrencyCode }) {
  const status = STATUS_TEXT[row.status || "pending"] || STATUS_TEXT.pending;
  const before = row.applied_snapshot?.before ?? null;
  const summary = summariseAmendment(row.proposed_changes, before);
  const requester = row.requested_by_user_id ? names[row.requested_by_user_id] || "A team member" : "The client (through their order link)";
  const reviewer = row.reviewed_by_user_id ? names[row.reviewed_by_user_id] || "A team member" : null;
  const money = (n: number | null) => (n === null ? null : formatCurrency(n, currency));

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${status.tone}`}>{status.label}</span>
        <span className="text-xs text-slate-500 tabular-nums">Requested {when(row.requested_at)}</span>
      </div>

      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto,1fr]">
        <dt className="text-slate-500">Asked by</dt>
        <dd className="font-semibold text-slate-900 dark:text-white">{requester}</dd>
        {row.reviewed_at && (
          <>
            <dt className="text-slate-500">{row.status === "rejected" ? "Declined by" : "Approved by"}</dt>
            <dd className="text-slate-900 dark:text-white"><strong>{reviewer || "A team member"}</strong> on {when(row.reviewed_at)}</dd>
          </>
        )}
      </dl>

      {row.client_notes && (
        <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">
          <p className="mb-1 font-semibold text-slate-900 dark:text-white">Client's note</p>
          <p className="whitespace-pre-wrap break-words text-slate-700 dark:text-slate-300">{row.client_notes}</p>
        </div>
      )}

      {hasChanges(summary) && (
        <div className="rounded-lg border border-brand-primary/20 bg-brand-primary/[0.06] p-3">
          <p className="mb-1 text-sm font-semibold text-slate-900 dark:text-white">In short</p>
          <AmendmentInlineSummary proposed={row.proposed_changes} before={before} asList />
        </div>
      )}

      <NextSteps steps={amendmentNextSteps(summary, row.status)} />

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          {before ? "What changed, line by line" : "What the client asked for"}
        </h3>
        {!hasChanges(summary) && <p className="text-sm text-slate-600">No differences from the order at the time.</p>}

        {summary.guests && (
          <p className="text-sm text-slate-700 dark:text-slate-300">
            Guests: {summary.guests.before !== null && <><span className="line-through">{summary.guests.before}</span> → </>}
            <strong className="text-slate-900 dark:text-white">{summary.guests.after}</strong>
          </p>
        )}

        <ChangeList title="Menu" changes={summary.menu} money={money} />
        <ChangeList title="Equipment" changes={summary.equipment} money={money} />
        <RequestedList title="Menu requested" lines={summary.requestedMenu} money={money} />
        <RequestedList title="Equipment requested" lines={summary.requestedEquipment} money={money} />

        {summary.other.length > 0 && (
          <ul className="space-y-1 text-sm">
            {summary.other.map((o) => (
              <li key={o.label} className="break-words text-slate-700 dark:text-slate-300">
                {o.label}: {o.before !== null && <><span className="line-through">{o.before}</span> → </>}
                <strong className="text-slate-900 dark:text-white">{o.after}</strong>
              </li>
            ))}
          </ul>
        )}
      </div>

      {row.review_notes && (
        <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800">
          <p className="mb-1 font-semibold text-slate-900 dark:text-white">Review note</p>
          <p className="whitespace-pre-wrap break-words text-slate-700 dark:text-slate-300">{row.review_notes}</p>
        </div>
      )}

      {before && (
        <p className="text-xs text-slate-500">
          Compared with the order just before this request was approved. Later edits to the order are not shown here.
        </p>
      )}
    </section>
  );
}

const KIND_TEXT: Record<AmendmentLineChange["kind"], { label: string; tone: string }> = {
  added: { label: "Added", tone: "bg-brand-primary/10 text-brand-primary border-brand-primary/20" },
  removed: { label: "Removed", tone: "bg-rose-50 text-rose-800 border-rose-200" },
  changed: { label: "Changed", tone: "bg-amber-50 text-amber-800 border-amber-200" },
};

function lineText(l: AmendmentLine, money: (n: number | null) => string | null) {
  const price = money(l.unitPrice);
  return `${l.quantity}${price ? ` × ${price}` : ""}`;
}

function ChangeList({ title, changes, money }: { title: string; changes: AmendmentLineChange[]; money: (n: number | null) => string | null }) {
  if (changes.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      <ul className="space-y-1.5">
        {changes.map((c, i) => {
          const k = KIND_TEXT[c.kind];
          return (
            <li key={`${c.name}-${i}`} className="flex flex-wrap items-start gap-2 text-sm">
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${k.tone}`}>{k.label}</span>
              <span className="min-w-0 flex-1 break-words text-slate-700 dark:text-slate-300">
                <strong className="text-slate-900 dark:text-white">{c.name}</strong>
                {c.kind === "added" && c.after && <> - {lineText(c.after, money)}</>}
                {c.kind === "removed" && c.before && <> - was {lineText(c.before, money)}</>}
                {c.kind === "changed" && c.before && c.after && (
                  <> - <span className="line-through">{lineText(c.before, money)}</span> → <strong className="text-slate-900 dark:text-white">{lineText(c.after, money)}</strong></>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RequestedList({ title, lines, money }: { title: string; lines: AmendmentLine[]; money: (n: number | null) => string | null }) {
  if (lines.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      <ul className="space-y-1 text-sm">
        {lines.map((l, i) => (
          <li key={`${l.name}-${i}`} className="break-words text-slate-700 dark:text-slate-300">
            <strong className="text-slate-900 dark:text-white">{l.name}</strong> - {lineText(l, money)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Row-level summary: "Removed **Baby Potatoes** · Added **Green Salad** (28 ...)". */
export function AmendmentInlineSummary({ proposed, before, max = 4, asList = false }: { proposed: any; before: any; max?: number; asList?: boolean }) {
  const phrases = summaryPhrases(summariseAmendment(proposed, before));
  if (phrases.length === 0) return null;
  if (asList) {
    return (
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-800 dark:text-slate-200">
        {phrases.map((p, i) => (
          <li key={i} className="break-words">
            {p.verb} <strong className="font-semibold text-slate-900 dark:text-white">{p.subject}</strong>
            {p.rest ? ` ${p.rest}` : ""}
          </li>
        ))}
      </ul>
    );
  }
  const shown = phrases.slice(0, max);
  return (
    <p className="mt-1 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
      {shown.map((p, i) => (
        <span key={i}>
          {i > 0 && <span className="text-slate-400"> · </span>}
          {p.verb} <strong className="font-semibold text-slate-900 dark:text-white">{p.subject}</strong>
          {p.rest ? ` ${p.rest}` : ""}
        </span>
      ))}
      {phrases.length > max && <span className="text-slate-500"> · and {phrases.length - max} more</span>}
    </p>
  );
}

function NextSteps({ steps }: { steps: ReturnType<typeof amendmentNextSteps> }) {
  if (steps.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
      <p className="mb-1.5 text-sm font-semibold text-slate-900 dark:text-white">What the team should do</p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-800 dark:text-slate-200">
        {steps.map((s, i) => (
          <li key={i} className="break-words">
            {s.lead}
            {s.items.length > 0 && (
              <>
                {" "}
                {s.items.map((it, j) => (
                  <span key={j}>
                    {j > 0 && (j === s.items.length - 1 ? " and " : ", ")}
                    <strong>{it}</strong>
                  </span>
                ))}
                .
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
