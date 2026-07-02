/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/platform/messaging-templates - Platform email templates.
 *
 * Super_admin only. Edits the global-default tier of email_templates
 * (company_id IS NULL) for the 10 platform-scoped registry entries
 * (subscription receipts, owner welcome, trial reminders, etc.).
 *
 * Reads:
 *   - platformTemplateService.listPlatformTemplates returns the 10
 *     scope='platform' definitions merged with their global-default
 *     override (if a super_admin has saved one).
 *
 * Writes:
 *   - savePlatformOverride hits the API which gates on super_admin,
 *     writes the company_id=NULL row through the service-role client,
 *     and the tenant resolver picks it up the next time the platform
 *     fires the matching template.
 *   - removePlatformOverride deletes the global-default row so the
 *     resolver falls back to the inline default in the registry.
 *
 * Mirror of the tenant editor at /admin/email-templates?tab=templates
 * with three differences:
 *   - One scope (platform) so no scope filter
 *   - No "Send Test" button - test sends use the platform email
 *     provider not a tenant's, and there's no per-tenant context
 *   - The reset wording is louder because resetting affects EVERY
 *     tenant that hasn't saved their own override
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { PlatformNav } from "@/components/admin/PlatformNav";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { PortalShell, PortalHeader, PortalCard, PortalCardHeader, StatTile,
  PageWorkbench,
} from "@/components/portal/ui";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ComposeDrawerHost } from "@/components/messaging/ComposeDrawerHost";
import {
  Mail, Pencil, RotateCcw, Save, AlertCircle, CheckCircle2, Search,
  Zap, ExternalLink, ShieldCheck, Crown,
} from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { captureException } from "@/lib/observability";
import { renderTemplate } from "@/lib/messageTemplates/registry";
import {
  listPlatformTemplates,
  savePlatformOverride,
  removePlatformOverride,
  type PlatformMergedTemplate,
} from "@/services/platformTemplateService";

export default function PlatformMessagingTemplatesPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
      <PlatformMessagingTemplatesContent />
    </ProtectedRoute>
  );
}

function PlatformMessagingTemplatesContent() {
  return (
    <div className="admin-page-shell">
      <PlatformNav />
      <NoIndexMeta />
      <Head>
        <title>Platform emails - CateringMS</title>
      </Head>

      <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
        <PlatformTemplatesPanel />
      </PortalShell>
    </div>
  );
}

function PlatformTemplatesPanel() {
  const { toast } = useToast();
  const [rows, setRows] = useState<PlatformMergedTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PlatformMergedTemplate | null>(null);
  const [query, setQuery] = useState("");
  const [onlyCustomised, setOnlyCustomised] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const list = await listPlatformTemplates();
      setRows(list);
    } catch (err: unknown) {
      const e = err as { message?: string };
      captureException(err, {
        tags: { route: "/admin/platform/messaging-templates", step: "load" },
      });
      toast({ title: "Couldn't load templates", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyCustomised && !r.isCustomised) return false;
      if (q) {
        const hay = `${r.label} ${r.description} ${r.group} ${r.key} ${r.trigger || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, query, onlyCustomised]);

  const grouped = useMemo(() => {
    const buckets = new Map<string, PlatformMergedTemplate[]>();
    for (const r of filtered) {
      const k = r.group;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k)!.push(r);
    }
    return Array.from(buckets.entries());
  }, [filtered]);

  const customisedCount = rows.filter((r) => r.isCustomised).length;

  return (
    <>
      <PortalHeader
        variant="hero"
        title="Platform emails"
        subtitle="Wording for emails CateringMS sends to tenants (subscription receipts, trial reminders, owner welcome). Edits apply to every tenant immediately."
        icon={Mail}
        meta={
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
              {loading ? "..." : rows.length} platform templates
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {loading ? "..." : customisedCount} customised
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
              <Crown className="h-3 w-3" />
              Global defaults
            </span>
          </>
        }
      />
      <PageWorkbench />

      <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_260px]">
        <PortalCard className="bg-slate-50 dark:bg-slate-900/50">
          <PortalCardHeader
            title={
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-slate-700 dark:text-slate-300 shrink-0" />
                Global defaults &middot; affects every tenant
              </span>
            }
            className="mb-2 pb-2"
          />
          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
            These are emails the platform sends to tenants on subscription events. Saving here writes a row at <code>email_templates.company_id IS NULL</code> - every tenant that hasn't customised the matching key sees the new wording. Reset to revert to the inline default in the registry.
          </p>
        </PortalCard>
        <StatTile
          label="Customised"
          value={customisedCount}
          hint={`of ${rows.length} platform templates`}
          icon={CheckCircle2}
        />
      </div>

      <PortalCard className="mb-6" padded={false}>
        <div className="py-3 px-4 flex flex-wrap items-center gap-3">
          <div className="relative grow min-w-[220px] max-w-[420px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by label, key or trigger..."
              className="pl-9 h-9 text-sm"
            />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Switch
              id="only-customised"
              checked={onlyCustomised}
              onCheckedChange={setOnlyCustomised}
            />
            <label htmlFor="only-customised" className="text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
              Only customised
            </label>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {filtered.length} of {rows.length} templates
          </span>
        </div>
      </PortalCard>

      {loading ? (
        <PortalCard className="text-center py-16 text-slate-500 dark:text-slate-400">Loading platform templates...</PortalCard>
      ) : grouped.length === 0 ? (
        <PortalCard className="text-center py-16 text-slate-500 dark:text-slate-400">
          {rows.length === 0 ? "No platform templates registered." : "No templates match the filter."}
        </PortalCard>
      ) : (
        <div className="space-y-6">
          {grouped.map(([group, items]) => (
            <div key={group}>
              <PortalCardHeader
                className="mb-2 px-1 pb-2"
                title={
                  <span className="inline-flex items-center gap-2 uppercase tracking-wide text-xs">
                    <Mail className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                    {group}
                  </span>
                }
                action={
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">({items.length})</span>
                }
              />
              <div className="space-y-2">
                {items.map((row) => (
                  <PortalCard key={row.key} padded={false}>
                    <div className="py-3 px-4 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white">{row.label}</p>
                          <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-0 text-[10px] gap-1">
                            <Zap className="w-3 h-3" /> Automatic
                          </Badge>
                          {row.isCustomised ? (
                            <Badge className="bg-brand-primary/15 text-brand-primary border-0 text-[10px] gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Customised
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-slate-500 dark:text-slate-400">Default</Badge>
                          )}
                          {row.isCustomised && !row.customIsActive && (
                            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-0 text-[10px] gap-1">
                              <AlertCircle className="w-3 h-3" /> Disabled, using default
                            </Badge>
                          )}
                          <code className="text-[10px] font-mono text-slate-400 dark:text-slate-500 ml-auto hidden sm:inline">
                            {row.key}
                          </code>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{row.description}</p>
                        {row.trigger && (
                          <p className="text-[11px] mt-1 inline-flex items-center gap-1 text-slate-600 dark:text-slate-400">
                            <Zap className="w-3 h-3 shrink-0" />
                            <span className="truncate" title={row.trigger}>{row.trigger}</span>
                          </p>
                        )}
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setEditing(row)} className="gap-1.5 shrink-0">
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </Button>
                    </div>
                  </PortalCard>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ComposeDrawerHost open={!!editing} onClose={() => setEditing(null)}>
        {editing && (
          <EditorDrawer
            template={editing}
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
  template, onClose, onSaved, onReset,
}: {
  template: PlatformMergedTemplate;
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
    setSaving(true);
    try {
      await savePlatformOverride({
        key: template.key,
        channel: template.channel,
        subject: isEmail ? subject : null,
        body,
        isActive: true,
      });
      toast({
        title: "Global default saved",
        description: "Every tenant that hasn't customised will see the new wording on the next platform send.",
      });
      onSaved();
    } catch (err: unknown) {
      const e = err as { message?: string };
      captureException(err, {
        tags: { route: "/admin/platform/messaging-templates", step: "save", templateKey: template.key },
      });
      toast({ title: "Couldn't save", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!template.isCustomised) return;
    const confirmed = window.confirm(
      `Reset the global default for "${template.label}"? Every tenant that hasn't saved their own override will fall back to the inline default in the registry.`,
    );
    if (!confirmed) return;
    setResetting(true);
    try {
      await removePlatformOverride({ key: template.key, channel: template.channel });
      toast({
        title: "Reset to inline default",
        description: "Resolver will use the registry default until you save a new global override.",
      });
      onReset();
    } catch (err: unknown) {
      const e = err as { message?: string };
      captureException(err, {
        tags: { route: "/admin/platform/messaging-templates", step: "reset", templateKey: template.key },
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

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-slate-600 dark:text-slate-400" />
          {template.label}
          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-0 text-[10px] gap-1 ml-1">
            <Crown className="w-3 h-3" /> Platform
          </Badge>
        </SheetTitle>
        <SheetDescription className="flex items-center gap-2">
          <span>{template.description}</span>
          <code className="text-[10px] font-mono text-slate-400 dark:text-slate-500 px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded">
            {template.key}
          </code>
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-4 mt-4">
        <Card className="border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50 shadow-none">
          <CardContent className="py-3 px-4 flex items-start gap-3">
            <Zap className="w-4 h-4 text-slate-700 dark:text-slate-300 mt-0.5 shrink-0" />
            <div className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
              <p className="font-semibold mb-0.5">{template.trigger || "Fires automatically when the platform event occurs."}</p>
              <p>
                Saving writes the global default. Every tenant that hasn't customised this key sees your wording immediately on the next platform send.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-800 dark:bg-slate-900/50 shadow-none">
          <CardContent className="py-3 px-4 space-y-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-semibold">
              Available variables (click to insert)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {template.variables.map((v) => (
                <button
                  key={v.name}
                  type="button"
                  onClick={() => insertVar(v.name)}
                  title={`${v.description} - example: ${v.example}`}
                  className="text-[11px] font-mono bg-slate-100 hover:bg-slate-200 hover:text-slate-900 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white px-2 py-1 rounded border border-slate-200 dark:border-slate-700 transition-colors"
                >
                  {`{{${v.name}}}`}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {isEmail && (
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Subject</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={template.defaultSubject || ""}
              className="mt-1"
            />
          </div>
        )}

        <div>
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Message body</label>
          <textarea
            id="template-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={isEmail ? 14 : 8}
            className="mt-1 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-3 py-2 text-sm leading-6 font-mono"
          />
        </div>

        <Card className="border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50 shadow-none">
          <CardContent className="py-3 px-4 space-y-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-600 dark:text-slate-400 font-semibold">
              Preview (sample data)
            </p>
            {isEmail && (
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{previewSubject || "(empty subject)"}</p>
            )}
            <p className="text-sm whitespace-pre-wrap text-slate-700 dark:text-slate-300">{previewBody || "(empty body)"}</p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="gap-1.5 bg-brand-primary hover:opacity-90"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving..." : "Save global default"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={resetting || !template.isCustomised}
            onClick={handleReset}
            className="gap-1.5"
            title={template.isCustomised ? "Drop the global default, fall back to inline registry default" : "Already on inline default"}
          >
            <RotateCcw className="w-4 h-4" />
            {resetting ? "Resetting..." : "Reset to inline default"}
          </Button>
        </div>

        {dirty && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300 text-center bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded px-2 py-1.5">
            You have unsaved changes. Save before closing.
          </p>
        )}

        <p className="text-[10px] text-slate-500 dark:text-slate-400 text-center">
          Platform defaults affect every tenant. A tenant who has saved their own override at <code>/admin/email-templates</code> keeps using theirs.
        </p>

        <Link
          href="/admin/email-templates?tab=templates"
          className="text-[11px] inline-flex items-center justify-center gap-1 text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white w-full"
        >
          See how tenants edit their own copy
          <ExternalLink className="w-3 h-3" />
        </Link>

        <Button variant="ghost" onClick={handleClose} className="w-full">Close</Button>
      </div>
    </>
  );
}
