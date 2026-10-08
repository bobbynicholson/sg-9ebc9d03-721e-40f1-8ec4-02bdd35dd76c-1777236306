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
  X,
  ListChecks,
  Type as TypeIcon,
  Mail,
  Phone,
  Hash,
  CalendarDays,
  Clock,
  AlignLeft,
  ChevronsUpDown,
  CircleDot,
  SquareCheck,
  BadgeDollarSign,
  EyeOff,
  ChevronRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

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
  EmbedPricingTier, EmbedButtonRadius, EmbedLayout, EmbedFieldSpacing,
} from "@/types/embedForms";
import { SnippetDialog } from "@/components/admin/embed/SnippetDialog";
import { AnalyticsBlock } from "@/components/admin/embed/AnalyticsBlock";
import { getTemplateMeta } from "@/lib/embed/templateCatalog";
import { useTenantHref } from "@/lib/tenantUrl";
import { captureException } from "@/lib/observability";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { getSetupChecklist, summariseReadiness, type SetupCheck, TEMPLATE_INTENT } from "@/lib/embed/setupChecks";
import { CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageWorkbench, PortalHeader, PortalShell } from "@/components/portal/ui";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";

// What the visitor sees for each question type, shown under the type
// picker so the choice is clear without trying it in the preview.
const FIELD_TYPE_HINTS: Record<string, string> = {
  text: "A one-line answer, e.g. a name or venue.",
  email: "An email address. Checked for a valid format.",
  phone: "A phone or WhatsApp number.",
  number: "A number, e.g. guest count or budget.",
  date: "A date picker. Past dates are blocked.",
  time: "A time picker, e.g. serving time.",
  textarea: "A larger box for longer answers.",
  select: "A dropdown: the visitor picks one option.",
  radio: "Option cards: the visitor picks one.",
  checkbox: "One tick box with your own text, e.g. to accept terms.",
  checkboxes: "Tick boxes: the visitor can pick several.",
  tier: "Pricing tiers from the Pricing tiers panel.",
};

// Icon + colour per question type for the editor cards and type picker.
const FIELD_TYPE_META: Record<string, { icon: LucideIcon; tone: string; label: string }> = {
  text:       { icon: TypeIcon,        tone: "bg-sky-50 text-sky-700 ring-sky-200",             label: "Short answer" },
  email:      { icon: Mail,            tone: "bg-indigo-50 text-indigo-700 ring-indigo-200",    label: "Email" },
  phone:      { icon: Phone,           tone: "bg-emerald-50 text-emerald-700 ring-emerald-200", label: "Phone" },
  number:     { icon: Hash,            tone: "bg-amber-50 text-amber-700 ring-amber-200",       label: "Number" },
  date:       { icon: CalendarDays,    tone: "bg-rose-50 text-rose-700 ring-rose-200",          label: "Date" },
  time:       { icon: Clock,           tone: "bg-orange-50 text-orange-700 ring-orange-200",    label: "Time" },
  textarea:   { icon: AlignLeft,       tone: "bg-slate-100 text-slate-700 ring-slate-200",      label: "Long answer" },
  select:     { icon: ChevronsUpDown,  tone: "bg-violet-50 text-violet-700 ring-violet-200",    label: "Dropdown" },
  radio:      { icon: CircleDot,       tone: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200", label: "Option cards" },
  checkbox:   { icon: SquareCheck,     tone: "bg-teal-50 text-teal-700 ring-teal-200",          label: "Single tick box" },
  checkboxes: { icon: ListChecks,      tone: "bg-cyan-50 text-cyan-700 ring-cyan-200",          label: "Tick boxes" },
  tier:       { icon: BadgeDollarSign, tone: "bg-lime-50 text-lime-700 ring-lime-200",          label: "Pricing tier" },
};

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
  { value: "event_time",  label: "Event start time" },
  { value: "guest_count", label: "Guest count" },
  { value: "venue",       label: "Venue" },
  { value: "event_name",  label: "Event type" },
  { value: "event_type",  label: "Event type code" },
  { value: "budget",      label: "Budget" },
  { value: "dietary",     label: "Dietary" },
  { value: "cuisine_type",label: "Cuisine type" },
  { value: "notes",       label: "Notes (appended)" },
];

// Restructure audit 2026-07-02: ProtectedRoute wrap restored (see
// the matching note on /admin/integrations/embed). The LCF-F
// flicker loop that prompted its removal has settled; every other
// /admin page carries the wrap. Middleware stays the route gate,
// the wrap is defence-in-depth with a proper unauthorized screen.
function EmbedFormCustomiser() {
  const router = useRouter();
  // Wave 27.3: tenant-slug wrapper for internal navigations.
  const { withSlug } = useTenantHref();
  const { id } = router.query;
  const { user, company } = useAuth() as any;
  const { toast } = useToast();

  const [form, setForm] = useState<EmbedFormConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Bumped by the Retry button to re-run the load effect.
  const [loadNonce, setLoadNonce] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [snippetOpen, setSnippetOpen] = useState(false);
  const [pricingTiers, setPricingTiers] = useState<EmbedPricingTier[]>([]);
  // Double-submit guard for the tenant-wide tier save.
  const [savingTiers, setSavingTiers] = useState(false);
  const [companyData, setCompanyData] = useState<any>(null);

  const previewIframeRef = useRef<HTMLIFrameElement | null>(null);

  // Load the form + the tenant's pricing tiers.
  useEffect(() => {
    if (!id || typeof id !== "string") return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [formsResp, companyResp] = await Promise.all([
          fetch("/api/admin/embed/forms"),
          fetch("/api/admin/embed/company"),
        ]);
        const formsJson = await formsResp.json();
        const companyJson = await companyResp.json();
        // A 500 here used to fall through to "Form not found" and bounce
        // the operator back to the list. Server errors get a Retry
        // screen instead; only a genuine miss redirects.
        if (!formsResp.ok) throw new Error(formsJson.error || "Failed to load the form");
        if (!companyResp.ok) throw new Error(companyJson.error || "Failed to load company settings");

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
      } catch (err: any) {
        // Without this catch a network failure left the page on an
        // infinite spinner (loading false + form null).
        captureException(err, {
          tags: { route: "/admin/integrations/embed/[id]", step: "load-form", formId: String(id), companyId: user?.company_id || "" },
        });
        if (!cancelled) setLoadError(dbErrorMessage(err, { entity: "form" }));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, loadNonce]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Push the unsaved draft into the preview iframe whenever the form
  // mutates. loader.js (preview mode) re-renders on {type:'embed-draft'}
  // and announces 'embed-preview-ready' once mounted, so the first draft
  // is also delivered after a (re)load. Same-origin target only.
  const formRef = useRef<EmbedFormConfig | null>(null);
  formRef.current = form;
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const postDraft = useCallback(() => {
    const iframe = previewIframeRef.current;
    const current = formRef.current;
    if (!iframe?.contentWindow || !current) return;
    try {
      iframe.contentWindow.postMessage({ type: "embed-draft", config: current }, window.location.origin);
    } catch {
      // Iframe still navigating; the ready message will trigger a resend.
    }
  }, []);
  useEffect(() => {
    if (form) postDraft();
  }, [form, postDraft]);
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return;
      if (ev.data?.type === "embed-preview-ready") postDraft();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [postDraft]);

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
      toast({ title: "Save failed", description: dbErrorMessage(err, { entity: "form" }), variant: "destructive" });
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
    // Data-consistency guard: a tier where min > max renders a
    // backwards estimate range on the public form (for example
    // "R450 to R250 per person"). Catch it before it ships.
    const backwards = pricingTiers.find(
      (t) => Number(t.price_per_person_min) > Number(t.price_per_person_max) && Number(t.price_per_person_max) > 0,
    );
    if (backwards) {
      toast({
        title: "Check the tier prices",
        description: `"${backwards.name || "Unnamed tier"}" has a minimum above its maximum. Swap the values before saving.`,
        variant: "destructive",
      });
      return;
    }
    setSavingTiers(true);
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
      toast({ title: "Couldn't save tiers", description: dbErrorMessage(err, { entity: "pricing tier" }), variant: "destructive" });
    } finally {
      setSavingTiers(false);
    }
  }

  // Scroll to a section and briefly ring it so it's obvious where to look.
  function jumpTo(anchor: string) {
    const el = document.getElementById(anchor);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.classList.add("ring-2", "ring-amber-400", "ring-offset-2", "rounded-xl");
    window.setTimeout(() => el.classList.remove("ring-2", "ring-amber-400", "ring-offset-2", "rounded-xl"), 1800);
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

  // Preview renders the tenant's REAL form (hosted page in preview mode:
  // live fields, brand, catalogue, tiers; submissions are never sent).
  // Unsaved edits are layered on top via postDraft above. The previous
  // demo.html preview showed placeholder fields, not this form.
  // Keyed on the SAVED slug so typing in the slug box doesn't reload the
  // iframe (and 404) on every keystroke.
  const savedSlugRef = useRef<string>("");
  if (form && !dirty) savedSlugRef.current = form.slug;
  const savedSlug = savedSlugRef.current || form?.slug || "";
  const previewSrc = useMemo(() => {
    if (!savedSlug || !companyData?.embed_token) return "";
    const qs = new URLSearchParams({
      token: companyData.embed_token,
      slug: savedSlug,
      preview: "1",
      compact: "1",
    });
    return `/embed/form.html?${qs.toString()}`;
  }, [savedSlug, companyData?.embed_token]);
  // Full-page preview for "Open in new tab" (saved version, no chrome strip).
  const companySlugForLink: string | undefined = companyData?.slug || company?.slug || user?.company_slug;
  const previewTabHref = companySlugForLink && savedSlug
    ? `/quote/${encodeURIComponent(companySlugForLink)}/${encodeURIComponent(savedSlug)}?preview=1`
    : previewSrc.replace("&compact=1", "");

  if (loading || !form) {
    return (
      <>
        <NoIndexMeta />
        <Head><title>Lead capture form - CateringMS</title></Head>
        <AdminNav />
        <div className="admin-page-shell">
          <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
            {loadError ? (
              <div className="mx-auto mt-16 max-w-md rounded-lg border border-rose-200 bg-white p-5 shadow-sm">
                <h2 className="text-base font-bold text-rose-900 mb-1">Couldn't load this form</h2>
                <p className="text-sm text-slate-600 mb-3">{loadError}</p>
                <div className="flex items-center gap-2">
                  <Button onClick={() => setLoadNonce((n) => n + 1)} size="sm" className="bg-brand-primary hover:bg-brand-primary/90">
                    Retry
                  </Button>
                  <Button asChild size="sm" variant="outline" className="gap-1.5">
                    <Link href={withSlug("/admin/integrations/embed")}>
                      <ArrowLeft className="w-3.5 h-3.5" /> Back to forms
                    </Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[50vh] items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            )}
          </PortalShell>
        </div>
      </>
    );
  }

  return (
    <>
      <NoIndexMeta />
      <Head><title>{form.name} - CateringMS</title></Head>
      <AdminNav />

      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            variant="hero"
            icon={Code2}
            title={
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <Input
                  value={form.name}
                  onChange={(e) => patchLocal({ name: e.target.value })}
                  onBlur={() => dirty && saveForm({ name: form.name }, { silent: true })}
                  className="text-xl md:text-2xl font-bold border-0 shadow-none px-0 focus-visible:ring-0 bg-transparent min-w-[260px] text-white placeholder:text-white/40"
                />
                {dirty && <span className="text-xs font-normal text-amber-300">Unsaved</span>}
                {/* LCF-B: persistent readiness chip beside the title.
                    Reads from the same checklist that powers the
                    banner below. */}
                {!readiness.ready ? (
                  <Badge className="bg-rose-100 text-rose-800 border border-rose-200 gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {readiness.failingRequired} required gap{readiness.failingRequired === 1 ? "" : "s"}
                  </Badge>
                ) : readiness.failingRecommended > 0 ? (
                  <Badge className="bg-amber-100 text-amber-800 border border-amber-200 gap-1">
                    <Info className="w-3 h-3" />
                    {readiness.failingRecommended} recommended
                  </Badge>
                ) : (
                  <Badge className="bg-emerald-50 text-emerald-800 border border-emerald-200 gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Ready to embed
                  </Badge>
                )}
              </span>
            }
            subtitle="Customise fields, theme, and after-submit behaviour. Edits auto-save on blur and update the live preview."
            meta={
              <>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                  <span className={`h-1.5 w-1.5 rounded-full ${form.is_active ? "bg-emerald-400" : "bg-slate-400"}`} />
                  {form.is_active ? "Live" : "Paused"}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                  {form.fields.length} field{form.fields.length === 1 ? "" : "s"}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/90">
                  <span className="font-mono">/{form.slug}</span>
                </span>
              </>
            }
            actions={
              <>
                <Button asChild variant="ghost" className="gap-2">
                  <Link href={withSlug("/admin/integrations/embed")}>
                    <ArrowLeft className="w-4 h-4" /> Back to forms
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => saveForm(form)}
                  disabled={saving || !dirty}
                  className="gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {dirty ? "Save changes" : "Saved"}
                </Button>
                <Button
                  onClick={async () => {
                    // Publish what's on screen: save first so the link and
                    // snippet serve exactly what the preview shows.
                    if (dirty) await saveForm(form, { silent: true });
                    setSnippetOpen(true);
                  }}
                  className="gap-2 bg-brand-primary hover:bg-brand-primary/90"
                  title={readiness.ready ? "Get the shareable link and website snippet" : "Fix the required items in the checklist first"}
                >
                  <Code2 className="w-4 h-4" /> Publish &amp; get link
                </Button>
              </>
            }
          />
          <PageWorkbench />

          {/* How-it-works guide: the three things an operator does here,
              each with its live status, so the page reads as a flow. */}
          <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            {[
              {
                n: 1,
                title: "Set up your questions",
                body: "Left column: edit labels, choose the answer type, mark required. Add or remove questions.",
                status: readiness.ready ? "Ready" : `${readiness.failingRequired} to fix`,
                ok: readiness.ready,
                onClick: () => jumpTo("section-fields"),
              },
              {
                n: 2,
                title: "Try it in the preview",
                body: "Middle column shows the real form and updates as you type. Test submissions there are not saved.",
                status: dirty ? "Unsaved edits" : "Up to date",
                ok: !dirty,
                onClick: () => jumpTo("section-preview"),
              },
              {
                n: 3,
                title: "Publish",
                body: "Copy the shareable link (any website button, WhatsApp, QR) or the snippet. Every submission lands in Leads.",
                status: form.is_active ? "Live" : "Paused",
                ok: form.is_active,
                onClick: async () => {
                  if (dirty) await saveForm(form, { silent: true });
                  setSnippetOpen(true);
                },
              },
            ].map((step) => (
              <button
                key={step.n}
                type="button"
                onClick={step.onClick}
                className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-brand-primary/50 hover:shadow dark:border-slate-800 dark:bg-slate-900"
              >
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-primary text-sm font-bold text-white">
                  {step.n}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{step.title}</span>
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${step.ok ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
                      {step.status}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">{step.body}</span>
                </span>
              </button>
            ))}
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
                <Card className="mb-4 bg-gradient-to-br from-brand-primary/10 to-brand-secondary/10">
                  <CardContent className="p-3 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-brand-primary flex-shrink-0" />
                    <p className="text-xs text-brand-primary">
                      <strong>Form is ready to embed.</strong>{" "}
                      {templateMeta && <span className="text-brand-primary">{TEMPLATE_INTENT[templateMeta.id]}</span>}
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
              <Card className={`mb-4 bg-gradient-to-br ${toneClass}`}>
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
                            onClick={() => { if (c.anchor) jumpTo(c.anchor); }}
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
                            <span className="flex flex-shrink-0 flex-col items-end gap-1">
                              {isRequired && (
                                <Badge className="bg-rose-600 text-white text-[10px]">Required</Badge>
                              )}
                              {c.anchor && <span className="text-[11px] font-semibold underline underline-offset-2">Fix →</span>}
                            </span>
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
            <div id="section-fields" className="lg:col-span-5 scroll-mt-20">
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="font-bold text-slate-900">Questions</h3>
                      <p className="text-[11px] text-slate-500">What visitors fill in, top to bottom.</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={addField} className="gap-1.5 h-8">
                      <Plus className="w-3.5 h-3.5" /> Add question
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
                      position={idx + 1}
                      field={field}
                      otherFields={form.fields.filter((_, i) => i !== idx)}
                      templateId={form.template_id}
                      isFirst={idx === 0}
                      isLast={idx === form.fields.length - 1}
                      onChange={(patch) => updateField(idx, patch)}
                      // Reads refs, not this render's closure: the options
                      // editor commits then saves on the next tick, after
                      // its own patch has landed.
                      onBlurSave={() => dirtyRef.current && formRef.current && saveForm({ fields: formRef.current.fields }, { silent: true })}
                      onMoveUp={() => moveField(idx, -1)}
                      onMoveDown={() => moveField(idx, 1)}
                      onRemove={() => removeField(idx)}
                    />
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Middle: live preview */}
            <div id="section-preview" className="lg:col-span-4 scroll-mt-20">
              <Card>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                      <Eye className="w-4 h-4 text-blue-600" /> Live preview
                    </h3>
                    {previewSrc && (
                      <Button asChild size="sm" variant="ghost" className="gap-1.5 h-8 text-xs" title={dirty ? "Save first: the new tab shows the saved version" : "Open the saved form in a new tab"}>
                        <a href={previewTabHref} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="w-3.5 h-3.5" /> Open in new tab
                        </a>
                      </Button>
                    )}
                  </div>
                  <p className="px-1 mb-2 text-[11px] text-slate-500">
                    Shows your edits instantly. Test submissions here are not saved as leads.
                  </p>
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
              <Card id="section-form-settings" className="scroll-mt-20">
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
                    <p className="text-[10px] text-slate-500 mt-1">
                      Used in your form link{(companyData?.slug || company?.slug || user?.company_slug) ? <>: <span className="font-mono break-all">/quote/{companyData?.slug || company?.slug || user?.company_slug}/{form.slug}</span></> : null}. Pick something short like <span className="font-mono">event-quote</span>. Changing it breaks links you already shared.
                    </p>
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
              <Card>
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
                    <Label className="text-xs">Space between fields</Label>
                    <FieldSpacingControl
                      value={form.theme?.field_spacing}
                      onChange={(v) => { const t = { ...form.theme, field_spacing: v }; patchLocal({ theme: t }); saveForm({ theme: t }, { silent: true }); }}
                    />
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

              {/* Where the menu + equipment choices on the form come from. */}
              <Card>
                <CardContent className="p-4 space-y-2.5">
                  <h3 className="font-bold text-slate-900">Menu &amp; equipment on this form</h3>
                  <div className="rounded-lg border border-slate-200 p-2.5">
                    <p className="text-xs font-semibold text-slate-800">Menu, by course</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      One card per category (Starters, Mains, Sides, Salads, Desserts...). Visitors pick dishes from the card&apos;s dropdown and each choice appears as a removable tag. Built live from your menu: available items only, no prices shown.
                    </p>
                    <Link href={withSlug("/admin/menu")} className="mt-1 inline-block text-[11px] font-semibold text-brand-primary hover:underline">Edit menu items →</Link>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-2.5">
                    <p className="text-xs font-semibold text-slate-800">Equipment packages</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Visitors pick <strong>Plate, knife &amp; fork</strong> or <strong>Plate, knife, fork, bowl &amp; spoon</strong>. Built from your plate, knife, fork, bowl and spoon items; the quote gets one of each per guest.
                    </p>
                    <Link href={withSlug("/admin/equipment")} className="mt-1 inline-block text-[11px] font-semibold text-brand-primary hover:underline">Edit equipment →</Link>
                  </div>
                  <p className="text-[10px] text-slate-500">Choices land on a draft quote for review, then carry into the order when it is accepted.</p>
                </CardContent>
              </Card>

              {/* Success behaviour */}
              <Card id="section-after-submit" className="scroll-mt-20">
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
              <Card>
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
                <Card id="section-pricing-tiers" className="scroll-mt-20">
                  <CardContent className="p-4 space-y-3">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-brand-primary" /> Pricing tiers
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
                          <Button size="sm" variant="ghost" onClick={() => setPricingTiers(prev => prev.filter((_, idx) => idx !== i))} className="h-7 text-rose-600 hover:text-rose-700">
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
                      <Button size="sm" onClick={savePricingTiers} disabled={savingTiers} className="flex-1 h-8 bg-brand-primary hover:bg-brand-primary/90">
                        {savingTiers ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save tiers"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Analytics */}
              <Card>
                <CardContent className="p-4 space-y-3">
                  <h3 className="font-bold text-slate-900">Analytics</h3>
                  <AnalyticsBlock formId={form.id} />
                </CardContent>
              </Card>
            </div>

          </div>

        </PortalShell>
        <Footer />
      </div>

      <SnippetDialog
        open={snippetOpen}
        onOpenChange={setSnippetOpen}
        form={form}
        embedToken={companyData?.embed_token || company?.embed_token}
        companyName={company?.company_name}
        companySlug={companyData?.slug || company?.slug || user?.company_slug}
      />
    </>
  );
}

function FieldEditor({
  field, position, otherFields, templateId, isFirst, isLast,
  onChange, onBlurSave, onMoveUp, onMoveDown, onRemove,
}: {
  field: EmbedField;
  position: number;
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
  // Collapsed cards keep a 12-question form scannable; a freshly added
  // question opens straight away.
  const [open, setOpen] = useState(field.label === "New field");
  // Single-pick options for select/radio; multi-pick for checkboxes.
  const needsOptions =
    field.type === "select" ||
    field.type === "radio" ||
    field.type === "checkboxes";
  // detailed-multi-step puts fields onto numbered pages. We expose
  // the page selector only there; other templates ignore the value.
  const supportsSteps = templateId === "detailed-multi-step";
  const fieldStep = (field as any).step;
  const meta = FIELD_TYPE_META[field.type] || FIELD_TYPE_META.text;
  const Icon = meta.icon;
  const optionCount = (field.options || []).length;
  const rules = (field.validation || {}) as { min?: number; max?: number };

  // Toggles and pickers are discrete choices: apply and save at once.
  const changeAndSave = (patch: Partial<EmbedField>) => {
    onChange(patch);
    setTimeout(onBlurSave, 0);
  };

  const summary = [
    meta.label,
    needsOptions ? `${optionCount} choice${optionCount === 1 ? "" : "s"}` : null,
    field.type === "number" && (rules.min !== undefined || rules.max !== undefined)
      ? `${rules.min ?? "any"} to ${rules.max ?? "any"}`
      : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className={`rounded-xl border bg-white shadow-sm transition ${open ? "border-brand-primary/40 ring-1 ring-brand-primary/15" : "border-slate-200 hover:border-slate-300"} ${field.visible === false ? "opacity-70" : ""}`}>
      {/* Header: always visible summary of the question. */}
      <div className="flex items-center gap-2 p-2.5">
        <div className="flex flex-col">
          <Button size="icon" variant="ghost" disabled={isFirst} onClick={onMoveUp} className="h-5 w-6" aria-label="Move question up">
            <ChevronUp className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" disabled={isLast} onClick={onMoveDown} className="h-5 w-6" aria-label="Move question down">
            <ChevronDown className="w-3.5 h-3.5" />
          </Button>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          aria-expanded={open}
        >
          <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ring-1 ${meta.tone}`}>
            <Icon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-slate-400">Q{position}</span>
              <span className="truncate text-sm font-semibold text-slate-900">{field.label || "Untitled question"}</span>
              {field.required && <span className="text-xs font-bold text-rose-500" title="Required">*</span>}
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
              {summary}
              {field.visible === false && (
                <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1 text-[10px] text-slate-600">
                  <EyeOff className="h-3 w-3" /> Hidden
                </span>
              )}
            </span>
          </span>
          <ChevronRight className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
        <Button size="icon" variant="ghost" onClick={onRemove} className="h-7 w-7 flex-shrink-0 text-rose-500 hover:text-rose-600" aria-label="Delete question">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {open && (
        <div className="space-y-3 border-t border-slate-100 p-3">
          {/* 1. The question */}
          <div>
            <Label className="text-[11px] font-semibold text-slate-700">Question</Label>
            <Input
              value={field.label}
              onChange={(e) => onChange({ label: e.target.value })}
              onBlur={onBlurSave}
              placeholder="e.g. What type of event is it?"
              className="mt-1 h-9 text-sm font-medium"
            />
          </div>

          {/* 2. Answer type, with icon + plain-English hint */}
          <div>
            <Label className="text-[11px] font-semibold text-slate-700">Answer type</Label>
            <Select value={field.type} onValueChange={(v) => changeAndSave({ type: v as EmbedFieldType })}>
              <SelectTrigger className="mt-1 h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((t) => {
                  const m = FIELD_TYPE_META[t.value] || FIELD_TYPE_META.text;
                  const TIcon = m.icon;
                  return (
                    <SelectItem key={t.value} value={t.value}>
                      <span className="flex items-center gap-2">
                        <span className={`flex h-5 w-5 items-center justify-center rounded ring-1 ${m.tone}`}><TIcon className="h-3 w-3" /></span>
                        {m.label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {FIELD_TYPE_HINTS[field.type] && (
              <p className="mt-1 text-[11px] text-slate-500">{FIELD_TYPE_HINTS[field.type]}</p>
            )}
          </div>

          {/* 3. Settings that depend on the type */}
          {needsOptions && (
            <OptionsEditor
              fieldType={field.type}
              options={(field.options || []) as EmbedFieldOptionLike[]}
              onChange={(options) => onChange({ options })}
              onCommit={() => setTimeout(onBlurSave, 0)}
            />
          )}

          {["text", "email", "phone", "number", "textarea", "time"].includes(field.type) && (
            <div>
              <Label className="text-[11px] font-semibold text-slate-700">Hint text inside the box <span className="font-normal text-slate-400">(optional)</span></Label>
              <Input
                value={field.placeholder || ""}
                onChange={(e) => onChange({ placeholder: e.target.value })}
                onBlur={onBlurSave}
                placeholder={field.type === "email" ? "e.g. you@example.com" : field.type === "phone" ? "e.g. +27 82 123 4567" : field.type === "number" ? "e.g. 50" : "e.g. Street, suburb, city"}
                className="mt-1 h-8 text-xs"
              />
            </div>
          )}

          {field.type === "number" && (
            <div className="grid grid-cols-2 gap-2">
              {(["min", "max"] as const).map((k) => (
                <div key={k}>
                  <Label className="text-[11px] font-semibold text-slate-700">{k === "min" ? "Lowest allowed" : "Highest allowed"}</Label>
                  <Input
                    type="number"
                    value={rules[k] ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const next = { ...(field.validation || {}) } as Record<string, unknown>;
                      if (raw === "") delete next[k];
                      else next[k] = Number(raw);
                      onChange({ validation: next as EmbedField["validation"] });
                    }}
                    onBlur={onBlurSave}
                    placeholder={k === "min" ? "No minimum" : "No maximum"}
                    className="mt-1 h-8 text-xs"
                  />
                </div>
              ))}
            </div>
          )}

          {field.type === "checkbox" && (
            <div>
              <Label className="text-[11px] font-semibold text-slate-700">Text next to the tick box</Label>
              <Input
                value={field.placeholder || ""}
                onChange={(e) => onChange({ placeholder: e.target.value })}
                onBlur={onBlurSave}
                placeholder="e.g. I agree to the terms and conditions"
                className="mt-1 h-8 text-xs"
              />
            </div>
          )}

          {field.type === "tier" && (
            <p className="rounded-md bg-lime-50 px-2.5 py-2 text-[11px] text-lime-800">
              Choices come from the <strong>Pricing tiers</strong> panel on the right, so prices stay in one place.
            </p>
          )}

          {!needsOptions && <FieldPreview field={field} />}

          {/* 4. Required / visible */}
          <div className="flex flex-wrap items-center gap-2">
            <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${field.required ? "border-rose-200 bg-rose-50 text-rose-800" : "border-slate-200 text-slate-600"}`}>
              <Switch checked={field.required} onCheckedChange={(v) => changeAndSave({ required: v })} />
              {field.required ? "Required" : "Optional"}
            </label>
            <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${field.visible ? "border-slate-200 text-slate-600" : "border-slate-300 bg-slate-100 text-slate-700"}`}>
              <Switch checked={field.visible} onCheckedChange={(v) => changeAndSave({ visible: v })} />
              {field.visible ? "Shown on form" : "Hidden"}
            </label>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced((s) => !s)}
            className="text-[11px] font-medium text-brand-primary hover:underline"
          >
            {showAdvanced ? "Hide advanced settings" : "Advanced: where it's saved, show only if..."}
          </button>

          {showAdvanced && (
            <div className="space-y-2 pt-1 border-t border-slate-200">
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-slate-500">Maps to lead column</Label>
                <p className="text-[10px] text-slate-500">Where the answer goes on the lead. &quot;No mapping&quot; still keeps it: it&apos;s added to the lead notes.</p>
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
                    {(() => {
                      // When the controlling field has choices, pick one of
                      // its real option values instead of typing a code
                      // that silently never matches.
                      const parent = otherFields.find((f) => f.id === field.conditional?.showIfFieldId);
                      const parentOptions = (parent?.options || []) as { value: string; label: string }[];
                      const current = Array.isArray(field.conditional?.showIfValue)
                        ? field.conditional?.showIfValue.join(",")
                        : (field.conditional?.showIfValue || "");
                      if (parent && parent.type === "checkbox") {
                        return (
                          <Select
                            value={current || "true"}
                            onValueChange={(v) => {
                              onChange({ conditional: { showIfFieldId: parent.id, showIfValue: v } });
                              setTimeout(onBlurSave, 0);
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="true">is ticked</SelectItem>
                              <SelectItem value="false">is not ticked</SelectItem>
                            </SelectContent>
                          </Select>
                        );
                      }
                      if (parent && parentOptions.length > 0) {
                        return (
                          <Select
                            value={current || undefined}
                            onValueChange={(v) => {
                              onChange({ conditional: { showIfFieldId: parent.id, showIfValue: v } });
                              setTimeout(onBlurSave, 0);
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="equals..." /></SelectTrigger>
                            <SelectContent>
                              {parentOptions.filter((o) => o.value).map((o) => (
                                <SelectItem key={o.value} value={o.value}>{o.label || o.value}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        );
                      }
                      return (
                        <Input
                          value={current}
                          onChange={(e) => {
                            if (!field.conditional?.showIfFieldId) return;
                            onChange({ conditional: { showIfFieldId: field.conditional.showIfFieldId, showIfValue: e.target.value } });
                          }}
                          onBlur={onBlurSave}
                          placeholder="equals value"
                          className="h-8 text-xs"
                          disabled={!field.conditional?.showIfFieldId}
                        />
                      );
                    })()}
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
      )}
    </div>
  );
}

// Small "How visitors see it" mock for non-choice questions.
function FieldPreview({ field }: { field: EmbedField }) {
  const box = "flex h-8 items-center justify-between rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-400";
  let control: React.ReactNode;
  switch (field.type) {
    case "textarea":
      control = <div className="h-14 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-400">{field.placeholder || "Longer answer..."}</div>;
      break;
    case "date":
      control = <div className={box}>dd / mm / yyyy <CalendarDays className="h-3.5 w-3.5" /></div>;
      break;
    case "time":
      control = <div className={box}>-- : -- <Clock className="h-3.5 w-3.5" /></div>;
      break;
    case "checkbox":
      control = (
        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700">
          <span className="h-3.5 w-3.5 rounded-sm border border-slate-400" />
          {field.placeholder || "Yes"}
        </div>
      );
      break;
    case "tier":
      control = <div className={box}>Select an option <ChevronsUpDown className="h-3.5 w-3.5" /></div>;
      break;
    default:
      control = <div className={box}>{field.placeholder || ""}&nbsp;</div>;
  }
  return (
    <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-2">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">How visitors see it</p>
      <p className="mb-1 text-xs font-semibold text-slate-700">
        {field.label || "Untitled question"}{field.required && <span className="text-rose-500"> *</span>}
      </p>
      {control}
    </div>
  );
}

type EmbedFieldOptionLike = { value: string; label: string } | string;

interface OptionRow {
  key: number;
  label: string;
  /** Saved code. Kept stable once created so existing leads and
   *  "Show only if" rules keep matching when a label is reworded. */
  value: string;
  isNew: boolean;
}

let optionRowKey = 0;

function slugifyOption(label: string): string {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "option";
}

function toRows(options: EmbedFieldOptionLike[]): OptionRow[] {
  return options.map((o) => {
    const label = typeof o === "string" ? o : (o.label || o.value || "");
    const value = typeof o === "string" ? o : (o.value || o.label || "");
    return { key: ++optionRowKey, label, value, isNew: false };
  });
}

// Turn rows into saved options: blank rows dropped, new rows get a code
// from their label, codes kept unique.
function rowsToOptions(rows: OptionRow[]): { value: string; label: string }[] {
  const used = new Set<string>();
  const out: { value: string; label: string }[] = [];
  for (const row of rows) {
    const label = row.label.trim();
    if (!label) continue;
    const base = row.isNew ? slugifyOption(label) : (row.value || slugifyOption(label));
    let value = base;
    let n = 2;
    while (used.has(value)) value = `${base}_${n++}`;
    used.add(value);
    out.push({ value, label });
  }
  return out;
}

/**
 * Choice editor for Dropdown / Option cards / Tick boxes. One row per
 * choice with what the visitor sees; codes are generated automatically.
 * Enter adds the next choice, pasting a list adds one row per line, and a
 * small preview shows how the question will look on the form.
 */
function OptionsEditor({
  fieldType, options, onChange, onCommit,
}: {
  fieldType: string;
  options: EmbedFieldOptionLike[];
  onChange: (options: { value: string; label: string }[]) => void;
  onCommit: () => void;
}) {
  const [rows, setRows] = useState<OptionRow[]>(() => {
    const initial = toRows(options);
    return initial.length > 0 ? initial : [{ key: ++optionRowKey, label: "", value: "", isNew: true }];
  });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const focusKeyRef = useRef<number | null>(null);
  const editingRef = useRef(false);

  // Follow outside changes (save response, undo) while not editing here.
  useEffect(() => {
    if (editingRef.current) return;
    const next = toRows(options);
    setRows(next.length > 0 ? next : [{ key: ++optionRowKey, label: "", value: "", isNew: true }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(options)]);

  useEffect(() => {
    if (focusKeyRef.current == null) return;
    const el = containerRef.current?.querySelector<HTMLInputElement>(`[data-option-key="${focusKeyRef.current}"]`);
    focusKeyRef.current = null;
    el?.focus();
  });

  function update(next: OptionRow[]) {
    setRows(next);
    onChange(rowsToOptions(next));
  }
  function addAfter(index: number, labels: string[] = [""]) {
    const fresh = labels.map((label) => ({ key: ++optionRowKey, label, value: "", isNew: true }));
    const next = [...rows.slice(0, index + 1), ...fresh, ...rows.slice(index + 1)];
    focusKeyRef.current = fresh[fresh.length - 1].key;
    update(next);
  }
  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    update(next);
  }
  function remove(index: number) {
    const next = rows.filter((_, i) => i !== index);
    update(next.length > 0 ? next : [{ key: ++optionRowKey, label: "", value: "", isNew: true }]);
  }

  const filled = rows.filter((r) => r.label.trim());
  const labelsLower = filled.map((r) => r.label.trim().toLowerCase());
  const duplicates = new Set(labelsLower.filter((l, i) => labelsLower.indexOf(l) !== i));
  const kind = fieldType === "select" ? "Dropdown" : fieldType === "radio" ? "Option cards" : "Tick boxes";
  const pickHint = fieldType === "checkboxes" ? "Visitors can tick several." : "Visitors pick one.";

  return (
    <div
      ref={containerRef}
      className="rounded-lg border border-slate-200 bg-white p-3"
      onFocus={() => { editingRef.current = true; }}
      onBlur={(e) => {
        // Save once focus leaves the whole editor, not between rows.
        if (containerRef.current && !containerRef.current.contains(e.relatedTarget as Node | null)) {
          editingRef.current = false;
          onCommit();
        }
      }}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
            <ListChecks className="h-3.5 w-3.5 text-brand-primary" /> Choices
          </p>
          <p className="text-[11px] text-slate-500">{kind}. {pickHint} Type each choice exactly as visitors should see it.</p>
        </div>
        <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
          {filled.length} choice{filled.length === 1 ? "" : "s"}
        </span>
      </div>

      <ol className="space-y-1.5">
        {rows.map((row, i) => {
          const isDup = row.label.trim() && duplicates.has(row.label.trim().toLowerCase());
          return (
            <li key={row.key} className="group flex items-center gap-1.5">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-[11px] font-bold text-brand-primary">
                {i + 1}
              </span>
              <Input
                data-option-key={row.key}
                value={row.label}
                placeholder={i === 0 ? "e.g. Wedding" : "Next choice"}
                aria-label={`Choice ${i + 1}`}
                onChange={(e) => update(rows.map((r) => (r.key === row.key ? { ...r, label: e.target.value } : r)))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addAfter(i);
                  } else if (e.key === "Backspace" && !row.label && rows.length > 1) {
                    e.preventDefault();
                    focusKeyRef.current = rows[Math.max(0, i - 1)].key;
                    remove(i);
                  }
                }}
                onPaste={(e) => {
                  // Pasting a list ("Wedding\nBirthday\n...") adds one row per line.
                  const text = e.clipboardData.getData("text");
                  if (!text.includes("\n")) return;
                  e.preventDefault();
                  const lines = text.split(/\r?\n/).map((l) => l.split("|")[0].trim()).filter(Boolean);
                  if (lines.length === 0) return;
                  const [first, ...rest] = lines;
                  const withFirst = rows.map((r) => (r.key === row.key ? { ...r, label: row.label ? row.label : first } : r));
                  const extra = row.label ? lines : rest;
                  if (extra.length === 0) { update(withFirst); return; }
                  const fresh = extra.map((label) => ({ key: ++optionRowKey, label, value: "", isNew: true }));
                  focusKeyRef.current = fresh[fresh.length - 1].key;
                  update([...withFirst.slice(0, i + 1), ...fresh, ...withFirst.slice(i + 1)]);
                }}
                className={`h-8 text-sm ${isDup ? "border-amber-400 focus-visible:ring-amber-300" : ""}`}
              />
              <div className="flex flex-shrink-0 items-center opacity-60 transition group-hover:opacity-100 group-focus-within:opacity-100">
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                  <ChevronUp className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-rose-500 hover:text-rose-600" onClick={() => remove(i)} aria-label={`Remove choice ${i + 1}`}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => addAfter(rows.length - 1)}>
          <Plus className="h-3.5 w-3.5" /> Add choice
        </Button>
        <span className="text-[10px] text-slate-400">Enter adds the next choice · paste a list to add many</span>
      </div>

      {duplicates.size > 0 && (
        <p className="mt-2 text-[11px] text-amber-700">Two choices have the same text. Visitors won&apos;t be able to tell them apart.</p>
      )}
      {filled.length === 0 && (
        <p className="mt-2 text-[11px] text-rose-600">Add at least one choice, otherwise visitors have nothing to pick.</p>
      )}

      {filled.length > 0 && (
        <div className="mt-3 rounded-md border border-dashed border-slate-200 bg-slate-50 p-2">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">How visitors see it</p>
          {fieldType === "select" ? (
            <div className="space-y-1">
              <div className="flex h-8 items-center justify-between rounded-md border border-slate-200 bg-white px-2.5 text-xs text-slate-400">
                Select an option <ChevronDown className="h-3.5 w-3.5" />
              </div>
              <div className="rounded-md border border-slate-200 bg-white py-1 shadow-sm">
                {filled.slice(0, 6).map((r) => (
                  <div key={r.key} className="px-2.5 py-1 text-xs text-slate-700">{r.label}</div>
                ))}
                {filled.length > 6 && <div className="px-2.5 py-1 text-[11px] text-slate-400">+{filled.length - 6} more</div>}
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {filled.slice(0, 8).map((r) => (
                <span key={r.key} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">
                  <span className={`h-3 w-3 border border-slate-400 ${fieldType === "radio" ? "rounded-full" : "rounded-sm"}`} />
                  {r.label}
                </span>
              ))}
              {filled.length > 8 && <span className="px-1 py-1 text-[11px] text-slate-400">+{filled.length - 8} more</span>}
            </div>
          )}
        </div>
      )}
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

export default function ProtectedEmbedFormCustomiser() {
  // Baseline admin tier. OWNER included alongside COMPANY_ADMIN and
  // ADMIN, matching the /api/admin/embed/* role gates.
  return (
    <ProtectedRoute allowedRoles={[
      UserRole.SUPER_ADMIN,
      UserRole.OWNER,
      UserRole.COMPANY_ADMIN,
      UserRole.ADMIN,
    ]}>
      <EmbedFormCustomiser />
    </ProtectedRoute>
  );
}

// "Space between fields": a preset, or "Custom" with an exact gap in pixels.
// Pixels are the space you see between one question and the next
// (public/embed/helpers.js applyTheme uses the same numbers).
const FIELD_SPACING_PX: Record<string, number> = { compact: 16, normal: 36, roomy: 48, extra: 64 };
const FIELD_SPACING_MAX = 80;

function FieldSpacingControl({ value, onChange }: { value: EmbedFieldSpacing | undefined; onChange: (v: EmbedFieldSpacing) => void }) {
  const isCustom = typeof value === "number";
  const currentPx = isCustom ? value : FIELD_SPACING_PX[value || "normal"] ?? 36;
  const [draft, setDraft] = useState(String(currentPx));
  useEffect(() => { setDraft(String(currentPx)); }, [currentPx]);

  const commit = () => {
    const n = Math.round(Number(draft));
    if (draft.trim() === "" || !Number.isFinite(n)) { setDraft(String(currentPx)); return; }
    const clamped = Math.min(FIELD_SPACING_MAX, Math.max(0, n));
    setDraft(String(clamped));
    if (clamped !== value) onChange(clamped);
  };

  return (
    <>
      <Select
        value={isCustom ? "custom" : value || "normal"}
        // Switching to Custom starts from the gap the form has now.
        onValueChange={(v) => onChange(v === "custom" ? currentPx : (v as EmbedFieldSpacing))}
      >
        <SelectTrigger className="h-8 text-xs mt-1" aria-label="Space between fields"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="compact">Compact - fits more on screen</SelectItem>
          <SelectItem value="normal">Normal</SelectItem>
          <SelectItem value="roomy">Roomy</SelectItem>
          <SelectItem value="extra">Extra roomy - easiest to read</SelectItem>
          <SelectItem value="custom">Custom - set the exact space</SelectItem>
        </SelectContent>
      </Select>
      {isCustom && (
        <div className="mt-1.5 flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={FIELD_SPACING_MAX}
            step={1}
            inputMode="numeric"
            aria-label="Space between fields in pixels"
            className="h-8 w-20 text-xs"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
          />
          <span className="text-xs text-slate-500">pixels (0 to {FIELD_SPACING_MAX})</span>
        </div>
      )}
    </>
  );
}
