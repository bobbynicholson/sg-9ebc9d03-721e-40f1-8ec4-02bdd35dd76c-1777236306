import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Users, FileText, Calendar, DollarSign, ChefHat, Package, TrendingUp, Mail, Zap, ArrowRight, BarChart3, Globe, MapPin, Bell, Star, Shield, CheckCircle, Sparkles, ShoppingCart, Clock, RefreshCw, Target, Repeat, CreditCard, Settings } from "lucide-react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { btnPress } from "@/components/motion/marketing";
import Head from "next/head";

export default function FeaturesPage() {
  const [flippedCard, setFlippedCard] = useState<number | null>(null);

  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": "CateringMS - Catering Management Platform",
    "description": "15 integrated systems for complete catering business management including lead management, GPS tracking, inventory control, kitchen management, and automated email follow-ups",
    "brand": {
      "@type": "Brand",
      "name": "CateringMS"
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
      "Role-Based Access Control"
    ]
  };

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "CateringMS",
    "url": "https://cateringms.com",
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
      gradient: "from-blue-500 to-brand-secondary",
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
      gradient: "from-slate-500 to-rose-500",
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
      gradient: "from-brand-primary to-brand-secondary",
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
      gradient: "from-blue-500 to-slate-500",
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
      gradient: "from-rose-500 to-orange-500",
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
      gradient: "from-rose-500 to-rose-500",
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
      gradient: "from-brand-primary to-blue-500",
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
      gradient: "from-brand-primary to-brand-secondary",
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
      gradient: "from-slate-500 to-slate-500",
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
      gradient: "from-orange-500 to-rose-500",
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
      gradient: "from-brand-primary to-brand-secondary",
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
      gradient: "from-blue-500 to-blue-500",
      impact: "Global reach, local feel",
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
        <title>Features - CateringMS Catering Management Platform</title>
        <meta name="description" content="Explore 15 integrated systems working together to automate operations, connect your team, and maximize profitability. Complete feature overview of CateringMS catering management platform." />
        <meta name="keywords" content="catering software features, GPS tracking, inventory management, kitchen management, email automation, payment processing, multi-region support" />
        <link rel="canonical" href="https://cateringms.com/features" />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
      </Head>

      <Header />

      <div className="font-body min-h-screen bg-stone-50 text-stone-900">
        {/* ===================== HERO ===================== */}
        <section className="relative overflow-hidden border-b border-stone-200 bg-stone-50">
          {/* Single soft brand wash, masked so it fades into the page. */}
          <div className="pointer-events-none absolute inset-x-0 -top-32 h-[480px] bg-[radial-gradient(55%_55%_at_50%_0%,rgba(180,83,9,0.10),transparent)]" />

          <div className="relative mx-auto max-w-7xl px-4 py-20 md:py-28">
            <Stagger className="mx-auto max-w-3xl text-center" gap={0.07}>
              <StaggerItem>
                <h1 className="text-balance font-display text-4xl font-semibold leading-[1.06] tracking-tight text-stone-900 sm:text-5xl lg:text-[3.75rem]">
                  Every feature you need to run a{" "}
                  <span className="text-amber-700">profitable catering business</span>
                </h1>
              </StaggerItem>

              <StaggerItem>
                <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-stone-600 sm:text-xl">
                  15 integrated systems working seamlessly together to automate operations, connect your team, and maximize profitability.
                </p>
              </StaggerItem>

              <StaggerItem className="mx-auto mt-9 flex max-w-md flex-col items-stretch justify-center gap-3 sm:max-w-none sm:flex-row sm:items-center">
                <Link href="/company-signup" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    className={`h-12 w-full rounded-full bg-gradient-to-b from-amber-500 to-amber-600 px-8 text-base font-semibold text-white shadow-lg shadow-amber-700/25 hover:from-amber-500 hover:to-amber-700 hover:shadow-xl hover:shadow-amber-700/30 sm:w-auto ${btnPress}`}
                  >
                    Start Free Trial
                    <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Button>
                </Link>
                <Link href="/pricing" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    variant="outline"
                    className={`h-12 w-full rounded-full border-stone-300 bg-white px-8 text-base font-semibold text-stone-700 hover:border-stone-400 hover:bg-stone-100 sm:w-auto ${btnPress}`}
                  >
                    View Pricing
                  </Button>
                </Link>
              </StaggerItem>
            </Stagger>
          </div>
        </section>

        {/* ===================== CORE FEATURES ===================== */}
        <section className="mx-auto max-w-7xl px-4 py-20 md:py-28">
          <Reveal className="mx-auto mb-14 max-w-3xl text-center">
            <h2 className="text-balance font-display text-3xl font-semibold tracking-tight text-stone-900 md:text-5xl">
              Click each card to discover how it works
            </h2>
            <p className="mt-4 text-balance text-lg text-stone-600">
              Hover or tap on any feature to see detailed benefits and real-world impact
            </p>
            <p className="mt-3 text-base text-stone-600">
              Read more about <Link href="/blog/catering-management-software-benefits" className="font-medium text-amber-700 underline-offset-2 hover:underline">software benefits</Link> and <Link href="/blog/automate-catering-operations" className="font-medium text-amber-700 underline-offset-2 hover:underline">automation strategies</Link> on our blog.
            </p>
          </Reveal>

          <Stagger className="mb-20 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {coreFeatures.map((feature, index) => (
              <StaggerItem key={index}>
                <div
                  className="relative h-[32rem] cursor-pointer perspective-1000"
                  onMouseEnter={() => setFlippedCard(index)}
                  onMouseLeave={() => setFlippedCard(null)}
                  onClick={() => setFlippedCard(flippedCard === index ? null : index)}
                >
                  <div
                    className="relative h-full w-full transform-style-3d"
                    style={{
                      transformStyle: "preserve-3d",
                      transition: "transform 0.5s cubic-bezier(0.23,1,0.32,1)",
                      transform: flippedCard === index ? "rotateY(180deg)" : "rotateY(0deg)"
                    }}
                  >
                    {/* Front */}
                    <div
                      className="absolute flex h-full w-full flex-col justify-between rounded-2xl border border-stone-200 bg-white p-8 shadow-sm backface-hidden"
                      style={{ backfaceVisibility: "hidden" }}
                    >
                      <div>
                        <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl bg-amber-50 ring-1 ring-amber-100">
                          <feature.icon className="h-7 w-7 text-amber-700" />
                        </div>
                        <h3 className="mb-3 font-display text-2xl font-semibold tracking-tight text-stone-900">{feature.title}</h3>
                        <p className="leading-relaxed text-stone-600">{feature.shortDesc}</p>
                      </div>
                      <div className="flex items-center justify-between border-t border-stone-100 pt-5">
                        <span className="text-sm font-semibold text-amber-700">
                          {feature.impact}
                        </span>
                        <ArrowRight className="h-5 w-5 text-stone-400" />
                      </div>
                    </div>

                    {/* Back */}
                    <div
                      className="absolute flex h-full w-full flex-col justify-between overflow-y-auto rounded-2xl bg-stone-900 p-8 text-white backface-hidden"
                      style={{
                        transform: "rotateY(180deg)",
                        backfaceVisibility: "hidden"
                      }}
                    >
                      <div>
                        <h3 className="mb-4 font-display text-2xl font-semibold tracking-tight text-white">{feature.title}</h3>
                        <p className="mb-6 leading-relaxed text-stone-300">{feature.fullDesc}</p>
                        <ul className="mb-4 space-y-3">
                          {feature.benefits.map((benefit, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                              <span className="text-sm leading-relaxed text-stone-200">{benefit}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="space-y-3">
                        <span className="flex w-full items-center justify-center rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-sm font-medium text-amber-200">
                          Impact: {feature.impact}
                        </span>
                        {feature.link && (
                          <Link href={feature.link}>
                            <Button
                              className={`w-full bg-amber-500 font-semibold text-white shadow-lg hover:bg-amber-600 hover:shadow-xl ${btnPress}`}
                              size="lg"
                            >
                              Learn More
                              <ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>

          {/* Mid-Page CTA */}
          <Reveal className="rounded-3xl border border-amber-100 bg-amber-50 p-8 text-center md:p-12">
            <h3 className="font-display text-2xl font-semibold tracking-tight text-stone-900 md:text-4xl">
              Ready to transform your catering business?
            </h3>
            <p className="mx-auto mt-4 max-w-2xl text-base text-stone-600 sm:text-lg">
              Join forward-thinking catering businesses across South Africa who are automating operations and maximizing profitability.
            </p>
            <p className="mt-3 text-sm text-stone-600 sm:text-base">
              Explore our <Link href="/pricing" className="font-medium text-amber-700 underline-offset-2 hover:underline">pricing plans</Link> or read success stories on our <Link href="/blog" className="font-medium text-amber-700 underline-offset-2 hover:underline">blog</Link>.
            </p>

            <div className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
              <Link href="/company-signup" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className={`h-12 w-full rounded-full bg-gradient-to-b from-amber-500 to-amber-600 px-9 text-base font-semibold text-white shadow-lg shadow-amber-700/25 hover:from-amber-500 hover:to-amber-700 hover:shadow-xl hover:shadow-amber-700/30 sm:w-auto ${btnPress}`}
                >
                  Start Your Free Trial Now
                  <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
                </Button>
              </Link>
              <Link href="/pricing" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  variant="outline"
                  className={`h-12 w-full rounded-full border-stone-300 bg-white px-9 text-base font-semibold text-stone-700 hover:border-stone-400 hover:bg-stone-100 sm:w-auto ${btnPress}`}
                >
                  See Pricing Plans
                </Button>
              </Link>
            </div>
            <p className="mt-6 text-xs text-stone-500 sm:text-sm">
              No credit card required · Cancel anytime · Setup in under 3 hours
            </p>
          </Reveal>
        </section>

        {/* ===================== ADDITIONAL FEATURES ===================== */}
        <section className="bg-white py-20 md:py-28">
          <div className="mx-auto max-w-7xl px-4">
            <Reveal className="mb-14 text-center">
              <h2 className="text-balance font-display text-3xl font-semibold tracking-tight text-stone-900 md:text-5xl">
                Additional tools included
              </h2>
              <p className="mt-4 text-lg text-stone-600">
                Everything you need, nothing you don't
              </p>
            </Reveal>

            <Stagger className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {additionalFeatures.map((feature, index) => (
                <StaggerItem key={index}>
                  <div className="flex items-start gap-4">
                    <feature.icon className="mt-1 h-7 w-7 shrink-0 text-amber-700" />
                    <div>
                      <h3 className="mb-2 text-lg font-semibold text-stone-900">{feature.title}</h3>
                      <p className="text-sm leading-relaxed text-stone-600">{feature.description}</p>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* ===================== SEAMLESS / CONNECTED (dark) ===================== */}
        <section className="relative overflow-hidden bg-stone-950 py-20 md:py-28">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_50%_at_50%_0%,rgba(180,83,9,0.16),transparent)]" />
          <div className="relative mx-auto max-w-6xl px-4">
            <Reveal className="mx-auto max-w-3xl text-center">
              <h2 className="text-balance font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl md:text-5xl">
                Everything works together seamlessly
              </h2>
              <p className="mx-auto mt-4 max-w-3xl text-balance text-base leading-relaxed text-stone-300 sm:text-xl">
                No more juggling 10 different tools. One platform. One login. Everything connected.
                Your entire operation flows from lead to delivery to follow-up automatically.
              </p>
              <p className="mt-3 text-sm text-stone-400 sm:text-base">
                Learn about <Link href="/blog/gps-tracking-catering-delivery" className="font-medium text-amber-300 underline-offset-2 hover:underline">GPS tracking benefits</Link> and <Link href="/blog/inventory-management-catering" className="font-medium text-amber-300 underline-offset-2 hover:underline">inventory best practices</Link>.
              </p>

              <div className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
                <Link href="/company-signup" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    className={`h-12 w-full rounded-full bg-amber-500 px-8 text-base font-semibold text-white shadow-xl hover:bg-amber-600 sm:w-auto ${btnPress}`}
                  >
                    Get Started Free
                    <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Button>
                </Link>
                <Link href="/contact" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    variant="outline"
                    className={`h-12 w-full rounded-full border-white/60 bg-transparent px-8 text-base font-semibold text-white hover:border-white hover:bg-white/10 sm:w-auto ${btnPress}`}
                  >
                    Schedule a Demo
                  </Button>
                </Link>
              </div>
            </Reveal>

            <Stagger className="mt-10 flex flex-wrap justify-center gap-3" gap={0.05}>
              {[
                "15 integrated systems",
                "Mobile-optimized",
                "Unlimited users",
                "24/7 support"
              ].map((item) => (
                <StaggerItem key={item}>
                  <div className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 py-2 text-sm text-stone-200">
                    <CheckCircle className="h-4 w-4 shrink-0 text-amber-400" />
                    <span>{item}</span>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* ===================== IMPACT / STATS ===================== */}
        <section className="bg-stone-100 py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-4">
            <Reveal className="mx-auto mb-12 max-w-3xl text-center">
              <h2 className="text-balance font-display text-3xl font-semibold tracking-tight text-stone-900 md:text-5xl">
                The impact on your business
              </h2>
              <p className="mt-4 text-base text-stone-600">
                See how our platform helps with <Link href="/blog/improve-catering-profit-margins" className="font-medium text-amber-700 underline-offset-2 hover:underline">improving margins</Link> and <Link href="/blog/scale-catering-business" className="font-medium text-amber-700 underline-offset-2 hover:underline">scaling your business</Link>.
              </p>
            </Reveal>

            <Stagger className="mx-auto mb-12 grid max-w-4xl grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-4" gap={0.06}>
              {[
                { value: "12+", label: "Hours Saved Weekly", icon: Clock },
                { value: "50-55%", label: "Fewer Admin Calls", icon: Bell },
                { value: "10-16%", label: "Margin Increase", icon: TrendingUp },
                { value: "1.5-2x", label: "Repeat Bookings", icon: RefreshCw }
              ].map((stat, index) => (
                <StaggerItem key={index}>
                  <div className="flex flex-col items-center text-center">
                    <stat.icon className="mb-3 h-6 w-6 text-amber-600" />
                    <div className="font-display text-4xl font-semibold tracking-tight text-stone-900 md:text-5xl">{stat.value}</div>
                    <div className="mt-1 text-sm text-stone-600">{stat.label}</div>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>

            <Reveal className="relative mx-auto overflow-hidden rounded-3xl bg-stone-900 px-6 py-12 text-center shadow-2xl shadow-stone-900/20 sm:px-8 md:py-16">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_70%_at_50%_0%,rgba(180,83,9,0.22),transparent)]" />
              <div className="relative mx-auto max-w-3xl">
                <h3 className="text-balance font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl md:text-4xl">
                  Stop wasting time. Start growing today.
                </h3>
                <p className="mx-auto mt-6 max-w-2xl text-balance text-base leading-relaxed text-stone-300 sm:text-xl">
                  Join the catering revolution. Build a profitable, scalable business that runs smoothly without constant manual intervention.
                </p>

                <div className="mt-8">
                  <Link href="/company-signup" className="inline-block w-full sm:w-auto">
                    <Button
                      size="lg"
                      className={`h-12 w-full rounded-full bg-amber-500 px-9 text-base font-semibold text-white shadow-xl hover:bg-amber-600 sm:w-auto ${btnPress}`}
                    >
                      Start Your Free Trial
                      <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </Button>
                  </Link>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
}
