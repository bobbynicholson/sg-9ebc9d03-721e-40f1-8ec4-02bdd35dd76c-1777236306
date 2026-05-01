/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/messaging-templates -- the central place where the catering
 * owner edits every email + WhatsApp template the system uses to
 * speak to clients and staff.
 *
 * One page, two channels (email + WhatsApp), grouped by purpose
 * (lead follow-up, quote, day of event, staff). Each row shows
 * whether it's currently using the system default or the company's
 * customisation. Click edit -> drawer with subject (email only),
 * body, variable insert chips, live preview, save / reset / cancel.
 *
 * Related pages:
 *   /admin/email-templates -- after-sales lifecycle templates (no
 *   response chasers, payment reminders). That page is intentionally
 *   left alone; it deals with a different lifecycle and uses
 *   localStorage for now. Future: fold both pages into one.
 */

import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ComposeDrawerHost } from "@/components/messaging/ComposeDrawerHost";
import { Mail, MessageCircle, Pencil, RotateCcw, Save, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  TEMPLATE_REGISTRY,
  renderTemplate,
  type TemplateDefinition,
  type MessageChannel,
} from "@/lib/messageTemplates/registry";
import {
  listForCompany,
  saveOverride,
  removeOverride,
  type MergedTemplate,
} from "@/services/messageTemplateService";

function useCompanyId() {
  const { user, profile } = useAuth() as any;
  return profile?.company_id ?? user?.company_id ?? null;
}

function MessagingTemplatesPage() {
  const companyId = useCompanyId();
  const { toast } = useToast();
  const [rows, setRows] = useState<MergedTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<MergedTemplate | null>(null);
  const [filterChannel, setFilterChannel] = useState<"all" | MessageChannel>("all");
  const [filterCategory, setFilterCategory] = useState<"all" | "client" | "staff">("all");

  // Load on mount + after every save / remove so the badges stay accurate.
  const reload = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const list = await listForCompany(companyId);
      setRows(list);
    } catch (err: any) {
      toast({ title: "Couldn't load templates", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [companyId]);

  const filtered = useMemo(() => {
    return rows.filter((r) =>
      (filterChannel === "all" || r.channel === filterChannel) &&
      (filterCategory === "all" || r.category === filterCategory),
    );
  }, [rows, filterChannel, filterCategory]);

  // Group by header line, keep registry order within each group.
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

  return (
    <>
      <NoIndexMeta />
      <Head><title>Messaging Templates | Admin</title></Head>
      <AdminNav />

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
        <div className="overflow-x-hidden lg:pl-72 xl:pl-80">
          <div className="px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 pb-24 max-w-screen-2xl">

            {/* HEADER */}
            <div className="mb-6">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h1 className="text-3xl font-bold text-slate-900 mb-2 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                      <Sparkles className="w-6 h-6 text-white" />
                    </div>
                    Messaging templates
                  </h1>
                  <p className="text-slate-600 max-w-2xl">
                    Edit every email and WhatsApp template the system sends to clients and staff. Change the wording, the tone, the sign-off -- it stays customised for your team and falls back to the system default if you reset it.
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
                    Customised
                  </p>
                  <p className="text-3xl font-bold text-emerald-700 tabular-nums">
                    {customisedCount}<span className="text-base text-slate-400 font-normal"> / {rows.length}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* FILTERS */}
            <Card className="border-0 shadow-sm mb-4">
              <CardContent className="py-3 px-4 flex flex-wrap items-center gap-3">
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
                          ? "bg-emerald-600 text-white font-medium"
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
                          ? "bg-emerald-600 text-white font-medium"
                          : "text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* LIST */}
            {loading ? (
              <div className="text-center py-16 text-slate-500">Loading templates…</div>
            ) : grouped.length === 0 ? (
              <div className="text-center py-16 text-slate-500">No templates match the filter.</div>
            ) : (
              <div className="space-y-6">
                {grouped.map((g) => (
                  <div key={`${g.channel}-${g.category}-${g.group}`}>
                    <div className="flex items-center gap-2 mb-2 px-1">
                      {g.channel === "email"
                        ? <Mail className="w-4 h-4 text-blue-600" />
                        : <MessageCircle className="w-4 h-4 text-emerald-600" />}
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-700">
                        {g.channel} · {g.category} · {g.group}
                      </p>
                    </div>
                    <div className="space-y-2">
                      {g.items.map((row) => (
                        <Card key={row.key} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                          <CardContent className="py-3 px-4 flex items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-semibold text-slate-900">{row.label}</p>
                                {row.isCustomised ? (
                                  <Badge className="bg-emerald-100 text-emerald-800 border-0 text-[10px] gap-1">
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
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditing(row)}
                              className="gap-1.5 shrink-0"
                            >
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
          </div>
        </div>
      </div>

      {/* EDITOR DRAWER -- shared resizable host (drag the left edge) */}
      <ComposeDrawerHost open={!!editing} onClose={() => setEditing(null)}>
        {editing && (
          <EditorDrawer
            template={editing}
            companyId={companyId}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); reload(); }}
            onReset={() => { setEditing(null); reload(); }}
          />
        )}
      </ComposeDrawerHost>

      {/* Footer sits inside the sidebar-offset wrapper so the sidebar
          never overlaps it on desktop. */}
      <div className="lg:pl-72 xl:pl-80">
        <Footer />
      </div>
    </>
  );
}

// ── Editor drawer ──────────────────────────────────────────────────

function EditorDrawer({
  template, companyId, onClose, onSaved, onReset,
}: {
  template: MergedTemplate;
  companyId: string | null;
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

  // Build sample preview using each variable's example.
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
      // Re-focus and place caret after the inserted token.
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
    } catch (err: any) {
      toast({ title: "Couldn't save", description: err?.message, variant: "destructive" });
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
    } catch (err: any) {
      toast({ title: "Couldn't reset", description: err?.message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          {isEmail
            ? <Mail className="w-5 h-5 text-blue-600" />
            : <MessageCircle className="w-5 h-5 text-emerald-600" />}
          {template.label}
        </SheetTitle>
        <SheetDescription>{template.description}</SheetDescription>
      </SheetHeader>

      <div className="space-y-4 mt-4">
        {/* Variables */}
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
                  title={`${v.description} -- example: ${v.example}`}
                  className="text-[11px] font-mono bg-slate-100 hover:bg-emerald-100 hover:text-emerald-800 px-2 py-1 rounded border border-slate-200 transition-colors"
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

        {/* Subject (email only) */}
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

        {/* Body */}
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

        {/* Live preview */}
        <Card className="border-emerald-200 bg-emerald-50/40 shadow-none">
          <CardContent className="py-3 px-4 space-y-2">
            <p className="text-[11px] uppercase tracking-wide text-emerald-700 font-semibold">
              Preview (sample data)
            </p>
            {isEmail && (
              <p className="text-sm font-semibold text-slate-900">{previewSubject || "(empty subject)"}</p>
            )}
            <p className="text-sm whitespace-pre-wrap text-slate-700">{previewBody || "(empty body)"}</p>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : "Save customisation"}
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
            {resetting ? "Resetting…" : "Reset to default"}
          </Button>
        </div>

        <p className="text-[10px] text-slate-500 text-center">
          Saved customisations are scoped to your company. Other tenants see their own templates (or the system default).
        </p>

        <Button variant="ghost" onClick={onClose} className="w-full">Close</Button>
      </div>
    </>
  );
}

export default function ProtectedMessagingTemplatesPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <MessagingTemplatesPage />
    </ProtectedRoute>
  );
}
