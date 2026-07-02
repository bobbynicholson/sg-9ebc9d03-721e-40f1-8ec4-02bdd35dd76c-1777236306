import { useState, useEffect } from "react";
import Head from "next/head";
import { PlatformNav } from "@/components/admin/PlatformNav";
import { PortalShell, PortalHeader, PortalCard, PortalCardHeader,
  PageWorkbench,
} from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sparkles, FileText, Eye, Save, Trash2, Loader2, CheckCircle2, Wand2, Search, TrendingUp, MessageSquare, Code, Link, Newspaper } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cmsService } from "@/services/cmsService";
import { useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { InfoTooltip } from "@/components/ui/info-tooltip";

interface BlogBrief {
  topic: string;
  keywords: string[];
  targetAudience: string;
  tone: "professional" | "casual" | "friendly" | "authoritative" | "conversational";
  contentLength: "short" | "medium" | "long";
  category: string;
  includeFAQ: boolean;
  includeSchema: boolean;
  includeInternalLinks: boolean;
}

// Hero meta chip styling, same recipe as the platform financial dashboard.
const HERO_CHIP =
  "inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white";

interface GeneratedContent {
  title: string;
  excerpt: string;
  content: string;
  metaDescription: string;
  faqs: Array<{ question: string; answer: string }>;
  schema: string;
  suggestedKeywords: string[];
  internalLinks: Array<{ text: string; url: string; context: string }>;
}

// Super-admin gate: the previous soft client redirect could flash the
// page (and fire cmsService reads) before pushing to login. ProtectedRoute
// hides the page entirely below super_admin, same as cms-pages.tsx.
export default function ProtectedCMSBlogPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN]}>
      <CMSBlogPage />
    </ProtectedRoute>
  );
}

function CMSBlogPage() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"create" | "manage">("create");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  // AI Brief State
  const [brief, setBrief] = useState<BlogBrief>({
    topic: "",
    keywords: [],
    targetAudience: "",
    tone: "professional",
    contentLength: "medium",
    category: "General",
    includeFAQ: true,
    includeSchema: true,
    includeInternalLinks: true,
  });

  // Generated Content State
  const [generated, setGenerated] = useState<GeneratedContent | null>(null);

  // Blog Management State
  const [posts, setPosts] = useState<any[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Live counts for the hero chips, derived straight from loaded posts.
  const publishedCount = posts.filter((p) => p?.is_published).length;
  const draftCount = posts.length - publishedCount;

  // Load posts on mount so the hero chips show real counts even while
  // the AI Writer tab is open. Switching to Manage refreshes the list.
  useEffect(() => {
    loadPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTab === "manage") {
      loadPosts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const loadPosts = async () => {
    setLoadingPosts(true);
    try {
      const data = await cmsService.getAllBlogPosts();
      setPosts(data);
    } catch (error) {
      console.error("Error loading posts:", error);
      toast({
        title: "Error",
        description: "Failed to load blog posts",
        variant: "destructive",
      });
    } finally {
      setLoadingPosts(false);
    }
  };

  const handleGenerateContent = async () => {
    if (!brief.topic || brief.keywords.length === 0) {
      toast({
        title: "Missing Information",
        description: "Please provide a topic and at least one keyword",
        variant: "destructive",
      });
      return;
    }

    setAiGenerating(true);

    try {
      // Same generator the CMS Pages editor uses (Anthropic with a
      // Groq fallback server-side). FAQ / schema / internal links stay
      // deterministic client-side helpers layered on top of the draft.
      const wordCount = brief.contentLength === "short" ? 800 : brief.contentLength === "medium" ? 1500 : 2500;
      const res = await fetch("/api/cms/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: brief.topic,
          audience: brief.targetAudience || "catering business owners",
          tone: brief.tone,
          wordTarget: wordCount,
          keywords: brief.keywords.join(", "),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error || `Draft generation failed (${res.status})`);
      }

      const plain = String(body.content || "").replace(/[#*`>_[\]]/g, "").replace(/\s+/g, " ").trim();
      const metaKeywords = String(body.meta_keywords || "")
        .split(",").map((k: string) => k.trim()).filter(Boolean);
      const content: GeneratedContent = {
        title: body.title || brief.topic,
        excerpt: plain.length > 200 ? `${plain.slice(0, 197)}...` : plain,
        content: body.content || "",
        metaDescription: body.meta_description || "",
        faqs: brief.includeFAQ ? generateFAQs(brief.topic) : [],
        schema: brief.includeSchema ? generateSchema(brief.topic) : "",
        suggestedKeywords: [...new Set([...brief.keywords, ...metaKeywords])],
        internalLinks: brief.includeInternalLinks ? generateInternalLinks(brief.topic) : [],
      };

      setGenerated(content);

      toast({
        title: "Content Generated!",
        description: "Your AI-powered blog post is ready for review",
      });
    } catch (error) {
      console.error("Error generating content:", error);
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : "Failed to generate content. Please try again.",
        variant: "destructive",
      });
    } finally {
      setAiGenerating(false);
    }
  };

  const handlePublish = async () => {
    if (!generated) return;

    setSaving(true);

    try {
      await cmsService.createBlogPost({
        title: generated.title,
        slug: generated.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        excerpt: generated.excerpt,
        content: generated.content,
        meta_description: generated.metaDescription,
        is_published: true,
        author: user?.full_name || user?.email || "Admin",
        published_date: new Date().toISOString(),
        last_updated: new Date().toISOString(),
        category: brief.category,
        tags: generated.suggestedKeywords || [],
      });

      toast({
        title: "Published!",
        description: "Your blog post is now live",
      });

      setGenerated(null);
      setBrief({
        topic: "",
        keywords: [],
        targetAudience: "",
        tone: "professional",
        contentLength: "medium",
        includeFAQ: true,
        includeSchema: true,
        category: "General",
        includeInternalLinks: true,
      });
      setActiveTab("manage");
    } catch (error) {
      console.error("Error publishing:", error);
      toast({
        title: "Publish Failed",
        description: "Failed to publish blog post",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePost = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await cmsService.deleteBlogPost(deleteTarget.id);
      setPosts((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      toast({
        title: "Post deleted",
        description: `"${deleteTarget.title}" has been removed from the blog.`,
      });
      setDeleteTarget(null);
    } catch (error) {
      console.error("Error deleting post:", error);
      toast({
        title: "Delete failed",
        description: "Could not delete the blog post. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="admin-page-shell">
        <PlatformNav />
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
          </div>
        </PortalShell>
      </div>
    );
  }

  return (
    <div className="admin-page-shell">
      <Head>
        <meta name="robots" content="noindex, nofollow" />
        <title>Blog CMS - CateringMS</title>
      </Head>
      <PlatformNav />
      <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
        <PortalHeader
          variant="hero"
          title="AI Blog Writer"
          subtitle="Create SEO-optimised posts for the public cateringms.com blog with AI, then manage everything that is already live."
          icon={Newspaper}
          meta={
            loadingPosts && posts.length === 0 ? (
              <span className={HERO_CHIP}>
                <Loader2 className="h-3 w-3 animate-spin" />
                Loading post counts...
              </span>
            ) : (
              <>
                <span className={HERO_CHIP}>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {publishedCount} published
                </span>
                <span className={HERO_CHIP}>
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  {draftCount} draft{draftCount === 1 ? "" : "s"}
                </span>
                <span className={HERO_CHIP}>
                  {posts.length} post{posts.length === 1 ? "" : "s"} total
                </span>
              </>
            )
          }
        />
        <PageWorkbench />

        {/* Toolbar: create/manage switcher + live blog count */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "create" | "manage")}>
          <PortalCard className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="create" className="gap-2">
                <Wand2 className="w-4 h-4" />
                AI Writer
              </TabsTrigger>
              <TabsTrigger value="manage" className="gap-2">
                <FileText className="w-4 h-4" />
                Manage Posts
              </TabsTrigger>
            </TabsList>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {posts.length === 0
                ? "No posts on the public blog yet"
                : `${posts.length} post${posts.length === 1 ? "" : "s"} on the public blog`}
            </p>
          </PortalCard>

          {/* AI Writer Tab */}
          <TabsContent value="create" className="space-y-6">
            {!generated ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Brief Input */}
                <div className="lg:col-span-2 space-y-6">
                  <PortalCard>
                    <PortalCardHeader
                      title={
                        <span className="flex items-center gap-2">
                          <Search className="w-5 h-5" />
                          Content Brief
                          <InfoTooltip content="Fill in the topic, keywords and tone for the AI generator to work from.\n\nThe article body runs through the live AI drafting endpoint (the same one CMS Pages uses). The FAQ, schema and internal-link sections are fixed starter templates, not AI output, so edit them before publishing. Publishing saves the post to the blog." />
                        </span>
                      }
                    />
                    <p className="-mt-2 mb-3 text-sm text-slate-600 dark:text-slate-400">
                      Provide details for the AI to generate your blog post
                    </p>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="topic">Topic / Title *</Label>
                        <Input
                          id="topic"
                          placeholder="e.g., How to Scale Your Catering Business"
                          value={brief.topic}
                          onChange={(e) => setBrief({ ...brief, topic: e.target.value })}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="keywords">Keywords (comma-separated) *</Label>
                        <Input
                          id="keywords"
                          placeholder="e.g., catering business, event catering, food service"
                          value={brief.keywords.join(", ")}
                          onChange={(e) => setBrief({ ...brief, keywords: e.target.value.split(",").map(k => k.trim()) })}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="audience">Target Audience</Label>
                        <Input
                          id="audience"
                          placeholder="e.g., Small catering business owners"
                          value={brief.targetAudience}
                          onChange={(e) => setBrief({ ...brief, targetAudience: e.target.value })}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Tone</Label>
                          <Select
                            value={brief.tone}
                            onValueChange={(v: any) => setBrief({ ...brief, tone: v })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="professional">Professional</SelectItem>
                              <SelectItem value="casual">Casual</SelectItem>
                              <SelectItem value="friendly">Friendly</SelectItem>
                              <SelectItem value="authoritative">Authoritative</SelectItem>
                              <SelectItem value="conversational">Conversational</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Content Length</Label>
                          <Select
                            value={brief.contentLength}
                            onValueChange={(v: any) => setBrief({ ...brief, contentLength: v })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="short">Short (~800 words)</SelectItem>
                              <SelectItem value="medium">Medium (~1500 words)</SelectItem>
                              <SelectItem value="long">Long (~2500 words)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Category</Label>
                        <Select
                          value={brief.category}
                          onValueChange={(v) => setBrief({ ...brief, category: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="General">General</SelectItem>
                            <SelectItem value="Catering Tips">Catering Tips</SelectItem>
                            <SelectItem value="Business Growth">Business Growth</SelectItem>
                            <SelectItem value="Event Planning">Event Planning</SelectItem>
                            <SelectItem value="Recipes">Recipes</SelectItem>
                            <SelectItem value="Industry News">Industry News</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={brief.includeFAQ}
                            onChange={(e) => setBrief({ ...brief, includeFAQ: e.target.checked })}
                            className="w-4 h-4 text-brand-primary"
                          />
                          <span className="text-sm text-slate-700 dark:text-slate-300">Include starter FAQs (template)</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={brief.includeSchema}
                            onChange={(e) => setBrief({ ...brief, includeSchema: e.target.checked })}
                            className="w-4 h-4 text-brand-primary"
                          />
                          <span className="text-sm text-slate-700 dark:text-slate-300">Include schema markup (template)</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={brief.includeInternalLinks}
                            onChange={(e) => setBrief({ ...brief, includeInternalLinks: e.target.checked })}
                            className="w-4 h-4 text-brand-primary"
                          />
                          <span className="text-sm text-slate-700 dark:text-slate-300">Include internal links (template)</span>
                        </label>
                      </div>

                      <Button
                        onClick={handleGenerateContent}
                        disabled={aiGenerating || !brief.topic || brief.keywords.length === 0}
                        className="w-full"
                        size="lg"
                      >
                        {aiGenerating ? (
                          <>
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                            Generating with AI...
                          </>
                        ) : (
                          <>
                            <Sparkles className="mr-2 h-5 w-5" />
                            Generate Blog Post
                          </>
                        )}
                      </Button>
                    </div>
                  </PortalCard>
                </div>

                {/* SEO Tips */}
                <div className="space-y-4">
                  <PortalCard>
                    <PortalCardHeader
                      title={
                        <span className="flex items-center gap-2 text-base">
                          <TrendingUp className="w-5 h-5" />
                          SEO Best Practices
                        </span>
                      }
                    />
                    <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-brand-primary mt-0.5 flex-shrink-0" />
                        <p>Use descriptive, keyword-rich titles (50-60 characters)</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-brand-primary mt-0.5 flex-shrink-0" />
                        <p>Include primary keyword in first paragraph</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-brand-primary mt-0.5 flex-shrink-0" />
                        <p>Use H2/H3 headings for structure</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-brand-primary mt-0.5 flex-shrink-0" />
                        <p>Keep meta description under 160 characters</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-brand-primary mt-0.5 flex-shrink-0" />
                        <p>Add internal links to related content</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-brand-primary mt-0.5 flex-shrink-0" />
                        <p>Include FAQ schema for rich snippets</p>
                      </div>
                    </div>
                  </PortalCard>

                  <PortalCard>
                    <PortalCardHeader
                      title={
                        <span className="flex items-center gap-2 text-base">
                          <MessageSquare className="w-5 h-5" />
                          AI Writing Tips
                        </span>
                      }
                    />
                    <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-brand-primary mt-0.5 flex-shrink-0" />
                        <p>Be specific with your topic for better results</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-brand-primary mt-0.5 flex-shrink-0" />
                        <p>Use 3-5 relevant keywords</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-brand-primary mt-0.5 flex-shrink-0" />
                        <p>Define target audience for better tone</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-brand-primary mt-0.5 flex-shrink-0" />
                        <p>Review and edit AI output before publishing</p>
                      </div>
                    </div>
                  </PortalCard>
                </div>
              </div>
            ) : (
              /* Generated Content Preview */
              <div className="space-y-6">
                <Alert>
                  <Sparkles className="h-4 w-4" />
                  <AlertDescription>
                    AI has generated your blog post! Review and edit before publishing.
                  </AlertDescription>
                </Alert>

                <PortalCard>
                  <PortalCardHeader title={generated.title} />
                  <p className="-mt-2 mb-3 text-sm text-slate-600 dark:text-slate-400">{generated.excerpt}</p>
                  <div className="space-y-6">
                    {/* SEO Meta */}
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Meta Description</Label>
                      <Textarea
                        value={generated.metaDescription}
                        onChange={(e) => setGenerated({ ...generated, metaDescription: e.target.value })}
                        className="h-20"
                      />
                      <p className="text-xs text-slate-500">
                        {generated.metaDescription.length}/160 characters
                      </p>
                    </div>

                    {/* Keywords */}
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Keywords</Label>
                      <div className="flex flex-wrap gap-2">
                        {generated.suggestedKeywords.map((keyword, idx) => (
                          <Badge key={idx} variant="secondary">{keyword}</Badge>
                        ))}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Content</Label>
                      <Textarea
                        value={generated.content}
                        onChange={(e) => setGenerated({ ...generated, content: e.target.value })}
                        className="min-h-[400px] font-mono text-sm"
                      />
                    </div>

                    {/* FAQs */}
                    {generated.faqs.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold">Starter FAQs (template)</Label>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          These are canned starter questions, not AI output. Rewrite them for this post before publishing.
                        </p>
                        <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
                          {generated.faqs.map((faq, idx) => (
                            <div key={idx} className="space-y-1">
                              <p className="font-semibold text-sm text-slate-900 dark:text-slate-100">Q: {faq.question}</p>
                              <p className="text-sm text-slate-600 dark:text-slate-400">A: {faq.answer}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Schema */}
                    {generated.schema && (
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold flex items-center gap-2">
                          <Code className="w-4 h-4" />
                          Schema.org JSON-LD (starter template)
                        </Label>
                        <Textarea
                          value={generated.schema}
                          onChange={(e) => setGenerated({ ...generated, schema: e.target.value })}
                          className="min-h-[200px] font-mono text-xs"
                        />
                      </div>
                    )}

                    {/* Internal Links */}
                    {generated.internalLinks.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold flex items-center gap-2">
                          <Link className="w-4 h-4" />
                          Starter internal links (template)
                        </Label>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          A fixed set of common marketing-site links, not AI suggestions. Keep the ones that fit this post.
                        </p>
                        <div className="space-y-3 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
                          {generated.internalLinks.map((link, idx) => (
                            <div key={idx} className="space-y-1">
                              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {link.text} → <code className="text-xs text-brand-primary">{link.url}</code>
                              </p>
                              <p className="text-xs text-slate-600 dark:text-slate-400 italic">Context: {link.context}</p>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-slate-500">
                          Use format: [[Link Text|/path]] in your content
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-4 border-t">
                      <Button
                        onClick={handlePublish}
                        disabled={saving}
                        className=""
                      >
                        {saving ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Publishing...
                          </>
                        ) : (
                          <>
                            <Save className="mr-2 h-4 w-4" />
                            Publish Post
                          </>
                        )}
                      </Button>

                      <Button
                        variant="outline"
                        onClick={() => setGenerated(null)}
                      >
                        Start Over
                      </Button>
                    </div>
                  </div>
                </PortalCard>
              </div>
            )}
          </TabsContent>

          {/* Manage Posts Tab */}
          <TabsContent value="manage">
            <PortalCard>
              <PortalCardHeader
                title={
                  <span className="flex items-center gap-2">
                    Blog posts
                    <InfoTooltip content="Every blog post on cateringms.com, drafts and published combined.\n\nSorted by publish date with the most recent first." />
                  </span>
                }
              />
              <p className="-mt-2 mb-3 text-sm text-slate-600 dark:text-slate-400">Manage your existing blog content</p>
              <div>
                {loadingPosts ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-brand-primary" />
                  </div>
                ) : posts.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No blog posts yet. Create your first post with AI!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {posts.map((post) => (
                      <div
                        key={post.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300 hover:bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/40 dark:hover:border-slate-700 dark:hover:bg-slate-800/40"
                      >
                        <div className="min-w-[220px] flex-1">
                          <div className="mb-1 flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-slate-900 dark:text-slate-100">{post.title}</h3>
                            <Badge
                              className={`border text-[10px] ${
                                post.is_published
                                  ? "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300"
                                  : "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                              }`}
                            >
                              {post.is_published ? "published" : "draft"}
                            </Badge>
                            {post.category && (
                              <Badge variant="outline" className="text-[10px] text-slate-600 dark:text-slate-300">
                                {post.category}
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-slate-600 dark:text-slate-400">{post.excerpt}</p>
                          {post.published_date && (
                            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                              Published {new Date(post.published_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-shrink-0 gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(`/blog/${post.slug}`, "_blank", "noopener,noreferrer")}
                            title="View the public post in a new tab"
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            View
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeleteTarget(post)}
                            disabled={deleting}
                            title="Delete post"
                          >
                            <Trash2 className="w-4 h-4 text-rose-600" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </PortalCard>
          </TabsContent>
        </Tabs>

        {/* Delete confirmation */}
        <AlertDialog
          open={!!deleteTarget}
          onOpenChange={(open) => {
            if (!open && !deleting) setDeleteTarget(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this blog post?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget
                  ? `"${deleteTarget.title}" will be permanently removed from the blog. This cannot be undone.`
                  : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={deleting}
                onClick={(e) => {
                  e.preventDefault();
                  handleDeletePost();
                }}
                className="bg-rose-600 text-white hover:bg-rose-700"
              >
                {deleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  "Delete post"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PortalShell>
    </div>
  );
}

function generateFAQs(topic: string): Array<{ question: string; answer: string }> {
  return [
    {
      question: `What is ${topic}?`,
      answer: `${topic} refers to the comprehensive approach to managing and optimizing your catering business operations for maximum efficiency and customer satisfaction.`
    },
    {
      question: `How can I implement ${topic} in my business?`,
      answer: `Start by assessing your current processes, identifying areas for improvement, and gradually implementing changes while monitoring results.`
    },
    {
      question: `What are the benefits of ${topic}?`,
      answer: `Key benefits include increased efficiency, better customer satisfaction, improved profitability, and sustainable business growth.`
    },
    {
      question: `How long does it take to see results?`,
      answer: `Most businesses see initial improvements within 30-60 days, with significant results becoming evident after 3-6 months of consistent implementation.`
    },
  ];
}

function generateSchema(topic: string): string {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": `${topic}: A Comprehensive Guide`,
    "description": `Complete guide to ${topic.toLowerCase()} for catering businesses`,
    "author": {
      "@type": "Organization",
      "name": "CateringMS"
    },
    "publisher": {
      "@type": "Organization",
      "name": "CateringMS",
      "logo": {
        "@type": "ImageObject",
        "url": "https://cateringms.com/logo.png"
      }
    },
    "datePublished": new Date().toISOString(),
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `https://cateringms.com/blog/${topic.toLowerCase().replace(/\s+/g, '-')}`
    }
  }, null, 2);
}

function generateInternalLinks(topic: string): Array<{ text: string; url: string; context: string }> {
  return [
    {
      text: "our platform features",
      url: "/features",
      context: "When discussing tools or technology needs"
    },
    {
      text: "pricing plans",
      url: "/pricing",
      context: "When mentioning solutions or ROI"
    },
    {
      text: "Sign up for a free trial",
      url: "/company-signup",
      context: "In conclusion or call-to-action sections"
    },
    {
      text: "contact our team",
      url: "/contact",
      context: "When offering personalized support"
    },
  ];
}
