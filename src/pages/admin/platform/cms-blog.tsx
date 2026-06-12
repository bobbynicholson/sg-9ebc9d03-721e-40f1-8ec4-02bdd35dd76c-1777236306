import { useState, useEffect } from "react";
import { PlatformNav } from "@/components/admin/PlatformNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sparkles, FileText, Eye, Save, Trash2, Loader2, CheckCircle2, Wand2, Search, TrendingUp, MessageSquare, Code, Link } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cmsService } from "@/services/cmsService";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/router";
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

export default function CMSBlogPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
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

  // Auth check
  useEffect(() => {
    if (!authLoading && (!user || user.active_role !== "super_admin")) {
      router.push("/auth/login");
    }
  }, [user, authLoading, router]);

  // Load existing posts
  useEffect(() => {
    if (activeTab === "manage") {
      loadPosts();
    }
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
      // Simulate AI generation (replace with actual API call to OpenAI/Claude)
      await new Promise(resolve => setTimeout(resolve, 2000));

      const wordCount = brief.contentLength === "short" ? 800 : brief.contentLength === "medium" ? 1500 : 2500;

      const content: GeneratedContent = {
        title: `${brief.topic}: A Comprehensive Guide for ${brief.targetAudience || 'Catering Businesses'}`,
        excerpt: `Discover everything you need to know about ${brief.topic.toLowerCase()} in the catering industry. Expert insights, practical tips, and proven strategies.`,
        content: generateSampleContent(brief.topic, wordCount, brief.tone, brief.includeInternalLinks),
        metaDescription: `Complete guide to ${brief.topic.toLowerCase()} for catering businesses. Learn best practices, tips, and strategies from industry experts.`,
        faqs: brief.includeFAQ ? generateFAQs(brief.topic) : [],
        schema: brief.includeSchema ? generateSchema(brief.topic) : "",
        suggestedKeywords: [...brief.keywords, `${brief.topic.toLowerCase()} guide`, `catering ${brief.topic.toLowerCase()}`],
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
        description: "Failed to generate content. Please try again.",
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

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 p-8 lg:pl-72 xl:pl-80 pt-20 lg:pt-8">
      <PlatformNav />
      <div className="max-w-full">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-primary to-brand-secondary flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">AI Blog Writer</h1>
              <p className="text-slate-600">Create SEO-optimized blog posts at scale with AI</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "create" | "manage")}>
          <TabsList className="mb-6">
            <TabsTrigger value="create" className="gap-2">
              <Wand2 className="w-4 h-4" />
              AI Writer
            </TabsTrigger>
            <TabsTrigger value="manage" className="gap-2">
              <FileText className="w-4 h-4" />
              Manage Posts
            </TabsTrigger>
          </TabsList>

          {/* AI Writer Tab */}
          <TabsContent value="create" className="space-y-6">
            {!generated ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Brief Input */}
                <div className="lg:col-span-2 space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Search className="w-5 h-5" />
                        Content Brief
                        <InfoTooltip content="Fill in the topic, keywords and tone for the AI generator to work from.\n\nHeads up: generation is currently a mock that returns sample text, not a live AI call. Publishing still saves the post properly." />
                      </CardTitle>
                      <CardDescription>
                        Provide details for the AI to generate your blog post
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
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
                            className="w-4 h-4 text-purple-600"
                          />
                          <span className="text-sm text-slate-700">Include FAQ Section</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={brief.includeSchema}
                            onChange={(e) => setBrief({ ...brief, includeSchema: e.target.checked })}
                            className="w-4 h-4 text-purple-600"
                          />
                          <span className="text-sm text-slate-700">Include Schema Markup</span>
                        </label>

                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={brief.includeInternalLinks}
                            onChange={(e) => setBrief({ ...brief, includeInternalLinks: e.target.checked })}
                            className="w-4 h-4 text-purple-600"
                          />
                          <span className="text-sm text-slate-700">Suggest Internal Links</span>
                        </label>
                      </div>

                      <Button
                        onClick={handleGenerateContent}
                        disabled={aiGenerating || !brief.topic || brief.keywords.length === 0}
                        className="w-full bg-gradient-to-r from-brand-primary to-brand-secondary hover:opacity-90"
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
                    </CardContent>
                  </Card>
                </div>

                {/* SEO Tips */}
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <TrendingUp className="w-5 h-5" />
                        SEO Best Practices
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-slate-600">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <p>Use descriptive, keyword-rich titles (50-60 characters)</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <p>Include primary keyword in first paragraph</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <p>Use H2/H3 headings for structure</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <p>Keep meta description under 160 characters</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <p>Add internal links to related content</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        <p>Include FAQ schema for rich snippets</p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <MessageSquare className="w-5 h-5" />
                        AI Writing Tips
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm text-slate-600">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                        <p>Be specific with your topic for better results</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                        <p>Use 3-5 relevant keywords</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                        <p>Define target audience for better tone</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                        <p>Review and edit AI output before publishing</p>
                      </div>
                    </CardContent>
                  </Card>
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

                <Card>
                  <CardHeader>
                    <CardTitle>{generated.title}</CardTitle>
                    <CardDescription>{generated.excerpt}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
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
                        <Label className="text-sm font-semibold">FAQ Section</Label>
                        <div className="space-y-3 p-4 bg-slate-50 rounded-lg">
                          {generated.faqs.map((faq, idx) => (
                            <div key={idx} className="space-y-1">
                              <p className="font-semibold text-sm text-slate-900">Q: {faq.question}</p>
                              <p className="text-sm text-slate-600">A: {faq.answer}</p>
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
                          Schema.org JSON-LD
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
                          Suggested Internal Links
                        </Label>
                        <div className="space-y-3 p-4 bg-slate-50 rounded-lg">
                          {generated.internalLinks.map((link, idx) => (
                            <div key={idx} className="space-y-1">
                              <p className="text-sm font-semibold text-slate-900">
                                {link.text} → <code className="text-xs text-purple-600">{link.url}</code>
                              </p>
                              <p className="text-xs text-slate-600 italic">Context: {link.context}</p>
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
                        className="bg-gradient-to-r from-brand-primary to-brand-secondary hover:opacity-90"
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
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* Manage Posts Tab */}
          <TabsContent value="manage">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Published Blog Posts
                  <InfoTooltip content="Every blog post on cateringms.com, drafts and published combined.\n\nSorted by publish date with the most recent first." />
                </CardTitle>
                <CardDescription>Manage your existing blog content</CardDescription>
              </CardHeader>
              <CardContent>
                {loadingPosts ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
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
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        <div>
                          <h3 className="font-semibold text-slate-900">{post.title}</h3>
                          <p className="text-sm text-slate-600">{post.excerpt}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm">
                            <Eye className="w-4 h-4 mr-2" />
                            View
                          </Button>
                          <Button variant="outline" size="sm">
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// Helper functions for demo (replace with actual AI API calls)
function generateSampleContent(topic: string, wordCount: number, tone: string, includeLinks: boolean): string {
  const linkExample = includeLinks 
    ? "\n\nLearn more about [[our platform features|/features]] and how they can help your business grow.\n\n" 
    : "\n\n";

  return `# ${topic}

## Introduction

In today's competitive catering industry, ${topic.toLowerCase()} has become essential for business success. This comprehensive guide will walk you through everything you need to know.${linkExample}

## Why This Matters

Understanding ${topic.toLowerCase()} is crucial because it directly impacts your business growth, customer satisfaction, and operational efficiency.

## Key Strategies

### Strategy 1: Foundation
Building a strong foundation is the first step...

### Strategy 2: Implementation
Once you have the basics in place...

### Strategy 3: Optimization
Continuous improvement ensures long-term success...

## Best Practices

- Always prioritize quality over quantity
- Listen to customer feedback
- Stay updated with industry trends
- Invest in your team's training

${includeLinks ? "Check out our [[pricing plans|/pricing]] to see which solution fits your needs best.\n" : ""}

## Common Challenges and Solutions

Every catering business faces challenges. Here's how to overcome them...

## Conclusion

Mastering ${topic.toLowerCase()} will set your catering business apart from competitors and drive sustainable growth.

${includeLinks ? "Ready to get started? [[Sign up for a free trial|/company-signup]] today!\n" : ""}

---

*Note: This is AI-generated content. Please review and edit before publishing.*`;
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