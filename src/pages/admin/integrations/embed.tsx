/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/integrations/embed - Lead Capture Forms admin page.
 *
 * Shows a gradient page header, a four-card KPI strip, the list of form
 * variants for the tenant, and a "+ New form" button that opens the
 * template gallery dialog. Empty state has a single big CTA.
 *
 * All queries are scoped to the caller's company by the API endpoint at
 * /api/admin/embed/forms - this page never passes a company_id.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import Head from "next/head";
import { useRouter } from "next/router";
import {
  Code2,
  Plus,
  Search,
  Eye,
  Send as SendIcon,
  TrendingUp,
  LayoutTemplate,
  ExternalLink,
  Copy,
  Pause,
  Play,
  Trash2,
  Pencil,
  MoreHorizontal,
  Sparkles,
} from "lucide-react";

import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ChatBot } from "@/components/ChatBot";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";

import { TemplateGalleryDialog } from "@/components/admin/embed/TemplateGalleryDialog";
import { SnippetDialog } from "@/components/admin/embed/SnippetDialog";
import { useTenantHref } from "@/lib/tenantUrl";
import { captureException } from "@/lib/observability";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { PageWorkbench, PortalCard, PortalHeader, PortalShell, StatTile } from "@/components/portal/ui";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";

interface EmbedFormRow {
  id: string;
  template_id: string;
  name: string;
  slug: string;
  views_count: number;
  submissions_count: number;
  last_submission_at: string | null;
  is_active: boolean;
  created_at: string;
}

interface KpiBlock {
  total_forms: number;
  total_views: number;
  total_submissions: number;
  conversion_rate: number;
}

const numberFmt = new Intl.NumberFormat("en-ZA");

// Restructure audit 2026-07-02: ProtectedRoute wrap restored.
// LCF-F (2026-05-25) removed it because the page flickered between
// "Verifying your credentials" and the loaded shell; the flicker was
// an AuthContext-era loading loop that has since settled (every other
// /admin page, including the financial-dashboard exemplar, carries
// the wrap without issue). Restoring it brings this page back in
// line with the admin-page standard: middleware is the route gate,
// the wrap is the defence-in-depth layer with a proper unauthorized
// screen instead of an API error wall.
function AdminEmbedFormsPage() {
  const { user, company } = useAuth() as any;
  // Wave 27.3: tenant-slug wrapper for internal navigations.
  const { withSlug } = useTenantHref();
  const { toast } = useToast();
  const router = useRouter();

  const [forms, setForms] = useState<EmbedFormRow[]>([]);
  const [kpis, setKpis] = useState<KpiBlock>({
    total_forms: 0, total_views: 0, total_submissions: 0, conversion_rate: 0,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [snippetForm, setSnippetForm] = useState<EmbedFormRow | null>(null);

  const filteredForms = useFuzzyItems(
    forms,
    search,
    [
      { key: "name" as any, weight: 3 },
      { key: "slug" as any, weight: 2 },
      { key: "template_id" as any, weight: 1 },
    ],
    { limit: 0 },
  );

  async function loadForms() {
    setLoading(true);
    setLoadError(null);
    try {
      const resp = await fetch("/api/admin/embed/forms");
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || "Failed to load forms");
      setForms((json.forms || []) as EmbedFormRow[]);
      // The collection endpoint also returns kpis for free, but if not, compute.
      if (json.kpis) {
        setKpis(json.kpis);
      } else {
        const list = (json.forms || []) as EmbedFormRow[];
        const v = list.reduce((s, f) => s + (f.views_count || 0), 0);
        const sub = list.reduce((s, f) => s + (f.submissions_count || 0), 0);
        setKpis({
          total_forms: list.length,
          total_views: v,
          total_submissions: sub,
          conversion_rate: v > 0 ? +(sub / v * 100).toFixed(1) : 0,
        });
      }
    } catch (err: any) {
      captureException(err, {
        tags: { route: "/admin/integrations/embed", step: "load-forms", companyId: user?.company_id || "" },
      });
      // Silent-failure audit: a failed load used to fall through to the
      // "create your first form" empty state, which is the wrong signal.
      setLoadError(dbErrorMessage(err, { entity: "form" }));
      toast({ title: "Couldn't load forms", description: dbErrorMessage(err, { entity: "form" }), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!user?.company_id) return;
    loadForms();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.company_id]);

  // Allow `?gallery=1` deep-link (used by /admin/integrations/embed/new).
  useEffect(() => {
    if (router.query.gallery === "1") {
      setGalleryOpen(true);
    }
  }, [router.query.gallery]);

  async function togglePause(form: EmbedFormRow) {
    const next = !form.is_active;
    const resp = await fetch(`/api/admin/embed/forms?id=${form.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: next }),
    });
    if (resp.ok) {
      setForms((prev) => prev.map((f) => f.id === form.id ? { ...f, is_active: next } : f));
      toast({ title: next ? "Form resumed" : "Form paused" });
    } else {
      // Surface the server's reason instead of a bare "failed".
      const j = await resp.json().catch(() => ({} as any));
      toast({ title: "Update failed", description: j.error || `HTTP ${resp.status}`, variant: "destructive" });
    }
  }

  async function duplicateForm(form: EmbedFormRow) {
    // Fetch full source row - we need its fields/theme/success message.
    const resp = await fetch("/api/admin/embed/forms");
    const json = await resp.json();
    const source = (json.forms || []).find((f: any) => f.id === form.id);
    if (!source) {
      toast({ title: "Couldn't load source form", variant: "destructive" });
      return;
    }
    const create = await fetch("/api/admin/embed/forms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        template_id: source.template_id,
        name: `${source.name} (copy)`,
        slug: `${source.slug}-copy-${Math.random().toString(36).slice(2, 5)}`,
        fields: source.fields,
        theme: source.theme,
        success_message: source.success_message,
        redirect_url: source.redirect_url,
        is_active: false,
      }),
    });
    const created = await create.json();
    if (create.ok) {
      toast({ title: "Form duplicated" });
      router.push(withSlug(`/admin/integrations/embed/${created.form.id}`));
    } else {
      toast({ title: "Duplicate failed", description: created.error, variant: "destructive" });
    }
  }

  async function deleteForm(form: EmbedFormRow) {
    if (!confirm(`Delete "${form.name}"? This will not delete past submissions.`)) return;
    const resp = await fetch(`/api/admin/embed/forms?id=${form.id}`, { method: "DELETE" });
    if (resp.ok) {
      setForms((prev) => prev.filter((f) => f.id !== form.id));
      toast({ title: "Form deleted" });
    } else {
      const j = await resp.json().catch(() => ({} as any));
      toast({ title: "Delete failed", description: j.error || `HTTP ${resp.status}`, variant: "destructive" });
    }
  }

  const isEmpty = !loading && !loadError && forms.length === 0;

  return (
    <>
      <NoIndexMeta />
      <Head><title>Lead capture forms - CateringMS</title></Head>
      <AdminNav />

      <div className="admin-page-shell">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <PortalHeader
            variant="hero"
            title="Lead capture forms"
            icon={Code2}
            subtitle="Embeddable enquiry forms for your marketing site. Pick a template, customise, paste the snippet."
            meta={
              !loading && !loadError && forms.length > 0 ? (
                <>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    {numberFmt.format(kpis.total_forms)} form{kpis.total_forms === 1 ? "" : "s"}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    {numberFmt.format(kpis.total_submissions)} submission{kpis.total_submissions === 1 ? "" : "s"}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white">
                    {kpis.conversion_rate}% conversion
                  </span>
                </>
              ) : undefined
            }
            actions={!isEmpty && (
              <Button
                onClick={() => setGalleryOpen(true)}
                className="gap-2 bg-brand-primary hover:bg-brand-primary/90"
              >
                <Plus className="w-4 h-4" />
                New form
              </Button>
            )}
          />
          <PageWorkbench />

          {loadError && (
            <div className="mb-6 rounded-lg border border-rose-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-bold text-rose-900 mb-1">Couldn't load your forms</h2>
              <p className="text-sm text-slate-600 mb-3">{loadError}</p>
              <Button onClick={loadForms} size="sm" className="bg-brand-primary hover:bg-brand-primary/90">
                Retry
              </Button>
            </div>
          )}

          {/* KPI strip: StatTile row per the command-centre standard.
              Skeleton tiles while loading so the row never flashes
              zeros that read as real figures. */}
          {!isEmpty && !loadError && (
            loading ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-28 animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800/50" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatTile
                  label={<span className="inline-flex items-center gap-1">Total forms<InfoTooltip content="Number of embeddable form variants you've created. Includes paused forms." /></span>}
                  value={numberFmt.format(kpis.total_forms)}
                  hint={`${forms.filter((f) => f.is_active).length} active`}
                  icon={LayoutTemplate}
                />
                <StatTile
                  label={<span className="inline-flex items-center gap-1">Views<InfoTooltip content="Lifetime page views recorded by the embed loader. One view = one form render on a visitor's screen." /></span>}
                  value={numberFmt.format(kpis.total_views)}
                  hint="Across all forms"
                  icon={Eye}
                />
                <StatTile
                  label={<span className="inline-flex items-center gap-1">Submissions<InfoTooltip content="Lifetime submissions across every form, excluding rows flagged as spam." /></span>}
                  value={numberFmt.format(kpis.total_submissions)}
                  hint="Across all forms"
                  icon={SendIcon}
                />
                <StatTile
                  label={<span className="inline-flex items-center gap-1">Conversion rate<InfoTooltip content="Total submissions divided by total views, expressed as a percentage. Healthy embedded forms sit between 5% and 20%." /></span>}
                  value={`${kpis.conversion_rate}%`}
                  hint="Submissions / views"
                  icon={TrendingUp}
                />
              </div>
            )
          )}

          {/* Search toolbar */}
          {!isEmpty && !loadError && (
            <PortalCard className="mb-6" padded={false}>
              <div className="p-3">
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Search forms..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
            </PortalCard>
          )}

          {/* List or empty state */}
          {loadError ? null : isEmpty ? (
            <Card>
              <CardContent className="py-16 text-center">
                <div className="mx-auto mb-6 w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center shadow-lg">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">
                  Get your first form on your site in under 2 minutes
                </h2>
                <p className="text-slate-600 max-w-lg mx-auto mb-6">
                  Pick a template, tweak the fields, copy the snippet. Every submission lands as a lead in your inbox automatically.
                </p>
                <Button
                  size="lg"
                  onClick={() => setGalleryOpen(true)}
                  className="gap-2 bg-brand-primary hover:bg-brand-primary/90"
                >
                  <LayoutTemplate className="w-5 h-5" />
                  Browse templates
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-6">
                      <div className="h-32 bg-slate-100 rounded-lg animate-pulse mb-4" />
                      <div className="h-5 w-2/3 bg-slate-100 rounded animate-pulse mb-2" />
                      <div className="h-4 w-1/3 bg-slate-100 rounded animate-pulse" />
                    </CardContent>
                  </Card>
                ))
              ) : filteredForms.length === 0 ? (
                <Card className="col-span-full">
                  <CardContent className="py-12 text-center text-slate-500">
                    No forms match "{search}"
                  </CardContent>
                </Card>
              ) : (
                filteredForms.map((form) => (
                  <FormCard
                    key={form.id}
                    form={form}
                    embedToken={company?.embed_token}
                    companyName={company?.company_name}
                    primaryColor={company?.primary_color}
                    secondaryColor={company?.secondary_color}
                    logoUrl={company?.logo_url}
                    currency={company?.currency}
                    onTogglePause={togglePause}
                    onDuplicate={duplicateForm}
                    onDelete={deleteForm}
                    onGetSnippet={() => setSnippetForm(form)}
                  />
                ))
              )}
            </div>
          )}

        </PortalShell>
        <Footer />
      </div>

      <TemplateGalleryDialog
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        embedToken={company?.embed_token}
        companyName={company?.company_name}
        primaryColor={company?.primary_color}
        secondaryColor={company?.secondary_color}
        logoUrl={company?.logo_url}
        currency={company?.currency}
        onCreated={(formId) => {
          setGalleryOpen(false);
          router.push(withSlug(`/admin/integrations/embed/${formId}`));
        }}
      />

      <SnippetDialog
        open={!!snippetForm}
        onOpenChange={(o) => !o && setSnippetForm(null)}
        form={snippetForm}
        embedToken={company?.embed_token}
        companyName={company?.company_name}
      />

      {/* LCF-B: ChatBot was receiving a hardcoded "admin" role +
          the wrong companyId path (user.user_metadata.company_id is
          empty for users created post-Wave-12; the canonical path
          is user.company_id via the profiles join). Same fix the
          HR hub got in HRS-4. */}
      <ChatBot
        userRole={String(((user as { active_role?: string; role?: string } | null)?.active_role
          || (user as { role?: string } | null)?.role) || "admin")}
        companyId={user?.company_id}
      />
    </>
  );
}

function FormCard({
  form, embedToken, companyName, primaryColor, secondaryColor, logoUrl, currency,
  onTogglePause, onDuplicate, onDelete, onGetSnippet,
}: {
  form: EmbedFormRow;
  embedToken?: string;
  companyName?: string;
  primaryColor?: string;
  secondaryColor?: string;
  logoUrl?: string;
  currency?: string;
  onTogglePause: (f: EmbedFormRow) => void;
  onDuplicate: (f: EmbedFormRow) => void;
  onDelete: (f: EmbedFormRow) => void;
  onGetSnippet: () => void;
}) {
  const { withSlug } = useTenantHref();
  const conversion = form.views_count > 0
    ? +(form.submissions_count / form.views_count * 100).toFixed(1)
    : 0;

  // LCF-H (task #229, 2026-05-25): preview iframe now passes the
  // tenant's actual company name + brand colours through the URL so
  // the demo fallback (token=preview path) shows "Spit Braai Delivery"
  // + their real colours instead of the generic "Catering Co.".
  const previewSrc = embedToken
    ? (() => {
        const qs = new URLSearchParams({
          template: form.template_id,
          token: "preview",
          slug: form.slug,
          // LCF-J (task #231, 2026-05-25): compact=1 strips the demo
          // page chrome (heading, controls, page padding) so only
          // the form itself renders inside the card thumbnail. The
          // template gallery dialog has used compact=1 since day
          // one; the FormCard iframes were silently rendering the
          // demo's "CateringMS embed live preview" header + the
          // template/token/slug control row instead of the form.
          compact: "1",
        });
        if (companyName) qs.set("companyName", companyName);
        if (primaryColor) qs.set("primary", primaryColor);
        if (secondaryColor) qs.set("secondary", secondaryColor);
        if (logoUrl) qs.set("logoUrl", logoUrl);
        if (currency) qs.set("currency", currency);
        return `/embed/demo.html?${qs.toString()}`;
      })()
    : "";

  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardContent className="p-0">
        {/* Thumbnail iframe. LCF-K (task #232, 2026-05-25):
            bumped to h-[480px] and dropped the pointer-events-none
            blocker. Bobby's ask was a bigger pane + working scroll.
            The previous pointer-events-none disabled scroll along
            with clicks; lifting it lets the operator scroll the
            form and even click submit (token=preview routes through
            loader.js demoMode which short-circuits submissions, so
            no real lead row gets created from these thumbnails). */}
        <div className="relative h-[480px] bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden rounded-t-xl border-b border-slate-200">
          {previewSrc ? (
            <iframe
              src={previewSrc}
              title={form.name}
              className="absolute inset-0 w-full h-full"
              loading="lazy"
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400 text-xs">
              {form.template_id}
            </div>
          )}
          <Badge
            className={`absolute top-2 right-2 ${form.is_active ? "bg-brand-primary" : "bg-slate-500"} text-white`}
          >
            {form.is_active ? "Active" : "Paused"}
          </Badge>
        </div>

        <div className="p-5">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 truncate">{form.name}</h3>
              <p className="text-xs text-slate-500 font-mono truncate">/{form.slug}</p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="flex-shrink-0">
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={withSlug(`/admin/integrations/embed/${form.id}`)} className="gap-2 cursor-pointer">
                    <Pencil className="w-4 h-4" /> Edit
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDuplicate(form)} className="gap-2 cursor-pointer">
                  <Copy className="w-4 h-4" /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onGetSnippet} className="gap-2 cursor-pointer">
                  <Code2 className="w-4 h-4" /> Get snippet
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onTogglePause(form)} className="gap-2 cursor-pointer">
                  {form.is_active ? <><Pause className="w-4 h-4" /> Pause</> : <><Play className="w-4 h-4" /> Resume</>}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onDelete(form)} className="gap-2 cursor-pointer text-rose-600">
                  <Trash2 className="w-4 h-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4 text-center">
            <div>
              <div className="text-lg font-bold text-slate-900 tabular-nums">{numberFmt.format(form.views_count)}</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Views</div>
            </div>
            <div>
              <div className="text-lg font-bold text-slate-900 tabular-nums">{numberFmt.format(form.submissions_count)}</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Submits</div>
            </div>
            <div>
              <div className="text-lg font-bold text-brand-primary tabular-nums">{conversion}%</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Conv</div>
            </div>
          </div>

          {form.last_submission_at && (
            <p className="text-[11px] text-slate-500 mb-3">
              Last submission {new Date(form.last_submission_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button asChild size="sm" variant="outline" className="gap-2">
              <Link href={withSlug(`/admin/integrations/embed/${form.id}`)}>
                <Pencil className="w-3.5 h-3.5" /> Edit
              </Link>
            </Button>
            <Button onClick={onGetSnippet} size="sm" className="gap-2 bg-brand-primary hover:bg-brand-primary/90">
              <ExternalLink className="w-3.5 h-3.5" /> Snippet
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProtectedAdminEmbedFormsPage() {
  // Baseline admin tier. OWNER included alongside COMPANY_ADMIN and
  // ADMIN, matching the /api/admin/embed/* role gates.
  return (
    <ProtectedRoute allowedRoles={[
      UserRole.SUPER_ADMIN,
      UserRole.OWNER,
      UserRole.COMPANY_ADMIN,
      UserRole.ADMIN,
    ]}>
      <AdminEmbedFormsPage />
    </ProtectedRoute>
  );
}
