import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ArrowRight, Calendar, Clock, Search, TrendingUp, BookOpen } from "lucide-react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { EASE, cardBase, btnPress, iconChip, Eyebrow } from "@/components/motion/marketing";
import Head from "next/head";
import Image from "next/image";
import blogPosts from "@/lib/blog.json";
import { jsonLdSafe } from "@/lib/jsonLd";

interface BlogPost {
  slug: string;
  title: string;
  author: string;
  date: string;
  image: string;
  content: Array<{
    type: string;
    text?: string;
    level?: number;
    question?: string;
    answer?: string;
  }>;
}

export default function BlogPage() {
  const posts = blogPosts as BlogPost[];

  const getExcerpt = (post: BlogPost): string => {
    const firstParagraph = post.content.find(block => block.type === "paragraph");
    return firstParagraph?.text?.substring(0, 150) + "..." || post.title;
  };

  const getCategory = (title: string): string => {
    if (title.toLowerCase().includes("cost") || title.toLowerCase().includes("profit")) return "Cost Management";
    if (title.toLowerCase().includes("automat")) return "Automation";
    if (title.toLowerCase().includes("kitchen")) return "Kitchen Management";
    if (title.toLowerCase().includes("driver") || title.toLowerCase().includes("delivery")) return "Logistics";
    if (title.toLowerCase().includes("equipment") || title.toLowerCase().includes("inventory")) return "Inventory";
    if (title.toLowerCase().includes("client") || title.toLowerCase().includes("customer")) return "Client Relations";
    if (title.toLowerCase().includes("team") || title.toLowerCase().includes("staff")) return "Team Management";
    return "Business Strategy";
  };

  const getReadTime = (post: BlogPost): string => {
    const wordCount = post.content.reduce((count, block) => {
      const text = block.text || block.question || block.answer || "";
      return count + text.split(" ").length;
    }, 0);
    const minutes = Math.ceil(wordCount / 200);
    return `${minutes} min read`;
  };

  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "CateringMS Catering Business Blog",
    "description": "Expert insights on automation, profitability, and growth for catering businesses",
    "url": "https://cateringms.com/blog",
    "publisher": {
      "@type": "Organization",
      "name": "CateringMS",
      "url": "https://cateringms.com"
    }
  };

  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "itemListElement": posts.slice(0, 10).map((post, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "url": `https://cateringms.com/blog/${post.slug}`,
      "name": post.title,
      "description": getExcerpt(post)
    }))
  };

  const categories = ["All", "Cost Management", "Automation", "Kitchen Management", "Logistics", "Inventory", "Client Relations"];

  return (
    <>
      <Head>
        <title>Catering business insights - CateringMS</title>
        <meta name="description" content="Expert insights on automation, profitability, and growth for catering businesses. Learn strategies to reduce costs, increase margins, and scale operations." />
        <meta name="keywords" content="catering business tips, catering automation, increase catering profits, catering operations, catering business growth" />
        <link rel="canonical" href="https://cateringms.com/blog" />
        
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdSafe(collectionSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdSafe(itemListSchema) }}
        />
      </Head>

      <Header />

      <div className="min-h-screen bg-white text-slate-900">
        {/* ===================== HEADER ===================== */}
        <section className="relative overflow-hidden border-b border-slate-100 bg-white">
          {/* Soft brand glow + faint grid, masked so it fades into the page. */}
          <div className="pointer-events-none absolute inset-x-0 -top-40 h-[480px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(124,58,237,0.10),transparent)]" />
          <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:46px_46px] [mask-image:radial-gradient(70%_55%_at_50%_0%,black,transparent)]" />

          <div className="relative mx-auto max-w-7xl px-4 py-12 md:py-16">
            <Reveal>
              <Link
                href="/"
                className={`mb-8 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm hover:border-slate-300 hover:text-slate-900 ${btnPress}`}
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Home
              </Link>
            </Reveal>

            <Reveal className="max-w-3xl" delay={0.05}>
              <div className="mb-5">
                <Eyebrow icon={BookOpen} className="border-violet-200 bg-violet-50 text-violet-700">
                  Insights & strategy
                </Eyebrow>
              </div>
              <h1 className="text-balance text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                Catering Business{" "}
                <span className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-500 bg-clip-text text-transparent">
                  Blog
                </span>
              </h1>
              <p className="mt-5 text-balance text-lg leading-relaxed text-slate-600 sm:text-xl">
                Expert insights on automation, profitability, and growth for catering businesses
              </p>
            </Reveal>
          </div>
        </section>

        {/* ===================== BODY ===================== */}
        <div className="mx-auto max-w-7xl px-4 py-12 md:py-16">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-4">
            <div className="lg:col-span-3">
              <Reveal className="mb-6">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Search articles..."
                    className="h-12 rounded-full pl-11"
                  />
                </div>
              </Reveal>

              <Stagger className="mb-10 flex flex-wrap gap-2" gap={0.04}>
                {categories.map((category) => (
                  <StaggerItem key={category}>
                    <Button
                      variant="outline"
                      size="sm"
                      className={`rounded-full border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50 ${btnPress}`}
                    >
                      {category}
                    </Button>
                  </StaggerItem>
                ))}
              </Stagger>

              <Stagger className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {posts.map((post) => (
                  <StaggerItem key={post.slug}>
                    <Link href={`/blog/${post.slug}`} className="block h-full">
                      <Card className={`${cardBase} cursor-pointer overflow-hidden p-0`}>
                        <div className="relative h-48 w-full overflow-hidden">
                          <Image
                            src={post.image}
                            alt={post.title}
                            layout="fill"
                            objectFit="cover"
                            className={`transition-transform duration-500 ${EASE} group-hover:scale-[1.04]`}
                          />
                        </div>
                        <CardHeader>
                          <Badge variant="secondary" className="mb-2 w-fit">
                            {getCategory(post.title)}
                          </Badge>
                          <CardTitle className={`text-xl text-slate-900 transition-colors duration-200 ${EASE} group-hover:text-violet-600`}>
                            {post.title}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="mb-4 line-clamp-3 text-slate-600">{getExcerpt(post)}</p>
                          <div className="flex items-center justify-between text-sm text-slate-500">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              {new Date(post.date).toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' })}
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4" />
                              {getReadTime(post)}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  </StaggerItem>
                ))}
              </Stagger>
            </div>

            <Stagger className="space-y-6" gap={0.08}>
              <StaggerItem>
                <Card className={`${cardBase} border-violet-100 bg-gradient-to-br from-violet-50 to-fuchsia-50`}>
                  <CardHeader>
                    <CardTitle className="text-lg">Popular Topics</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">Cost Reduction</span>
                      <Badge className="bg-purple-100 text-purple-700">5 posts</Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">Kitchen Management</span>
                      <Badge className="bg-blue-100 text-blue-700">3 posts</Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">Logistics</span>
                      <Badge className="bg-green-100 text-green-700">2 posts</Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">Equipment</span>
                      <Badge className="bg-orange-100 text-orange-700">3 posts</Badge>
                    </div>
                  </CardContent>
                </Card>
              </StaggerItem>

              <StaggerItem>
                <Card className={cardBase}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <span className={`${iconChip} h-8 w-8 bg-gradient-to-br from-violet-500 to-fuchsia-500`}>
                        <TrendingUp className="h-4 w-4 text-white" />
                      </span>
                      Most Read
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {posts.slice(0, 3).map((post) => (
                      <Link href={`/blog/${post.slug}`} key={post.slug} className="block">
                        <div className="space-y-1.5">
                          <h4 className={`line-clamp-2 text-sm font-semibold text-slate-900 transition-colors duration-200 ${EASE} hover:text-violet-600`}>
                            {post.title}
                          </h4>
                          <p className="text-xs text-slate-500">{new Date(post.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                        </div>
                      </Link>
                    ))}
                  </CardContent>
                </Card>
              </StaggerItem>

              <StaggerItem>
                <Card className={`${cardBase} border-emerald-100 bg-gradient-to-br from-emerald-50 to-green-50`}>
                  <CardHeader>
                    <CardTitle className="text-lg">Newsletter</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-slate-600">
                      Get weekly tips on catering business automation and profitability
                    </p>
                    <Input placeholder="Your email" type="email" className="rounded-full" />
                    <Button className={`w-full rounded-full bg-gradient-to-b from-violet-600 to-violet-700 font-semibold text-white shadow-lg shadow-violet-600/20 hover:from-violet-600 hover:to-violet-800 ${btnPress}`}>
                      Subscribe
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              </StaggerItem>
            </Stagger>
          </div>
        </div>

        <Footer />
      </div>
    </>
  );
}
