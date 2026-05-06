/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Sticky change-request side panel for the admin quote detail page.
 *
 * Bobby's brief: while pricing a quote that came back from a client
 * with "please change X" feedback, the request itself must stay in
 * the operator's peripheral vision the whole time. Not collapsed,
 * not behind an accordion, not below the fold once they scroll
 * down to the menu items. This component renders the pending
 * messages as a sticky sidebar on wide viewports and a dockable
 * floating card on narrower ones.
 *
 * State + handlers stay in the parent page so the existing
 * Supabase mutations and toast feedback don't fork. We're a
 * pure-render component plus a little local UI state for the
 * collapse/expand behaviour when nothing is pending.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  MessageSquare, CheckCircle2, X as XIcon, Reply,
  Loader2, ChevronDown, ChevronUp, History,
} from "lucide-react";

export type ChangeReq = {
  id: string;
  message: string;
  requested_changes: any;
  status: string;
  submitter_name: string | null;
  addressed_at: string | null;
  created_at: string;
};

interface Props {
  requests: ChangeReq[];
  clientNameFallback: string | null;
  highlightId: string | null;
  onMarkAddressed: (id: string) => void;
  onDismiss: (id: string) => void;
  onReply: (req: ChangeReq) => void;
  updatingId: string | null;
  // The notification deep-link asks us to be open on first paint.
  // The parent computes that from window.location and passes it in.
  forceOpen: boolean;
}

function formatTs(ts: string) {
  return new Date(ts).toLocaleString("en-ZA", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export function ChangeRequestPanel({
  requests,
  clientNameFallback,
  highlightId,
  onMarkAddressed,
  onDismiss,
  onReply,
  updatingId,
  forceOpen,
}: Props) {
  const pending = useMemo(
    () => requests.filter((r) => r.status === "pending"),
    [requests],
  );
  const history = useMemo(
    () => requests.filter((r) => r.status !== "pending"),
    [requests],
  );

  // Collapsed history list expands on demand. forceOpen wins on the
  // first render so a notification deep-link always lands on an
  // expanded panel, even if everything's already addressed.
  const [historyOpen, setHistoryOpen] = useState<boolean>(forceOpen);
  useEffect(() => {
    if (forceOpen) setHistoryOpen(true);
  }, [forceOpen]);

  // Highlight ring on the targeted request. We re-trigger the ring
  // animation whenever the highlightId changes by remounting via key.
  const highlightRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!highlightId) return;
    const el = highlightRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId, requests.length]);

  if (requests.length === 0) return null;

  // No pending requests -- collapse to a small toggle. Operator can
  // still pull up the history if they need to revisit something.
  if (pending.length === 0) {
    return (
      <aside
        id="change-requests"
        className="lg:sticky lg:top-20"
        aria-label="Client change-request history"
      >
        <button
          type="button"
          onClick={() => setHistoryOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          <span className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            View change-request history ({history.length})
          </span>
          {historyOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {historyOpen && (
          <div className="mt-2 space-y-2">
            {history.map((req) => (
              <RequestCard
                key={req.id}
                req={req}
                clientNameFallback={clientNameFallback}
                isHighlighted={req.id === highlightId}
                highlightRef={req.id === highlightId ? highlightRef : null}
                onMarkAddressed={onMarkAddressed}
                onDismiss={onDismiss}
                onReply={onReply}
                updatingId={updatingId}
                dimmed
              />
            ))}
          </div>
        )}
      </aside>
    );
  }

  return (
    <aside
      id="change-requests"
      className="lg:sticky lg:top-20"
      aria-label="Client change requests"
    >
      <div className="rounded-xl border border-blue-200 bg-blue-50/60 shadow-sm">
        <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
          <h2 className="text-sm font-semibold text-blue-900 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-blue-600" />
            Client wants you to change something
          </h2>
          <Badge className="bg-blue-600 text-white border-0">
            {pending.length} new
          </Badge>
        </div>
        <p className="px-4 text-[11px] text-blue-700/80">
          Edit the quote on the left -- this stays in view so you can refer back.
        </p>
        <div className="p-3 space-y-3 max-h-[70vh] overflow-y-auto">
          {pending.map((req) => (
            <RequestCard
              key={req.id}
              req={req}
              clientNameFallback={clientNameFallback}
              isHighlighted={req.id === highlightId}
              highlightRef={req.id === highlightId ? highlightRef : null}
              onMarkAddressed={onMarkAddressed}
              onDismiss={onDismiss}
              onReply={onReply}
              updatingId={updatingId}
            />
          ))}
        </div>

        {history.length > 0 && (
          <div className="border-t border-blue-100 bg-white/60 rounded-b-xl">
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-2 px-4 py-2 text-xs text-slate-600 hover:bg-slate-50"
            >
              <span className="flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" />
                History ({history.length})
              </span>
              {historyOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {historyOpen && (
              <div className="px-3 pb-3 space-y-2">
                {history.map((req) => (
                  <RequestCard
                    key={req.id}
                    req={req}
                    clientNameFallback={clientNameFallback}
                    isHighlighted={req.id === highlightId}
                    highlightRef={req.id === highlightId ? highlightRef : null}
                    onMarkAddressed={onMarkAddressed}
                    onDismiss={onDismiss}
                    onReply={onReply}
                    updatingId={updatingId}
                    dimmed
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

interface CardProps {
  req: ChangeReq;
  clientNameFallback: string | null;
  isHighlighted: boolean;
  highlightRef: React.RefObject<HTMLDivElement> | null;
  onMarkAddressed: (id: string) => void;
  onDismiss: (id: string) => void;
  onReply: (req: ChangeReq) => void;
  updatingId: string | null;
  dimmed?: boolean;
}

function RequestCard({
  req, clientNameFallback, isHighlighted, highlightRef,
  onMarkAddressed, onDismiss, onReply, updatingId, dimmed,
}: CardProps) {
  const isPending = req.status === "pending";
  const rc = req.requested_changes || {};
  const baseRing = isHighlighted
    ? "ring-2 ring-amber-400 ring-offset-2 ring-offset-blue-50 animate-pulse-once"
    : "";
  const palette = isPending
    ? "border-blue-200 bg-white"
    : "border-slate-200 bg-slate-50/80";
  const dim = dimmed ? "opacity-80" : "";

  return (
    <div
      ref={highlightRef ?? undefined}
      className={`rounded-lg border p-3 ${palette} ${dim} ${baseRing}`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <span className="text-xs font-semibold text-slate-900">
          {req.submitter_name || clientNameFallback || "Client"}
        </span>
        <span className="text-[11px] text-slate-500">
          {formatTs(req.created_at)}
        </span>
      </div>

      <blockquote className="text-sm text-slate-800 whitespace-pre-wrap border-l-2 border-blue-300 pl-3 italic mb-3">
        {req.message}
      </blockquote>

      {(rc.event_date || rc.guest_count != null || rc.menu_changes) && (
        <div className="bg-slate-50 border border-slate-200 rounded-md p-2 mb-3 text-[11px] text-slate-700 space-y-0.5">
          {rc.event_date && (
            <div><span className="font-medium text-slate-500">New event date:</span> {rc.event_date}</div>
          )}
          {rc.guest_count != null && (
            <div><span className="font-medium text-slate-500">New guest count:</span> {rc.guest_count}</div>
          )}
          {rc.menu_changes && (
            <div><span className="font-medium text-slate-500">Menu tweak:</span> {rc.menu_changes}</div>
          )}
        </div>
      )}

      {isPending ? (
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            onClick={() => onMarkAddressed(req.id)}
            disabled={updatingId === req.id}
            className="bg-emerald-600 hover:bg-emerald-700 gap-1 h-7 text-[11px] px-2"
          >
            {updatingId === req.id
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <CheckCircle2 className="w-3 h-3" />}
            Mark addressed
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onReply(req)}
            className="gap-1 h-7 text-[11px] px-2"
          >
            <Reply className="w-3 h-3" />
            Reply
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDismiss(req.id)}
            disabled={updatingId === req.id}
            className="text-slate-600 gap-1 h-7 text-[11px] px-2"
          >
            <XIcon className="w-3 h-3" />
            Dismiss
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <Badge
            className={
              req.status === "addressed"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-200 text-slate-600"
            }
          >
            {req.status}
          </Badge>
          {req.status === "addressed" && req.addressed_at && (
            <span className="text-emerald-700">
              {formatTs(req.addressed_at)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
