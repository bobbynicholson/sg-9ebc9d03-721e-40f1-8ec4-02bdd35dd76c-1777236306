/**
 * OrderManualFollowupsPanel - Wave 70.49c
 *
 * Surfaces the "things the system couldn't do itself" follow-up list
 * produced by releaseOrderResources() (Wave 70.48 + 70.49). Today
 * those are:
 *   - notify_hire_supplier  - 3rd-party rentals we cancelled in our
 *                              DB; supplier still needs a phone call
 *                              / email so they don't deliver
 *                              equipment we no longer need.
 *   - notify_outsource_provider - outsourced caterers we cancelled
 *                              who otherwise show up to the kitchen.
 *
 * Reads the latest audit_logs row for the order with
 * action='order_cancelled'; extracts details.release_receipt.lines[]
 * .followups; renders as a checklist. Completion is tracked via a
 * parallel audit_logs row with action='manual_followup_completed' +
 * details.followup_ref_id matching the original entry.
 *
 * Why audit_logs and not a new table:
 *   - Zero schema migration
 *   - Multi-operator safe (rows survive page refresh + sync via DB)
 *   - The audit trail itself records WHO ticked each item + WHEN
 *   - Read-modify-write race is impossible because each completion
 *     is an INSERT not an UPDATE
 *
 * Renders nothing when there are no follow-ups required (the typical
 * case for orders cancelled without hire-in / outsource allocations).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Phone, Mail, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Followup {
  kind: "notify_hire_supplier" | "notify_outsource_provider";
  label: string;
  contact?: string | null;
  ref_id?: string;
  resource?: string;
}

interface Props {
  orderId: string;
}

const KIND_META: Record<Followup["kind"], { title: string; verb: string; tone: string }> = {
  notify_hire_supplier: {
    title: "Cancel hire-in with supplier",
    verb: "phone / email",
    tone: "border-amber-200 bg-amber-50",
  },
  notify_outsource_provider: {
    title: "Notify outsource provider",
    verb: "phone / email",
    tone: "border-rose-200 bg-rose-50",
  },
};

export function OrderManualFollowupsPanel({ orderId }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [completedRefIds, setCompletedRefIds] = useState<Set<string>>(new Set());
  const [completing, setCompleting] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);

  // Load the latest cancellation audit row + any completion entries.
  const load = async () => {
    setLoading(true);
    try {
      // Most-recent cancellation row - if the order was cancelled
      // multiple times (e.g. uncancelled then re-cancelled, rare but
      // possible), we surface the latest follow-ups.
      const { data: cancelRow } = await (supabase as any)
        .from("audit_logs")
        .select("details, company_id")
        .eq("entity_type", "order")
        .eq("entity_id", orderId)
        .eq("action", "order_cancelled")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!cancelRow) {
        setFollowups([]);
        setCompletedRefIds(new Set());
        return;
      }

      setCompanyId((cancelRow as any).company_id || null);
      const receipt = (cancelRow as any).details?.release_receipt;
      const collected: Followup[] = [];
      ((receipt?.lines as any[]) || []).forEach((line) => {
        if (Array.isArray(line.followups)) {
          line.followups.forEach((f: any) => {
            collected.push({
              kind: f.kind,
              label: f.label,
              contact: f.contact || null,
              ref_id: f.ref_id,
              resource: line.resource,
            });
          });
        }
      });
      setFollowups(collected);

      // Pull completion audits for THIS order so checked-off items
      // persist across refreshes + across operators.
      if (collected.length > 0) {
        const { data: completions } = await (supabase as any)
          .from("audit_logs")
          .select("details")
          .eq("entity_type", "order")
          .eq("entity_id", orderId)
          .eq("action", "manual_followup_completed");
        const done = new Set<string>();
        ((completions as any[]) || []).forEach((c) => {
          const ref = c.details?.followup_ref_id;
          if (ref) done.add(String(ref));
        });
        setCompletedRefIds(done);
      } else {
        setCompletedRefIds(new Set());
      }
    } catch (e) {
      console.warn("[OrderManualFollowupsPanel] load failed:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [orderId]);

  const markDone = async (followup: Followup) => {
    if (!followup.ref_id || !companyId) return;
    setCompleting(followup.ref_id);
    try {
      const { error } = await (supabase as any).from("audit_logs").insert({
        company_id: companyId,
        user_id: (user as any)?.id ?? null,
        action: "manual_followup_completed",
        entity_type: "order",
        entity_id: orderId,
        details: {
          followup_ref_id: followup.ref_id,
          followup_kind: followup.kind,
          followup_label: followup.label,
          followup_resource: followup.resource,
        },
      });
      if (error) throw error;
      setCompletedRefIds((prev) => new Set(prev).add(followup.ref_id!));
      toast({ title: "Marked done", description: followup.label });
    } catch (e: any) {
      toast({
        title: "Couldn't mark done",
        description: e?.message || "Try again",
        variant: "destructive",
      });
    } finally {
      setCompleting(null);
    }
  };

  const pendingCount = useMemo(
    () => followups.filter((f) => !f.ref_id || !completedRefIds.has(f.ref_id)).length,
    [followups, completedRefIds],
  );

  if (loading) return null; // silent on load - avoids layout flash
  if (followups.length === 0) return null; // nothing to surface - panel doesn't render

  return (
    <Card className={pendingCount > 0 ? "border-amber-300" : "border-brand-primary/20"}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          {pendingCount > 0 ? (
            <>
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Manual follow-ups required</span>
              <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 ml-auto">
                {pendingCount} pending
              </Badge>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 text-brand-primary" />
              <span>All follow-ups complete</span>
              <Badge variant="outline" className="bg-brand-primary/15 text-brand-primary border-brand-primary/30 ml-auto">
                {followups.length} done
              </Badge>
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-xs text-slate-600 mb-3">
          The system cancelled these allocations on our side but couldn't notify the 3rd party automatically (per policy - cancellation fees / accept-link UX issues). One quick call each.
        </p>
        <ul className="space-y-2">
          {followups.map((f, i) => {
            const isDone = f.ref_id ? completedRefIds.has(f.ref_id) : false;
            const meta = KIND_META[f.kind];
            return (
              <li
                key={f.ref_id || `${f.kind}-${i}`}
                className={`flex items-start gap-3 p-3 rounded border ${isDone ? "border-brand-primary/20 bg-brand-primary/10" : meta.tone}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                      {meta.title}
                    </span>
                    {isDone && (
                      <Badge variant="outline" className="bg-brand-primary/15 text-brand-primary border-brand-primary/20 text-[10px]">
                        Done
                      </Badge>
                    )}
                  </div>
                  <p className={`text-sm font-medium ${isDone ? "text-slate-500 line-through" : "text-slate-900"}`}>
                    {f.label}
                  </p>
                  {f.contact && (
                    <div className="flex items-center gap-2 mt-1">
                      {/^[+\d\s\-()]+$/.test(f.contact) ? (
                        <a
                          href={`tel:${f.contact.replace(/[^+\d]/g, "")}`}
                          className="text-xs inline-flex items-center gap-1 text-blue-700 hover:underline"
                        >
                          <Phone className="w-3 h-3" />
                          {f.contact}
                        </a>
                      ) : (
                        <a
                          href={`mailto:${f.contact}`}
                          className="text-xs inline-flex items-center gap-1 text-blue-700 hover:underline"
                        >
                          <Mail className="w-3 h-3" />
                          {f.contact}
                        </a>
                      )}
                      <span className="text-[10px] text-slate-500">({meta.verb})</span>
                    </div>
                  )}
                </div>
                {!isDone && f.ref_id && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => markDone(f)}
                    disabled={completing === f.ref_id}
                    className="flex-shrink-0"
                  >
                    {completing === f.ref_id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        Mark done
                      </>
                    )}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
