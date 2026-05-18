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
import { MetricCard } from "@/components/dashboard/MetricCard";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useFuzzyItems } from "@/hooks/useFuzzySearch";

import { TemplateGalleryDialog } from "@/components/admin/embed/TemplateGalleryDialog";
import { SnippetDialog } from "@/components/admin/embed/SnippetDialog";
import { useTenantHref } from "@/lib/tenantUrl";

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

export default function AdminEmbedFormsPage() {
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
      toast({ title: "Couldn't load forms", description: err.message, variant: "destructive" });
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
      toast({ title: "Update failed", variant: "destructive" });
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
      toast({ title: "Delete failed", variant: "destructive" });
    }
  }

  const isEmpty = !loading && forms.length === 0;

  return (
    <>
      <NoIndexMeta />
      <Head><title>Lead Capture Forms - CateringMS Admin</title></Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 lg:pl-72 xl:pl-80">
        <div className="px-4 py-6 md:py-8 lg:py-12 max-w-full">

          {/* Header */}
          <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-2xl shadow-lg">
                <Code2 className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  Lead Capture Forms
                </h1>
                <p className="text-sm md:text-base text-slate-600 mt-1">
                  Embeddable enquiry forms for your marketing site. Pick a template, customise, paste the snippet.
                </p>
              </div>
            </div>
            {!isEmpty && (
              <Button
                onClick={() => setGalleryOpen(true)}
                className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
              >
                <Plus className="w-4 h-4" />
                New form
              </Button>
            )}
          </div>

          {/* KPI strip */}
          {!isEmpty && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-8">
              <MetricCard
                label="Total forms"
                value={numberFmt.format(kpis.total_forms)}
                tooltip="Number of embeddable form variants you've created. Includes paused forms."
                icon={LayoutTemplate}
                iconColor="text-indigo-600"
                loading={loading}
              />
              <MetricCard
                label="Views"
                value={numberFmt.format(kpis.total_views)}
                hint="Across all forms"
                tooltip="Lifetime page views recorded by the embed loader. One view = one form render on a visitor's screen."
                icon={Eye}
                iconColor="text-blue-600"
                loading={loading}
              />
              <MetricCard
                label="Submissions"
                value={numberFmt.format(kpis.total_submissions)}
                hint="Across all forms"
                tooltip="Lifetime submissions across every form, excluding rows flagged as spam."
                icon={SendIcon}
                iconColor="text-emerald-600"
                loading={loading}
              />
              <MetricCard
                label="Conversion rate"
                value={`${kpis.conversion_rate}%`}
                hint="Submissions / views"
                tooltip="Total submissions divided by total views, expressed as a percentage. Healthy embedded forms sit between 5% and 20%."
                icon={TrendingUp}
                iconColor="text-purple-600"
                loading={loading}
              />
            </div>
          )}

          {/* Search */}
          {!isEmpty && (
            <div className="mb-4">
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
          )}

          {/* List or empty state */}
          {isEmpty ? (
            <Card className="border-0 shadow-lg">
              <CardContent className="py-16 text-center">
                <div className="mx-auto mb-6 w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg">
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
                  className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
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
                  <Card key={i} className="border-0 shadow-lg">
                    <CardContent className="p-6">
                      <div className="h-32 bg-slate-100 rounded-lg animate-pulse mb-4" />
                      <div className="h-5 w-2/3 bg-slate-100 rounded animate-pulse mb-2" />
                      <div className="h-4 w-1/3 bg-slate-100 rounded animate-pulse" />
                    </CardContent>
                  </Card>
                ))
              ) : filteredForms.length === 0 ? (
                <Card className="border-0 shadow-lg col-span-full">
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
                    onTogglePause={togglePause}
                    onDuplicate={duplicateForm}
                    onDelete={deleteForm}
                    onGetSnippet={() => setSnippetForm(form)}
                  />
                ))
              )}
            </div>
          )}

        </div>
        <Footer />
      </div>

      <TemplateGalleryDialog
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        embedToken={company?.embed_token}
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

      <ChatBot userRole="admin" companyId={user?.user_metadata?.company_id} />
    </>
  );
}

function FormCard({
  form, embedToken, onTogglePause, onDuplicate, onDelete, onGetSnippet,
}: {
  form: EmbedFormRow;
  embedToken?: string;
  onTogglePause: (f: EmbedFormRow) => void;
  onDuplicate: (f: EmbedFormRow) => void;
  onDelete: (f: EmbedFormRow) => void;
  onGetSnippet: () => void;
}) {
  const { withSlug } = useTenantHref();
  const conversion = form.views_count > 0
    ? +(form.submissions_count / form.views_count * 100).toFixed(1)
    : 0;

  const previewSrc = embedToken
    ? `/embed/demo.html?template=${encodeURIComponent(form.template_id)}&token=preview&slug=${encodeURIComponent(form.slug)}`
    : "";

  return (
    <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
      <CardContent className="p-0">
        {/* Thumbnail iframe */}
        <div className="relative h-44 bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden rounded-t-xl border-b border-slate-200">
          {previewSrc ? (
            <iframe
              src={previewSrc}
              title={form.name}
              className="absolute inset-0 w-full h-full pointer-events-none"
              loading="lazy"
              sandbox="allow-scripts allow-same-origin"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400 text-xs">
              {form.template_id}
            </div>
          )}
          <Badge
            className={`absolute top-2 right-2 ${form.is_active ? "bg-emerald-500" : "bg-slate-500"} text-white`}
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
                <DropdownMenuItem onClick={() => onDelete(form)} className="gap-2 cursor-pointer text-red-600">
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
              <div className="text-lg font-bold text-emerald-600 tabular-nums">{conversion}%</div>
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
            <Button onClick={onGetSnippet} size="sm" className="gap-2 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600">
              <ExternalLink className="w-3.5 h-3.5" /> Snippet
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
