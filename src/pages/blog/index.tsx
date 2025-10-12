import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Calendar, Clock, Search, TrendingUp, DollarSign, Users, Zap } from "lucide-react";
import { Footer } from "@/components/Footer";
import Head from "next/head";

interface BlogPost {
  id: string;
  title: string;
  excerpt: string;
  category: string;
  readTime: string;
  date: string;
  slug: string;
}

export default function BlogPage() {
  const blogPosts: BlogPost[] = [
    {
      id: "1",
      title: "How to Reduce Catering Business Costs by 40% Without Sacrificing Quality",
      excerpt: "Learn practical strategies to cut operational expenses while maintaining the high standards your clients expect. Discover automation tools and smart inventory management techniques.",
      category: "Cost Management",
      readTime: "8 min read",
      date: "2025-01-15",
      slug: "reduce-catering-costs-40-percent"
    },
    {
      id: "2",
      title: "Complete Guide to Automating Your Catering Business Operations",
      excerpt: "Step-by-step guide to implementing automation in your catering company. From order management to delivery tracking, streamline every process.",
      category: "Automation",
      readTime: "12 min read",
      date: "2025-01-12",
      slug: "complete-automation-guide"
    },
    {
      id: "3",
      title: "Increasing Catering Profit Margins: From 15% to 30% in 6 Months",
      excerpt: "Real case study showing how South African catering businesses improved profitability through strategic pricing and operational efficiency.",
      category: "Profitability",
      readTime: "10 min read",
      date: "2025-01-10",
      slug: "increase-profit-margins-guide"
    },
    {
      id: "4",
      title: "Why Most Catering Businesses Fail and How to Avoid Common Mistakes",
      excerpt: "Identify the critical mistakes that lead to catering business failure. Get actionable advice to build a sustainable and profitable operation.",
      category: "Business Strategy",
      readTime: "9 min read",
      date: "2025-01-08",
      slug: "avoid-catering-business-mistakes"
    },
    {
      id: "5",
      title: "Equipment Management: Stop Losing Money on Missing Inventory",
      excerpt: "Implement a system to track plates, cutlery, and equipment. Calculate the true cost of lost items and prevent future losses.",
      category: "Operations",
      readTime: "7 min read",
      date: "2025-01-05",
      slug: "equipment-tracking-system"
    },
    {
      id: "6",
      title: "Converting More Quotes to Paid Orders: Proven Email Strategies",
      excerpt: "Master the art of follow-up emails. Learn timing, messaging, and discount strategies that convert hesitant prospects into confirmed bookings.",
      category: "Sales",
      readTime: "11 min read",
      date: "2025-01-03",
      slug: "quote-conversion-strategies"
    },
    {
      id: "7",
      title: "Kitchen Efficiency: Reducing Food Waste While Maintaining Quality",
      excerpt: "Practical tips to minimize waste in your catering kitchen. Improve prep processes, portion control, and inventory rotation.",
      category: "Kitchen Management",
      readTime: "8 min read",
      date: "2024-12-30",
      slug: "reduce-kitchen-food-waste"
    },
    {
      id: "8",
      title: "GPS Tracking for Catering Deliveries: Why It Matters",
      excerpt: "Discover how real-time delivery tracking improves customer satisfaction, reduces complaints, and increases repeat business.",
      category: "Technology",
      readTime: "6 min read",
      date: "2024-12-28",
      slug: "gps-tracking-benefits"
    },
    {
      id: "9",
      title: "Scaling Your Catering Business Without Hiring More Admin Staff",
      excerpt: "Learn how automation allows you to handle 5x more events with the same team. Real examples from successful catering companies.",
      category: "Growth",
      readTime: "10 min read",
      date: "2024-12-25",
      slug: "scale-without-more-staff"
    },
    {
      id: "10",
      title: "The True Cost of Manual Processes in Catering Operations",
      excerpt: "Calculate hidden costs of Excel spreadsheets, WhatsApp coordination, and manual tracking. See ROI of switching to proper systems.",
      category: "Cost Management",
      readTime: "9 min read",
      date: "2024-12-22",
      slug: "cost-of-manual-processes"
    },
    {
      id: "11",
      title: "Client Communication Best Practices for Catering Businesses",
      excerpt: "Master professional communication from first inquiry to post-event follow-up. Templates and timing strategies included.",
      category: "Client Relations",
      readTime: "8 min read",
      date: "2024-12-20",
      slug: "client-communication-guide"
    },
    {
      id: "12",
      title: "Seasonal Catering: Managing Peak Periods Without Burnout",
      excerpt: "Prepare for busy seasons with smart scheduling, staff management, and workflow optimization. Maintain quality during high-volume periods.",
      category: "Operations",
      readTime: "11 min read",
      date: "2024-12-18",
      slug: "manage-peak-seasons"
    },
    {
      id: "13",
      title: "Pricing Strategy for Catering Services: Complete Guide",
      excerpt: "Set profitable prices that win clients. Learn about cost calculation, competitor analysis, and value-based pricing.",
      category: "Pricing",
      readTime: "13 min read",
      date: "2024-12-15",
      slug: "catering-pricing-strategy"
    },
    {
      id: "14",
      title: "Managing Multiple Events Simultaneously: Systems That Work",
      excerpt: "Coordinate multiple events happening on the same day. Calendar management, team coordination, and equipment allocation strategies.",
      category: "Operations",
      readTime: "10 min read",
      date: "2024-12-12",
      slug: "manage-multiple-events"
    },
    {
      id: "15",
      title: "Inventory Management for Catering: Reduce Waste, Increase Profit",
      excerpt: "Implement proper inventory systems to track ingredients, reduce spoilage, and optimize purchasing. Real cost savings examples.",
      category: "Inventory",
      readTime: "9 min read",
      date: "2024-12-10",
      slug: "inventory-management-guide"
    },
    {
      id: "16",
      title: "Building a Reliable Catering Team: Hiring and Training Guide",
      excerpt: "Recruit, train, and retain quality staff. Create systems that allow your business to run without constant owner supervision.",
      category: "Team Management",
      readTime: "12 min read",
      date: "2024-12-08",
      slug: "build-reliable-team"
    },
    {
      id: "17",
      title: "Customer Reviews and Complaints: Turning Negatives Into Positives",
      excerpt: "Handle complaints professionally and turn unhappy clients into loyal advocates. Systematic approach to issue resolution.",
      category: "Client Relations",
      readTime: "7 min read",
      date: "2024-12-05",
      slug: "handle-reviews-complaints"
    },
    {
      id: "18",
      title: "Financial Management for Catering Businesses: Cash Flow Basics",
      excerpt: "Master cash flow management, understand your numbers, and make data-driven business decisions. Avoid common financial pitfalls.",
      category: "Finance",
      readTime: "11 min read",
      date: "2024-12-03",
      slug: "financial-management-basics"
    },
    {
      id: "19",
      title: "Marketing Your Catering Business on a Limited Budget",
      excerpt: "Cost-effective marketing strategies that work. Social media, referrals, partnerships, and local SEO tactics for catering companies.",
      category: "Marketing",
      readTime: "10 min read",
      date: "2024-12-01",
      slug: "budget-marketing-strategies"
    },
    {
      id: "20",
      title: "Technology Stack for Modern Catering Businesses in 2025",
      excerpt: "Essential software and tools every catering business needs. From order management to accounting, build your complete tech stack.",
      category: "Technology",
      readTime: "14 min read",
      date: "2024-11-28",
      slug: "essential-catering-technology"
    }
  ];

  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "CaterOS Catering Business Blog",
    "description": "Expert insights on automation, profitability, and growth for South African catering businesses",
    "url": "https://cateros.co.za/blog",
    "publisher": {
      "@type": "Organization",
      "name": "CaterOS",
      "url": "https://cateros.co.za"
    }
  };

  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "itemListElement": blogPosts.slice(0, 10).map((post, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "url": `https://cateros.co.za/blog/${post.slug}`,
      "name": post.title,
      "description": post.excerpt
    }))
  };

  const categories = ["All", "Cost Management", "Automation", "Profitability", "Operations", "Sales", "Technology", "Growth"];

  return (
    <>
      <Head>
        <title>Catering Business Insights - CateringMS Blog</title>
        <meta name="description" content="Expert insights on automation, profitability, and growth for South African catering businesses. Learn strategies to reduce costs, increase margins, and scale operations." />
        <meta name="keywords" content="catering business tips, catering automation, increase catering profits, catering operations, catering business growth" />
        <link rel="canonical" href="https://cateros.co.za/blog" />
        
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
        />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <Link href="/">
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>

          <div className="mb-12">
            <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent mb-4">
              Catering Business Blog
            </h1>
            <p className="text-xl text-slate-600 max-w-3xl">
              Expert insights on automation, profitability, and growth for South African catering businesses
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {blogPosts.map((post) => (
                    <Link href={`/blog/${post.slug}`} key={post.id}>
                      <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
                        <CardHeader>
                          <Badge variant="secondary" className="w-fit mb-2">
                            {post.category}
                          </Badge>
                          <CardTitle className="text-xl hover:text-orange-600 transition-colors">
                            {post.title}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-gray-600 mb-4">{post.excerpt}</p>
                          <div className="flex items-center justify-between text-sm text-gray-500">
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              {new Date(post.date).toLocaleDateString("en-ZA")}
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4" />
                              {post.readTime}
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
                    <Badge className="bg-purple-100 text-purple-700">12 posts</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">Automation</span>
                    <Badge className="bg-blue-100 text-blue-700">8 posts</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">Profitability</span>
                    <Badge className="bg-green-100 text-green-700">10 posts</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">Operations</span>
                    <Badge className="bg-orange-100 text-orange-700">15 posts</Badge>
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
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm hover:text-purple-600 cursor-pointer">
                      How to Reduce Costs by 40%
                    </h4>
                    <p className="text-xs text-slate-600">2.4k reads</p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm hover:text-purple-600 cursor-pointer">
                      Automation Complete Guide
                    </h4>
                    <p className="text-xs text-slate-600">1.8k reads</p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm hover:text-purple-600 cursor-pointer">
                      Increasing Profit Margins
                    </h4>
                    <p className="text-xs text-slate-600">1.5k reads</p>
                  </div>
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
