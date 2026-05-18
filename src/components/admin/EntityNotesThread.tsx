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
import { MessageSquare, Loader2, Send } from "lucide-react";

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
    } catch (e) {
      console.warn("[EntityNotesThread] post failed:", e);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-slate-500" />
        <span className="text-sm font-semibold text-slate-700">
          Notes thread
          {rows.length > 0 && <span className="ml-1 text-xs font-normal text-slate-500">({rows.length})</span>}
        </span>
      </div>

      <div className="flex gap-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder={placeholder || "Add an internal note. Visible to admins only - audit logged."}
          className="text-sm"
        />
        <Button
          onClick={post}
          disabled={posting || !body.trim()}
          size="sm"
          className="self-end"
        >
          {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>

      {loading ? (
        <p className="text-xs text-slate-400 text-center py-3">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-3">
          No notes yet. The first one starts the thread.
        </p>
      ) : (
        <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {rows.map((r) => {
            const author =
              r.details?.author_name
              || (r.user_id && profileMap[r.user_id]?.full_name)
              || (r.user_id && profileMap[r.user_id]?.email)
              || "Unknown";
            return (
              <li key={r.id} className="rounded-md border border-slate-200 bg-slate-50 p-2.5 text-sm">
                <div className="flex items-baseline justify-between gap-3 mb-0.5">
                  <span className="font-medium text-slate-800 text-xs">{author}</span>
                  <span className="text-[11px] text-slate-500 tabular-nums">{fmtTs(r.created_at)}</span>
                </div>
                <p className="text-slate-700 whitespace-pre-wrap">{r.details?.body || ""}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
