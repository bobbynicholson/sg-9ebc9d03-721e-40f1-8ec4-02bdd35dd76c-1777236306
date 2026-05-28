/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/platform/cms-pages - Bobby's marketing CMS for cateringms.com.
 *
 * NOT a tenant feature - this is super-admin scope. The pages
 * managed here appear on the public marketing site, never inside a
 * catering company's portal.
 *
 * Two modes:
 *   - List   - every page on file, edit/delete inline
 *   - Edit   - title, slug, content, meta. Sticky preview panel.
 *               AI Draft Assistant generates a full post via Sonnet.
 *
 * Both modes use PlatformNav so the operator never loses orientation.
 */
import { useState, useEffect, useMemo } from "react";
import Head from "next/head";
import { PlatformNav } from "@/components/admin/PlatformNav";
import { cmsService } from "@/services/cmsService";
import type { CMSPage } from "@/types/cms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Pencil, Trash2, Plus, ArrowLeft, Save, X, AlertTriangle, Sparkles,
  Loader2, Eye, FileText, Wand2, Globe, ImageIcon, Upload,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";

interface DraftRequest {
  topic: string;
  audience: string;
  tone: "informative" | "casual" | "promotional";
  wordTarget: number;
  keywords: string;
}

const EMPTY_FORM = {
  title: "",
  slug: "",
  content: "",
  meta_description: "",
  meta_keywords: "",
  header_image_url: "",
  header_image_alt: "",
  is_published: true,
};

// Wave 24: super_admin gate. The header comment already notes "NOT
// a tenant feature - this is super-admin scope" but the page had no
// runtime gate, so a tenant admin who guessed the URL could load
// (and via the underlying cmsService, mutate) public marketing
// pages. ProtectedRoute hides the page entirely below super_admin.
export default function ProtectedCMSPageManagement() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
      <CMSPageManagement />
    </ProtectedRoute>
  );
}

function CMSPageManagement() {
  const { toast } = useToast();
  const [pages, setPages] = useState<CMSPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPage, setEditingPage] = useState<CMSPage | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });

  // AI panel state
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [draftReq, setDraftReq] = useState<DraftRequest>({
    topic: "",
    audience: "catering company owners and operations managers",
    tone: "informative",
    wordTarget: 600,
    keywords: "",
  });

  // Live preview side-panel toggle
  const [previewOpen, setPreviewOpen] = useState(false);

  // Header image upload state
  const [imageBusy, setImageBusy] = useState(false);

  const uploadHeaderImage = async (file: File) => {
    setImageBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      // Pass the slug so the storage path is human-readable.
      fd.append("slug", formData.slug || "untitled");
      const res = await fetch("/api/cms/upload-image", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Upload failed");
      setFormData((prev) => ({
        ...prev,
        header_image_url: json.url,
        // If the operator hasn't typed alt text yet, leave it empty
        // so the save guard prompts them. Don't auto-fill from the
        // filename - that's almost always lazy SEO.
      }));
      toast({
        title: "Image uploaded",
        description: "Now add alt text describing what's in the image.",
      });
    } catch (e: any) {
      toast({ title: "Image upload failed", description: e?.message || "", variant: "destructive" });
    } finally {
      setImageBusy(false);
    }
  };

  // ── Load ────────────────────────────────────────────────────────────
  useEffect(() => {
    loadPages();
  }, []);

  const loadPages = async () => {
    try {
      setLoading(true);
      const data = await cmsService.getAllPages(false);
      setPages(data);
    } catch (error) {
      console.error("Error loading pages:", error);
      toast({ title: "Could not load pages", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // ── Edit / save ─────────────────────────────────────────────────────
  const startEdit = (page: CMSPage) => {
    setEditingPage(page);
    setFormData({
      title: page.title,
      slug: page.slug,
      content: page.content,
      meta_description: page.meta_description || "",
      meta_keywords: page.meta_keywords || "",
      header_image_url: page.header_image_url || "",
      header_image_alt: page.header_image_alt || "",
      is_published: page.is_published,
    });
    setAiOpen(false);
    setPreviewOpen(false);
  };

  const startNew = () => {
    setIsCreating(true);
    setEditingPage(null);
    setFormData({ ...EMPTY_FORM });
    setAiOpen(false);
    setPreviewOpen(false);
  };

  const handleSave = async () => {
    if (!formData.title.trim() || !formData.slug.trim()) {
      toast({ title: "Title and slug are required", variant: "destructive" });
      return;
    }
    // Accessibility gate: a header image without alt text fails WCAG.
    // Block save until the operator either removes the image or adds
    // a description.
    if (formData.header_image_url && !formData.header_image_alt.trim()) {
      toast({
        title: "Add alt text for the header image",
        description: "Required for screen readers and search engines.",
        variant: "destructive",
      });
      return;
    }
    try {
      if (editingPage) {
        await cmsService.updatePage(editingPage.id, formData);
      } else {
        await cmsService.createPage(formData);
      }
      await loadPages();
      handleCancel();
      toast({ title: "Page saved" });
    } catch (error: any) {
      console.error("Error saving page:", error);
      toast({ title: "Save failed", description: error?.message || "", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this page? This cannot be undone.")) return;
    try {
      await cmsService.deletePage(id);
      await loadPages();
      toast({ title: "Page deleted" });
    } catch (error: any) {
      toast({ title: "Delete failed", description: error?.message || "", variant: "destructive" });
    }
  };

  const handleCancel = () => {
    setEditingPage(null);
    setIsCreating(false);
    setFormData({ ...EMPTY_FORM });
    setAiOpen(false);
    setPreviewOpen(false);
  };

  const generateSlug = (title: string) =>
    title
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);

  // ── AI draft ───────────────────────────────────────────────────────
  const runAiDraft = async () => {
    if (!draftReq.topic.trim()) {
      toast({ title: "Tell the AI what to write about", variant: "destructive" });
      return;
    }
    setAiBusy(true);
    try {
      const res = await fetch("/api/cms/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftReq),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "AI draft failed");
      // Drop everything into the form. The team can edit before saving.
      setFormData((prev) => ({
        ...prev,
        title: json.title || prev.title,
        slug: json.slug || prev.slug || generateSlug(json.title || ""),
        content: json.content || prev.content,
        meta_description: json.meta_description || prev.meta_description,
        meta_keywords: json.meta_keywords || prev.meta_keywords,
      }));
      setAiOpen(false);
      setPreviewOpen(true);
      toast({
        title: "Draft ready",
        description: `${json.tokens_out} output tokens via ${json.model}. Review and tweak before publishing.`,
      });
    } catch (e: any) {
      toast({
        title: "AI draft failed",
        description: e?.message || "Check ANTHROPIC_API_KEY on the server.",
        variant: "destructive",
      });
    } finally {
      setAiBusy(false);
    }
  };

  const editing = editingPage || isCreating;

  // Lightweight markdown preview - handles ##, **, line breaks.
  const previewHtml = useMemo(() => {
    const md = formData.content || "";
    const escaped = md
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return escaped
      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
      .replace(/^## (.+)$/gm, "<h2>$1</h2>")
      .replace(/^# (.+)$/gm, "<h1>$1</h1>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/^- (.+)$/gm, "<li>$1</li>")
      .replace(/(<li>[\s\S]+?<\/li>)/g, "<ul>$1</ul>")
      .replace(/\n\n/g, "</p><p>")
      .replace(/^(?!<[hu1-3])/gm, "<p>")
      .replace(/<p>(<h[1-3]>)/g, "$1")
      .replace(/<p>(<ul>)/g, "$1");
  }, [formData.content]);

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <>
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>{editing ? (editingPage ? "Edit page" : "New page") : "Page Management"} - CateringMS</title>
      </Head>

      <PlatformNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-blue-50 via-white to-indigo-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-4 py-6 lg:py-8 max-w-full">
          {/* Always-visible scope banner */}
          <Alert className="mb-5 border-purple-200 bg-purple-50">
            <AlertTriangle className="h-4 w-4 text-purple-600" />
            <AlertDescription className="text-purple-800">
              <strong>cateringms.com marketing site.</strong> What you publish here appears on the public website at{" "}
              <code className="text-xs bg-purple-100 px-1.5 py-0.5 rounded">cateringms.com/page/&lt;slug&gt;</code>.
              It does NOT show up in any individual catering company's portal.
            </AlertDescription>
          </Alert>

          {/* ── Editor mode ──────────────────────────────────────── */}
          {editing ? (
            <>
              {/* Header */}
              <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 shadow-lg">
                    <FileText className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-slate-900">
                      {editingPage ? "Edit page" : "New page"}
                    </h1>
                    <p className="text-xs text-slate-500">
                      {editingPage ? `Editing "${editingPage.title}"` : "Marketing site content"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setAiOpen((v) => !v)}>
                    <Wand2 className="w-4 h-4 mr-1.5" /> AI assist
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPreviewOpen((v) => !v)}>
                    <Eye className="w-4 h-4 mr-1.5" />
                    {previewOpen ? "Hide preview" : "Preview"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleCancel}>
                    <X className="mr-1.5 h-4 w-4" /> Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} className="bg-gradient-to-r from-emerald-600 to-green-600">
                    <Save className="mr-1.5 h-4 w-4" /> Save page
                  </Button>
                </div>
              </div>

              {/* AI assist panel (collapsible) */}
              {aiOpen && (
                <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50 shadow-sm mb-5">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-600" />
                      AI Draft Assistant
                    </CardTitle>
                    <CardDescription>
                      Describe the post in plain English. Sonnet writes a full draft (title, slug, content, SEO meta) ready to edit. Output drops straight into the form.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label className="text-xs">What's the post about?</Label>
                      <Textarea
                        rows={2}
                        value={draftReq.topic}
                        onChange={(e) => setDraftReq({ ...draftReq, topic: e.target.value })}
                        placeholder="e.g. How catering teams can cut food waste using prep-list intelligence, focus on real-world scenarios from spit braais and corporate lunches."
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs">Audience</Label>
                        <Input
                          value={draftReq.audience}
                          onChange={(e) => setDraftReq({ ...draftReq, audience: e.target.value })}
                          placeholder="catering company owners"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Tone</Label>
                        <select
                          value={draftReq.tone}
                          onChange={(e) => setDraftReq({ ...draftReq, tone: e.target.value as any })}
                          className="w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm"
                        >
                          <option value="informative">Informative</option>
                          <option value="casual">Casual</option>
                          <option value="promotional">Promotional</option>
                        </select>
                      </div>
                      <div>
                        <Label className="text-xs">Word target (200-2000)</Label>
                        <Input
                          type="number"
                          min={200}
                          max={2000}
                          step={50}
                          value={draftReq.wordTarget}
                          onChange={(e) =>
                            setDraftReq({ ...draftReq, wordTarget: parseInt(e.target.value) || 600 })
                          }
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">SEO keywords (optional, comma separated)</Label>
                      <Input
                        value={draftReq.keywords}
                        onChange={(e) => setDraftReq({ ...draftReq, keywords: e.target.value })}
                        placeholder="catering software, food waste, prep list, kitchen management"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        onClick={runAiDraft}
                        disabled={aiBusy || !draftReq.topic.trim()}
                        className="bg-gradient-to-r from-purple-600 to-pink-600"
                      >
                        {aiBusy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
                        {aiBusy ? "Drafting..." : "Generate draft"}
                      </Button>
                      <p className="text-[11px] text-slate-500">
                        Anything you've already typed in the form below will be overwritten when the draft lands.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Form + preview grid */}
              <div className={`grid grid-cols-1 ${previewOpen ? "lg:grid-cols-2" : ""} gap-5`}>
                {/* Form column */}
                <div className="space-y-4">
                  {/*
                    Header image card, the post's hero. Sat above
                    the title card because the operator scrolls top to
                    bottom thinking like a reader: image first, then
                    title, then body. Alt text is required at save
                    time, not optional.
                  */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <ImageIcon className="w-4 h-4 text-blue-600" />
                        Header image
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Hero image rendered above the title on the public post.
                        Alt text is required for accessibility + SEO.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-5 pt-2 space-y-3">
                      {formData.header_image_url ? (
                        <div className="relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={formData.header_image_url}
                            alt={formData.header_image_alt || ""}
                            className="w-full max-h-64 object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => setFormData((prev) => ({
                              ...prev,
                              header_image_url: "",
                              header_image_alt: "",
                            }))}
                            className="absolute top-2 right-2 rounded-md bg-white/95 hover:bg-white shadow text-xs font-medium px-2.5 py-1 text-slate-700 inline-flex items-center gap-1"
                            title="Remove image"
                          >
                            <X className="w-3.5 h-3.5" />
                            Remove
                          </button>
                        </div>
                      ) : (
                        <label
                          htmlFor="header-image-input"
                          className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition"
                        >
                          {imageBusy ? (
                            <Loader2 className="w-7 h-7 text-slate-400 animate-spin mb-2" />
                          ) : (
                            <Upload className="w-7 h-7 text-slate-400 mb-2" />
                          )}
                          <p className="text-sm font-medium text-slate-700">
                            {imageBusy ? "Uploading..." : "Click to upload header image"}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-1">
                            JPG, PNG, WebP, AVIF, GIF · 5 MB max
                          </p>
                        </label>
                      )}
                      <Input
                        id="header-image-input"
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
                        className="hidden"
                        disabled={imageBusy}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) uploadHeaderImage(f);
                          e.target.value = ""; // allow re-upload of same filename
                        }}
                      />
                      {formData.header_image_url && (
                        <div>
                          <Label htmlFor="header_image_alt" className="text-xs">
                            Alt text <span className="text-rose-600">*</span>
                          </Label>
                          <Input
                            id="header_image_alt"
                            value={formData.header_image_alt}
                            onChange={(e) =>
                              setFormData({ ...formData, header_image_alt: e.target.value })
                            }
                            placeholder='e.g. "A spit braai roasting over open coals at a Stellenbosch wedding"'
                            className={
                              !formData.header_image_alt.trim()
                                ? "border-amber-300 focus-visible:ring-amber-300"
                                : ""
                            }
                          />
                          <p className="text-[11px] text-slate-500 mt-1">
                            Describe what's IN the image, not the image itself ("dog playing fetch", not "image of dog").
                            Required for screen readers + Google image search.
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-5 space-y-4">
                      <div>
                        <Label htmlFor="title" className="text-xs">Page title</Label>
                        <Input
                          id="title"
                          value={formData.title}
                          onChange={(e) => {
                            const t = e.target.value;
                            setFormData((prev) => ({
                              ...prev,
                              title: t,
                              // Only auto-fill slug while it's empty or follows the previous title.
                              slug: prev.slug && prev.slug !== generateSlug(prev.title) ? prev.slug : generateSlug(t),
                            }));
                          }}
                          placeholder="e.g. Five ways to cut catering food waste"
                        />
                      </div>

                      <div>
                        <Label htmlFor="slug" className="text-xs">URL slug</Label>
                        <Input
                          id="slug"
                          value={formData.slug}
                          onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                          placeholder="five-ways-to-cut-food-waste"
                        />
                        <p className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          cateringms.com/page/<strong>{formData.slug || "your-slug"}</strong>
                        </p>
                      </div>

                      <div>
                        <Label htmlFor="content" className="text-xs">Page content (Markdown)</Label>
                        <Textarea
                          id="content"
                          value={formData.content}
                          onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                          placeholder="Write the post here. Use ## for section headings, ** for bold."
                          rows={20}
                          className="font-mono text-sm"
                        />
                        <p className="text-[11px] text-slate-500 mt-1">
                          ## Heading · **bold** · *italic* · - bullet · [link](url) · HTML allowed
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">SEO</CardTitle>
                      <CardDescription className="text-xs">
                        What search engines and social previews will show.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-5 pt-0 space-y-3">
                      <div>
                        <Label htmlFor="meta_description" className="text-xs">Meta description</Label>
                        <Textarea
                          id="meta_description"
                          value={formData.meta_description}
                          onChange={(e) => setFormData({ ...formData, meta_description: e.target.value })}
                          placeholder="One-line summary for Google search results (~155 chars)"
                          rows={2}
                        />
                        <p className="text-[11px] text-slate-500 mt-1">
                          {formData.meta_description.length} / ~155 chars
                        </p>
                      </div>
                      <div>
                        <Label htmlFor="meta_keywords" className="text-xs">Meta keywords</Label>
                        <Input
                          id="meta_keywords"
                          value={formData.meta_keywords}
                          onChange={(e) => setFormData({ ...formData, meta_keywords: e.target.value })}
                          placeholder="catering software, food waste, prep list"
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-5 flex items-center gap-3">
                      <Switch
                        id="published"
                        checked={formData.is_published}
                        onCheckedChange={(checked) => setFormData({ ...formData, is_published: checked })}
                      />
                      <div>
                        <Label htmlFor="published" className="text-sm font-medium">
                          {formData.is_published ? "Published" : "Draft"}
                        </Label>
                        <p className="text-[11px] text-slate-500">
                          {formData.is_published
                            ? "Live on the marketing site as soon as you save."
                            : "Saved but hidden from public visitors. Toggle on when ready."}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Live preview column */}
                {previewOpen && (
                  <div>
                    <Card className="lg:sticky lg:top-6">
                      <CardHeader className="pb-2 flex flex-row items-center justify-between">
                        <div>
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Eye className="w-4 h-4" /> Live preview
                          </CardTitle>
                          <CardDescription className="text-xs">
                            Roughly how the post renders on the public site.
                          </CardDescription>
                        </div>
                      </CardHeader>
                      <CardContent className="p-5 pt-0">
                        <article className="prose prose-sm max-w-none border border-slate-200 rounded-lg overflow-hidden bg-white min-h-[300px]">
                          {formData.header_image_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={formData.header_image_url}
                              alt={formData.header_image_alt || ""}
                              className="!my-0 w-full max-h-72 object-cover"
                            />
                          )}
                          <div className="p-4">
                            <h1 className="!mb-2">{formData.title || "(no title yet)"}</h1>
                            {formData.meta_description && (
                              <p className="text-slate-500 italic !mt-0">{formData.meta_description}</p>
                            )}
                            <hr />
                            <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                          </div>
                        </article>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* ── List mode ────────────────────────────────────── */
            <>
              <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 shadow-lg">
                    <FileText className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">
                      Marketing pages
                    </h1>
                    <p className="text-sm text-slate-500">
                      Static pages + blog posts that live on cateringms.com
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link href="/admin/platform/dashboard">
                    <Button variant="outline" size="sm">
                      <ArrowLeft className="mr-1.5 h-4 w-4" />
                      Platform dashboard
                    </Button>
                  </Link>
                  <Button onClick={startNew} className="bg-gradient-to-r from-blue-600 to-indigo-600">
                    <Plus className="mr-1.5 h-4 w-4" />
                    New page
                  </Button>
                </div>
              </div>

              {loading ? (
                <Card><CardContent className="py-12 text-center text-slate-500">Loading...</CardContent></Card>
              ) : pages.length === 0 ? (
                <Card className="border-2 border-dashed">
                  <CardContent className="py-12 text-center space-y-3">
                    <FileText className="w-14 h-14 mx-auto text-slate-300" />
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">No pages yet</h3>
                      <p className="text-sm text-slate-600 mt-1">Use the AI Draft Assistant to write your first one.</p>
                    </div>
                    <Button onClick={startNew} className="bg-gradient-to-r from-blue-600 to-indigo-600">
                      <Plus className="mr-1.5 h-4 w-4" />
                      Create first page
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {pages.map((page) => (
                    <Card key={page.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4 flex flex-wrap items-center gap-3">
                        <div className="flex-1 min-w-[200px]">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h3 className="text-base font-semibold text-slate-900">{page.title}</h3>
                            <Badge variant={page.is_published ? "default" : "secondary"} className="text-[10px]">
                              {page.is_published ? "published" : "draft"}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-500 flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            cateringms.com/page/<strong>{page.slug}</strong>
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Last updated {new Date(page.last_updated).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {page.is_published && (
                            <a
                              href={`/page/${page.slug}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-700"
                              title="View live"
                            >
                              <Eye className="w-4 h-4" />
                            </a>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(page)} title="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-rose-600 hover:text-rose-700"
                            onClick={() => handleDelete(page.id)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
