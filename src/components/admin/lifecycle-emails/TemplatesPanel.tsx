/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TemplatesPanel - Lifecycle Emails template editor.
 *
 * Edits rows in `email_templates` directly. Logic:
 *   - Reads global-default rows (company_id IS NULL) seeded by
 *     20260506130000_seed_email_templates.sql to drive the canonical
 *     list of template types every tenant gets.
 *   - For each type, looks for a tenant override row
 *     (company_id = currentCompany). If present, the operator is
 *     editing a customised version. If absent, they are about to
 *     create one (Save inserts a new row).
 *   - "Reset to default" deletes the tenant row so the resolver falls
 *     back to the global default seeded copy.
 *
 * The hub page itself (/admin/email-templates) is out of scope; this
 * component is just the panel content.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ComposeDrawerHost } from "@/components/messaging/ComposeDrawerHost";
import { Mail, Pencil, RotateCcw, Save, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface TemplateMeta {
  type: string;
  label: string;
  description: string;
  group: string;
  variables: Array<{ name: string; description: string; example: string }>;
}

/**
 * Friendly metadata per template_type. The backing rows live in DB but
 * the editor groups + describes them with this static map so a new
 * tenant who has never customised anything still sees a sensible list.
 */
const TEMPLATE_META: TemplateMeta[] = [
  {
    type: "quote_request_received",
    label: "Quote enquiry received",
    description: "Auto-reply when a client submits an enquiry through the embed form.",
    group: "Lead capture",
    variables: [
      { name: "first_name", description: "Client first name", example: "Sarah" },
      { name: "event_name", description: "Event name on the enquiry", example: "Birthday lunch" },
      { name: "event_date", description: "Event date", example: "12 June 2026" },
      { name: "tenant_name", description: "Your catering business name", example: "Capital Caterers" },
    ],
  },
  {
    type: "quote_sent",
    label: "Quote sent to client",
    description: "Sent when you publish or re-send a quote.",
    group: "Quote",
    variables: [
      { name: "first_name", description: "Client first name", example: "Sarah" },
      { name: "event_name", description: "Event name", example: "Birthday lunch" },
      { name: "tenant_name", description: "Your catering business name", example: "Capital Caterers" },
      { name: "total", description: "Quote total in ZAR", example: "12 500" },
      { name: "quote_link", description: "Public quote link", example: "https://app/q/abcd-1234" },
    ],
  },
  {
    type: "quote_accepted_client",
    label: "Quote accepted (to client)",
    description: "Confirmation to the client after they accept the quote.",
    group: "Quote",
    variables: [
      { name: "first_name", description: "Client first name", example: "Sarah" },
      { name: "event_name", description: "Event name", example: "Birthday lunch" },
      { name: "tenant_name", description: "Your catering business name", example: "Capital Caterers" },
      { name: "event_day_suffix", description: "Event date in brackets, blank when no date", example: " (12 June 2026)" },
    ],
  },
  {
    type: "quote_changes_requested",
    label: "Quote changes requested",
    description: "Sent when you re-issue a quote after client feedback.",
    group: "Quote",
    variables: [
      { name: "first_name", description: "Client first name", example: "Sarah" },
      { name: "event_name", description: "Event name", example: "Birthday lunch" },
      { name: "tenant_name", description: "Your catering business name", example: "Capital Caterers" },
      { name: "quote_link", description: "Public quote link", example: "https://app/q/abcd-1234" },
    ],
  },
  {
    type: "deposit_invoice_issued",
    label: "Deposit invoice issued",
    description: "First invoice after acceptance, locks in the date.",
    group: "Invoicing",
    variables: [
      { name: "first_name", description: "Client first name", example: "Sarah" },
      { name: "event_name", description: "Event name", example: "Birthday lunch" },
      { name: "tenant_name", description: "Your catering business name", example: "Capital Caterers" },
      { name: "deposit_amount", description: "Deposit amount", example: "5 000" },
      { name: "invoice_number", description: "Invoice number", example: "INV-000123" },
      { name: "invoice_link", description: "Direct link to the invoice", example: "https://app/client-portal/billing?invoiceId=..." },
    ],
  },
  {
    type: "balance_invoice_issued",
    label: "Balance invoice issued",
    description: "Final invoice once deposit has landed.",
    group: "Invoicing",
    variables: [
      { name: "first_name", description: "Client first name", example: "Sarah" },
      { name: "event_name", description: "Event name", example: "Birthday lunch" },
      { name: "tenant_name", description: "Your catering business name", example: "Capital Caterers" },
      { name: "balance_amount", description: "Balance amount", example: "7 500" },
      { name: "invoice_number", description: "Invoice number", example: "INV-000124" },
      { name: "invoice_link", description: "Direct link to the invoice", example: "https://app/client-portal/billing?invoiceId=..." },
    ],
  },
  {
    type: "invoice_issued",
    label: "Invoice issued (generic)",
    description: "Generic fallback when neither deposit nor balance is configured.",
    group: "Invoicing",
    variables: [
      { name: "first_name", description: "Client first name", example: "Sarah" },
      { name: "event_name", description: "Event name", example: "Birthday lunch" },
      { name: "tenant_name", description: "Your catering business name", example: "Capital Caterers" },
      { name: "amount", description: "Total amount", example: "R 12 500" },
      { name: "invoice_number", description: "Invoice number", example: "INV-000125" },
      { name: "invoice_link", description: "Direct link to the invoice", example: "https://app/client-portal/billing?invoiceId=..." },
    ],
  },
  {
    type: "deposit_payment_received",
    label: "Deposit payment received",
    description: "Receipt when the deposit lands.",
    group: "Payments",
    variables: [
      { name: "first_name", description: "Client first name", example: "Sarah" },
      { name: "event_name", description: "Event name", example: "Birthday lunch" },
      { name: "tenant_name", description: "Your catering business name", example: "Capital Caterers" },
      { name: "amount", description: "Amount received", example: "5 000" },
      { name: "invoice_number", description: "Invoice reference", example: "INV-000123" },
    ],
  },
  {
    type: "balance_payment_received",
    label: "Balance payment received",
    description: "Receipt when the balance lands.",
    group: "Payments",
    variables: [
      { name: "first_name", description: "Client first name", example: "Sarah" },
      { name: "event_name", description: "Event name", example: "Birthday lunch" },
      { name: "tenant_name", description: "Your catering business name", example: "Capital Caterers" },
      { name: "amount", description: "Amount received", example: "7 500" },
      { name: "invoice_number", description: "Invoice reference", example: "INV-000124" },
    ],
  },
  {
    type: "order_confirmed",
    label: "Order confirmed",
    description: "Sent when the order moves to confirmed status.",
    group: "Order lifecycle",
    variables: [
      { name: "first_name", description: "Client first name", example: "Sarah" },
      { name: "order_number", description: "Order number", example: "ORD-000045" },
      { name: "tenant_name", description: "Your catering business name", example: "Capital Caterers" },
      { name: "event_date_phrase", description: "Event date phrase, blank when none", example: " for 12 June" },
    ],
  },
  {
    type: "order_preparing",
    label: "Order in prep",
    description: "Reassurance email when the kitchen starts prep.",
    group: "Order lifecycle",
    variables: [
      { name: "first_name", description: "Client first name", example: "Sarah" },
      { name: "event_name", description: "Event name", example: "Birthday lunch" },
      { name: "tenant_name", description: "Your catering business name", example: "Capital Caterers" },
      { name: "event_date_phrase", description: "Event date phrase, blank when none", example: " for 12 June" },
    ],
  },
  {
    type: "order_ready",
    label: "Order ready for dispatch",
    description: "Prep finished, driver pickup next.",
    group: "Order lifecycle",
    variables: [
      { name: "first_name", description: "Client first name", example: "Sarah" },
      { name: "event_name", description: "Event name", example: "Birthday lunch" },
      { name: "tenant_name", description: "Your catering business name", example: "Capital Caterers" },
    ],
  },
  {
    type: "order_in_transit",
    label: "Order on the way",
    description: "Sent when the driver leaves the kitchen.",
    group: "Order lifecycle",
    variables: [
      { name: "first_name", description: "Client first name", example: "Sarah" },
      { name: "order_number", description: "Order number", example: "ORD-000045" },
      { name: "tenant_name", description: "Your catering business name", example: "Capital Caterers" },
      { name: "venue_phrase", description: "Venue phrase, blank when none", example: " to The Atrium" },
      { name: "eta_sentence", description: "ETA sentence (built from order)", example: "ETA: about 14:30." },
    ],
  },
  {
    type: "order_delivered",
    label: "Order delivered",
    description: "Confirmation after delivery, opens the door for review.",
    group: "Order lifecycle",
    variables: [
      { name: "first_name", description: "Client first name", example: "Sarah" },
      { name: "event_name", description: "Event name", example: "Birthday lunch" },
      { name: "order_number", description: "Order number", example: "ORD-000045" },
      { name: "tenant_name", description: "Your catering business name", example: "Capital Caterers" },
    ],
  },
  {
    type: "cancellation_approved",
    label: "Order cancelled",
    description: "Cancellation confirmation; refund paragraph injected dynamically.",
    group: "Cancellation / refund",
    variables: [
      { name: "first_name", description: "Client first name", example: "Sarah" },
      { name: "event_name", description: "Event name", example: "Birthday lunch" },
      { name: "order_number", description: "Order number", example: "ORD-000045" },
      { name: "tenant_name", description: "Your catering business name", example: "Capital Caterers" },
      { name: "event_date_label", description: "Event date phrase, blank when none", example: " for 12 June" },
      { name: "refund_paragraph", description: "Refund paragraph (auto-generated based on policy)", example: "A refund of R 1 000 is due..." },
    ],
  },
  {
    type: "postponement_approved",
    label: "Postponement approved",
    description: "Confirmation that the event date has moved.",
    group: "Cancellation / refund",
    variables: [
      { name: "first_name", description: "Client first name", example: "Sarah" },
      { name: "event_name", description: "Event name", example: "Birthday lunch" },
      { name: "tenant_name", description: "Your catering business name", example: "Capital Caterers" },
      { name: "new_date", description: "New event date", example: "26 June 2026" },
    ],
  },
  {
    type: "refund_paid",
    label: "Refund paid",
    description: "Receipt confirming the refund EFT has gone out.",
    group: "Cancellation / refund",
    variables: [
      { name: "first_name", description: "Client first name", example: "Sarah" },
      { name: "event_name", description: "Event name", example: "Birthday lunch" },
      { name: "order_number", description: "Order number", example: "ORD-000045" },
      { name: "tenant_name", description: "Your catering business name", example: "Capital Caterers" },
      { name: "amount", description: "Refund amount", example: "R 1 000" },
    ],
  },
  {
    type: "review_request",
    label: "Review request",
    description: "Sent a few days after delivery to ask for a review.",
    group: "Post-event",
    variables: [
      { name: "first_name", description: "Client first name", example: "Sarah" },
      { name: "event_name", description: "Event name", example: "Birthday lunch" },
      { name: "tenant_name", description: "Your catering business name", example: "Capital Caterers" },
      { name: "review_link", description: "Review link", example: "https://app/review/..." },
    ],
  },
];

interface RowState {
  meta: TemplateMeta;
  /** Subject + body that will go out - tenant override or global default. */
  subject: string;
  body: string;
  /** True when the tenant has its own row for this type. */
  isCustomised: boolean;
}

function useCompanyId(): string | null {
  const { user, profile } = useAuth() as any;
  return profile?.company_id ?? user?.company_id ?? null;
}

function substitute(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v);
  }
  return out;
}

export function TemplatesPanel() {
  const companyId = useCompanyId();
  const { toast } = useToast();
  const [rows, setRows] = useState<RowState[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<RowState | null>(null);
  const [filterGroup, setFilterGroup] = useState<string>("all");

  const reload = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      // Pull every row (tenant + global default) for the listed types
      // in one round trip. The OR filter is the most efficient way:
      // company_id = mine OR company_id IS NULL.
      const types = TEMPLATE_META.map((m) => m.type);
      const { data, error } = await (supabase as any)
        .from("email_templates")
        .select("template_type, company_id, subject, body, is_active")
        .in("template_type", types)
        .or(`company_id.eq.${companyId},company_id.is.null`);
      if (error) throw error;

      const byType = new Map<string, { tenant?: any; global?: any }>();
      for (const r of (data || []) as any[]) {
        const k = r.template_type;
        const existing = byType.get(k) || {};
        if (r.company_id === null) existing.global = r;
        else if (r.company_id === companyId) existing.tenant = r;
        byType.set(k, existing);
      }

      const next: RowState[] = TEMPLATE_META.map((meta) => {
        const found = byType.get(meta.type) || {};
        const source = found.tenant || found.global;
        return {
          meta,
          subject: source?.subject || "",
          body: source?.body || "",
          isCustomised: !!found.tenant,
        };
      });
      setRows(next);
    } catch (err: any) {
      toast({
        title: "Couldn't load templates",
        description: err?.message || String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [companyId]);

  const groups = useMemo(() => Array.from(new Set(TEMPLATE_META.map((m) => m.group))), []);
  const filtered = useMemo(
    () => rows.filter((r) => filterGroup === "all" || r.meta.group === filterGroup),
    [rows, filterGroup],
  );
  const grouped = useMemo(() => {
    const buckets = new Map<string, RowState[]>();
    for (const r of filtered) {
      const k = r.meta.group;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k)!.push(r);
    }
    return Array.from(buckets.entries());
  }, [filtered]);

  const customisedCount = rows.filter((r) => r.isCustomised).length;

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-600 max-w-2xl">
          Edit every email the system sends to clients. Change the wording, the tone, the sign-off - it stays customised for your team and falls back to the system default if you reset it.
        </p>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Customised</p>
          <p className="text-2xl font-bold text-emerald-700 tabular-nums">
            {customisedCount}<span className="text-sm text-slate-400 font-normal"> / {rows.length}</span>
          </p>
        </div>
      </div>

      <Card className="border-0 shadow-sm mb-4">
        <CardContent className="py-3 px-4 flex flex-wrap items-center gap-3">
          <span className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Group</span>
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 text-xs flex-wrap">
            <button
              type="button"
              onClick={() => setFilterGroup("all")}
              className={`px-3 py-1.5 rounded-md ${filterGroup === "all" ? "bg-emerald-600 text-white font-medium" : "text-slate-600 hover:bg-slate-50"}`}
            >
              All
            </button>
            {groups.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setFilterGroup(g)}
                className={`px-3 py-1.5 rounded-md ${filterGroup === g ? "bg-emerald-600 text-white font-medium" : "text-slate-600 hover:bg-slate-50"}`}
              >
                {g}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-center py-16 text-slate-500">Loading templates...</div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-16 text-slate-500">No templates match the filter.</div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([group, items]) => (
            <div key={group}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <Mail className="w-4 h-4 text-blue-600" />
                <p className="text-xs font-bold uppercase tracking-wide text-slate-700">{group}</p>
              </div>
              <div className="space-y-2">
                {items.map((row) => (
                  <Card key={row.meta.type} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                    <CardContent className="py-3 px-4 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-slate-900">{row.meta.label}</p>
                          {row.isCustomised ? (
                            <Badge className="bg-emerald-100 text-emerald-800 border-0 text-[10px] gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Customised
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-slate-500">Default</Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{row.meta.description}</p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setEditing(row)} className="gap-1.5 shrink-0">
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ComposeDrawerHost open={!!editing} onClose={() => setEditing(null)}>
        {editing && (
          <EditorDrawer
            row={editing}
            companyId={companyId}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); reload(); }}
            onReset={() => { setEditing(null); reload(); }}
          />
        )}
      </ComposeDrawerHost>
    </>
  );
}

function EditorDrawer({
  row, companyId, onClose, onSaved, onReset,
}: {
  row: RowState;
  companyId: string | null;
  onClose: () => void;
  onSaved: () => void;
  onReset: () => void;
}) {
  const { toast } = useToast();
  const [subject, setSubject] = useState(row.subject);
  const [body, setBody] = useState(row.body);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [showPreview, setShowPreview] = useState(true);

  const dirty = subject !== row.subject || body !== row.body;

  const previewCtx = useMemo(() => {
    const ctx: Record<string, string> = {};
    for (const v of row.meta.variables) ctx[v.name] = v.example;
    return ctx;
  }, [row.meta.variables]);
  const previewSubject = useMemo(() => substitute(subject, previewCtx), [subject, previewCtx]);
  const previewBody = useMemo(() => substitute(body, previewCtx), [body, previewCtx]);

  const insertVar = (name: string) => {
    const token = `{{${name}}}`;
    const el = document.getElementById("template-body") as HTMLTextAreaElement | null;
    if (el) {
      const start = el.selectionStart ?? body.length;
      const end = el.selectionEnd ?? body.length;
      const next = body.slice(0, start) + token + body.slice(end);
      setBody(next);
      requestAnimationFrame(() => {
        el.focus();
        const caret = start + token.length;
        el.setSelectionRange(caret, caret);
      });
    } else {
      setBody(body + token);
    }
  };

  const handleSave = async () => {
    if (!companyId) {
      toast({ title: "Missing company", description: "Reload the page and try again.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      // Look for existing tenant row first; insert if absent, update if
      // present. Can't use upsert because the table has no UNIQUE on
      // (company_id, template_type).
      const { data: existing, error: lookupErr } = await (supabase as any)
        .from("email_templates")
        .select("id")
        .eq("company_id", companyId)
        .eq("template_type", row.meta.type)
        .maybeSingle();
      if (lookupErr) throw lookupErr;

      if (existing?.id) {
        const { error: updErr } = await (supabase as any)
          .from("email_templates")
          .update({ subject, body, is_active: true, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (updErr) throw updErr;
      } else {
        const { error: insErr } = await (supabase as any)
          .from("email_templates")
          .insert([{
            company_id: companyId,
            user_id: companyId,
            template_type: row.meta.type,
            subject,
            body,
            is_active: true,
          }]);
        if (insErr) throw insErr;
      }
      toast({ title: "Template saved", description: "Customised version is now in use." });
      onSaved();
    } catch (err: any) {
      toast({ title: "Couldn't save", description: err?.message || String(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!companyId || !row.isCustomised) return;
    setResetting(true);
    try {
      const { error } = await (supabase as any)
        .from("email_templates")
        .delete()
        .eq("company_id", companyId)
        .eq("template_type", row.meta.type);
      if (error) throw error;
      toast({ title: "Reset to default", description: "System default will be used from now on." });
      onReset();
    } catch (err: any) {
      toast({ title: "Couldn't reset", description: err?.message || String(err), variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-blue-600" />
          {row.meta.label}
        </SheetTitle>
        <SheetDescription>{row.meta.description}</SheetDescription>
      </SheetHeader>

      <div className="space-y-4 mt-4">
        <Card className="border-slate-200 shadow-none">
          <CardContent className="py-3 px-4 space-y-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
              Available variables (click to insert)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {row.meta.variables.map((v) => (
                <button
                  key={v.name}
                  type="button"
                  onClick={() => insertVar(v.name)}
                  title={`${v.description} - example: ${v.example}`}
                  className="text-[11px] font-mono bg-slate-100 hover:bg-emerald-100 hover:text-emerald-800 px-2 py-1 rounded border border-slate-200 transition-colors"
                >
                  {`{{${v.name}}}`}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 leading-snug">
              Variables are substituted at send time with the matching field on the lead / quote / order.
            </p>
          </CardContent>
        </Card>

        <div>
          <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Subject</label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject line"
            className="mt-1"
          />
        </div>

        <div>
          <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Message body</label>
          <textarea
            id="template-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={14}
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm leading-6 font-mono"
          />
        </div>

        <div className="flex items-center justify-between">
          <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Preview (sample data)</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowPreview((s) => !s)}
            className="text-xs h-7"
          >
            {showPreview ? "Hide preview" : "Show preview"}
          </Button>
        </div>
        {showPreview && (
          <Card className="border-emerald-200 bg-emerald-50/40 shadow-none">
            <CardContent className="py-3 px-4 space-y-2">
              <p className="text-sm font-semibold text-slate-900">{previewSubject || "(empty subject)"}</p>
              <p className="text-sm whitespace-pre-wrap text-slate-700">{previewBody || "(empty body)"}</p>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving..." : "Save customisation"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={resetting || !row.isCustomised}
            onClick={handleReset}
            className="gap-1.5"
            title={row.isCustomised ? "Drop your customisation, fall back to system default" : "Already on default"}
          >
            <RotateCcw className="w-4 h-4" />
            {resetting ? "Resetting..." : "Reset to default"}
          </Button>
        </div>

        {/* TODO: Send-test button - needs a server route that resolves
            the template, substitutes fixture variables and sends to the
            current operator's email via emailService. Deferred so the
            DB seed + resolver land first. */}

        <p className="text-[10px] text-slate-500 text-center">
          Saved customisations are scoped to your company. Other tenants see their own templates (or the system default).
        </p>

        <Button variant="ghost" onClick={onClose} className="w-full">Close</Button>
      </div>
    </>
  );
}

export default TemplatesPanel;
