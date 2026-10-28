/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC Wave F: communications log scoped to this order.
 *
 * Unifies three sources into one chronological feed:
 *  - notifications (in-portal toasts + linked-entity feed)
 *  - outgoing_email_queue (transactional emails, status lifecycle)
 *  - (whatsapp_messages table not present yet - placeholder)
 *
 * The operator answers "did the client get the order_ready email?"
 * in one scan. Failed sends surface a rose row with the error.
 *
 * Admin-tier only - this is operational oversight, staff don't need
 * to see the email queue.
 */
import { useEffect, useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/observability";
import { useAuth } from "@/contexts/AuthContext";
import { canSeeOtherStaffPay } from "@/lib/authGuards";
import { UserRole } from "@/types/app";
import { MessageSquare, Mail, Bell, Loader2, CheckCircle2, AlertCircle, Clock, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AmendmentDetailsDialog, AmendmentInlineSummary } from "./AmendmentDetailsDialog";

interface Props {
  orderId: string;
  companyId: string;
  defaultOpen?: boolean;
  forceOpen?: boolean;
}

interface CommsEvent {
  id: string;
  kind: "notification" | "email";
  title: string;
  detail: string | null;
  recipient: string | null;
  status: "sent" | "queued" | "failed" | "info";
  created_at: string;
  /** About a client change request (amendment) on this order. */
  aboutAmendment?: boolean;
}

const isAmendmentText = (...parts: Array<string | null | undefined>) =>
  parts.some((p) => !!p && /amend|change request/i.test(p));

function rel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = ms / 60_000;
  if (m < 60) return `${Math.max(0, Math.round(m))}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function CommsLogSection({ orderId, companyId, defaultOpen, forceOpen }: Props) {
  const { user } = useAuth();
  const canSee = canSeeOtherStaffPay(user?.role as UserRole | undefined);
  const [events, setEvents] = useState<CommsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<CommsEvent | null>(null);
  const [showAmendment, setShowAmendment] = useState<string | null>(null);
  // Change requests on this order, so amendment messages can say what changed.
  const [amendments, setAmendments] = useState<Array<{ id: string; proposed: any; before: any; requestedAt: number }>>([]);

  useEffect(() => {
    if (!canSee) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [notifRes, emailRes] = await Promise.all([
          (supabase as any)
            .from("notifications")
            .select("id, title, message, type, notification_type, target_role, channels, is_read, created_at")
            .eq("company_id", companyId)
            .eq("related_entity_type", "order")
            .eq("related_entity_id", orderId)
            .order("created_at", { ascending: false })
            .limit(50),
          (supabase as any)
            .from("outgoing_email_queue")
            .select("id, subject, to_email, to_name, status, template_type, trigger_event, sent_at, created_at, error_message, scheduled_for")
            .eq("company_id", companyId)
            .eq("trigger_ref_id", orderId)
            .order("created_at", { ascending: false })
            .limit(50),
        ]);
        if (cancelled) return;
        const merged: CommsEvent[] = [];
        for (const n of (notifRes.data || []) as any[]) {
          merged.push({
            id: `n:${n.id}`,
            kind: "notification",
            title: n.title || n.notification_type || "Notification",
            detail: n.message || null,
            recipient: n.target_role ? `→ ${n.target_role}` : null,
            status: "info",
            created_at: n.created_at,
            aboutAmendment: isAmendmentText(n.notification_type, n.title),
          });
        }
        for (const e of (emailRes.data || []) as any[]) {
          let status: CommsEvent["status"] = "queued";
          if (e.status === "sent" || e.sent_at) status = "sent";
          else if (e.status === "failed" || e.error_message) status = "failed";
          merged.push({
            id: `e:${e.id}`,
            kind: "email",
            title: e.subject || e.template_type || e.trigger_event || "Email",
            detail: e.error_message || null,
            recipient: e.to_name ? `${e.to_name} <${e.to_email}>` : e.to_email,
            status,
            created_at: e.sent_at || e.created_at,
          });
        }
        merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        if (!cancelled) setEvents(merged);
        if (merged.some((m) => m.aboutAmendment)) {
          const { data: reqs } = await (supabase as any)
            .from("order_amendment_requests")
            .select("id, proposed_changes, applied_snapshot, requested_at")
            .eq("order_id", orderId)
            .order("requested_at", { ascending: false });
          if (!cancelled) {
            setAmendments(((reqs || []) as any[]).map((r) => ({
              id: r.id,
              proposed: r.proposed_changes,
              before: r.applied_snapshot?.before ?? null,
              requestedAt: new Date(r.requested_at).getTime(),
            })));
          }
        }
      } catch (e: any) {
        captureException(e, { tags: { route: "/order/[id]", step: "loadCommsLog", orderId, companyId } });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, companyId, canSee]);

  if (!canSee) return null;

  // The change request a message is about: the latest one made before it was sent.
  const amendmentFor = (e: CommsEvent | null) => {
    if (!e?.aboutAmendment) return null;
    const at = new Date(e.created_at).getTime() + 60_000;
    return amendments.find((a) => a.requestedAt <= at) || null;
  };

  const failedCount = events.filter((e) => e.status === "failed").length;
  const summary = loading
    ? "Loading..."
    : events.length === 0
      ? "No messages sent yet"
      : `${events.length} message${events.length === 1 ? "" : "s"}${failedCount ? ` · ${failedCount} failed` : ""}`;

  return (
    <CollapsibleSection
      id="section-comms"
      title="Communications"
      summary={summary}
      icon={MessageSquare}
      accent="purple"
      defaultOpen={defaultOpen}
      forceOpen={forceOpen}
    >
      {loading ? (
        <div className="flex items-center justify-center py-6 text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading comms log...
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-slate-500 py-2">
          No emails or notifications recorded against this order yet. Transactional comms (deposit confirmation, order_ready, etc) will appear here as they go out.
        </p>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => {
            const Icon = e.kind === "email" ? Mail : Bell;
            const statusTone =
              e.status === "sent" ? "bg-brand-primary/10 border-brand-primary/20" :
              e.status === "failed" ? "bg-rose-50 border-rose-300" :
              e.status === "queued" ? "bg-amber-50 border-amber-200" :
              "bg-slate-50 border-slate-200";
            const StatusIcon =
              e.status === "sent" ? CheckCircle2 :
              e.status === "failed" ? AlertCircle :
              e.status === "queued" ? Clock :
              Bell;
            const statusColor =
              e.status === "sent" ? "text-brand-primary" :
              e.status === "failed" ? "text-rose-700" :
              e.status === "queued" ? "text-amber-700" :
              "text-slate-600";
            return (
              <li key={e.id} className={`flex items-start gap-3 p-2.5 rounded-md border ${statusTone}`}>
                <Icon className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900">{e.title}</p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                    <span className={`text-[10px] uppercase tracking-wider font-semibold inline-flex items-center gap-1 ${statusColor}`}>
                      <StatusIcon className="w-3 h-3" />{e.status}
                    </span>
                    {e.recipient && <span className="text-xs text-slate-600 truncate">{e.recipient}</span>}
                  </div>
                  {amendmentFor(e) && (
                    <AmendmentInlineSummary proposed={amendmentFor(e)!.proposed} before={amendmentFor(e)!.before} max={3} />
                  )}
                  {e.detail && (
                    <p className={`text-xs mt-1 line-clamp-2 break-words ${e.status === "failed" ? "text-rose-800 font-medium" : "text-slate-600"}`}>
                      {e.detail}
                    </p>
                  )}
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-1">
                  <span className="text-[10px] text-slate-400 tabular-nums mt-0.5" title={new Date(e.created_at).toLocaleString("en-ZA")}>
                    {rel(e.created_at)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setViewing(e)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-white hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
                    aria-label={`Read the full message: ${e.title}`}
                    title="Read the full message"
                  >
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={!!viewing} onOpenChange={(o) => { if (!o) setViewing(null); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="break-words pr-6">{viewing?.title}</DialogTitle>
            <DialogDescription>
              {viewing?.kind === "email" ? "Email" : "Team notification"}
              {" · "}<strong className="capitalize">{viewing?.status === "info" ? "Recorded" : viewing?.status}</strong>
              {viewing ? ` · ${new Date(viewing.created_at).toLocaleString("en-ZA")}` : ""}
            </DialogDescription>
          </DialogHeader>
          {viewing?.recipient && (
            <p className="break-words text-sm text-slate-700 dark:text-slate-300">
              <strong className="text-slate-900 dark:text-white">{viewing.kind === "email" ? "Sent to: " : "For: "}</strong>
              {viewing.recipient.replace(/^→\s*/, "").replace(/_/g, " ")}
            </p>
          )}
          {amendmentFor(viewing) && (
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">What changed</p>
              <AmendmentInlineSummary proposed={amendmentFor(viewing)!.proposed} before={amendmentFor(viewing)!.before} asList />
            </div>
          )}
          {viewing?.detail ? (
            <div className={`rounded-lg p-3 text-sm ${viewing.status === "failed" ? "bg-rose-50 text-rose-900" : "bg-slate-50 text-slate-800 dark:bg-slate-800 dark:text-slate-200"}`}>
              <p className="mb-1 font-semibold">{viewing.status === "failed" ? "Why it failed" : "Message"}</p>
              <p className="whitespace-pre-wrap break-words">{viewing.detail}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-600">No message text was saved for this {viewing?.kind === "email" ? "email" : "notification"}.</p>
          )}
          {viewing?.aboutAmendment && (
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => { setShowAmendment(amendmentFor(viewing)?.id || "all"); setViewing(null); }}>
              See the full change request
            </Button>
          )}
        </DialogContent>
      </Dialog>

      <AmendmentDetailsDialog
        open={!!showAmendment}
        onOpenChange={(o) => { if (!o) setShowAmendment(null); }}
        orderId={orderId}
        companyId={companyId}
        requestId={showAmendment && showAmendment !== "all" ? showAmendment : null}
      />
    </CollapsibleSection>
  );
}
