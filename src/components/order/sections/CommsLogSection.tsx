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
import { MessageSquare, Mail, Bell, Loader2, CheckCircle2, AlertCircle, Clock } from "lucide-react";

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
}

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
      } catch (e: any) {
        captureException(e, { tags: { route: "/order/[id]", step: "loadCommsLog", orderId, companyId } });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, companyId, canSee]);

  if (!canSee) return null;

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
                  {e.detail && (
                    <p className={`text-xs mt-1 ${e.status === "failed" ? "text-rose-800 font-medium" : "text-slate-600"}`}>
                      {e.detail.length > 200 ? `${e.detail.slice(0, 200)}...` : e.detail}
                    </p>
                  )}
                </div>
                <span className="text-[10px] text-slate-400 tabular-nums flex-shrink-0 mt-0.5" title={new Date(e.created_at).toLocaleString("en-ZA")}>
                  {rel(e.created_at)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </CollapsibleSection>
  );
}
