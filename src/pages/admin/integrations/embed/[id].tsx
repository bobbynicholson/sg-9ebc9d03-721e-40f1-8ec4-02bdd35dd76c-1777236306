/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/integrations/embed/[id] -- form customiser.
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

const FIELD_TYPES: { value: EmbedFieldType; label: string }[] = [
  { value: "text",     label: "Text" },
  { value: "email",    label: "Email" },
  { value: "phone",    label: "Phone" },
  { value: "number",   label: "Number" },
  { value: "date",     label: "Date" },
  { value: "time",     label: "Time" },
  { value: "textarea", label: "Long text" },
  { value: "select",   label: "Dropdown" },
  { value: "radio",    label: "Radio" },
  { value: "checkbox", label: "Checkbox" },
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

export default function EmbedFormCustomiser() {
  const router = useRouter();
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
          router.push("/admin/integrations/embed");
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
      // Same-origin only -- the demo iframe lives on our own domain so this should not throw.
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
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [form, toast]);

  // Mutators -- stage changes locally, mark dirty, save on explicit Save click
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
      toast({ title: "Couldn't save tiers", description: err.message, variant: "destructive" });
    }
  }

  const templateMeta = useMemo(
    () => form ? getTemplateMeta(form.template_id) : undefined,
    [form?.template_id]   // eslint-disable-line react-hooks/exhaustive-deps
  );
  const showsPricing = templateMeta?.usesPricingTiers ?? false;

  const previewSrc = useMemo(() => {
    if (!form || !companyData?.embed_token) return "";
    return `/embed/demo.html?token=${companyData.embed_token}&slug=${encodeURIComponent(form.slug)}&template=${encodeURIComponent(form.template_id)}&draft=1`;
  }, [form?.slug, form?.template_id, companyData?.embed_token]);  // eslint-disable-line react-hooks/exhaustive-deps

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
                <Link href="/admin/integrations/embed">
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
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button variant="outline" onClick={() => setSnippetOpen(true)} className="gap-2">
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

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

            {/* Left: field editor */}
            <div className="lg:col-span-4">
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
              <Card className="border-0 shadow-lg">
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
              <Card className="border-0 shadow-lg">
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
                    <p className="text-[10px] text-slate-500 mt-1">Sent to this URL instead of showing the success message.</p>
                  </div>
                </CardContent>
              </Card>

              {/* Pricing tiers (only when relevant template) */}
              {showsPricing && (
                <Card className="border-0 shadow-lg">
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
  field, otherFields, isFirst, isLast,
  onChange, onBlurSave, onMoveUp, onMoveDown, onRemove,
}: {
  field: EmbedField;
  otherFields: EmbedField[];
  isFirst: boolean;
  isLast: boolean;
  onChange: (patch: Partial<EmbedField>) => void;
  onBlurSave: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const needsOptions = field.type === "select" || field.type === "radio";

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
