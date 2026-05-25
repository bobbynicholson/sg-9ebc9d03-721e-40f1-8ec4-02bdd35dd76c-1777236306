/**
 * /admin/messaging-templates - the central place where the catering
 * owner edits every email + WhatsApp template the system uses to
 * speak to clients and staff.
 *
 * One page, two channels (email + WhatsApp), grouped by purpose
 * (lead follow-up, quote, day of event, staff, order lifecycle,
 * pre-event, money, lead alerts, account). Each row shows whether
 * it is currently using the system default or the company's
 * customisation. Click edit -> drawer with subject (email only),
 * body, variable insert chips, live preview, save / reset / cancel.
 *
 * Wave 50 (LCF-L, task #233): admit OWNER role, capture exceptions
 * with tenant tags, drop the useAuth() as-any cast, add a search
 * box + "only customised" filter + per-row coverage chip, dirty
 * guard while the drawer has unsaved edits, and expand the registry
 * to cover order lifecycle, embed lead alerts, pre-event reminders,
 * transactional reminders and portal-link emails so an operator can
 * edit the wording of every system-driven message in one place.
 *
 * Related pages:
 *   /admin/email-templates - after-sales lifecycle templates (no
 *   response chasers, payment reminders). That page is intentionally
 *   left alone today; it deals with a different lifecycle and uses
 *   localStorage. Future: fold both pages into one (tracked in the
 *   deferred backlog).
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
import { Switch } from "@/components/ui/switch";
import { SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ComposeDrawerHost } from "@/components/messaging/ComposeDrawerHost";
import { Mail, MessageCircle, Pencil, RotateCcw, Save, Sparkles, AlertCircle, CheckCircle2, Search, Send } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { captureException } from "@/lib/observability";
import {
  renderTemplate,
  type MessageChannel,
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

function MessagingTemplatesPage() {
  const companyId = useCompanyId();
  const { toast } = useToast();
  const [rows, setRows] = useState<MergedTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<MergedTemplate | null>(null);
  const [filterChannel, setFilterChannel] = useState<"all" | MessageChannel>("all");
  const [filterCategory, setFilterCategory] = useState<"all" | "client" | "staff">("all");
  const [query, setQuery] = useState("");
  const [onlyCustomised, setOnlyCustomised] = useState(false);

  // Load on mount + after every save / remove so the badges stay accurate.
  const reload = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const list = await listForCompany(companyId);
      setRows(list);
    } catch (err: unknown) {
      const e = err as { message?: string };
      captureException(err, {
        tags: { route: "/admin/messaging-templates", step: "load", companyId },
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
      if (onlyCustomised && !r.isCustomised) return false;
      if (q) {
        const hay = `${r.label} ${r.description} ${r.group} ${r.key}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filterChannel, filterCategory, onlyCustomised, query]);

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
  const emailCount = rows.filter((r) => r.channel === "email").length;
  const whatsappCount = rows.filter((r) => r.channel === "whatsapp").length;

  return (
    <>
      <NoIndexMeta />
      <Head><title>Messaging Templates | Admin</title></Head>
      <AdminNav />

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
        <div className="overflow-x-hidden lg:pl-72 xl:pl-80">
          <div className="px-3 sm:px-4 md:px-6 pt-20 lg:pt-6 pb-24 max-w-screen-2xl">

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
                    Edit every email and WhatsApp template the system sends to clients and staff. Change the wording, the tone, the sign-off. It stays customised for your team and falls back to the system default if you reset it.
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
                    Customised
                  </p>
                  <p className="text-3xl font-bold text-emerald-700 tabular-nums">
                    {customisedCount}<span className="text-base text-slate-400 font-normal"> / {rows.length}</span>
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {emailCount} email &middot; {whatsappCount} WhatsApp
                  </p>
                </div>
              </div>
            </div>

            {/* COVERAGE BANNER */}
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
                {/* Search */}
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
                        : <MessageCircle className="w-4 h-4 text-emerald-600" />}
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-700">
                        {g.channel} &middot; {g.category} &middot; {g.group}
                      </p>
                      <span className="text-[10px] text-slate-400 ml-1">
                        ({g.items.length})
                      </span>
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
                                <code className="text-[10px] font-mono text-slate-400 ml-auto hidden sm:inline">
                                  {row.key}
                                </code>
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

      {/* EDITOR DRAWER - shared resizable host (drag the left edge) */}
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
  const [sendingTest, setSendingTest] = useState(false);

  const dirty = subject !== initialSubject || body !== initialBody;

  // Dirty guard - warn the operator before navigating away with
  // unsaved customisations. Standard pattern from company-profile /
  // white-label / kitchen-settings.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

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
    } catch (err: unknown) {
      const e = err as { message?: string };
      captureException(err, {
        tags: {
          route: "/admin/messaging-templates",
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
          route: "/admin/messaging-templates",
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

  // Send test reads the LIVE override (or default if no override).
  // If the operator has unsaved edits, we ask them to save first so
  // what they see in the inbox matches what they tested.
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
      if (!resp.ok) throw new Error(json?.error || "Send failed");
      toast({
        title: "Test sent",
        description: `Sent to ${json.to}. Check your ${json.channel === "email" ? "inbox" : "WhatsApp"}.`,
      });
    } catch (err: unknown) {
      const e = err as { message?: string };
      captureException(err, {
        tags: {
          route: "/admin/messaging-templates",
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
            : <MessageCircle className="w-5 h-5 text-emerald-600" />}
          {template.label}
        </SheetTitle>
        <SheetDescription className="flex items-center gap-2">
          <span>{template.description}</span>
          <code className="text-[10px] font-mono text-slate-400 px-1.5 py-0.5 bg-slate-100 rounded">
            {template.key}
          </code>
        </SheetDescription>
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
                  title={`${v.description} - example: ${v.example}`}
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

export default function ProtectedMessagingTemplatesPage() {
  return (
    <ProtectedRoute
      allowedRoles={[
        UserRole.SUPER_ADMIN,
        UserRole.COMPANY_ADMIN,
        UserRole.ADMIN,
        UserRole.OWNER,
      ]}
    >
      <MessagingTemplatesPage />
    </ProtectedRoute>
  );
}
