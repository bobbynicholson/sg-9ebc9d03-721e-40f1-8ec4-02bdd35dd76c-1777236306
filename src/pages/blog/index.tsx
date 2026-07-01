import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ArrowRight, Calendar, Clock, Search } from "lucide-react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { EASE, btnPress } from "@/components/motion/marketing";
import Head from "next/head";
import Image from "next/image";
import blogPosts from "@/lib/blog.json";
import { jsonLdSafe } from "@/lib/jsonLd";
import type { GetStaticProps } from "next";
import { cmsService } from "@/services/cmsService";

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

const FALLBACK_COVER = "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&auto=format&fit=crop&q=60";

// Posts written in the platform CMS live in blog_posts; the launch set
// is baked into blog.json. Merge both (CMS wins on slug clashes) so
// articles published from /admin/platform/cms-blog actually appear here.
export const getStaticProps: GetStaticProps = async () => {
  let dbPosts: BlogPost[] = [];
  try {
    const rows = await cmsService.getAllBlogPosts(true);
    dbPosts = (rows || []).map((r: any) => {
      const plain = String(r.content || "").replace(/[#*`>_[\]]/g, "").replace(/\s+/g, " ").trim();
      return {
        slug: r.slug,
        title: r.title,
        author: r.author || "CateringMS Team",
        date: r.published_date || r.created_at || new Date().toISOString(),
        image: r.cover_image || FALLBACK_COVER,
        content: [
          { type: "paragraph", text: r.excerpt || plain.slice(0, 300) },
          ...(plain ? [{ type: "paragraph", text: plain }] : []),
        ],
      };
    });
  } catch {
    // blog_posts unreachable at build time - static set still renders.
  }
  const dbSlugs = new Set(dbPosts.map((p) => p.slug));
  const merged = [
    ...dbPosts,
    ...(blogPosts as BlogPost[]).filter((p) => !dbSlugs.has(p.slug)),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return { props: { posts: merged }, revalidate: 300 };
};

export default function BlogPage({ posts = blogPosts as BlogPost[] }: { posts?: BlogPost[] }) {

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

  const [featured, ...rest] = posts;

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

      <div className="font-body min-h-screen bg-stone-50 text-stone-900">
        {/* ===================== HEADER ===================== */}
        <section className="border-b border-stone-200 bg-stone-50">
          <div className="mx-auto max-w-7xl px-4 pb-10 pt-12 md:pb-14 md:pt-16">
            <Reveal>
              <Link
                href="/"
                className={`mb-10 inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm hover:border-stone-400 hover:text-stone-900 ${btnPress}`}
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Home
              </Link>
            </Reveal>

            <Reveal className="max-w-3xl" delay={0.05}>
              <h1 className="text-balance font-display text-4xl font-medium leading-[1.05] tracking-tight text-stone-900 sm:text-5xl lg:text-6xl">
                Catering Business{" "}
                <span className="text-amber-700">Blog</span>
              </h1>
              <p className="mt-6 max-w-[60ch] text-pretty text-lg leading-relaxed text-stone-700 sm:text-xl">
                Expert insights on automation, profitability, and growth for catering businesses
              </p>
            </Reveal>
          </div>
        </section>

        {/* ===================== BODY ===================== */}
        <div className="mx-auto max-w-7xl px-4 py-14 md:py-20">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-4 lg:gap-12">
            <div className="lg:col-span-3">
              <Reveal className="mb-6">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
                  <Input
                    placeholder="Search articles..."
                    className="h-12 rounded-full border-stone-300 pl-11"
                  />
                </div>
              </Reveal>

              <Stagger className="mb-12 flex flex-wrap gap-2" gap={0.04}>
                {categories.map((category) => (
                  <StaggerItem key={category}>
                    <Button
                      variant="outline"
                      size="sm"
                      className={`rounded-full border-stone-300 text-stone-700 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 ${btnPress}`}
                    >
                      {category}
                    </Button>
                  </StaggerItem>
                ))}
              </Stagger>

              {/* Featured post: wide editorial lead, not part of the uniform grid. */}
              {featured && (
                <Reveal className="mb-12">
                  <Link href={`/blog/${featured.slug}`} className="group block">
                    <article className="grid grid-cols-1 overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm transition-[transform,box-shadow,border-color] duration-300 ease-standard hover:-translate-y-1 hover:border-amber-200 hover:shadow-xl md:grid-cols-2">
                      <div className="relative h-60 w-full overflow-hidden md:h-full md:min-h-[20rem]">
                        <Image
                          src={featured.image}
                          alt={featured.title}
                          layout="fill"
                          objectFit="cover"
                          className={`transition-transform duration-500 ${EASE} group-hover:scale-[1.03]`}
                        />
                      </div>
                      <div className="flex flex-col justify-center p-7 md:p-9">
                        <Badge variant="secondary" className="mb-3 w-fit bg-amber-100 text-amber-800">
                          {getCategory(featured.title)}
                        </Badge>
                        <h2 className={`text-balance font-display text-2xl font-semibold leading-snug tracking-tight text-stone-900 transition-colors duration-200 ${EASE} group-hover:text-amber-800 md:text-3xl`}>
                          {featured.title}
                        </h2>
                        <p className="mt-4 max-w-[60ch] text-pretty leading-relaxed text-stone-700">
                          {getExcerpt(featured)}
                        </p>
                        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-stone-600">
                          <span className="inline-flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-stone-400" />
                            {new Date(featured.date).toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' })}
                          </span>
                          <span className="inline-flex items-center gap-2">
                            <Clock className="h-4 w-4 text-stone-400" />
                            {getReadTime(featured)}
                          </span>
                          <span className="ml-auto inline-flex items-center gap-1.5 font-medium text-amber-700 transition-colors duration-150 group-hover:text-amber-800">
                            Read article
                            <ArrowRight className={`h-4 w-4 transition-transform duration-200 ${EASE} group-hover:translate-x-0.5`} />
                          </span>
                        </div>
                      </div>
                    </article>
                  </Link>
                </Reveal>
              )}

              <Stagger className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2">
                {rest.map((post, i) => (
                  <StaggerItem key={post.slug}>
                    <Link href={`/blog/${post.slug}`} className="group block h-full">
                      <article className="flex h-full flex-col">
                        <div className="relative mb-5 aspect-[16/10] w-full overflow-hidden rounded-2xl border border-stone-200 bg-stone-100">
                          <Image
                            src={post.image}
                            alt={post.title}
                            layout="fill"
                            objectFit="cover"
                            className={`transition-transform duration-500 ${EASE} group-hover:scale-[1.04]`}
                          />
                          <span className="absolute left-3 top-3 rounded-full bg-stone-900/85 px-3 py-1 text-xs font-medium text-stone-50">
                            {getCategory(post.title)}
                          </span>
                        </div>
                        <h3 className={`text-balance font-display text-xl font-semibold leading-snug tracking-tight text-stone-900 transition-colors duration-200 ${EASE} group-hover:text-amber-800`}>
                          {post.title}
                        </h3>
                        {/* Show the excerpt on the first couple of cards only, so the column has rhythm instead of identical blocks. */}
                        {i < 2 && (
                          <p className="mt-3 line-clamp-2 max-w-[62ch] text-pretty leading-relaxed text-stone-700">
                            {getExcerpt(post)}
                          </p>
                        )}
                        <div className="mt-4 flex items-center gap-x-4 border-t border-stone-200 pt-4 text-sm text-stone-600">
                          <span className="inline-flex items-center gap-1.5">
                            <Calendar className="h-4 w-4 text-stone-400" />
                            {new Date(post.date).toLocaleDateString("en-US", { year: 'numeric', month: 'short', day: 'numeric' })}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <Clock className="h-4 w-4 text-stone-400" />
                            {getReadTime(post)}
                          </span>
                        </div>
                      </article>
                    </Link>
                  </StaggerItem>
                ))}
              </Stagger>
            </div>

            <aside className="space-y-10">
              <Reveal>
                <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
                  <h2 className="font-display text-lg font-semibold text-stone-900">Popular Topics</h2>
                  <ul className="mt-4 divide-y divide-stone-200">
                    {[
                      { label: "Cost Reduction", count: "5 posts" },
                      { label: "Kitchen Management", count: "3 posts" },
                      { label: "Logistics", count: "2 posts" },
                      { label: "Equipment", count: "3 posts" },
                    ].map((topic) => (
                      <li key={topic.label} className="flex items-center justify-between py-2.5 text-sm">
                        <span className="text-stone-700">{topic.label}</span>
                        <span className="text-stone-500">{topic.count}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>

              <Reveal delay={0.05}>
                <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
                  <h2 className="font-display text-lg font-semibold text-stone-900">Most Read</h2>
                  <ol className="mt-4 space-y-5">
                    {posts.slice(0, 3).map((post, idx) => (
                      <li key={post.slug}>
                        <Link href={`/blog/${post.slug}`} className="group flex gap-3.5">
                          <span className="font-display text-lg font-semibold leading-none text-amber-700/70">
                            {String(idx + 1).padStart(2, "0")}
                          </span>
                          <div className="space-y-1">
                            <h4 className={`line-clamp-2 text-sm font-semibold leading-snug text-stone-900 transition-colors duration-200 ${EASE} group-hover:text-amber-800`}>
                              {post.title}
                            </h4>
                            <p className="text-xs text-stone-500">{new Date(post.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ol>
                </div>
              </Reveal>

              <Reveal delay={0.1}>
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
                  <h2 className="font-display text-lg font-semibold text-stone-900">Newsletter</h2>
                  <p className="mt-3 max-w-[42ch] text-sm leading-relaxed text-stone-700">
                    Get weekly tips on catering business automation and profitability
                  </p>
                  <div className="mt-4 space-y-3">
                    <Input placeholder="Your email" type="email" className="rounded-full border-stone-300 bg-white" />
                    <Button className={`w-full rounded-full bg-amber-600 font-semibold text-white shadow-sm hover:bg-amber-700 ${btnPress}`}>
                      Subscribe
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Reveal>
            </aside>
          </div>
        </div>

        <Footer />
      </div>
    </>
  );
}
