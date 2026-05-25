/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/integrations/embed/[id] - form customiser.
 *
 * Three columns at desktop (left = field editor, middle = live preview,
 * right = settings sidebar). Stacks on mobile. Auto-saves on blur. The
 * preview iframe re-renders on every change so the tenant sees what the
 * end customer will see.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  ArrowLeft,
  Save,
  Code2,
  ExternalLink,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Loader2,
  Eye,
  Calculator,
} from "lucide-react";

import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import type {
  EmbedField, EmbedFieldType, EmbedFieldMapping, EmbedFormConfig,
  EmbedPricingTier, EmbedButtonRadius, EmbedLayout,
} from "@/types/embedForms";
import { SnippetDialog } from "@/components/admin/embed/SnippetDialog";
import { AnalyticsBlock } from "@/components/admin/embed/AnalyticsBlock";
import { getTemplateMeta } from "@/lib/embed/templateCatalog";
import { useTenantHref } from "@/lib/tenantUrl";
import { captureException } from "@/lib/observability";
import { getSetupChecklist, summariseReadiness, type SetupCheck, TEMPLATE_INTENT } from "@/lib/embed/setupChecks";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const FIELD_TYPES: { value: EmbedFieldType; label: string }[] = [
  { value: "text",       label: "Text" },
  { value: "email",      label: "Email" },
  { value: "phone",      label: "Phone" },
  { value: "number",     label: "Number" },
  { value: "date",       label: "Date" },
  { value: "time",       label: "Time" },
  { value: "textarea",   label: "Long text" },
  { value: "select",     label: "Dropdown" },
  { value: "radio",      label: "Radio (single choice)" },
  { value: "checkbox",   label: "Checkbox (single)" },
  { value: "checkboxes", label: "Checkbox group (multi)" },
  { value: "tier",       label: "Pricing tier" },
];

const MAP_NONE = "__none__";
const MAPPINGS: { value: typeof MAP_NONE | EmbedFieldMapping; label: string }[] = [
  { value: MAP_NONE,      label: "(no mapping)" },
  { value: "name",        label: "Lead name" },
  { value: "email",       label: "Lead email" },
  { value: "phone",       label: "Lead phone" },
  { value: "event_date",  label: "Event date" },
  { value: "guest_count", label: "Guest count" },
  { value: "venue",       label: "Venue" },
  { value: "event_name",  label: "Event type" },
  { value: "event_type",  label: "Event type code" },
  { value: "budget",      label: "Budget" },
  { value: "dietary",     label: "Dietary" },
  { value: "cuisine_type",label: "Cuisine type" },
  { value: "notes",       label: "Notes (appended)" },
];

// LCF-F (task #227, 2026-05-25): rolled back the ProtectedRoute
// wrap added in LCF-B. Wrapping caused the page to flicker
// between "Verifying your credentials" and the loaded shell -
// ProtectedRoute kept remounting in a loop. Middleware ROUTE_
// GUARDS["/admin"] already enforces admin-role access, and the
// API endpoints all do their own session check. The page-level
// wrap was defence-in-depth, not the only gate. Removing it
// stops the loop without weakening security.
export default function EmbedFormCustomiser() {
  const router = useRouter();
  // Wave 27.3: tenant-slug wrapper for internal navigations.
  const { withSlug } = useTenantHref();
  const { id } = router.query;
  const { user, company } = useAuth() as any;
  const { toast } = useToast();

  const [form, setForm] = useState<EmbedFormConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [snippetOpen, setSnippetOpen] = useState(false);
  const [pricingTiers, setPricingTiers] = useState<EmbedPricingTier[]>([]);
  const [companyData, setCompanyData] = useState<any>(null);

  const previewIframeRef = useRef<HTMLIFrameElement | null>(null);

  // Load the form + the tenant's pricing tiers.
  useEffect(() => {
    if (!id || typeof id !== "string") return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [formsResp, companyResp] = await Promise.all([
          fetch("/api/admin/embed/forms"),
          fetch("/api/admin/embed/company"),
        ]);
        const formsJson = await formsResp.json();
        const companyJson = await companyResp.json();

        const found = (formsJson.forms || []).find((f: any) => f.id === id);
        if (!found) {
          toast({ title: "Form not found", variant: "destructive" });
          router.push(withSlug("/admin/integrations/embed"));
          return;
        }
        if (!cancelled) {
          setForm(found);
          setCompanyData(companyJson.company);
          setPricingTiers(companyJson.company?.embed_pricing_tiers || []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Push draft into the preview iframe whenever the form mutates.
  // The demo loader listens for postMessage with {type: 'embed-draft', config}.
  useEffect(() => {
    if (!form) return;
    const iframe = previewIframeRef.current;
    if (!iframe || !iframe.contentWindow) return;
    try {
      iframe.contentWindow.postMessage({ type: "embed-draft", config: form }, "*");
    } catch {
      // Same-origin only - the demo iframe lives on our own domain so this should not throw.
    }
  }, [form]);

  const saveForm = useCallback(async (next: Partial<EmbedFormConfig>, opts: { silent?: boolean } = {}) => {
    if (!form) return;
    setSaving(true);
    try {
      const resp = await fetch(`/api/admin/embed/forms?id=${form.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Save failed");
      setForm(json.form);
      setDirty(false);
      if (!opts.silent) toast({ title: "Saved" });
    } catch (err: any) {
      captureException(err, {
        tags: { route: "/admin/integrations/embed/[id]", step: "save-form", formId: form?.id || "", companyId: user?.company_id || "" },
      });
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [form, toast, user?.company_id]);

  // LCF-B (task #223, 2026-05-25): beforeunload guard while dirty,
  // mirroring the company-profile + white-label + kitchen-settings
  // pattern. Stops a refresh / nav-away mid-edit from silently
  // losing field tweaks.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Mutators - stage changes locally, mark dirty, save on explicit Save click
  // or when a relevant blur fires. Field reorders auto-save because they're
  // discrete actions, not text typing.
  function patchLocal(next: Partial<EmbedFormConfig>) {
    if (!form) return;
    setForm({ ...form, ...next });
    setDirty(true);
  }

  function updateField(idx: number, patch: Partial<EmbedField>) {
    if (!form) return;
    const fields = form.fields.map((f, i) => i === idx ? { ...f, ...patch } : f);
    patchLocal({ fields });
  }

  function moveField(idx: number, dir: -1 | 1) {
    if (!form) return;
    const fields = [...form.fields];
    const target = idx + dir;
    if (target < 0 || target >= fields.length) return;
    [fields[idx], fields[target]] = [fields[target], fields[idx]];
    fields.forEach((f, i) => { f.order = i + 1; });
    saveForm({ fields });
    setForm({ ...form, fields });
  }

  function addField() {
    if (!form) return;
    const id = `field_${Math.random().toString(36).slice(2, 8)}`;
    const newField: EmbedField = {
      id,
      type: "text",
      label: "New field",
      required: false,
      visible: true,
      order: form.fields.length + 1,
    };
    patchLocal({ fields: [...form.fields, newField] });
  }

  function removeField(idx: number) {
    if (!form) return;
    const fields = form.fields.filter((_, i) => i !== idx);
    patchLocal({ fields });
  }

  async function savePricingTiers() {
    try {
      const resp = await fetch("/api/admin/embed/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embed_pricing_tiers: pricingTiers }),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Save failed");
      toast({ title: "Pricing tiers saved" });
    } catch (err: any) {
      captureException(err, {
        tags: { route: "/admin/integrations/embed/[id]", step: "save-pricing-tiers", companyId: user?.company_id || "" },
      });
      toast({ title: "Couldn't save tiers", description: err.message, variant: "destructive" });
    }
  }

  const templateMeta = useMemo(
    () => form ? getTemplateMeta(form.template_id) : undefined,
    [form?.template_id]   // eslint-disable-line react-hooks/exhaustive-deps
  );
  const showsPricing = templateMeta?.usesPricingTiers ?? false;

  // LCF-B (task #223, 2026-05-25): derive the template-aware setup
  // checklist from the live form state + tenant tier count. Pure;
  // recomputes on every form mutation so the banner is always in
  // sync with what's on screen.
  const setupChecklist: SetupCheck[] = useMemo(() => {
    if (!form) return [];
    return getSetupChecklist({
      form,
      templateMeta,
      pricingTiersCount: pricingTiers.length,
    });
  }, [form, templateMeta, pricingTiers.length]);
  const readiness = useMemo(() => summariseReadiness(setupChecklist), [setupChecklist]);

  const previewSrc = useMemo(() => {
    if (!form || !companyData?.embed_token) return "";
    // LCF-H (task #229, 2026-05-25): pass tenant brand through so the
    // demo fallback shows real company name + colours when the API
    // path can't be hit.
    const qs = new URLSearchParams({
      token: companyData.embed_token,
      slug: form.slug,
      template: form.template_id,
      draft: "1",
    });
    if (companyData.company_name) qs.set("companyName", companyData.company_name);
    if (form.theme?.primary_color) qs.set("primary", form.theme.primary_color);
    else if (companyData.primary_color) qs.set("primary", companyData.primary_color);
    if (form.theme?.secondary_color) qs.set("secondary", form.theme.secondary_color);
    else if (companyData.secondary_color) qs.set("secondary", companyData.secondary_color);
    if (companyData.logo_url) qs.set("logoUrl", companyData.logo_url);
    if (companyData.currency) qs.set("currency", companyData.currency);
    return `/embed/demo.html?${qs.toString()}`;
  }, [form?.slug, form?.template_id, form?.theme?.primary_color, form?.theme?.secondary_color, companyData?.embed_token, companyData?.company_name, companyData?.primary_color, companyData?.secondary_color, companyData?.logo_url, companyData?.currency]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Force-reload key. The postMessage path below is the soft option,
  // but the demo page doesn't always re-render on draft messages
  // (helpers.js doesn't subscribe). Bumping this key on every config-
  // affecting change forces a fresh iframe and guarantees the
  // operator sees their edit reflected. We hash a few fields to keep
  // re-mounts to actual content changes (not unrelated re-renders).
  const previewKey = useMemo(() => {
    if (!form) return "blank";
    const themeStr = JSON.stringify(form.theme || {});
    const fieldsStr = (form.fields || [])
      .map((f: any) => `${f.id}:${f.type}:${f.required ? 1 : 0}:${f.label || ""}`)
      .join("|");
    return `${form.template_id}::${themeStr}::${fieldsStr}::${form.success_message || ""}::${form.redirect_url || ""}`;
  }, [form]);

  if (loading || !form) {
    return (
      <>
        <NoIndexMeta />
        <AdminNav />
        <div className="min-h-screen lg:pl-72 xl:pl-80 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      </>
    );
  }

  return (
    <>
      <NoIndexMeta />
      <Head><title>{form.name} - Lead Capture Forms</title></Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 lg:pl-72 xl:pl-80">
        <div className="px-4 py-6 md:py-8 max-w-full">

          {/* Top bar */}
          <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Button asChild variant="ghost" size="icon">
                <Link href={withSlug("/admin/integrations/embed")}>
                  <ArrowLeft className="w-5 h-5" />
                </Link>
              </Button>
              <Input
                value={form.name}
                onChange={(e) => patchLocal({ name: e.target.value })}
                onBlur={() => dirty && saveForm({ name: form.name }, { silent: true })}
                className="text-xl md:text-2xl font-bold border-0 shadow-none px-0 focus-visible:ring-0 bg-transparent min-w-[260px]"
              />
              {dirty && <span className="text-xs text-amber-600">Unsaved</span>}
              {/* LCF-B: persistent readiness chip beside the title.
                  Reads from the same checklist that powers the
                  banner below. */}
              {!readiness.ready ? (
                <Badge className="bg-rose-100 text-rose-800 border border-rose-200 gap-1 ml-2">
                  <AlertTriangle className="w-3 h-3" />
                  {readiness.failingRequired} required gap{readiness.failingRequired === 1 ? "" : "s"}
                </Badge>
              ) : readiness.failingRecommended > 0 ? (
                <Badge className="bg-amber-100 text-amber-800 border border-amber-200 gap-1 ml-2">
                  <Info className="w-3 h-3" />
                  {readiness.failingRecommended} recommended
                </Badge>
              ) : (
                <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-200 gap-1 ml-2">
                  <CheckCircle2 className="w-3 h-3" />
                  Ready to embed
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="outline"
                onClick={() => setSnippetOpen(true)}
                className="gap-2"
                title={readiness.ready ? "Copy embed snippet" : "Form has setup gaps - tap the checklist below first"}
              >
                <Code2 className="w-4 h-4" /> Get snippet
              </Button>
              <Button
                onClick={() => saveForm(form)}
                disabled={saving || !dirty}
                className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </Button>
            </div>
          </div>

          {/* LCF-B (task #223, 2026-05-25): per-template setup
              checklist. Each row is anchored to the section it
              cares about; clicking jumps. Hides when every check
              passes so a finished form has a clean canvas. */}
          {(() => {
            if (setupChecklist.length === 0) return null;
            const failing = setupChecklist.filter((c) => !c.passed);
            if (failing.length === 0 && readiness.failingRequired === 0 && readiness.failingRecommended === 0) {
              // Render a slim green confirmation strip when nothing's failing.
              return (
                <Card className="border-0 shadow mb-4 bg-gradient-to-br from-emerald-50 to-teal-50">
                  <CardContent className="p-3 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <p className="text-xs text-emerald-900">
                      <strong>Form is ready to embed.</strong>{" "}
                      {templateMeta && <span className="text-emerald-800">{TEMPLATE_INTENT[templateMeta.id]}</span>}
                    </p>
                  </CardContent>
                </Card>
              );
            }
            const requiredFails = failing.filter((c) => c.severity === "required");
            const recommendedFails = failing.filter((c) => c.severity === "recommended");
            const toneClass = requiredFails.length > 0
              ? "from-rose-50 to-orange-50"
              : "from-amber-50 to-yellow-50";
            const headIcon = requiredFails.length > 0
              ? <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
              : <Info className="w-5 h-5 text-amber-600 flex-shrink-0" />;
            return (
              <Card className={`border-0 shadow mb-4 bg-gradient-to-br ${toneClass}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      {headIcon}
                      <p className="font-semibold text-slate-900">
                        Setup checklist
                        {templateMeta && (
                          <span className="ml-2 text-sm font-normal text-slate-600">
                            {templateMeta.name}
                          </span>
                        )}
                      </p>
                    </div>
                    <p className="text-xs tabular-nums text-slate-600">
                      {requiredFails.length > 0 && (
                        <span className="text-rose-700 font-semibold">{requiredFails.length} required</span>
                      )}
                      {requiredFails.length > 0 && recommendedFails.length > 0 && <span className="mx-1">·</span>}
                      {recommendedFails.length > 0 && (
                        <span className="text-amber-700">{recommendedFails.length} recommended</span>
                      )}
                    </p>
                  </div>
                  {templateMeta && (
                    <p className="text-xs text-slate-600 mb-3">
                      <strong>Template intent:</strong> {TEMPLATE_INTENT[templateMeta.id]}
                    </p>
                  )}
                  <ul className="space-y-1.5">
                    {failing.map((c) => {
                      const isRequired = c.severity === "required";
                      const Icon = isRequired ? AlertTriangle : Info;
                      const tone = isRequired
                        ? "border-rose-200 text-rose-900 hover:bg-rose-50/80 bg-white/70"
                        : "border-amber-200 text-amber-900 hover:bg-amber-50/80 bg-white/70";
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => {
                              if (!c.anchor) return;
                              const el = document.getElementById(c.anchor);
                              if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                            }}
                            disabled={!c.anchor}
                            className={`w-full text-left px-3 py-2 rounded-md border transition-colors text-sm flex items-start gap-2 ${tone}`}
                          >
                            <Icon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium">{c.label}</p>
                              {c.detail && (
                                <p className="text-xs opacity-90 mt-0.5">{c.detail}</p>
                              )}
                            </div>
                            {isRequired && (
                              <Badge className="bg-rose-600 text-white text-[10px] flex-shrink-0">Required</Badge>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            );
          })()}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

            {/* Left: field editor */}
            <div id="section-fields" className="lg:col-span-4 scroll-mt-20">
              <Card className="border-0 shadow-lg">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-slate-900">Fields</h3>
                    <Button size="sm" variant="outline" onClick={addField} className="gap-1.5 h-8">
                      <Plus className="w-3.5 h-3.5" /> Add field
                    </Button>
                  </div>

                  {form.fields.length === 0 && (
                    <p className="text-sm text-slate-500 py-6 text-center">
                      No fields yet. Click "Add field" to start.
                    </p>
                  )}

                  {form.fields.map((field, idx) => (
                    <FieldEditor
                      key={field.id + idx}
                      field={field}
                      otherFields={form.fields.filter((_, i) => i !== idx)}
                      templateId={form.template_id}
                      isFirst={idx === 0}
                      isLast={idx === form.fields.length - 1}
                      onChange={(patch) => updateField(idx, patch)}
                      onBlurSave={() => dirty && saveForm({ fields: form.fields }, { silent: true })}
                      onMoveUp={() => moveField(idx, -1)}
                      onMoveDown={() => moveField(idx, 1)}
                      onRemove={() => removeField(idx)}
                    />
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Middle: live preview */}
            <div className="lg:col-span-5">
              <Card className="border-0 shadow-lg">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                      <Eye className="w-4 h-4 text-indigo-600" /> Live preview
                    </h3>
                    {previewSrc && (
                      <Button asChild size="sm" variant="ghost" className="gap-1.5 h-8 text-xs">
                        <a href={previewSrc} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-3.5 h-3.5" /> Open in new tab
                        </a>
                      </Button>
                    )}
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white overflow-hidden h-[640px]">
                    {previewSrc ? (
                      <iframe
                        key={previewKey}
                        ref={previewIframeRef}
                        src={previewSrc}
                        title="Form preview"
                        className="w-full h-full border-0"
                        sandbox="allow-scripts allow-same-origin allow-forms"
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                        Loading preview...
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right: settings sidebar */}
            <div className="lg:col-span-3 space-y-4">

              {/* Form settings */}
              <Card id="section-form-settings" className="border-0 shadow-lg scroll-mt-20">
                <CardContent className="p-4 space-y-3">
                  <h3 className="font-bold text-slate-900">Form settings</h3>
                  <div>
                    <Label className="text-xs">Slug</Label>
                    <Input
                      value={form.slug}
                      onChange={(e) => patchLocal({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
                      onBlur={() => dirty && saveForm({ slug: form.slug }, { silent: true })}
                      className="font-mono text-xs mt-1"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">URL-safe identifier used in the embed snippet.</p>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <Label className="text-xs">Active</Label>
                    <Switch
                      checked={form.is_active}
                      onCheckedChange={(v) => { patchLocal({ is_active: v }); saveForm({ is_active: v }, { silent: true }); }}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Theme */}
              <Card className="border-0 shadow-lg">
                <CardContent className="p-4 space-y-3">
                  <h3 className="font-bold text-slate-900">Theme</h3>
                  <ColorRow
                    label="Primary colour"
                    value={form.theme?.primary_color || ""}
                    onChange={(v) => patchLocal({ theme: { ...form.theme, primary_color: v } })}
                    onBlur={() => dirty && saveForm({ theme: form.theme }, { silent: true })}
                  />
                  <ColorRow
                    label="Secondary colour"
                    value={form.theme?.secondary_color || ""}
                    onChange={(v) => patchLocal({ theme: { ...form.theme, secondary_color: v } })}
                    onBlur={() => dirty && saveForm({ theme: form.theme }, { silent: true })}
                  />
                  <div>
                    <Label className="text-xs">Button radius</Label>
                    <Select
                      value={form.theme?.button_radius || "medium"}
                      onValueChange={(v) => { const t = { ...form.theme, button_radius: v as EmbedButtonRadius }; patchLocal({ theme: t }); saveForm({ theme: t }, { silent: true }); }}
                    >
                      <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="small">Small</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="full">Full</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Layout</Label>
                    <Select
                      value={form.theme?.layout || "single-column"}
                      onValueChange={(v) => { const t = { ...form.theme, layout: v as EmbedLayout }; patchLocal({ theme: t }); saveForm({ theme: t }, { silent: true }); }}
                    >
                      <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single-column">Single column</SelectItem>
                        <SelectItem value="two-column">Two column</SelectItem>
                        <SelectItem value="card">Card</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Empty colour fields inherit your white-label theme.
                  </p>
                </CardContent>
              </Card>

              {/* Success behaviour */}
              <Card id="section-after-submit" className="border-0 shadow-lg scroll-mt-20">
                <CardContent className="p-4 space-y-3">
                  <h3 className="font-bold text-slate-900">After submit</h3>
                  <div>
                    <Label className="text-xs">Success message</Label>
                    <Textarea
                      value={form.success_message || ""}
                      onChange={(e) => patchLocal({ success_message: e.target.value })}
                      onBlur={() => dirty && saveForm({ success_message: form.success_message }, { silent: true })}
                      rows={3}
                      className="text-xs mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Redirect URL (optional)</Label>
                    <Input
                      value={form.redirect_url || ""}
                      onChange={(e) => patchLocal({ redirect_url: e.target.value || null })}
                      onBlur={() => dirty && saveForm({ redirect_url: form.redirect_url }, { silent: true })}
                      placeholder="https://yoursite.com/thank-you"
                      className="text-xs mt-1"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">Must be https. Sent to this URL instead of showing the success message.</p>
                  </div>
                </CardContent>
              </Card>

              {/* Notifications - per-form overrides for the email +
                  auto-reply flags. Defaults to "yes, email me" because
                  Bobby explicitly called this out as the must-work
                  behaviour for tenants going live. */}
              <Card className="border-0 shadow-lg">
                <CardContent className="p-4 space-y-3">
                  <h3 className="font-bold text-slate-900">Notifications</h3>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs font-medium">Email me on new submissions</Label>
                      <p className="text-[10px] text-slate-500 mt-0.5">Goes to your company notification email or the owner's profile email.</p>
                    </div>
                    <Switch
                      checked={form.notify_admin_email !== false}
                      onCheckedChange={(v) => {
                        patchLocal({ notify_admin_email: v } as any);
                        saveForm({ notify_admin_email: v } as any, { silent: true });
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs font-medium">Send a thank-you to the visitor</Label>
                      <p className="text-[10px] text-slate-500 mt-0.5">Auto-reply confirmation email after they submit.</p>
                    </div>
                    <Switch
                      checked={form.auto_reply_enabled === true}
                      onCheckedChange={(v) => {
                        patchLocal({ auto_reply_enabled: v } as any);
                        saveForm({ auto_reply_enabled: v } as any, { silent: true });
                      }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-500">
                    The in-app notification bell always fires regardless of these toggles.
                  </p>
                </CardContent>
              </Card>

              {/* Pricing tiers (only when relevant template) */}
              {showsPricing && (
                <Card id="section-pricing-tiers" className="border-0 shadow-lg scroll-mt-20">
                  <CardContent className="p-4 space-y-3">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-amber-500" /> Pricing tiers
                    </h3>
                    <p className="text-[11px] text-slate-500 -mt-1">
                      Powers the live estimate on this template. Tiers are tenant-wide, shared across all forms that use them.
                    </p>
                    {pricingTiers.length === 0 && (
                      <p className="text-xs text-slate-500 py-2">No tiers yet.</p>
                    )}
                    {pricingTiers.map((tier, i) => (
                      <div key={tier.id || i} className="border border-slate-200 rounded-md p-2 space-y-1.5">
                        <Input
                          value={tier.name}
                          placeholder="Tier name"
                          onChange={(e) => setPricingTiers(prev => prev.map((t, idx) => idx === i ? { ...t, name: e.target.value } : t))}
                          className="h-8 text-xs"
                        />
                        <div className="grid grid-cols-2 gap-1.5">
                          <Input
                            type="number"
                            value={tier.price_per_person_min}
                            placeholder="Min /person"
                            onChange={(e) => setPricingTiers(prev => prev.map((t, idx) => idx === i ? { ...t, price_per_person_min: Number(e.target.value) } : t))}
                            className="h-8 text-xs"
                          />
                          <Input
                            type="number"
                            value={tier.price_per_person_max}
                            placeholder="Max /person"
                            onChange={(e) => setPricingTiers(prev => prev.map((t, idx) => idx === i ? { ...t, price_per_person_max: Number(e.target.value) } : t))}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <Input
                            value={tier.currency || "ZAR"}
                            onChange={(e) => setPricingTiers(prev => prev.map((t, idx) => idx === i ? { ...t, currency: e.target.value.toUpperCase() } : t))}
                            className="h-7 text-xs w-20"
                          />
                          <Button size="sm" variant="ghost" onClick={() => setPricingTiers(prev => prev.filter((_, idx) => idx !== i))} className="h-7 text-red-600 hover:text-red-700">
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPricingTiers(prev => [...prev, {
                          id: `tier_${Math.random().toString(36).slice(2, 8)}`,
                          name: "New tier",
                          price_per_person_min: 0,
                          price_per_person_max: 0,
                          currency: "ZAR",
                        }])}
                        className="flex-1 gap-1.5 h-8"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add tier
                      </Button>
                      <Button size="sm" onClick={savePricingTiers} className="flex-1 h-8 bg-amber-500 hover:bg-amber-600">
                        Save tiers
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Analytics */}
              <Card className="border-0 shadow-lg">
                <CardContent className="p-4 space-y-3">
                  <h3 className="font-bold text-slate-900">Analytics</h3>
                  <AnalyticsBlock formId={form.id} />
                </CardContent>
              </Card>
            </div>

          </div>

        </div>
        <Footer />
      </div>

      <SnippetDialog
        open={snippetOpen}
        onOpenChange={setSnippetOpen}
        form={form}
        embedToken={companyData?.embed_token || company?.embed_token}
        companyName={company?.company_name}
      />
    </>
  );
}

function FieldEditor({
  field, otherFields, templateId, isFirst, isLast,
  onChange, onBlurSave, onMoveUp, onMoveDown, onRemove,
}: {
  field: EmbedField;
  otherFields: EmbedField[];
  templateId: string;
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<EmbedField>) => void;
  onBlurSave: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Single-pick options for select/radio; multi-pick for checkboxes.
  const needsOptions =
    field.type === "select" ||
    field.type === "radio" ||
    field.type === "checkboxes";
  // detailed-multi-step puts fields onto numbered pages. We expose
  // the page selector only there; other templates ignore the value.
  const supportsSteps = templateId === "detailed-multi-step";
  const fieldStep = (field as any).step;

  return (
    <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex flex-col">
          <Button size="icon" variant="ghost" disabled={isFirst} onClick={onMoveUp} className="h-6 w-6">
            <ChevronUp className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" disabled={isLast} onClick={onMoveDown} className="h-6 w-6">
            <ChevronDown className="w-3.5 h-3.5" />
          </Button>
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <Input
            value={field.label}
            onChange={(e) => onChange({ label: e.target.value })}
            onBlur={onBlurSave}
            placeholder="Field label"
            className="h-8 text-sm font-medium"
          />
          <div className="grid grid-cols-2 gap-2">
            <Select value={field.type} onValueChange={(v) => onChange({ type: v as EmbedFieldType })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              value={field.placeholder || ""}
              onChange={(e) => onChange({ placeholder: e.target.value })}
              onBlur={onBlurSave}
              placeholder="Placeholder"
              className="h-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Switch checked={field.required} onCheckedChange={(v) => onChange({ required: v })} />
              Required
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <Switch checked={field.visible} onCheckedChange={(v) => onChange({ visible: v })} />
              Visible
            </label>
          </div>

          {needsOptions && (
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-slate-500">Options (one per line, format: value|label)</Label>
              <Textarea
                value={(field.options || []).map((o) => `${o.value}|${o.label}`).join("\n")}
                onChange={(e) => {
                  const opts = e.target.value.split("\n").map((line) => {
                    const [value, label] = line.split("|").map((s) => s.trim());
                    return { value: value || "", label: label || value || "" };
                  }).filter((o) => o.value);
                  onChange({ options: opts });
                }}
                onBlur={onBlurSave}
                rows={3}
                className="text-xs font-mono mt-1"
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowAdvanced((s) => !s)}
            className="text-[11px] text-indigo-600 hover:text-indigo-700"
          >
            {showAdvanced ? "Hide advanced" : "Show advanced"}
          </button>

          {showAdvanced && (
            <div className="space-y-2 pt-1 border-t border-slate-200">
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-slate-500">Maps to lead column</Label>
                <Select
                  value={field.mapsTo || MAP_NONE}
                  onValueChange={(v) => onChange({ mapsTo: (v === MAP_NONE ? undefined : v) as EmbedFieldMapping | undefined })}
                >
                  <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MAPPINGS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {otherFields.length > 0 && (
                <div>
                  <Label className="text-[10px] uppercase tracking-wide text-slate-500">Show only if</Label>
                  <div className="grid grid-cols-2 gap-1.5 mt-1">
                    <Select
                      value={field.conditional?.showIfFieldId || MAP_NONE}
                      onValueChange={(v) => onChange({ conditional: v && v !== MAP_NONE ? { showIfFieldId: v, showIfValue: field.conditional?.showIfValue || "" } : undefined })}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="(always shown)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={MAP_NONE}>(always shown)</SelectItem>
                        {otherFields.map((f) => <SelectItem key={f.id} value={f.id}>{f.label || f.id}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input
                      value={Array.isArray(field.conditional?.showIfValue) ? field.conditional?.showIfValue.join(",") : (field.conditional?.showIfValue || "")}
                      onChange={(e) => {
                        if (!field.conditional?.showIfFieldId) return;
                        onChange({ conditional: { showIfFieldId: field.conditional.showIfFieldId, showIfValue: e.target.value } });
                      }}
                      onBlur={onBlurSave}
                      placeholder="equals value"
                      className="h-8 text-xs"
                      disabled={!field.conditional?.showIfFieldId}
                    />
                  </div>
                </div>
              )}
              {supportsSteps && (
                <div>
                  <Label className="text-[10px] uppercase tracking-wide text-slate-500">Step (multi-step forms)</Label>
                  <Select
                    value={typeof fieldStep === "number" ? String(fieldStep) : "auto"}
                    onValueChange={(v) =>
                      onChange({
                        ...(v === "auto"
                          ? ({ step: undefined } as any)
                          : ({ step: Number(v) } as any)),
                      } as any)
                    }
                  >
                    <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto (group by field id)</SelectItem>
                      <SelectItem value="0">Step 1 - Contact</SelectItem>
                      <SelectItem value="1">Step 2 - Event</SelectItem>
                      <SelectItem value="2">Step 3 - Preferences</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {"Pin this field to a specific page. \"Auto\" falls back to grouping by field id (name/email → step 1, event_date/guests → step 2, etc)."}
                  </p>
                </div>
              )}
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-slate-500">Field id</Label>
                <Input value={field.id} readOnly className="h-7 text-xs font-mono mt-1 bg-slate-100" />
              </div>
            </div>
          )}
        </div>
        <Button size="icon" variant="ghost" onClick={onRemove} className="h-6 w-6 text-red-500 hover:text-red-600">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}

function ColorRow({
  label, value, onChange, onBlur,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2 mt-1">
        <input
          type="color"
          value={value || "#9333ea"}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className="h-8 w-12 rounded border border-slate-200 cursor-pointer"
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder="(inherit)"
          className="font-mono text-xs h-8"
        />
      </div>
    </div>
  );
}
