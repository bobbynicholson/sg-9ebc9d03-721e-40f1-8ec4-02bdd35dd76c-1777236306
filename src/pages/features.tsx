import Link from "next/link";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  FileText, 
  Calendar,
  DollarSign,
  ChefHat,
  Package,
  Truck,
  TrendingUp,
  Mail,
  Zap,
  ArrowRight,
  BarChart3,
  Globe,
  MapPin,
  Bell,
  Star,
  Shield,
  CheckCircle,
  Sparkles,
  ShoppingCart,
  Clock,
  AlertCircle,
  RefreshCw,
  Target,
  Repeat,
  CreditCard,
  Settings
} from "lucide-react";
import { Footer } from "@/components/Footer";
import Head from "next/head";

export default function FeaturesPage() {
  const [flippedCard, setFlippedCard] = useState<number | null>(null);

  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "CaterOS - Catering Management Platform",
    "description": "15 integrated systems for complete catering business management including lead management, GPS tracking, inventory control, kitchen management, and automated email follow-ups",
    "brand": {
      "@type": "Brand",
      "name": "CaterOS"
    },
    "offers": {
      "@type": "AggregateOffer",
      "lowPrice": "899",
      "highPrice": "4999",
      "priceCurrency": "ZAR",
      "availability": "https://schema.org/InStock"
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.9",
      "reviewCount": "127"
    },
    "features": [
      "Lead Management & Quote Generation",
      "Order Processing & Calendar Management",
      "Inventory & Equipment Tracking with Expiry Alerts",
      "Multi-Region Franchise Support",
      "GPS Tracking for Real-Time Delivery",
      "Driver Earnings & Payment System",
      "Kitchen Production Management",
      "Shopping & Receipt Scanning",
      "Cleaning Schedule Management",
      "Client Portal with Complaint System",
      "Email Automation",
      "Payment Gateway Integration",
      "Multi-Currency Support",
      "Blog & CMS System",
      "Role-Based Access Control"
    ]
  };

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "CaterOS",
    "url": "https://cateros.co.za",
    "contactPoint": {
      "@type": "ContactPoint",
      "telephone": "+27-83-652-5755",
      "contactType": "customer support"
    }
  };

  const coreFeatures = [
    {
      icon: Users,
      title: "Lead Management & Quote Generation",
      shortDesc: "Capture, track, and convert leads automatically",
      fullDesc: "Automated lead capture from your website or manual entry. Generate professional quotes instantly with dynamic pricing. Track every lead through the sales pipeline with automated follow-ups.",
      benefits: [
        "Capture leads from any source",
        "Generate quotes in under 60 seconds",
        "Automated follow-up sequences",
        "Track conversion rates in real-time"
      ],
      gradient: "from-blue-500 to-cyan-500",
      impact: "2-2.5x higher conversion (industry data)",
      link: "/features/lead-management"
    },
    {
      icon: FileText,
      title: "Order Processing & Calendar",
      shortDesc: "Visual calendar with real-time availability",
      fullDesc: "Dynamic calendar shows availability, bookings, and conflicts instantly. Process orders with one click. Automatically blocks dates on confirmation. See your entire operation at a glance.",
      benefits: [
        "Visual booking calendar",
        "Automatic date blocking",
        "Conflict detection and alerts",
        "Multi-region view"
      ],
      gradient: "from-purple-500 to-pink-500",
      impact: "Zero double-bookings",
      link: null
    },
    {
      icon: Package,
      title: "Inventory & Equipment Tracking",
      shortDesc: "Track every item with expiry alerts",
      fullDesc: "Complete inventory management for food and equipment. Automatic expiry date tracking with alerts. Know what's available, what's cleaning, and what needs ordering before you run out.",
      benefits: [
        "Real-time stock levels",
        "Expiry date alerts",
        "Equipment availability tracking",
        "Cleaning schedule integration"
      ],
      gradient: "from-green-500 to-emerald-500",
      impact: "45-50% reduction in waste",
      link: "/features/inventory-management"
    },
    {
      icon: Globe,
      title: "Multi-Region Franchise Support",
      shortDesc: "Scale across South Africa with one click",
      fullDesc: "Launch new kitchens and regional operations instantly. Head office manages sales, each region operates independently. Consolidated dashboard for company-wide visibility.",
      benefits: [
        "One-click region setup",
        "Centralized sales management",
        "Regional operational autonomy",
        "Company-wide reporting"
      ],
      gradient: "from-indigo-500 to-purple-500",
      impact: "Unlimited scalability",
      link: null
    },
    {
      icon: MapPin,
      title: "GPS Tracking for Real-Time Delivery",
      shortDesc: "Live location tracking for clients and admin",
      fullDesc: "Drivers share real-time GPS location. Clients track their delivery on a live map. Admin monitors all active deliveries from one dashboard. Automatic notifications at each stage.",
      benefits: [
        "Live driver location tracking",
        "Client-facing tracking portal",
        "Automatic status notifications",
        "Estimated arrival times"
      ],
      gradient: "from-red-500 to-orange-500",
      impact: "65-70% fewer tracking calls",
      link: "/features/gps-tracking"
    },
    {
      icon: DollarSign,
      title: "Driver Earnings & Payment System",
      shortDesc: "Automatic time and distance tracking",
      fullDesc: "Track driver hours and kilometers automatically. Calculate earnings in real-time. Drivers see what they're owed instantly. Admin processes payments with one click.",
      benefits: [
        "GPS-based time tracking",
        "Automatic distance calculation",
        "Real-time earnings visibility",
        "One-click payment processing"
      ],
      gradient: "from-yellow-500 to-amber-500",
      impact: "100% payment transparency",
      link: null
    },
    {
      icon: ChefHat,
      title: "Kitchen Production Management",
      shortDesc: "Smart prep lists and order coordination",
      fullDesc: "Kitchen teams see exactly what to prepare and when. Ingredients automatically pulled from inventory. Production schedules optimize workflow. Shopping lists generated automatically.",
      benefits: [
        "Automated prep schedules",
        "Ingredient tracking",
        "Production workflow optimization",
        "Waste reduction analytics"
      ],
      gradient: "from-pink-500 to-rose-500",
      impact: "30-35% faster prep times",
      link: "/features/kitchen-management"
    },
    {
      icon: ShoppingCart,
      title: "Shopping & Receipt Scanning",
      shortDesc: "Scan receipts, auto-update inventory",
      fullDesc: "Scan receipts with your phone camera. AI reads items and prices automatically. Inventory updates in real-time. Track supplier pricing and find cheaper alternatives.",
      benefits: [
        "OCR receipt scanning",
        "Automatic inventory updates",
        "Supplier price comparison",
        "Cost optimization recommendations"
      ],
      gradient: "from-cyan-500 to-blue-500",
      impact: "10-12% cost savings potential",
      link: null
    },
    {
      icon: Sparkles,
      title: "Cleaning Schedule Management",
      shortDesc: "Track cleaning times and equipment availability",
      fullDesc: "Set cleaning times for equipment after events. System calculates availability automatically. Cleaning team sees their schedule. Admin tracks completion status.",
      benefits: [
        "Automated availability calculations",
        "Cleaning team portal",
        "Status tracking",
        "Equipment reservation system"
      ],
      gradient: "from-teal-500 to-cyan-500",
      impact: "Zero equipment conflicts",
      link: null
    },
    {
      icon: Shield,
      title: "Client Portal with Complaint System",
      shortDesc: "Self-service portal for clients",
      fullDesc: "Clients track orders, view invoices, make payments, and submit feedback. Built-in complaint management with automatic escalation. Complete order history at their fingertips.",
      benefits: [
        "Order tracking and history",
        "Invoice management",
        "Secure payment processing",
        "Feedback and complaint system"
      ],
      gradient: "from-violet-500 to-purple-500",
      impact: "75-80% reduction in admin calls",
      link: null
    },
    {
      icon: Mail,
      title: "Email Automation",
      shortDesc: "Quote follow-ups and after-sales nurturing",
      fullDesc: "Automated email sequences for quote follow-ups (day 2, 5, 10). Post-event reviews. 12-month after-sales nurture campaign. Admin customizes all templates.",
      benefits: [
        "Automated quote follow-ups",
        "Post-event review requests",
        "12-month nurture campaign",
        "Fully customizable templates"
      ],
      gradient: "from-orange-500 to-red-500",
      impact: "2-2.5x repeat booking rate",
      link: "/features/email-automation"
    },
    {
      icon: CreditCard,
      title: "Payment Gateway Integration",
      shortDesc: "PayFast, Stripe, and more",
      fullDesc: "Integrated payment processing for South African and international payments. Automatic payment reconciliation. Support for cards, EFT, and instant payments.",
      benefits: [
        "PayFast integration (SA)",
        "Stripe (International)",
        "Automatic reconciliation",
        "Multiple payment methods"
      ],
      gradient: "from-emerald-500 to-green-500",
      impact: "Instant payment processing",
      link: null
    },
    {
      icon: Globe,
      title: "Multi-Currency Support",
      shortDesc: "Accept payments in any currency",
      fullDesc: "Clients choose their preferred currency at signup. All pricing automatically converts. Perfect for expanding internationally while keeping local operations smooth.",
      benefits: [
        "Currency selection at signup",
        "Automatic conversion",
        "Local payment methods",
        "International expansion ready"
      ],
      gradient: "from-blue-500 to-indigo-500",
      impact: "Global reach, local feel",
      link: null
    },
    {
      icon: FileText,
      title: "Blog & CMS System",
      shortDesc: "Manage content and drive SEO traffic",
      fullDesc: "Built-in blog with 20 SEO-optimized posts ready to go. Full CMS for pages and posts. Drive organic traffic and establish thought leadership in catering.",
      benefits: [
        "20 pre-written SEO posts",
        "Full content management",
        "Page builder",
        "SEO optimization tools"
      ],
      gradient: "from-pink-500 to-purple-500",
      impact: "Organic lead generation",
      link: null
    },
    {
      icon: Settings,
      title: "Role-Based Access Control",
      shortDesc: "Secure permissions for every team member",
      fullDesc: "Assign roles and permissions precisely. Admin, kitchen, drivers, cleaning, shopping, clients all have appropriate access levels. Secure, audited, and compliant.",
      benefits: [
        "Granular permission control",
        "Role-based dashboards",
        "Audit trail",
        "Security compliance"
      ],
      gradient: "from-slate-500 to-gray-600",
      impact: "Enterprise-grade security",
      link: null
    }
  ];

  const additionalFeatures = [
    {
      icon: BarChart3,
      title: "Analytics & Reporting",
      description: "Real-time dashboards showing revenue, bookings, inventory levels, and profitability by event type."
    },
    {
      icon: Bell,
      title: "Smart Notifications",
      description: "Automated alerts for low stock, upcoming events, driver arrivals, payment confirmations, and more."
    },
    {
      icon: Clock,
      title: "Time Optimization",
      description: "Smart scheduling that optimizes kitchen prep times, delivery routes, and equipment usage."
    },
    {
      icon: Target,
      title: "Profit Optimization",
      description: "Track cost per event, identify profitable menu items, and optimize pricing strategies."
    },
    {
      icon: Repeat,
      title: "Recurring Events",
      description: "Set up weekly or monthly recurring bookings for corporate clients with automatic invoicing."
    },
    {
      icon: Star,
      title: "Review Management",
      description: "Automated review requests, testimonial collection, and reputation management tools."
    }
  ];

  return (
    <>
      <Head>
        <title>Features - CaterOS Catering Management Platform</title>
        <meta name="description" content="Explore 15 integrated systems working together to automate operations, connect your team, and maximize profitability. Complete feature overview of CaterOS catering management platform." />
        <meta name="keywords" content="catering software features, GPS tracking, inventory management, kitchen management, email automation, payment processing, multi-region support" />
        <link rel="canonical" href="https://cateros.co.za/features" />
        
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
      </Head>

      <div className="min-h-screen bg-white">
        <div className="relative overflow-hidden bg-gradient-to-br from-purple-50 via-white to-pink-50">
          <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.5))] bg-[size:40px_40px]" />
        
          <div className="relative container mx-auto px-4 py-16 md:py-24 max-w-7xl">
            <div className="text-center max-w-4xl mx-auto">
              <Badge className="mb-6 px-4 py-2 bg-purple-100 text-purple-700 border-purple-200 text-sm shadow-sm">
                <Sparkles className="w-4 h-4 mr-2 inline" />
                Complete Platform Overview
              </Badge>
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 bg-clip-text text-transparent leading-tight">
                Every Feature You Need to Run a Profitable Catering Business
              </h1>
              <p className="text-xl md:text-2xl text-slate-700 mb-8 leading-relaxed">
                15 integrated systems working seamlessly together to automate operations, connect your team, and maximize profitability.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
                <Link href="/auth/register">
                  <Button size="lg" className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-8 py-6 text-lg hover:shadow-2xl transition-all hover:scale-105">
                    Start Free Trial
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                <Link href="/pricing">
                  <Button size="lg" variant="outline" className="px-8 py-6 text-lg border-2 border-purple-200 hover:border-purple-400 hover:bg-purple-50">
                    View Pricing
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-16 md:py-24 max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <Badge className="mb-4 px-4 py-2 bg-green-100 text-green-700 border-green-200">
              <CheckCircle className="w-4 h-4 mr-2 inline" />
              All Core Systems Operational
            </Badge>
            <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mb-6">
              Click Each Card to Discover How It Works
            </h2>
            <p className="text-xl text-slate-600 mb-4">
              Hover or tap on any feature to see detailed benefits and real-world impact
            </p>
            <p className="text-base text-slate-500">
              Read more about <Link href="/blog/catering-management-software-benefits" className="text-purple-600 hover:text-purple-700 underline">software benefits</Link> and <Link href="/blog/automate-catering-operations" className="text-purple-600 hover:text-purple-700 underline">automation strategies</Link> on our blog.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
            {coreFeatures.map((feature, index) => (
              <div
                key={index}
                className="relative h-[32rem] cursor-pointer perspective-1000"
                onMouseEnter={() => setFlippedCard(index)}
                onMouseLeave={() => setFlippedCard(null)}
                onClick={() => setFlippedCard(flippedCard === index ? null : index)}
              >
                <div
                  className={`relative w-full h-full transition-transform duration-500 transform-style-3d ${
                    flippedCard === index ? "rotate-y-180" : ""
                  }`}
                  style={{
                    transformStyle: "preserve-3d",
                    transform: flippedCard === index ? "rotateY(180deg)" : "rotateY(0deg)"
                  }}
                >
                  <Card className="absolute w-full h-full border-0 shadow-xl backface-hidden overflow-hidden">
                    <CardContent className="h-full flex flex-col justify-between p-8">
                      <div>
                        <div className={`inline-flex p-4 bg-gradient-to-br ${feature.gradient} rounded-2xl shadow-lg mb-6`}>
                          <feature.icon className="w-8 h-8 text-white" />
                        </div>
                        <h3 className="text-2xl font-bold text-slate-900 mb-3">{feature.title}</h3>
                        <p className="text-slate-600 leading-relaxed">{feature.shortDesc}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <Badge className={`bg-gradient-to-r ${feature.gradient} text-white border-0`}>
                          {feature.impact}
                        </Badge>
                        <ArrowRight className="w-5 h-5 text-slate-400" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card
                    className="absolute w-full h-full border-0 shadow-xl backface-hidden overflow-hidden"
                    style={{
                      transform: "rotateY(180deg)",
                      backfaceVisibility: "hidden"
                    }}
                  >
                    <CardContent className={`h-full flex flex-col justify-between p-8 bg-gradient-to-br ${feature.gradient} text-white overflow-y-auto`}>
                      <div>
                        <h3 className="text-2xl font-bold mb-4">{feature.title}</h3>
                        <p className="mb-6 leading-relaxed opacity-95">{feature.fullDesc}</p>
                        <ul className="space-y-3 mb-4">
                          {feature.benefits.map((benefit, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                              <span className="text-sm leading-relaxed">{benefit}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="space-y-3">
                        <Badge className="bg-white/20 text-white border-white/30 backdrop-blur-sm w-full justify-center">
                          Impact: {feature.impact}
                        </Badge>
                        {feature.link && (
                          <Link href={feature.link}>
                            <Button 
                              className="w-full bg-white/90 hover:bg-white text-slate-900 font-semibold shadow-lg hover:shadow-xl transition-all hover:scale-105"
                              size="lg"
                            >
                              Learn More
                              <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl p-8 md:p-12 border-2 border-purple-100 text-center mb-16">
            <h3 className="text-2xl md:text-4xl font-bold text-slate-900 mb-4">
              Ready to Transform Your Catering Business?
            </h3>
            <p className="text-lg text-slate-600 mb-4 max-w-2xl mx-auto">
              Join forward-thinking catering businesses across South Africa who are automating operations and maximizing profitability.
            </p>
            <p className="text-base text-slate-500 mb-8">
              Explore our <Link href="/pricing" className="text-purple-600 hover:text-purple-700 underline font-medium">pricing plans</Link> or read success stories on our <Link href="/blog" className="text-purple-600 hover:text-purple-700 underline font-medium">blog</Link>.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/auth/register">
                <Button size="lg" className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-10 py-6 text-lg hover:shadow-2xl transition-all hover:scale-105">
                  Start Your Free Trial Now
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link href="/pricing">
                <Button size="lg" variant="outline" className="px-10 py-6 text-lg border-2 border-purple-300 hover:bg-purple-50">
                  See Pricing Plans
                </Button>
              </Link>
            </div>
            <p className="text-sm text-slate-500 mt-6">
              No credit card required • Cancel anytime • Setup in under 3 hours
            </p>
          </div>

          <div className="mb-16">
            <div className="text-center mb-12">
              <Badge className="mb-4 px-4 py-2 bg-blue-100 text-blue-700 border-blue-200">
                <Zap className="w-4 h-4 mr-2 inline" />
                Even More Powerful Features
              </Badge>
              <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mb-4">
                Additional Tools Included
              </h2>
              <p className="text-xl text-slate-600">
                Everything you need, nothing you don't
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {additionalFeatures.map((feature, index) => (
                <Card key={index} className="border-2 border-slate-200 hover:border-purple-300 hover:shadow-xl transition-all group">
                  <CardContent className="pt-6 pb-6">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-gradient-to-br from-purple-100 to-pink-100 rounded-xl group-hover:scale-110 transition-transform">
                        <feature.icon className="w-6 h-6 text-purple-600" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-slate-900 mb-2">{feature.title}</h3>
                        <p className="text-slate-600 text-sm">{feature.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-12 text-center">
            <div className="absolute inset-0 bg-grid-white/5 [mask-image:linear-gradient(0deg,rgba(255,255,255,0.1),rgba(255,255,255,0.05))] bg-[size:40px_40px]" />
            <div className="relative">
              <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
                Everything Works Together Seamlessly
              </h2>
              <p className="text-xl text-slate-300 mb-4 max-w-3xl mx-auto">
                No more juggling 10 different tools. One platform. One login. Everything connected. 
                Your entire operation flows from lead to delivery to follow-up automatically.
              </p>
              <p className="text-base text-purple-200 mb-8">
                Learn about <Link href="/blog/gps-tracking-catering-delivery" className="text-white hover:text-purple-100 underline">GPS tracking benefits</Link> and <Link href="/blog/inventory-management-catering" className="text-white hover:text-purple-100 underline">inventory best practices</Link>.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
                <Link href="/auth/register">
                  <Button size="lg" className="bg-white text-purple-600 hover:bg-purple-50 px-10 py-6 text-lg shadow-2xl hover:scale-105 transition-all">
                    Get Started Free
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                <Link href="/contact">
                  <Button size="lg" variant="outline" className="border-2 border-white text-white hover:bg-white/10 px-10 py-6 text-lg">
                    Schedule a Demo
                  </Button>
                </Link>
              </div>
              <div className="flex flex-wrap justify-center gap-6 text-purple-200 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>15 integrated systems</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Mobile-optimized</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Unlimited users</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>24/7 support</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 py-16 md:py-24">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="text-center mb-12">
              <Badge className="mb-4 px-4 py-2 bg-purple-100 text-purple-700 border-purple-200">
                <TrendingUp className="w-4 h-4 mr-2 inline" />
                Real Results
              </Badge>
              <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mb-6">
                The Impact on Your Business
              </h2>
              <p className="text-base text-slate-600">
                See how our platform helps with <Link href="/blog/improve-catering-profit-margins" className="text-purple-600 hover:text-purple-700 underline">improving margins</Link> and <Link href="/blog/scale-catering-business" className="text-purple-600 hover:text-purple-700 underline">scaling your business</Link>.
              </p>
            </div>

            <div className="grid md:grid-cols-4 gap-6 mb-12">
              {[
                { value: "12+", label: "Hours Saved Weekly", icon: Clock },
                { value: "50-55%", label: "Fewer Admin Calls", icon: Bell },
                { value: "10-16%", label: "Margin Increase", icon: TrendingUp },
                { value: "1.5-2x", label: "Repeat Bookings", icon: RefreshCw }
              ].map((stat, index) => (
                <Card key={index} className="border-0 shadow-lg text-center">
                  <CardContent className="pt-8 pb-8">
                    <div className="flex justify-center mb-4">
                      <div className="p-4 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl">
                        <stat.icon className="w-8 h-8 text-white" />
                      </div>
                    </div>
                    <div className="text-4xl font-bold text-slate-900 mb-2">{stat.value}</div>
                    <div className="text-slate-600">{stat.label}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="border-0 shadow-2xl bg-gradient-to-r from-purple-600 to-pink-600 text-white">
              <CardContent className="py-12 px-8 text-center">
                <h3 className="text-3xl md:text-4xl font-bold mb-6">
                  Stop Wasting Time. Start Growing Today.
                </h3>
                <p className="text-xl text-purple-100 mb-8 max-w-2xl mx-auto">
                  Join the catering revolution. Build a profitable, scalable business that runs smoothly without constant manual intervention.
                </p>
                <Link href="/auth/register">
                  <Button size="lg" className="bg-white text-purple-600 hover:bg-purple-50 px-10 py-6 text-lg shadow-2xl hover:scale-105 transition-all">
                    Start Your Free Trial
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>

        <Footer />
      </div>
    </>
  );
}
