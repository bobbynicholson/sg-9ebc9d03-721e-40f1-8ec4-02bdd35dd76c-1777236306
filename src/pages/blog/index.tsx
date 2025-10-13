import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Calendar, Clock, Search, TrendingUp } from "lucide-react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import Head from "next/head";
import Image from "next/image";
import blogPosts from "@/lib/blog.json";

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
        <title>Catering Business Insights - CateringMS Blog</title>
        <meta name="description" content="Expert insights on automation, profitability, and growth for catering businesses. Learn strategies to reduce costs, increase margins, and scale operations." />
        <meta name="keywords" content="catering business tips, catering automation, increase catering profits, catering operations, catering business growth" />
        <link rel="canonical" href="https://cateringms.com/blog" />
        
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
        />
      </Head>

      <Header />

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <Link href="/">
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>

          <div className="mb-12">
            <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-4">
              Catering Business Blog
            </h1>
            <p className="text-xl text-slate-600 max-w-3xl">
              Expert insights on automation, profitability, and growth for catering businesses
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-8">
            <div className="lg:col-span-3">
              <div className="mb-6">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <Input 
                    placeholder="Search articles..." 
                    className="pl-10 h-12"
                  />
                </div>
              </div>

              <div className="flex gap-2 mb-8 flex-wrap">
                {categories.map((category) => (
                  <Button
                    key={category}
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                  >
                    {category}
                  </Button>
                ))}
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {posts.map((post) => (
                    <Link href={`/blog/${post.slug}`} key={post.slug}>
                      <Card className="h-full hover:shadow-xl transition-all duration-300 cursor-pointer overflow-hidden group">
                        <div className="relative h-48 w-full overflow-hidden">
                          <Image 
                            src={post.image} 
                            alt={post.title}
                            layout="fill"
                            objectFit="cover"
                            className="group-hover:scale-105 transition-transform duration-300"
                          />
                        </div>
                        <CardHeader>
                          <Badge variant="secondary" className="w-fit mb-2">
                            {getCategory(post.title)}
                          </Badge>
                          <CardTitle className="text-xl group-hover:text-orange-600 transition-colors">
                            {post.title}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-gray-600 mb-4 line-clamp-3">{getExcerpt(post)}</p>
                          <div className="flex items-center justify-between text-sm text-gray-500">
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
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-50 to-pink-50">
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

              <Card className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Most Read
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {posts.slice(0, 3).map((post) => (
                    <Link href={`/blog/${post.slug}`} key={post.slug}>
                      <div className="space-y-2 cursor-pointer">
                        <h4 className="font-semibold text-sm hover:text-purple-600 transition-colors line-clamp-2">
                          {post.title}
                        </h4>
                        <p className="text-xs text-slate-600">{new Date(post.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                      </div>
                    </Link>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-0 shadow-lg bg-gradient-to-br from-green-50 to-emerald-50">
                <CardHeader>
                  <CardTitle className="text-lg">Newsletter</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-slate-600">
                    Get weekly tips on catering business automation and profitability
                  </p>
                  <Input placeholder="Your email" type="email" />
                  <Button className="w-full bg-gradient-to-r from-purple-600 to-pink-600">
                    Subscribe
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
        
        <Footer />
      </div>
    </>
  );
}
