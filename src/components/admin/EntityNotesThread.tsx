/**
 * EntityNotesThread - generic chronological notes thread for any
 * entity in the system, backed by audit_logs.
 *
 * Phase 16 #1. Phase 9 #6 shipped OrderNotesThread bound to
 * entity_type='order'. The same UI pattern is useful on quote,
 * invoice, lead etc. - we want one component, not five copies.
 *
 * Backed by audit_logs (action={actionPrefix}_added,
 * entity_type={entityType}, entity_id={entityId},
 * details={body, author_name}). Reuses the audit_logs RLS
 * policies so company admins see only their own tenant's notes.
 * No schema migration required.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { MessageSquare, Loader2, Send, LockKeyhole, UserRound } from "lucide-react";
import { notificationService } from "@/services/notificationService";
import { UserRole } from "@/types/app";

interface NoteRow {
  id: string;
  created_at: string;
  user_id: string | null;
  details: any;
}

interface ProfileLite {
  id: string;
  full_name: string | null;
  email: string | null;
}

const fmtTs = (iso: string) =>
  new Date(iso).toLocaleString("en-ZA", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });

export function EntityNotesThread({
  entityType,
  entityId,
  companyId,
  actionPrefix,
  placeholder,
  entityLabel,
}: {
  /** audit_logs.entity_type value (order, quote, invoice, lead, etc). */
  entityType: string;
  /** audit_logs.entity_id (the row's UUID). */
  entityId: string;
  /** Tenant id for the insert. */
  companyId: string | null;
  /** Defaults to `${entityType}_note`. The audit row writes
   *  `${actionPrefix}_added`. Keeps backwards compat with existing
   *  'order_note_added' rows when overridden explicitly. */
  actionPrefix?: string;
  placeholder?: string;
  /** Friendly label used in the admin notification message. */
  entityLabel?: string;
}) {
  const { user } = useAuth() as any;
  const action = `${actionPrefix || `${entityType}_note`}_added`;
  const [rows, setRows] = useState<NoteRow[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, ProfileLite>>({});
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    if (!entityId) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("audit_logs")
        .select("id, created_at, user_id, details")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .eq("action", action)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        console.error("[EntityNotesThread] audit_logs fetch failed:", error);
      }
      const list = (data || []) as NoteRow[];
      setRows(list);
      const userIds = Array.from(new Set(list.map((r) => r.user_id).filter(Boolean) as string[]));
      const missing = userIds.filter((id) => !profileMap[id]);
      if (missing.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", missing);
        if (profilesError) {
          console.error("[EntityNotesThread] profiles fetch failed:", profilesError);
        }
        if (profiles) {
          const next = { ...profileMap };
          for (const p of profiles as any[]) next[p.id] = p as ProfileLite;
          setProfileMap(next);
        }
      }
    } catch {
      /* fall through with empty list */
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId, action]);

  useEffect(() => {
    void load();
  }, [load]);

  // Notes should feel collaborative while several operators are working
  // the same quote. The payload is only used as a refresh trigger; the
  // actual note content still comes through the tenant-scoped query above.
  useEffect(() => {
    if (!entityId) return;
    const channel = (supabase as any)
      .channel(`entity-notes:${entityType}:${entityId}:${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_logs", filter: `entity_id=eq.${entityId}` },
        (payload: any) => {
          if (payload?.new?.entity_type === entityType && payload?.new?.action === action) void load();
        },
      )
      .subscribe();
    return () => { (supabase as any).removeChannel(channel); };
  }, [entityType, entityId, action, load]);

  const post = async () => {
    const trimmed = body.trim();
    if (!trimmed || !companyId || !entityId) return;
    setPosting(true);
    try {
      const authorName = user?.full_name || user?.email || "Unknown admin";
      const { error } = await (supabase as any).from("audit_logs").insert({
        company_id: companyId,
        user_id: user?.id ?? null,
        action,
        entity_type: entityType,
        entity_id: entityId,
        details: { body: trimmed, author_name: authorName },
      });
      if (error) throw error;
      setBody("");
      void load();
      if (entityType === "quote") {
        void notificationService.broadcastNotification({
          companyId,
          type: "quote_internal_note",
          title: "New internal quote note",
          message: `A team member added an internal note to ${entityLabel || "a quote"}.`,
          targetRoles: [UserRole.OWNER, UserRole.COMPANY_ADMIN, UserRole.ADMIN, UserRole.SALES_ADMIN, UserRole.REGION_ADMIN],
          priority: "normal",
          link: `/admin/quotes/${entityId}`,
          relatedEntityType: entityType,
          relatedEntityId: entityId,
        }).catch((error) => console.warn("[EntityNotesThread] note notification failed:", error));
      }
    } catch (e) {
      console.warn("[EntityNotesThread] post failed:", e);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-indigo-50/40 p-4 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
            <MessageSquare className="w-4 h-4" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-800">Notes thread</span>
              {rows.length > 0 && <span className="text-xs text-slate-500">{rows.length}</span>}
            </div>
            <p className="text-[11px] text-slate-500">Team-only conversation and audit trail</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-white/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
          <LockKeyhole className="h-3 w-3" /> Internal only
        </span>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-inner">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder={placeholder || "Write an internal note for the team…"}
          className="min-h-[76px] resize-none border-0 bg-transparent text-sm shadow-none focus-visible:ring-0"
        />
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-2 pt-2">
          <span className="text-[11px] text-slate-400">Only admins and authorized team members can see this.</span>
          <Button onClick={post} disabled={posting || !body.trim()} size="sm" className="gap-1.5 rounded-lg">
            {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span className="hidden sm:inline">Send note</span>
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-slate-400 text-center py-3">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white/70 px-4 py-6 text-xs text-slate-400 text-center">
          No notes yet. Start the team conversation above.
        </p>
      ) : (
        <ul className="space-y-3 max-h-80 overflow-y-auto pr-1">
          {rows.map((r) => {
            const author =
              r.details?.author_name
              || (r.user_id && profileMap[r.user_id]?.full_name)
              || (r.user_id && profileMap[r.user_id]?.email)
              || "Unknown";
            const mine = r.user_id && r.user_id === user?.id;
            return (
              <li key={r.id} className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                {!mine && <span className="mb-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500"><UserRound className="h-3.5 w-3.5" /></span>}
                <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${mine ? "rounded-br-md bg-indigo-600 text-white" : "rounded-bl-md border border-slate-200 bg-white text-slate-700"}`}>
                  <div className={`mb-1 flex items-baseline justify-between gap-3 text-[11px] ${mine ? "text-indigo-100" : "text-slate-500"}`}>
                    <span className={`font-semibold ${mine ? "text-white" : "text-slate-800"}`}>{mine ? "You" : author}</span>
                    <span className="tabular-nums">{fmtTs(r.created_at)}</span>
                  </div>
                  <p className="whitespace-pre-wrap leading-relaxed">{r.details?.body || ""}</p>
                </div>
                {mine && <span className="mb-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700"><UserRound className="h-3.5 w-3.5" /></span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
