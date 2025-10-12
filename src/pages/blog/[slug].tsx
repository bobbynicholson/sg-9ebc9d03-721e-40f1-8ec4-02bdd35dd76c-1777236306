import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { cmsService } from "@/services/cmsService";
import type { BlogPost } from "@/types/cms";
import { Calendar, Clock, Tag, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Head from "next/head";

export default function BlogPostPage() {
  const router = useRouter();
  const { slug } = router.query;
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (slug && typeof slug === "string") {
      loadPost(slug);
    }
  }, [slug]);

  const loadPost = async (postSlug: string) => {
    try {
      setLoading(true);
      const data = await cmsService.getBlogPostBySlug(postSlug);
      setPost(data);
    } catch (error) {
      console.error("Error loading blog post:", error);
    } finally {
      setLoading(false);
    }
  };

  const getBlogPostingSchema = (post: BlogPost) => ({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": post.title,
    "description": post.excerpt,
    "image": post.featured_image || "https://cateros.co.za/default-blog-image.jpg",
    "datePublished": post.published_date,
    "dateModified": post.last_updated || post.published_date,
    "author": {
      "@type": "Person",
      "name": post.author
    },
    "publisher": {
      "@type": "Organization",
      "name": "CaterOS",
      "logo": {
        "@type": "ImageObject",
        "url": "https://cateros.co.za/logo.png"
      }
    },
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": `https://cateros.co.za/blog/${post.slug}`
    },
    "keywords": post.tags?.join(", ") || post.category,
    "articleSection": post.category,
    "wordCount": post.content.split(" ").length,
    "timeRequired": `PT${post.read_time_minutes || 10}M`
  });

  const getBreadcrumbSchema = (post: BlogPost) => ({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": "https://cateros.co.za"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "Blog",
        "item": "https://cateros.co.za/blog"
      },
      {
        "@type": "ListItem",
        "position": 3,
        "name": post.title,
        "item": `https://cateros.co.za/blog/${post.slug}`
      }
    ]
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-4xl mx-auto">
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-gray-200 rounded w-3/4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded w-5/6"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50">
        <div className="container mx-auto px-4 py-16">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl font-bold mb-4">Blog Post Not Found</h1>
            <p className="text-gray-600 mb-8">The blog post you are looking for does not exist.</p>
            <Link href="/blog">
              <Button>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Blog
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{post.title} - CateringMS Blog</title>
        <meta name="description" content={post.excerpt} />
        <meta name="keywords" content={post.tags?.join(", ") || post.category} />
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={post.excerpt} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={`https://cateros.co.za/blog/${post.slug}`} />
        {post.featured_image && <meta property="og:image" content={post.featured_image} />}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="article:published_time" content={post.published_date} />
        <meta name="article:author" content={post.author} />
        <link rel="canonical" href={`https://cateros.co.za/blog/${post.slug}`} />
        
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(getBlogPostingSchema(post)) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(getBreadcrumbSchema(post)) }}
        />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50">
        <div className="container mx-auto px-4 py-8">
          <div className="max-w-4xl mx-auto">
            <Link href="/blog">
              <Button variant="ghost" className="mb-6">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Blog
              </Button>
            </Link>

            <article className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
              {post.featured_image && (
                <div className="w-full h-64 bg-gradient-to-r from-orange-400 to-amber-400"></div>
              )}

              <div className="p-8 md:p-12">
                <div className="mb-6">
                  <Badge variant="secondary" className="mb-4">
                    {post.category}
                  </Badge>
                  <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
                    {post.title}
                  </h1>
                  <p className="text-xl text-gray-600 mb-6">
                    {post.excerpt}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-6 text-sm text-gray-500 mb-8 pb-8 border-b">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    {new Date(post.published_date).toLocaleDateString("en-ZA", {
                      year: "numeric",
                      month: "long",
                      day: "numeric"
                    })}
                  </div>
                  {post.read_time_minutes && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      {post.read_time_minutes} min read
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    By {post.author}
                  </div>
                </div>

                <div 
                  className="prose prose-lg max-w-none"
                  style={{
                    lineHeight: "1.8",
                  }}
                >
                  {post.content.split("\n\n").map((paragraph, index) => {
                    if (paragraph.startsWith("## ")) {
                      return (
                        <h2 key={index} className="text-2xl font-bold mt-8 mb-4 text-gray-900">
                          {paragraph.replace("## ", "")}
                        </h2>
                      );
                    }
                    if (paragraph.startsWith("**") && paragraph.endsWith("**")) {
                      return (
                        <p key={index} className="font-semibold text-gray-800 my-4">
                          {paragraph.replace(/\*\*/g, "")}
                        </p>
                      );
                    }
                    return (
                      <p key={index} className="text-gray-700 mb-4">
                        {paragraph}
                      </p>
                    );
                  })}
                </div>

                {post.tags && post.tags.length > 0 && (
                  <div className="mt-12 pt-8 border-t">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Tag className="h-4 w-4 text-gray-500" />
                      {post.tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </article>

            <div className="mt-8 text-center">
              <Link href="/blog">
                <Button size="lg">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Read More Articles
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
