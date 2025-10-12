import Link from "next/link";
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
  Clock,
  CheckCircle,
  AlertCircle,
  ShoppingCart,
  Sparkles,
  Mail,
  Zap,
  ArrowRight,
  BarChart3,
  Globe,
  Smartphone,
  Lock,
  RefreshCw,
  MapPin,
  Bell,
  MousePointer,
  Star,
  Quote,
  Shield,
  Heart,
  Target,
  Lightbulb,
  Percent,
  Activity,
  Award
} from "lucide-react";
import { Footer } from "@/components/Footer";
import Head from "next/head";

export default function HomePage() {
  const problems = [
    {
      icon: DollarSign,
      title: "Razor-Thin Profit Margins",
      description: "Food costs are high, margins are small. Every inefficiency eats into your bottom line, making it nearly impossible to scale profitably.",
      impact: "Average 4-6% margins",
      color: "from-red-500 to-rose-600"
    },
    {
      icon: Clock,
      title: "Manual Admin Overload",
      description: "Hours wasted on spreadsheets, phone calls, and paperwork. Your admin costs are killing your profits and keeping you trapped in the business.",
      impact: "15+ hours weekly on admin",
      color: "from-orange-500 to-amber-600"
    },
    {
      icon: Users,
      title: "Disconnected Teams",
      description: "Kitchen doesn't know what drivers are doing. Clients can't track orders. Everyone calls you for updates. It's chaos.",
      impact: "40+ coordination calls daily",
      color: "from-purple-500 to-indigo-600"
    },
    {
      icon: Package,
      title: "Equipment & Stock Nightmares",
      description: "Missing cutlery, dirty plates, unknown stock levels. You're constantly scrambling and over-ordering just to be safe.",
      impact: "12-16% equipment loss",
      color: "from-blue-500 to-cyan-600"
    },
    {
      icon: AlertCircle,
      title: "Owner-Dependent Operations",
      description: "Can't take a day off. Can't hire someone to run it. The business only works when you're there, limiting growth and burning you out.",
      impact: "Difficult to scale",
      color: "from-pink-500 to-rose-600"
    },
    {
      icon: FileText,
      title: "Lost Leads & Follow-ups",
      description: "Quotes get forgotten, follow-ups missed, repeat customers lost. No system means money slipping through the cracks every day.",
      impact: "25-35% conversion loss",
      color: "from-green-500 to-emerald-600"
    }
  ];

  const solutions = [
    {
      icon: Zap,
      title: "Complete Automation",
      description: "From lead capture to post-event follow-ups, automate every touchpoint. Free your time to focus on growth, not admin.",
      benefit: "Save 12+ hours per week",
      metric: "Up to 70-75% less manual work"
    },
    {
      icon: MapPin,
      title: "Real-Time GPS Tracking",
      description: "Clients see exactly where their food is. Drivers navigate efficiently. You monitor everything from one dashboard.",
      benefit: "Reduce customer calls by 50-55%",
      metric: "Live location updates"
    },
    {
      icon: BarChart3,
      title: "Smart Inventory Management",
      description: "Track every plate, fork, and ingredient. Know what's clean, what's available, and what needs ordering before you run out.",
      benefit: "Cut equipment losses by 40%",
      metric: "Real-time stock levels"
    },
    {
      icon: Activity,
      title: "Profitability Insights",
      description: "See which suppliers are cheaper, which events are profitable, and where costs are creeping up. Make data-driven decisions.",
      benefit: "Potential to increase margins by 10-16%",
      metric: "Smart cost tracking"
    },
    {
      icon: Bell,
      title: "Connected Ecosystem",
      description: "Kitchen, drivers, cleaning, shopping, and clients all on one platform. Everyone knows exactly what to do, when.",
      benefit: "Eliminate up to 60-65% of coordination calls",
      metric: "6 integrated portals"
    },
    {
      icon: RefreshCw,
      title: "Intelligent Follow-Up",
      description: "Automated emails that nurture relationships, request reviews, and bring customers back year after year.",
      benefit: "Estimated 1.5-2x repeat booking rate",
      metric: "12-month nurture campaign"
    }
  ];

  const stats = [
    { value: "12+", label: "Hours Saved Weekly", icon: Clock, color: "from-blue-500 to-cyan-500" },
    { value: "50-55%", label: "Fewer Admin Calls", icon: Bell, color: "from-purple-500 to-pink-500" },
    { value: "10-16%", label: "Margin Increase", icon: TrendingUp, color: "from-green-500 to-emerald-500" },
    { value: "1.5-2x", label: "Repeat Bookings", icon: RefreshCw, color: "from-orange-500 to-amber-500" }
  ];

  const testimonials = [
    {
      quote: "We went from barely breaking even to 18% profit margins. The automation alone saved us enough to hire two full-time staff members.",
      author: "Sarah Johnson",
      role: "Owner, Cape Town Catering Co.",
      rating: 5
    },
    {
      quote: "Finally, I can take a vacation. The system runs everything. My team knows exactly what to do without calling me every hour.",
      author: "Michael Peters",
      role: "Director, Durban Events & Catering",
      rating: 5
    },
    {
      quote: "The GPS tracking feature alone improved our customer satisfaction significantly. Clients love seeing their food on the way in real-time.",
      author: "Linda Ndlovu",
      role: "Founder, Johannesburg Function Foods",
      rating: 5
    }
  ];

  const faqs = [
    {
      question: "How long does it take to set up?",
      answer: "Most businesses are fully operational within 2-3 hours. We provide guided onboarding, video tutorials, and dedicated support to get you started quickly."
    },
    {
      question: "Do I need technical skills to use this?",
      answer: "Not at all. The platform is designed for caterers, not tech experts. If you can use WhatsApp, you can use our system. We've made everything intuitive and simple."
    },
    {
      question: "What if my team isn't tech-savvy?",
      answer: "Our mobile apps are incredibly simple. Drivers tap a button to start jobs, kitchen staff see clear prep lists, clients track orders visually. Everyone picks it up in minutes."
    },
    {
      question: "Can I scale to multiple locations?",
      answer: "Absolutely. Our multi-region feature lets you launch new kitchens, teams, and operations across South Africa with one-click setup. Head office manages sales, regions handle fulfillment."
    },
    {
      question: "What payment methods do you support?",
      answer: "We integrate with PayFast, Stripe, Paystack, and Flutterwave. Accept card payments, EFTs, and instant payments. All reconciled automatically."
    },
    {
      question: "Is my data secure?",
      answer: "Bank-level encryption, daily backups, 99.9% uptime. Your business data is protected, secure, and always accessible when you need it."
    },
    {
      question: "Can I try it before committing?",
      answer: "Yes! Start with a free trial. No credit card required. Test everything, invite your team, run a real event. Only pay if you love it."
    },
    {
      question: "What kind of support do you provide?",
      answer: "Email support, video tutorials, detailed documentation, and a growing community of South African caterers. We're invested in your success."
    }
  ];

  const trustIndicators = [
    { icon: Shield, text: "Bank-Level Security" },
    { icon: Globe, text: "Built for South Africa" },
    { icon: Award, text: "99.9% Uptime" },
    { icon: Heart, text: "Founded by Caterers" }
  ];

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "CaterOS",
    "legalName": "CaterOS (A product of Skylight Digital)",
    "url": "https://cateros.co.za",
    "logo": "https://cateros.co.za/logo.png",
    "description": "The ultimate catering management solution for profitable, scalable catering businesses in South Africa",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "17 Swalle Street",
      "addressLocality": "Golden Acre",
      "addressCountry": "ZA"
    },
    "contactPoint": {
      "@type": "ContactPoint",
      "telephone": "+27-83-652-5755",
      "contactType": "customer support",
      "areaServed": "ZA",
      "availableLanguage": ["English", "Afrikaans"]
    },
    "sameAs": [
      "https://www.facebook.com/cateros",
      "https://www.linkedin.com/company/cateros"
    ]
  };

  const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": "https://cateros.co.za",
    "name": "CaterOS",
    "image": "https://cateros.co.za/logo.png",
    "telephone": "+27-83-652-5755",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "17 Swalle Street",
      "addressLocality": "Golden Acre",
      "addressCountry": "ZA"
    },
    "geo": {
      "@type": "GeoCoordinates",
      "latitude": "-33.9249",
      "longitude": "18.4241"
    },
    "url": "https://cateros.co.za",
    "priceRange": "R899-R4999",
    "openingHoursSpecification": {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      "opens": "08:00",
      "closes": "17:00"
    }
  };

  const softwareSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "CaterOS",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web, iOS, Android",
    "offers": {
      "@type": "Offer",
      "price": "899",
      "priceCurrency": "ZAR",
      "priceValidUntil": "2025-12-31"
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.9",
      "ratingCount": "127"
    },
    "description": "Complete catering management platform with lead management, GPS tracking, inventory control, and automated email follow-ups"
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(faq => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer
      }
    }))
  };

  return (
    <>
      <Head>
        <title>CaterOS - Ultimate Catering Management Solution for South Africa</title>
        <meta name="description" content="Stop losing money to manual chaos. CaterOS is the complete operating system for profitable, scalable catering businesses. Automate operations, track deliveries with GPS, and increase margins by 15-25%." />
        <meta name="keywords" content="catering management software, catering business software south africa, catering automation, GPS delivery tracking, inventory management, catering profitability" />
        <meta property="og:title" content="CaterOS - Ultimate Catering Management Solution" />
        <meta property="og:description" content="The complete operating system for profitable, scalable catering businesses in South Africa" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://cateros.co.za" />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="canonical" href="https://cateros.co.za" />
        
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      </Head>

      <div className="min-h-screen bg-white">
        <div className="relative overflow-hidden bg-gradient-to-br from-purple-50 via-white to-pink-50">
          <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.5))] bg-[size:40px_40px]" />
        
          <div className="relative container mx-auto px-4 py-16 md:py-24 max-w-7xl">
            <div className="text-center max-w-4xl mx-auto mb-12">
              <Badge className="mb-6 px-4 py-2 bg-purple-100 text-purple-700 border-purple-200 text-sm shadow-sm">
                <Lightbulb className="w-4 h-4 mr-2 inline" />
                Built by caterers, for caterers
              </Badge>
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 bg-clip-text text-transparent leading-tight">
                Stop Losing Money to Manual Chaos
              </h1>
              <div className="mb-6">
                <Badge className="px-6 py-3 bg-gradient-to-r from-amber-400 to-orange-500 text-white text-base font-bold shadow-lg">
                  <Sparkles className="w-5 h-5 mr-2 inline" />
                  The Ultimate Catering Management Solution
                </Badge>
              </div>
              <p className="text-xl md:text-2xl text-slate-700 mb-4 leading-relaxed font-medium">
                The complete operating system for profitable, scalable catering businesses
              </p>
              <p className="text-lg text-slate-600 mb-8 max-w-3xl mx-auto">
                  Connect your entire team, automate operations, track everything in real-time, and finally build a business that runs without you being there 24/7.
                </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-8">
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
              <p className="text-sm text-slate-500">
                No credit card required • Cancel anytime • Setup in under 3 hours
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-6 mb-12">
              {trustIndicators.map((indicator, index) => (
                <div key={index} className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-md border border-slate-200">
                  <indicator.icon className="w-4 h-4 text-purple-600" />
                  <span className="text-sm font-medium text-slate-700">{indicator.text}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-5xl mx-auto">
              {stats.map((stat, index) => (
                <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-all">
                  <CardContent className="pt-6 pb-6 text-center">
                    <div className="flex justify-center mb-3">
                      <div className={`p-3 bg-gradient-to-br ${stat.color} rounded-2xl shadow-lg`}>
                        <stat.icon className="w-6 h-6 text-white" />
                      </div>
                    </div>
                    <div className="text-3xl md:text-4xl font-bold text-slate-900 mb-1">{stat.value}</div>
                    <div className="text-sm text-slate-600">{stat.label}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-16 md:py-24 max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <Badge className="mb-4 px-4 py-2 bg-red-100 text-red-700 border-red-200">
              <AlertCircle className="w-4 h-4 mr-2 inline" />
              The Reality Check
            </Badge>
            <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mb-6">
              Every Catering Business Faces These Same Problems
            </h2>
            <p className="text-xl text-slate-600 mb-4">
              We know because we lived them. Here's what's actually killing your profitability.
            </p>
            <p className="text-base text-slate-500">
              Learn more about <Link href="/blog/improve-catering-profit-margins" className="text-purple-600 hover:text-purple-700 underline">improving profit margins</Link> and <Link href="/blog/reduce-admin-costs-catering" className="text-purple-600 hover:text-purple-700 underline">reducing admin costs</Link> in our blog.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
            {problems.map((problem, index) => (
              <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 group overflow-hidden">
                <CardContent className="pt-8 pb-8">
                  <div className={`inline-flex p-4 bg-gradient-to-br ${problem.color} rounded-2xl shadow-lg mb-6 group-hover:scale-110 transition-transform`}>
                    <problem.icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-3">{problem.title}</h3>
                  <p className="text-slate-600 leading-relaxed mb-3">{problem.description}</p>
                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-red-600">
                    <TrendingUp className="w-4 h-4" />
                    {problem.impact}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-center bg-slate-50 rounded-3xl p-8 md:p-12 border-2 border-slate-200">
            <h3 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4">
              Sound familiar?
            </h3>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-6">
              You're working harder than ever, events are booked solid, but at the end of the month, 
              there's barely anything left. The manual work is crushing you, and scaling feels impossible.
            </p>
            <p className="text-xl font-semibold text-purple-600 mb-4">
              It doesn't have to be this way.
            </p>
            <Link href="/features" className="inline-flex items-center gap-2 text-purple-600 hover:text-purple-700 font-medium">
              See how our features solve these problems
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        <div className="relative py-16 md:py-24 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-pink-900" />
          <div className="absolute inset-0 bg-grid-white/5 [mask-image:linear-gradient(0deg,rgba(255,255,255,0.1),rgba(255,255,255,0.05))] bg-[size:40px_40px]" />
        
          <div className="relative container mx-auto px-4 max-w-6xl">
            <div className="text-center mb-12">
              <Badge className="mb-6 px-4 py-2 bg-purple-500/20 text-purple-300 border-purple-400/30 text-sm">
                <Heart className="w-4 h-4 mr-2 inline" />
                The Story Behind This Platform
              </Badge>
              <h2 className="text-3xl md:text-5xl font-bold text-white mb-8">
                Born from Real Pain, Built for Real Results
              </h2>
            </div>
            
            <Card className="border-0 bg-white/10 backdrop-blur-lg shadow-2xl">
              <CardContent className="p-8 md:p-12">
                <div className="space-y-6 text-lg text-slate-200 leading-relaxed">
                  <p>
                    I ran <span className="text-white font-semibold">Spit Braai Delivery</span> in South Africa. 
                    We were busy, really busy. Functions every weekend, quotes flying in, drivers on the road, 
                    kitchen teams prepping around the clock.
                  </p>
                  <p>
                    But here's the brutal truth: <span className="text-white font-semibold text-xl">we were barely profitable</span>. 
                    The cost of food kept climbing. Admin consumed every spare hour. Equipment went missing. 
                    Drivers needed constant coordination. Clients called asking "Where's my food?"
                  </p>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-6 my-6">
                    <p className="text-white font-semibold text-xl mb-2">
                      The turning point:
                    </p>
                    <p>
                      After losing money on what should have been a R15,000 profit event because of coordination 
                      failures and missing equipment, I realized the technology we desperately needed simply didn't exist.
                    </p>
                  </div>
                  <p>
                    Every other industry has modern software. Restaurants have Toast and Square. 
                    Delivery has Uber and DoorDash. <span className="text-white font-semibold">But catering? 
                    We're stuck with Excel spreadsheets and hope</span>.
                  </p>
                  <p>
                    The business only worked when I was there managing every detail. 
                    <span className="text-white font-semibold"> I couldn't hire someone to run it because there was no system</span>. 
                    Just phone calls, spreadsheets, and constant firefighting.
                  </p>
                  <div className="pt-6 border-t border-white/20">
                    <p className="text-xl md:text-2xl font-bold text-white mb-4">
                      So I built the tool I desperately needed.
                    </p>
                    <p className="text-lg">
                      The complete operating system that connects everyone, automates everything, 
                      and finally makes catering businesses actually <span className="text-purple-300 font-semibold">profitable</span> and <span className="text-pink-300 font-semibold">scalable</span>.
                    </p>
                  </div>
                </div>
                <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
                  <Link href="/auth/register">
                    <Button size="lg" className="bg-white text-purple-900 hover:bg-purple-50 px-8 py-6 text-lg shadow-xl">
                      Join the Movement
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </Button>
                  </Link>
                  <Link href="/blog">
                    <Button size="lg" variant="outline" className="border-2 border-white text-white hover:bg-white/10 px-8 py-6 text-lg">
                      Read Success Stories
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="container mx-auto px-4 py-16 md:py-24 max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <Badge className="mb-4 px-4 py-2 bg-green-100 text-green-700 border-green-200">
              <CheckCircle className="w-4 h-4 mr-2 inline" />
              The Solution
            </Badge>
            <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mb-6">
              How We Solve Every Single Problem
            </h2>
            <p className="text-xl text-slate-600 mb-4">
              A complete platform that transforms chaos into profit
            </p>
            <p className="text-base text-slate-500">
              Read about <Link href="/blog/automate-catering-operations" className="text-purple-600 hover:text-purple-700 underline">automating your catering operations</Link> and <Link href="/blog/catering-management-software-benefits" className="text-purple-600 hover:text-purple-700 underline">software benefits</Link>.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
            {solutions.map((solution, index) => (
              <Card key={index} className="border-2 border-purple-100 shadow-lg hover:shadow-xl hover:border-purple-300 transition-all duration-300 group overflow-hidden">
                <CardContent className="pt-8 pb-8">
                  <div className="inline-flex p-4 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl shadow-lg mb-6 group-hover:scale-110 transition-transform">
                    <solution.icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-3">{solution.title}</h3>
                  <p className="text-slate-600 mb-4 leading-relaxed">{solution.description}</p>
                  <div className="space-y-2">
                    <Badge className="bg-green-100 text-green-700 border-green-200 px-3 py-1 w-full justify-start">
                      <CheckCircle className="w-4 h-4 mr-2" />
                      {solution.benefit}
                    </Badge>
                    <Badge className="bg-blue-100 text-blue-700 border-blue-200 px-3 py-1 w-full justify-start">
                      <BarChart3 className="w-4 h-4 mr-2" />
                      {solution.metric}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl p-8 md:p-12 border-2 border-purple-100">
            <div className="text-center max-w-3xl mx-auto">
              <h3 className="text-2xl md:text-4xl font-bold text-slate-900 mb-4">
                Everything works together seamlessly
              </h3>
              <p className="text-lg text-slate-600 mb-4">
                No more juggling 10 different tools. One platform. One login. Everything connected.
              </p>
              <p className="text-base text-slate-500 mb-8">
                Explore our complete <Link href="/features" className="text-purple-600 hover:text-purple-700 underline font-medium">feature overview</Link> to see how it all works together.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { icon: Users, label: "Lead Management" },
                  { icon: FileText, label: "Smart Quoting" },
                  { icon: Calendar, label: "Dynamic Calendar" },
                  { icon: DollarSign, label: "Payment Processing" },
                  { icon: ChefHat, label: "Kitchen Orders" },
                  { icon: Package, label: "Stock Control" },
                  { icon: Sparkles, label: "Equipment Tracking" },
                  { icon: Truck, label: "Driver Portal" },
                  { icon: Shield, label: "Client Portal" },
                  { icon: Mail, label: "Email Automation" },
                  { icon: ShoppingCart, label: "Shopping Lists" },
                  { icon: TrendingUp, label: "Analytics" }
                ].map((feature, index) => (
                  <div key={index} className="bg-white rounded-xl p-4 shadow-md hover:shadow-lg transition-all group text-center">
                    <div className="inline-flex p-3 bg-gradient-to-br from-purple-100 to-pink-100 rounded-xl mb-3 group-hover:scale-110 transition-transform">
                      <feature.icon className="w-5 h-5 text-purple-600" />
                    </div>
                    <p className="text-sm font-semibold text-slate-900">{feature.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 py-16 md:py-24">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="text-center mb-16">
              <Badge className="mb-4 px-4 py-2 bg-yellow-100 text-yellow-700 border-yellow-200">
                <Star className="w-4 h-4 mr-2 inline" />
                What Caterers Are Saying
              </Badge>
              <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mb-4">
                Real Results from Real Businesses
              </h2>
              <p className="text-xl text-slate-600">
                South African catering businesses using our platform
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {testimonials.map((testimonial, index) => (
                <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-all">
                  <CardContent className="pt-8 pb-8">
                    <div className="flex gap-1 mb-4">
                      {[...Array(testimonial.rating)].map((_, i) => (
                        <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                      ))}
                    </div>
                    <Quote className="w-10 h-10 text-purple-200 mb-4" />
                    <p className="text-slate-700 mb-6 leading-relaxed italic">
                      "{testimonial.quote}"
                    </p>
                    <div className="border-t border-slate-200 pt-4">
                      <p className="font-semibold text-slate-900">{testimonial.author}</p>
                      <p className="text-sm text-slate-600">{testimonial.role}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>

        <div className="relative py-16 md:py-24 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900" />
          <div className="absolute inset-0 bg-grid-white/5 [mask-image:linear-gradient(0deg,rgba(255,255,255,0.1),rgba(255,255,255,0.05))] bg-[size:40px_40px]" />
        
          <div className="relative container mx-auto px-4 max-w-6xl">
            <div className="text-center mb-12">
              <Badge className="mb-6 px-4 py-2 bg-purple-500/20 text-purple-200 border-purple-400/30 text-sm">
                <Globe className="w-4 h-4 mr-2 inline" />
                Scale Across South Africa
              </Badge>
              <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
                Ready to Franchise or Expand?
              </h2>
              <p className="text-xl text-slate-300 max-w-3xl mx-auto mb-4">
                Launch new kitchens and regional operations with one-click setup. Perfect for multi-location businesses.
              </p>
              <p className="text-base text-purple-200">
                Learn more about <Link href="/blog/manage-multiple-catering-locations" className="text-white hover:text-purple-100 underline">managing multiple locations</Link> and <Link href="/blog/scale-catering-business" className="text-white hover:text-purple-100 underline">scaling your business</Link>.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {[
                {
                  icon: Target,
                  title: "Centralized Sales, Distributed Operations",
                  description: "Head office handles all quotes and bookings. Each region operates independently with their own teams and inventory."
                },
                {
                  icon: MousePointer,
                  title: "One-Click Regional Setup",
                  description: "Launch a new region in minutes. Complete admin portal, staff management, and operations ready to go."
                },
                {
                  icon: BarChart3,
                  title: "Consolidated Dashboard",
                  description: "View all regions from one place. Track orders, revenue, staff performance, and inventory company-wide."
                },
                {
                  icon: Zap,
                  title: "Intelligent Order Assignment",
                  description: "Head office assigns orders based on location and capacity. Each region sees only their work."
                }
              ].map((feature, index) => (
                <Card key={index} className="border-0 bg-white/10 backdrop-blur-sm hover:bg-white/15 transition-all">
                  <CardContent className="pt-8 pb-8">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl shrink-0">
                        <feature.icon className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h3 className="text-xl font-bold text-white mb-2">{feature.title}</h3>
                        <p className="text-slate-300">{feature.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-16 md:py-24 max-w-4xl">
          <div className="text-center mb-16">
            <Badge className="mb-4 px-4 py-2 bg-blue-100 text-blue-700 border-blue-200">
              <Lightbulb className="w-4 h-4 mr-2 inline" />
              Common Questions
            </Badge>
            <h2 className="text-3xl md:text-5xl font-bold text-slate-900 mb-4">
              Everything You Need to Know
            </h2>
            <p className="text-base text-slate-600">
              More questions? Check out our <Link href="/blog" className="text-purple-600 hover:text-purple-700 underline">blog for detailed guides</Link> or <Link href="/features" className="text-purple-600 hover:text-purple-700 underline">explore all features</Link>.
            </p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <Card key={index} className="border-2 border-slate-200 hover:border-purple-300 transition-all">
                <CardContent className="pt-6 pb-6">
                  <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-purple-600 shrink-0 mt-0.5" />
                    {faq.question}
                  </h3>
                  <p className="text-slate-600 pl-8">{faq.answer}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-center mt-12">
            <p className="text-lg text-slate-600 mb-6">
              Still have questions? We're here to help.
            </p>
            <Link href="/contact">
              <Button size="lg" variant="outline" className="border-2 border-purple-300 hover:bg-purple-50">
                Contact Support
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-50 to-purple-50 py-16 md:py-24">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="grid md:grid-cols-3 gap-8">
              <Card className="border-0 shadow-xl bg-gradient-to-br from-blue-500 to-cyan-500 text-white hover:scale-105 transition-transform">
                <CardContent className="pt-8 pb-8 text-center">
                  <Smartphone className="w-12 h-12 mx-auto mb-4" />
                  <h3 className="text-2xl font-bold mb-3">Mobile-First</h3>
                  <p className="text-blue-100 mb-4">
                    Drivers, kitchen, and clients use their phones. Beautiful, intuitive interfaces anyone can master.
                  </p>
                  <Link href="/features" className="text-white hover:text-blue-50 underline text-sm">
                    Learn about mobile features →
                  </Link>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-xl bg-gradient-to-br from-green-500 to-emerald-500 text-white hover:scale-105 transition-transform">
                <CardContent className="pt-8 pb-8 text-center">
                  <Lock className="w-12 h-12 mx-auto mb-4" />
                  <h3 className="text-2xl font-bold mb-3">Secure & Reliable</h3>
                  <p className="text-green-100 mb-4">
                    Bank-level security. Daily backups. 99.9% uptime. Your data is protected.
                  </p>
                  <Link href="/privacy" className="text-white hover:text-green-50 underline text-sm">
                    Read our privacy policy →
                  </Link>
                </CardContent>
              </Card>

              <Card className="border-0 shadow-xl bg-gradient-to-br from-purple-500 to-pink-500 text-white hover:scale-105 transition-transform">
                <CardContent className="pt-8 pb-8 text-center">
                  <MapPin className="w-12 h-12 mx-auto mb-4" />
                  <h3 className="text-2xl font-bold mb-3">Built for SA</h3>
                  <p className="text-purple-100 mb-4">
                    Rand pricing, local payments, South African business practices. Finally, software for us.
                  </p>
                  <Link href="/pricing" className="text-white hover:text-purple-50 underline text-sm">
                    View pricing plans →
                  </Link>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <Card className="border-0 shadow-2xl bg-gradient-to-r from-purple-600 to-pink-600 text-white overflow-hidden mx-4 my-16">
          <CardContent className="py-16 px-8">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="text-3xl md:text-5xl font-bold mb-6">
                Stop Losing Money. Start Growing Today.
              </h2>
              <p className="text-xl text-purple-100 mb-8 leading-relaxed max-w-3xl mx-auto">
                Join forward-thinking catering businesses across South Africa who are finally running 
                profitable, scalable operations without being trapped in their business.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
                <Link href="/auth/register">
                  <Button size="lg" className="bg-white text-purple-600 hover:bg-purple-50 px-10 py-6 text-lg shadow-2xl hover:scale-105 transition-all">
                    Start Your Free Trial
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                <Link href="/pricing">
                  <Button size="lg" variant="outline" className="border-2 border-white text-white hover:bg-white/10 px-10 py-6 text-lg">
                    View Pricing Plans
                  </Button>
                </Link>
              </div>
              <div className="flex flex-wrap justify-center gap-6 text-purple-200 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>No credit card required</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Cancel anytime</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Setup in under 3 hours</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  <span>Dedicated support included</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Footer />
      </div>
    </>
  );
}
