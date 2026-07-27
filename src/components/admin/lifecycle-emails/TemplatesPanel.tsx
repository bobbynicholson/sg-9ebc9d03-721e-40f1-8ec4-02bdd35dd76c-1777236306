/**
 * TemplatesPanel - the canonical Lifecycle Emails template editor.
 *
 * Wave 50 LCF-M (task #235): rewritten to read from the central
 * TEMPLATE_REGISTRY instead of the old hardcoded TEMPLATE_META list.
 * Now surfaces every template the system can send (~79 entries
 * spanning email + WhatsApp, client + staff audiences), not just the
 * 18 client-email subset the legacy panel knew about.
 *
 * Data flow:
 *   - Reads TEMPLATE_REGISTRY for the canonical list of templates +
 *     their default subject / body / variable bag.
 *   - messageTemplateService.listForCompany merges overrides from
 *     email_templates + whatsapp_templates so each row reflects
 *     "customised vs default" for the current tenant.
 *   - Save / Reset go through messageTemplateService.saveOverride /
 *     removeOverride - the same code path /admin/messaging-templates
 *     uses, so editing here drives the live send the same way.
 *
 * Editor features:
 *   - Search across label, key, description, group
 *   - Channel filter (email / WhatsApp) + Audience filter (client / staff)
 *   - Only-customised toggle
 *   - Per-row template-key chip + variable count
 *   - Drawer editor with variable insert chips, live preview,
 *     Save / Reset / Send test
 *   - Dirty guard via beforeunload + Close confirm
 *   - captureException with route + step + companyId + templateKey tags
 *
 * Pure component: no AdminNav / NoIndexMeta / page header - those are
 * page concerns. The hub page at /admin/email-templates renders this
 * inside its own tab.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ComposeDrawerHost } from "@/components/messaging/ComposeDrawerHost";
import { Mail, MessageCircle, Pencil, RotateCcw, Save, AlertCircle, CheckCircle2, Search, Send, Zap, MousePointerClick, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useTenantHref } from "@/lib/tenantUrl";
import { captureException } from "@/lib/observability";
import {
  renderTemplate,
  TEMPLATE_REGISTRY,
  type MessageChannel,
  type MessageDelivery,
} from "@/lib/messageTemplates/registry";
import {
  listForCompany,
  saveOverride,
  removeOverride,
  type MergedTemplate,
} from "@/services/messageTemplateService";

function useCompanyId(): string | null {
  const { user, profile } = useAuth();
  return profile?.company_id ?? user?.company_id ?? null;
}

export function TemplatesPanel() {
  const companyId = useCompanyId();
  const { toast } = useToast();
  const { withSlug } = useTenantHref();
  const [rows, setRows] = useState<MergedTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<MergedTemplate | null>(null);
  const [filterChannel, setFilterChannel] = useState<"all" | MessageChannel>("all");
  const [filterCategory, setFilterCategory] = useState<"all" | "client" | "staff">("all");
  const [filterDelivery, setFilterDelivery] = useState<"all" | MessageDelivery>("all");
  const [query, setQuery] = useState("");
  const [onlyCustomised, setOnlyCustomised] = useState(false);

  const reload = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const list = await listForCompany(companyId);
      setRows(list);
    } catch (err: unknown) {
      const e = err as { message?: string };
      captureException(err, {
        tags: { route: "/admin/email-templates", step: "load", companyId },
      });
      toast({ title: "Couldn't load templates", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [companyId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filterChannel !== "all" && r.channel !== filterChannel) return false;
      if (filterCategory !== "all" && r.category !== filterCategory) return false;
      if (filterDelivery !== "all" && (r.delivery || "manual") !== filterDelivery) return false;
      if (onlyCustomised && !r.isCustomised) return false;
      if (q) {
        const hay = `${r.label} ${r.description} ${r.group} ${r.key} ${r.trigger || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filterChannel, filterCategory, filterDelivery, onlyCustomised, query]);

  const grouped = useMemo(() => {
    const buckets = new Map<string, MergedTemplate[]>();
    for (const r of filtered) {
      const k = `${r.channel}|${r.category}|${r.group}`;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k)!.push(r);
    }
    return Array.from(buckets.entries()).map(([k, items]) => {
      const [channel, category, group] = k.split("|") as [MessageChannel, "client" | "staff", string];
      return { channel, category, group, items };
    });
  }, [filtered]);

  const customisedCount = rows.filter((r) => r.isCustomised).length;
  const emailCount = rows.filter((r) => r.channel === "email").length;
  const whatsappCount = rows.filter((r) => r.channel === "whatsapp").length;
  const automatedCount = rows.filter((r) => (r.delivery || "manual") === "automated").length;
  const manualCount = rows.filter((r) => (r.delivery || "manual") === "manual").length;
  // LCF-R: the service filters out scope='platform' templates so the
  // tenant editor never shows subscription receipts / owner welcome
  // etc. We show the count quietly in the footer so the operator
  // knows the editor isn't pretending those don't exist.
  const totalRegistry = (TEMPLATE_REGISTRY).length;
  const platformOwnedCount = totalRegistry - rows.length;

  return (
    <>
      {/* HEADER + COVERAGE */}
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-600 max-w-2xl">
          Edit every email and WhatsApp message the system sends to clients and staff. Change the wording, the tone, the sign-off. It stays customised for your team and falls back to the system default if you reset it.
        </p>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Customised</p>
          <p className="text-2xl font-bold text-brand-primary tabular-nums">
            {customisedCount}<span className="text-sm text-slate-400 font-normal"> / {rows.length}</span>
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {emailCount} email &middot; {whatsappCount} WhatsApp
          </p>
          <p className="text-[10px] text-slate-500">
            {automatedCount} automatic &middot; {manualCount} manual
          </p>
        </div>
      </div>

      {/* Two-panel intel banner: automatic vs manual. Operators kept
          asking "wait, does this one actually send by itself?" - now
          they can see at a glance. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <Card className="border-0 shadow-sm bg-slate-50">
          <CardContent className="py-3 px-4 flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4 bg-slate-100" />
            </div>
            <div className="text-xs text-slate-950 leading-relaxed">
              <p className="font-semibold text-slate-950 mb-0.5">
                Automatic &middot; {automatedCount} template{automatedCount === 1 ? "" : "s"}
              </p>
              <p>
                The system fires these on its own (order status change, cron, webhook). Edits land immediately on the next firing - no clicking required. Use the Sent Log tab to see what's gone out.
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm bg-amber-50">
          <CardContent className="py-3 px-4 flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
              <MousePointerClick className="w-4 h-4 text-amber-700" />
            </div>
            <div className="text-xs text-amber-950 leading-relaxed">
              <p className="font-semibold text-amber-900 mb-0.5">
                Manual &middot; {manualCount} template{manualCount === 1 ? "" : "s"}
              </p>
              <p>
                You click a Send button on Leads / Quotes / Staff to use these. Edits show up prefilled when you next click - perfect for tweaking your sales voice without losing the core copy.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm mb-4 bg-blue-50">
        <CardContent className="py-3 px-4 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
          <div className="text-xs text-blue-900 leading-relaxed">
            <strong>Editing here changes what your clients and staff actually receive.</strong>
            {" "}Templates marked <em>Customised</em> use your wording. The rest use the system default until you save a customisation. Reset anytime to fall back to the default. WhatsApp templates skip the subject line and only edit the body.
          </div>
        </CardContent>
      </Card>

      {/* FILTERS */}
      <Card className="border-0 shadow-sm mb-4">
        <CardContent className="py-3 px-4 flex flex-wrap items-center gap-3">
          <div className="relative grow min-w-[220px] max-w-[420px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by label, key or description..."
              className="pl-9 h-9 text-sm"
            />
          </div>

          <span className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Channel</span>
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 text-xs">
            {([
              { id: "all",      label: "All" },
              { id: "email",    label: "Email" },
              { id: "whatsapp", label: "WhatsApp" },
            ] as const).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setFilterChannel(t.id)}
                className={`px-3 py-1.5 rounded-md ${
                  filterChannel === t.id
                    ? "bg-brand-primary text-white font-medium"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <span className="text-xs uppercase tracking-wide text-slate-500 font-semibold ml-2">Audience</span>
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 text-xs">
            {([
              { id: "all",    label: "All" },
              { id: "client", label: "Client" },
              { id: "staff",  label: "Staff" },
            ] as const).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setFilterCategory(t.id)}
                className={`px-3 py-1.5 rounded-md ${
                  filterCategory === t.id
                    ? "bg-brand-primary text-white font-medium"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <span className="text-xs uppercase tracking-wide text-slate-500 font-semibold ml-2">Delivery</span>
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1 text-xs">
            {([
              { id: "all",       label: "All" },
              { id: "automated", label: "Automatic" },
              { id: "manual",    label: "Manual" },
            ] as const).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setFilterDelivery(t.id)}
                className={`px-3 py-1.5 rounded-md inline-flex items-center gap-1 ${
                  filterDelivery === t.id
                    ? "bg-brand-primary text-white font-medium"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {t.id === "automated" && <Zap className="w-3 h-3" />}
                {t.id === "manual" && <MousePointerClick className="w-3 h-3" />}
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <Switch
              id="only-customised"
              checked={onlyCustomised}
              onCheckedChange={setOnlyCustomised}
            />
            <label htmlFor="only-customised" className="text-xs text-slate-600 cursor-pointer">
              Only customised
            </label>
          </div>
        </CardContent>
      </Card>

      {/* LIST */}
      {loading ? (
        <div className="text-center py-16 text-slate-500">Loading templates...</div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          {rows.length === 0 ? "No templates registered yet." : "No templates match the filter."}
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((g) => (
            <div key={`${g.channel}-${g.category}-${g.group}`}>
              <div className="flex items-center gap-2 mb-2 px-1">
                {g.channel === "email"
                  ? <Mail className="w-4 h-4 text-blue-600" />
                  : <MessageCircle className="w-4 h-4 text-brand-primary" />}
                <p className="text-xs font-bold uppercase tracking-wide text-slate-700">
                  {g.channel} &middot; {g.category} &middot; {g.group}
                </p>
                <span className="text-[10px] text-slate-400 ml-1">({g.items.length})</span>
              </div>
              <div className="space-y-2">
                {g.items.map((row) => {
                  const delivery: MessageDelivery = row.delivery || "manual";
                  return (
                    <Card key={row.key} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                      <CardContent className="py-3 px-4 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-slate-900">{row.label}</p>
                            {/* Delivery badge - leftmost so it's the
                                first thing the eye lands on. */}
                            {delivery === "automated" ? (
                              <Badge className="bg-slate-100 text-slate-800 border-0 text-[10px] gap-1">
                                <Zap className="w-3 h-3" /> Automatic
                              </Badge>
                            ) : delivery === "hybrid" ? (
                              <Badge className="bg-blue-100 text-blue-800 border-0 text-[10px] gap-1">
                                <Zap className="w-3 h-3" /> Auto + manual
                              </Badge>
                            ) : (
                              <Badge className="bg-amber-100 text-amber-900 border-0 text-[10px] gap-1">
                                <MousePointerClick className="w-3 h-3" /> Manual
                              </Badge>
                            )}
                            {row.isCustomised ? (
                              <Badge className="bg-brand-primary/15 text-brand-primary border-0 text-[10px] gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Customised
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-slate-500">Default</Badge>
                            )}
                            {row.isCustomised && !row.customIsActive && (
                              <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px] gap-1">
                                <AlertCircle className="w-3 h-3" /> Disabled, using default
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">{row.description}</p>
                          {row.trigger && (
                            <p
                              className={`text-[11px] mt-1 inline-flex items-center gap-1 ${
                                delivery === "automated"
                                  ? "text-slate-700"
                                  : delivery === "hybrid"
                                    ? "text-blue-700"
                                    : "text-amber-800"
                              }`}
                            >
                              {delivery === "automated"
                                ? <Zap className="w-3 h-3 shrink-0" />
                                : <MousePointerClick className="w-3 h-3 shrink-0" />}
                              <span className="font-medium shrink-0">Used when:</span>
                              <span className="truncate" title={row.trigger}>
                                {row.trigger}
                              </span>
                            </p>
                          )}
                        </div>
                        <Button size="sm" variant="outline" onClick={() => setEditing(row)} className="gap-1.5 shrink-0">
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {platformOwnedCount > 0 && (
        <p className="text-[11px] text-slate-500 text-center mt-6">
          {platformOwnedCount} platform-owned template{platformOwnedCount === 1 ? "" : "s"}
          {" "}(subscription receipts, trial reminders, owner welcome) are managed by CateringMS and not editable here.
        </p>
      )}

      <ComposeDrawerHost open={!!editing} onClose={() => setEditing(null)}>
        {editing && (
          <EditorDrawer
            template={editing}
            companyId={companyId}
            withSlug={withSlug}
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
  template, companyId, withSlug, onClose, onSaved, onReset,
}: {
  template: MergedTemplate;
  companyId: string | null;
  withSlug: (path: string) => string;
  onClose: () => void;
  onSaved: () => void;
  onReset: () => void;
}) {
  const { toast } = useToast();
  const isEmail = template.channel === "email";

  const initialSubject = template.isCustomised && template.customSubject != null
    ? template.customSubject
    : (template.defaultSubject || "");
  const initialBody = template.isCustomised && template.customBody != null
    ? template.customBody
    : template.defaultBody;

  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  const dirty = subject !== initialSubject || body !== initialBody;

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const previewCtx = useMemo(() => {
    const ctx: Record<string, string> = {};
    for (const v of template.variables) ctx[v.name] = v.example;
    return ctx;
  }, [template.variables]);
  const previewSubject = useMemo(() => renderTemplate(subject, previewCtx), [subject, previewCtx]);
  const previewBody = useMemo(() => renderTemplate(body, previewCtx), [body, previewCtx]);

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
      await saveOverride({
        companyId,
        key: template.key,
        channel: template.channel,
        subject: isEmail ? subject : null,
        body,
        isActive: true,
      });
      toast({ title: "Template saved", description: "Customised version is now in use." });
      onSaved();
    } catch (err: unknown) {
      const e = err as { message?: string };
      captureException(err, {
        tags: {
          route: "/admin/email-templates",
          step: "save",
          companyId,
          templateKey: template.key,
        },
      });
      toast({ title: "Couldn't save", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!companyId || !template.isCustomised) return;
    setResetting(true);
    try {
      await removeOverride({ companyId, key: template.key, channel: template.channel });
      toast({ title: "Reset to default", description: "System default will be used from now on." });
      onReset();
    } catch (err: unknown) {
      const e = err as { message?: string };
      captureException(err, {
        tags: {
          route: "/admin/email-templates",
          step: "reset",
          companyId,
          templateKey: template.key,
        },
      });
      toast({ title: "Couldn't reset", description: e?.message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  const handleClose = () => {
    if (dirty) {
      const ok = window.confirm("You have unsaved changes. Close anyway?");
      if (!ok) return;
    }
    onClose();
  };

  const handleSendTest = async () => {
    if (dirty) {
      toast({
        title: "Save first",
        description: "Save your customisation before sending a test so what you receive matches what's stored.",
      });
      return;
    }
    setSendingTest(true);
    try {
      const resp = await fetch("/api/admin/messaging-templates/send-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateKey: template.key }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        // Structured failures from sendEmailDetailed carry an
        // error_code + optional fix_link. Surface the fix path so
        // the operator knows exactly which settings page to open.
        const code = json?.error_code ? ` [${json.error_code}]` : "";
        const fix = json?.fix_link ? ` Open: ${json.fix_link}` : "";
        throw new Error(`${json?.error || "Send failed"}${code}${fix}`);
      }
      toast({
        title: "Test sent",
        description: `Sent to ${json.to}. Check your ${json.channel === "email" ? "inbox" : "WhatsApp"}.`,
      });
    } catch (err: unknown) {
      const e = err as { message?: string };
      captureException(err, {
        tags: {
          route: "/admin/email-templates",
          step: "send-test",
          companyId,
          templateKey: template.key,
        },
      });
      toast({
        title: "Test send failed",
        description: e?.message || "Unknown error",
        variant: "destructive",
      });
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          {isEmail
            ? <Mail className="w-5 h-5 text-blue-600" />
            : <MessageCircle className="w-5 h-5 text-brand-primary" />}
          {template.label}
        </SheetTitle>
        <SheetDescription className="flex items-center gap-2">
          <span>{template.description}</span>
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-4 mt-4">
        {/* LCF-Q: delivery panel - tells the operator exactly when /
            how this template fires and links to the workflow page
            that drives it. */}
        {(() => {
          const delivery: MessageDelivery = template.delivery || "manual";
          const isAutomated = delivery === "automated";
          const tone = isAutomated
            ? "border-slate-200 bg-slate-50"
            : delivery === "hybrid"
              ? "border-blue-200 bg-blue-50"
              : "border-amber-200 bg-amber-50";
          const Icon = isAutomated ? Zap : MousePointerClick;
          const iconColour = isAutomated
            ? "text-slate-700"
            : delivery === "hybrid"
              ? "text-blue-700"
              : "text-amber-700";
          const headerLabel = isAutomated
            ? "Automatic - the system fires this for you"
            : delivery === "hybrid"
              ? "Automatic with manual re-send option"
              : "Manual - you click Send when you're ready";
          return (
            <Card className={`shadow-none ${tone}`}>
              <CardContent className="py-3 px-4 flex items-start gap-3">
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColour}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-900">{headerLabel}</p>
                  {template.trigger && (
                    <p className="text-[11px] text-slate-700 mt-0.5">{template.trigger}</p>
                  )}
                  {template.settingsLink && (
                    <Link
                      href={withSlug(template.settingsLink)}
                      className="text-[11px] inline-flex items-center gap-1 text-slate-700 underline mt-1 hover:text-slate-900"
                    >
                      {isAutomated ? "Open the workflow page that fires this" : "Open the page where you click Send"}
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })()}

        <Card className="border-slate-200 shadow-none">
          <CardContent className="py-3 px-4 space-y-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
              Available variables (click to insert)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {template.variables.map((v) => (
                <button
                  key={v.name}
                  type="button"
                  onClick={() => insertVar(v.name)}
                  title={`${v.description} - example: ${v.example}`}
                  className="text-[11px] font-mono bg-slate-100 hover:bg-brand-primary/15 hover:text-brand-primary px-2 py-1 rounded border border-slate-200 transition-colors"
                >
                  {`{{${v.name}}}`}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 leading-snug">
              Variables are replaced at send time with the matching field on the lead / quote / order. Hover a chip for a description and example.
            </p>
          </CardContent>
        </Card>

        {isEmail && (
          <div>
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Subject</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={template.defaultSubject || ""}
              className="mt-1"
            />
          </div>
        )}

        <div>
          <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Message body</label>
          <textarea
            id="template-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={isEmail ? 14 : 8}
            className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm leading-6 font-mono"
          />
        </div>

        <Card className="border-brand-primary/20 bg-brand-primary/10 shadow-none">
          <CardContent className="py-3 px-4 space-y-2">
            <p className="text-[11px] uppercase tracking-wide text-brand-primary font-semibold">
              Preview (sample data)
            </p>
            {isEmail && (
              <p className="text-sm font-semibold text-slate-900">{previewSubject || "(empty subject)"}</p>
            )}
            <p className="text-sm whitespace-pre-wrap text-slate-700">{previewBody || "(empty body)"}</p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="gap-1.5 bg-brand-primary hover:bg-brand-primary/90"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving..." : "Save customisation"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={resetting || !template.isCustomised}
            onClick={handleReset}
            className="gap-1.5"
            title={template.isCustomised ? "Drop your customisation, fall back to system default" : "Already on default"}
          >
            <RotateCcw className="w-4 h-4" />
            {resetting ? "Resetting..." : "Reset to default"}
          </Button>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={handleSendTest}
          disabled={sendingTest || dirty}
          className="w-full gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50"
          title={dirty ? "Save your customisation first - then test" : "Sends the live template to your own email / WhatsApp with example data"}
        >
          <Send className="w-4 h-4" />
          {sendingTest ? "Sending test..." : `Send test ${isEmail ? "email" : "WhatsApp"} to me`}
        </Button>

        {dirty && (
          <p className="text-[11px] text-amber-700 text-center bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
            You have unsaved changes. Save before closing.
          </p>
        )}

        <p className="text-[10px] text-slate-500 text-center">
          Saved customisations are scoped to your company. Other tenants see their own templates (or the system default).
        </p>

        <Button variant="ghost" onClick={handleClose} className="w-full">Close</Button>
      </div>
    </>
  );
}

export default TemplatesPanel;
