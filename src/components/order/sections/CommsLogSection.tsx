/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ODOC Wave F: communications log scoped to this order.
 *
 * Unifies three sources into one chronological feed:
 *  - notifications (in-portal toasts + linked-entity feed)
 *  - outgoing_email_queue (transactional emails, status lifecycle)
 *  - whatsapp_messages (messages sent through the business account)
 *
 * The operator answers "did the client get the order_ready email?"
 * in one scan. Failed sends surface a rose row with the error.
 *
 * Admin-tier only - this is operational oversight, staff don't need
 * to see the email queue.
 */
import { useEffect, useState } from "react";
import { CollapsibleSection } from "./CollapsibleSection";
import { WhatsAppOrderSend } from "@/components/order/WhatsAppOrderSend";
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
  kind: "notification" | "email" | "whatsapp";
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
  const [reloadTick, setReloadTick] = useState(0);
  // Change requests on this order, so amendment messages can say what changed.
  const [amendments, setAmendments] = useState<Array<{ id: string; proposed: any; before: any; requestedAt: number }>>([]);

  useEffect(() => {
    if (!canSee) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [notifRes, emailRes, whatsappRes] = await Promise.all([
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
          (supabase as any)
            .from("whatsapp_messages")
            .select("id, recipient_name, recipient_phone, template_name, message_content, status, failure_reason, created_at, sent_at")
            .eq("company_id", companyId)
            .eq("related_entity_type", "order")
            .eq("related_entity_id", orderId)
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
        for (const w of (whatsappRes.data || []) as any[]) {
          merged.push({
            id: `w:${w.id}`,
            kind: "whatsapp",
            title: `WhatsApp: ${w.template_name || "message"}`,
            detail: w.failure_reason || w.message_content || null,
            recipient: w.recipient_name || w.recipient_phone,
            status: w.status === "failed" ? "failed" : w.status === "pending" || w.status === "sending" ? "queued" : "sent",
            created_at: w.sent_at || w.created_at,
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
  }, [orderId, companyId, canSee, reloadTick]);

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
      <div className="min-w-0 space-y-4 [overflow-wrap:anywhere]">
        <div className="print:hidden [&_button]:min-h-[44px] [&_button]:max-w-full [&_button]:whitespace-normal">
          <WhatsAppOrderSend orderId={orderId} companyId={companyId} onSent={() => setReloadTick((tick) => tick + 1)} />
        </div>
        {loading ? (
          <p role="status" className="flex items-center gap-2 py-4 text-sm text-slate-600">
            <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" /> Loading communications…
          </p>
        ) : events.length === 0 ? (
          <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">No messages or notifications recorded for this order.</p>
        ) : (
          <ul className="divide-y divide-slate-200 border-t border-slate-200" aria-label="Recent order communications">
            {events.map((event) => {
              const Icon = event.kind === "email" ? Mail : event.kind === "whatsapp" ? MessageSquare : Bell;
              const channel = event.kind === "email" ? "Email" : event.kind === "whatsapp" ? "WhatsApp" : "Team notification";
              const amendment = amendmentFor(event);
              const date = new Date(event.created_at);
              const StatusIcon = event.status === "sent" ? CheckCircle2 : event.status === "failed" ? AlertCircle : event.status === "queued" ? Clock : Bell;
              const statusTone = event.status === "failed" ? "bg-rose-50 text-rose-800"
                : event.status === "queued" ? "bg-amber-50 text-amber-900"
                : event.status === "sent" ? "bg-emerald-50 text-emerald-800"
                : "bg-slate-100 text-slate-700";
              return (
                <li key={event.id} className="min-w-0 space-y-2 py-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                      <Icon aria-hidden="true" className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold leading-snug text-slate-950">{event.title}</p>
                      <p className="mt-0.5 text-sm text-slate-600">{channel}</p>
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusTone}`}>
                      <StatusIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                      {event.status === "info" ? "Recorded" : event.status}
                    </span>
                    <time dateTime={event.created_at} className="tabular-nums" title={date.toLocaleString("en-ZA")}>{rel(event.created_at)}</time>
                  </div>
                  {event.recipient && <p className="text-sm text-slate-600">{event.recipient}</p>}
                  {amendment && <AmendmentInlineSummary proposed={amendment.proposed} before={amendment.before} max={3} />}
                  {event.detail && (
                    <p className={`line-clamp-2 text-sm ${event.status === "failed" ? "font-medium text-rose-800" : "text-slate-600"}`}>
                      {event.detail}
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setViewing(event)}
                    className="h-auto min-h-[44px] max-w-full whitespace-normal print:hidden"
                    aria-label={`Read details: ${event.title}`}
                  >
                    <Eye /> View details
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={!!viewing} onOpenChange={(o) => { if (!o) setViewing(null); }}>
        <DialogContent className="min-w-0 [overflow-wrap:anywhere] sm:max-w-xl">
          <DialogHeader className="min-w-0 pr-12 text-left">
            <DialogTitle>{viewing?.title}</DialogTitle>
            <DialogDescription>
              {viewing?.kind === "email" ? "Email" : viewing?.kind === "whatsapp" ? "WhatsApp message" : "Team notification"}
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
            <Button type="button" variant="outline" className="h-auto min-h-[44px] w-full whitespace-normal sm:w-auto" onClick={() => { setShowAmendment(amendmentFor(viewing)?.id || "all"); setViewing(null); }}>
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
