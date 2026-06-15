import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, FileText, Calendar, DollarSign, ChefHat, Package, Truck, TrendingUp, Clock, CheckCircle, AlertCircle, ShoppingCart, Sparkles, Mail, Zap, ArrowRight, BarChart3, Globe, Smartphone, Lock, RefreshCw, MapPin, Bell, MousePointer, Star, Quote, Shield, Heart, Target, Lightbulb, Activity, Award, Workflow } from "lucide-react";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { EASE, cardBase, btnPress, iconChip, Eyebrow } from "@/components/motion/marketing";
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

  // The real catering lifecycle, in caterers' own language -- quote, deposit,
  // BEO, hire-in, guest counts, rebooking. This is the workflow the platform
  // runs end to end; it doubles as the "how it works" story for buyers.
  const workflow = [
    {
      icon: FileText,
      step: "Enquiry & Quote",
      description:
        "Capture every lead and build itemised, menu-based quotes in minutes. Send a branded quote your client can review and accept online.",
    },
    {
      icon: Calendar,
      step: "Confirm & Deposit",
      description:
        "Clients accept through a secure magic-link portal and pay a deposit via PayFast. The function locks into your calendar automatically.",
    },
    {
      icon: ChefHat,
      step: "Plan & Prep",
      description:
        "Auto-generate the BEO, kitchen prep lists, shopping lists and allergen sheets — with own stock and hire-in equipment reconciled for the date.",
    },
    {
      icon: Truck,
      step: "Deliver & Serve",
      description:
        "Drivers get optimised routes and live GPS tracking. Clients watch their order arrive while equipment is checked out and signed back in.",
    },
    {
      icon: RefreshCw,
      step: "Invoice & Rebook",
      description:
        "Settle the balance with final guest-count adjustments, then trigger automated thank-yous and rebooking nurture for the next season.",
    },
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
    "name": "CateringMS",
    "legalName": "CateringMS (A product of Skylight Digital)",
    "url": "https://cateringms.com",
    "logo": "https://cateringms.com/logo.png",
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
      "https://www.facebook.com/cateringms",
      "https://www.linkedin.com/company/cateringms"
    ]
  };

  const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": "https://cateringms.com",
    "name": "CateringMS",
    "image": "https://cateringms.com/logo.png",
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
    "url": "https://cateringms.com",
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
    "name": "CateringMS",
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
        <title>CateringMS - The Ultimate Catering Management Solution for South Africa</title>
        <meta
          name="description"
          content="Transform your South African catering business with CateringMS. Streamline operations, boost profits, and delight clients with our all-in-one management platform."
        />
        <meta name="keywords" content="catering software South Africa, catering management system, SA catering business, event catering management" />

        {/* Hreflang tags for international SEO */}
        <link rel="alternate" hrefLang="en-ZA" href="https://cateringms.com" />
        <link rel="alternate" hrefLang="en-US" href="https://cateringms.com/us" />
        <link rel="alternate" hrefLang="en-GB" href="https://cateringms.com/uk" />
        <link rel="alternate" hrefLang="x-default" href="https://cateringms.com" />

        {/* Open Graph */}
        <meta property="og:title" content="CateringMS - South African Catering Management Software" />
        <meta property="og:description" content="The ultimate catering management platform for South African caterers" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://cateringms.com" />

        {/* JSON-LD Schema */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "CateringMS",
              "applicationCategory": "BusinessApplication",
              "aggregateRating": {
                "@type": "AggregateRating",
                "ratingValue": "4.8",
                "ratingCount": "127"
              },
              "offers": {
                "@type": "Offer",
                "price": "399",
                "priceCurrency": "ZAR"
              },
              "operatingSystem": "Web",
              "description": "Complete catering management software for South African businesses"
            })
          }}
        />
      </Head>

      <Header />

      <div className="min-h-screen bg-white text-slate-900">
        {/* ===================== HERO ===================== */}
        <section className="relative overflow-hidden border-b border-slate-100 bg-white">
          {/* Soft brand glow + faint grid, masked so it fades into the page. */}
          <div className="pointer-events-none absolute inset-x-0 -top-40 h-[560px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(124,58,237,0.12),transparent)]" />
          <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.04)_1px,transparent_1px)] [background-size:46px_46px] [mask-image:radial-gradient(70%_55%_at_50%_0%,black,transparent)]" />

          <div className="relative mx-auto max-w-7xl px-4 py-20 md:py-28">
            <Stagger className="mx-auto mb-14 max-w-3xl text-center" gap={0.07}>
              <StaggerItem className="mb-6 flex justify-center">
                <Eyebrow icon={Lightbulb} className="border-violet-200 bg-violet-50 text-violet-700">
                  Built by caterers, for caterers
                </Eyebrow>
              </StaggerItem>

              <StaggerItem>
                <h1 className="text-balance text-5xl font-bold tracking-tight text-slate-900 sm:text-6xl lg:text-7xl">
                  Stop losing money to{" "}
                  <span className="bg-gradient-to-r from-violet-600 via-fuchsia-600 to-rose-500 bg-clip-text text-transparent">
                    manual chaos
                  </span>
                </h1>
              </StaggerItem>

              <StaggerItem>
                <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-slate-600 sm:text-xl">
                  The complete operating system for profitable, scalable catering
                  businesses. From the first enquiry to the final invoice — quotes,
                  deposits, kitchen prep, deliveries and follow-ups — all connected
                  and automated, so the business finally runs without you there 24/7.
                </p>
              </StaggerItem>

              <StaggerItem className="mx-auto mt-8 flex max-w-md flex-col items-stretch justify-center gap-3 sm:max-w-none sm:flex-row sm:items-center">
                <Link href="/company-signup" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    className={`h-12 w-full rounded-full bg-gradient-to-b from-violet-600 to-violet-700 px-8 text-base font-semibold text-white shadow-lg shadow-violet-600/20 hover:from-violet-600 hover:to-violet-800 hover:shadow-xl hover:shadow-violet-600/30 sm:w-auto ${btnPress}`}
                  >
                    Start Free Trial
                    <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Button>
                </Link>
                <Link href="/pricing" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    variant="outline"
                    className={`h-12 w-full rounded-full border-slate-300 bg-white px-8 text-base font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50 sm:w-auto ${btnPress}`}
                  >
                    View Pricing
                  </Button>
                </Link>
              </StaggerItem>

              <StaggerItem>
                <p className="mt-5 text-sm text-slate-500">
                  No credit card required · Cancel anytime · Setup in under 3 hours
                </p>
              </StaggerItem>
            </Stagger>

            {/* Trust row */}
            <Stagger className="mb-14 flex flex-wrap justify-center gap-3" gap={0.05}>
              {trustIndicators.map((indicator, index) => (
                <StaggerItem key={index}>
                  <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 shadow-sm">
                    <indicator.icon className="h-4 w-4 text-violet-600" />
                    <span className="text-sm font-medium text-slate-700">{indicator.text}</span>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>

            {/* Stats */}
            <Stagger className="mx-auto grid max-w-5xl grid-cols-2 gap-4 md:grid-cols-4" gap={0.06}>
              {stats.map((stat, index) => (
                <StaggerItem key={index}>
                  <div className={`${cardBase} flex flex-col items-center p-6 text-center`}>
                    <div className={`${iconChip} mb-3 h-12 w-12 bg-gradient-to-br ${stat.color}`}>
                      <stat.icon className="h-6 w-6 text-white" />
                    </div>
                    <div className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">{stat.value}</div>
                    <div className="mt-1 text-sm text-slate-600">{stat.label}</div>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* ===================== PROBLEMS ===================== */}
        <section className="mx-auto max-w-7xl px-4 py-20 md:py-28">
          <Reveal className="mx-auto mb-16 max-w-3xl text-center">
            <Eyebrow icon={AlertCircle} className="border-red-200 bg-red-50 text-red-600">
              The reality check
            </Eyebrow>
            <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight text-slate-900 md:text-5xl">
              Every catering business faces these same problems
            </h2>
            <p className="mt-4 text-balance text-lg text-slate-600">
              We know because we lived them. Here's what's actually killing your profitability.
            </p>
          </Reveal>

          <Stagger className="mb-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {problems.map((problem, index) => (
              <StaggerItem key={index}>
                <div className={`${cardBase} p-7`}>
                  <div className={`${iconChip} mb-6 h-14 w-14 bg-gradient-to-br ${problem.color}`}>
                    <problem.icon className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="mb-2.5 text-xl font-semibold text-slate-900">{problem.title}</h3>
                  <p className="mb-4 leading-relaxed text-slate-600">{problem.description}</p>
                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-red-600">
                    <TrendingUp className="h-4 w-4" />
                    {problem.impact}
                  </div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>

          <Reveal className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center md:p-12">
            <h3 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Sound familiar?</h3>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
              You're working harder than ever, events are booked solid, but at the end of the month,
              there's barely anything left. The manual work is crushing you, and scaling feels impossible.
            </p>
            <p className="mt-4 text-xl font-semibold text-violet-600">It doesn't have to be this way.</p>
            <Link
              href="/features"
              className={`group mt-5 inline-flex items-center gap-2 font-medium text-violet-600 transition-colors duration-150 hover:text-violet-700`}
            >
              See how our features solve these problems
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </Reveal>
        </section>

        {/* ===================== STORY (dark) ===================== */}
        <section className="relative overflow-hidden bg-slate-950 py-20 md:py-28">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_50%_at_50%_0%,rgba(124,58,237,0.18),transparent)]" />
          <div className="relative mx-auto max-w-5xl px-4">
            <Reveal className="mb-12 text-center">
              <Eyebrow icon={Heart} className="border-violet-400/20 bg-violet-500/10 text-violet-300">
                The story behind this platform
              </Eyebrow>
              <h2 className="mt-6 text-balance text-3xl font-bold tracking-tight text-white md:text-5xl">
                Born from real pain, built for real results
              </h2>
            </Reveal>

            <Reveal delay={0.05}>
              <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl backdrop-blur-md md:p-12">
                <div className="space-y-6 text-lg leading-relaxed text-slate-300">
                  <p>
                    I ran <span className="font-semibold text-white">Spit Braai Delivery</span> in South Africa.
                    We were busy, really busy. Functions every weekend, quotes flying in, drivers on the road,
                    kitchen teams prepping around the clock.
                  </p>
                  <p>
                    But here's the brutal truth: <span className="text-xl font-semibold text-white">we were barely profitable</span>.
                    The cost of food kept climbing. Admin consumed every spare hour. Equipment went missing.
                    Drivers needed constant coordination. Clients called asking "Where's my food?"
                  </p>
                  <div className="my-6 rounded-xl border border-white/10 bg-white/[0.04] p-6">
                    <p className="mb-2 text-xl font-semibold text-white">The turning point:</p>
                    <p>
                      After losing money on what should have been a R15,000 profit event because of coordination
                      failures and missing equipment, I realized the technology we desperately needed simply didn't exist.
                    </p>
                  </div>
                  <p>
                    Every other industry has modern software. Restaurants have Toast and Square.
                    Delivery has Uber and DoorDash. <span className="font-semibold text-white">But catering?
                    We're stuck with Excel spreadsheets and hope</span>.
                  </p>
                  <p>
                    The business only worked when I was there managing every detail.
                    <span className="font-semibold text-white"> I couldn't hire someone to run it because there was no system</span>.
                    Just phone calls, spreadsheets, and constant firefighting.
                  </p>
                  <div className="border-t border-white/15 pt-6">
                    <p className="mb-4 text-xl font-bold text-white md:text-2xl">
                      So I built the tool I desperately needed.
                    </p>
                    <p className="text-lg">
                      The complete operating system that connects everyone, automates everything,
                      and finally makes catering businesses actually <span className="font-semibold text-violet-300">profitable</span> and <span className="font-semibold text-fuchsia-300">scalable</span>.
                    </p>
                  </div>
                </div>
                <div className="mt-10">
                  <Link href="/company-signup" className="block sm:inline-block">
                    <Button
                      size="lg"
                      className={`h-12 w-full rounded-full bg-white px-8 text-base font-semibold text-slate-900 shadow-xl hover:bg-slate-100 sm:w-auto ${btnPress}`}
                    >
                      Join the Movement
                      <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </Button>
                  </Link>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ===================== SOLUTIONS ===================== */}
        <section className="mx-auto max-w-7xl px-4 py-20 md:py-28">
          <Reveal className="mx-auto mb-16 max-w-3xl text-center">
            <Eyebrow icon={CheckCircle} className="border-emerald-200 bg-emerald-50 text-emerald-600">
              The solution
            </Eyebrow>
            <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight text-slate-900 md:text-5xl">
              How we solve every single problem
            </h2>
            <p className="mt-4 text-lg text-slate-600">A complete platform that transforms chaos into profit.</p>
          </Reveal>

          <Stagger className="mb-16 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {solutions.map((solution, index) => (
              <StaggerItem key={index}>
                <div className={`${cardBase} flex h-full flex-col p-7`}>
                  <div className={`${iconChip} mb-6 h-14 w-14 bg-gradient-to-br from-violet-500 to-fuchsia-500`}>
                    <solution.icon className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="mb-2.5 text-xl font-semibold text-slate-900">{solution.title}</h3>
                  <p className="mb-5 flex-1 leading-relaxed text-slate-600">{solution.description}</p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                      <CheckCircle className="h-4 w-4 shrink-0" />
                      {solution.benefit}
                    </div>
                    <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700">
                      <BarChart3 className="h-4 w-4 shrink-0" />
                      {solution.metric}
                    </div>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>

          <Reveal className="rounded-3xl border border-violet-100 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-8 md:p-12">
            <div className="mx-auto max-w-3xl text-center">
              <h3 className="text-2xl font-bold tracking-tight text-slate-900 md:text-4xl">
                Everything works together seamlessly
              </h3>
              <p className="mt-4 text-lg text-slate-600">
                No more juggling 10 different tools. One platform. One login. Everything connected.
              </p>
              <p className="mt-3 text-base text-slate-500">
                Explore our complete{" "}
                <Link href="/features" className="font-medium text-violet-600 underline-offset-2 hover:underline">feature overview</Link>{" "}
                to see how it all works together.
              </p>
            </div>
            <Stagger className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3" gap={0.04}>
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
                <StaggerItem key={index}>
                  <div className={`group flex flex-col items-center rounded-xl border border-white bg-white p-4 text-center shadow-sm transition-[transform,box-shadow] duration-300 ${EASE} hover:-translate-y-0.5 hover:shadow-md`}>
                    <div className={`${iconChip} mb-3 h-11 w-11 bg-gradient-to-br from-violet-100 to-fuchsia-100`}>
                      <feature.icon className="h-5 w-5 text-violet-600" />
                    </div>
                    <p className="text-sm font-semibold text-slate-900">{feature.label}</p>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </Reveal>
        </section>

        {/* ===================== HOW IT WORKS / LIFECYCLE ===================== */}
        <section className="border-y border-slate-100 bg-white py-20 md:py-28">
          <div className="mx-auto max-w-7xl px-4">
            <Reveal className="mx-auto mb-16 max-w-3xl text-center">
              <Eyebrow icon={Workflow} className="border-violet-200 bg-violet-50 text-violet-700">
                How CateringMS works
              </Eyebrow>
              <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight text-slate-900 md:text-5xl">
                From first enquiry to repeat booking — one connected workflow
              </h2>
              <p className="mt-4 text-balance text-lg text-slate-600">
                Every function follows the same path. CateringMS runs each stage for you,
                so nothing slips between the quote and the invoice.
              </p>
            </Reveal>

            <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5" gap={0.06}>
              {workflow.map((stage, index) => (
                <StaggerItem key={index}>
                  <div className={`${cardBase} flex h-full flex-col p-6`}>
                    <div className="mb-5 flex items-center justify-between">
                      <div className={`${iconChip} h-12 w-12 bg-gradient-to-br from-violet-500 to-fuchsia-500`}>
                        <stage.icon className="h-6 w-6 text-white" />
                      </div>
                      <span className="text-2xl font-bold tabular-nums text-slate-200">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <h3 className="mb-2 text-lg font-semibold text-slate-900">{stage.step}</h3>
                    <p className="text-sm leading-relaxed text-slate-600">{stage.description}</p>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>

            <Reveal className="mt-10 text-center">
              <Link
                href="/features"
                className="group inline-flex items-center gap-2 font-medium text-violet-600 transition-colors duration-150 hover:text-violet-700"
              >
                See every stage in detail
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </Reveal>
          </div>
        </section>

        {/* ===================== TESTIMONIALS ===================== */}
        <section className="bg-slate-50 py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-4">
            <Reveal className="mb-16 text-center">
              <Eyebrow icon={Star} className="border-amber-200 bg-amber-50 text-amber-600">
                What caterers are saying
              </Eyebrow>
              <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight text-slate-900 md:text-5xl">
                Real results from real businesses
              </h2>
              <p className="mt-4 text-lg text-slate-600">South African catering businesses using our platform.</p>
            </Reveal>

            <Stagger className="grid gap-6 md:grid-cols-3">
              {testimonials.map((testimonial, index) => (
                <StaggerItem key={index}>
                  <div className={`${cardBase} flex h-full flex-col p-7`}>
                    <div className="mb-4 flex gap-1">
                      {[...Array(testimonial.rating)].map((_, i) => (
                        <Star key={i} className="h-5 w-5 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                    <Quote className="mb-4 h-9 w-9 text-violet-200" />
                    <p className="mb-6 flex-1 italic leading-relaxed text-slate-700">"{testimonial.quote}"</p>
                    <div className="border-t border-slate-200 pt-4">
                      <p className="font-semibold text-slate-900">{testimonial.author}</p>
                      <p className="text-sm text-slate-600">{testimonial.role}</p>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* ===================== FRANCHISE / EXPAND (dark) ===================== */}
        <section className="relative overflow-hidden bg-slate-950 py-20 md:py-28">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_50%_at_50%_0%,rgba(99,102,241,0.18),transparent)]" />
          <div className="relative mx-auto max-w-6xl px-4">
            <Reveal className="mb-12 text-center">
              <Eyebrow icon={Globe} className="border-violet-400/20 bg-violet-500/10 text-violet-200">
                Scale across South Africa
              </Eyebrow>
              <h2 className="mt-6 text-balance text-3xl font-bold tracking-tight text-white md:text-5xl">
                Ready to franchise or expand?
              </h2>
              <p className="mx-auto mt-4 max-w-3xl text-balance text-lg text-slate-300">
                Launch new kitchens and regional operations with one-click setup. Perfect for multi-location businesses.
              </p>
            </Reveal>

            <Stagger className="grid gap-6 md:grid-cols-2">
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
                <StaggerItem key={index}>
                  <div className={`group h-full rounded-2xl border border-white/10 bg-white/[0.04] p-7 backdrop-blur-sm transition-[transform,background-color,border-color] duration-300 ${EASE} hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.07]`}>
                    <div className="flex items-start gap-4">
                      <div className={`${iconChip} h-12 w-12 shrink-0 bg-gradient-to-br from-violet-500 to-fuchsia-500`}>
                        <feature.icon className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <h3 className="mb-2 text-xl font-semibold text-white">{feature.title}</h3>
                        <p className="text-slate-300">{feature.description}</p>
                      </div>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* ===================== FAQ ===================== */}
        <section className="mx-auto max-w-4xl px-4 py-20 md:py-28">
          <Reveal className="mb-16 text-center">
            <Eyebrow icon={Lightbulb} className="border-blue-200 bg-blue-50 text-blue-600">
              Common questions
            </Eyebrow>
            <h2 className="mt-5 text-balance text-3xl font-bold tracking-tight text-slate-900 md:text-5xl">
              Everything you need to know
            </h2>
            <p className="mt-4 text-base text-slate-600">
              More questions? Check out our{" "}
              <Link href="/features" className="font-medium text-violet-600 underline-offset-2 hover:underline">feature overview</Link>{" "}
              or <Link href="/contact" className="font-medium text-violet-600 underline-offset-2 hover:underline">contact support</Link>.
            </p>
          </Reveal>

          <Stagger className="space-y-4" gap={0.05}>
            {faqs.map((faq, index) => (
              <StaggerItem key={index}>
                <div className={`rounded-2xl border border-slate-200 bg-white p-6 transition-[border-color,box-shadow] duration-300 ${EASE} hover:border-violet-200 hover:shadow-sm`}>
                  <h3 className="mb-3 flex items-start gap-3 text-lg font-semibold text-slate-900">
                    <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-violet-600" />
                    {faq.question}
                  </h3>
                  <p className="pl-8 text-slate-600">{faq.answer}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>

          <Reveal className="mt-12 text-center">
            <p className="mb-6 text-lg text-slate-600">Still have questions? We're here to help.</p>
            <Link href="/contact" className="inline-block w-full sm:w-auto">
              <Button
                size="lg"
                variant="outline"
                className={`h-12 w-full rounded-full border-slate-300 px-8 font-semibold hover:border-slate-400 hover:bg-slate-50 sm:w-auto ${btnPress}`}
              >
                Contact Support
                <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Button>
            </Link>
          </Reveal>
        </section>

        {/* ===================== THREE PILLARS ===================== */}
        <section className="bg-slate-50 py-20 md:py-28">
          <div className="mx-auto max-w-6xl px-4">
            <Stagger className="grid gap-6 md:grid-cols-3">
              {[
                { icon: Smartphone, accent: "from-blue-500 to-cyan-500", title: "Mobile-First", body: "Drivers, kitchen, and clients use their phones. Beautiful, intuitive interfaces anyone can master.", href: "/features", cta: "Learn about mobile features" },
                { icon: Lock, accent: "from-emerald-500 to-green-500", title: "Secure & Reliable", body: "Bank-level security. Daily backups. 99.9% uptime. Your data is protected.", href: "/privacy", cta: "Read our privacy policy" },
                { icon: MapPin, accent: "from-violet-500 to-fuchsia-500", title: "Built for SA", body: "Rand pricing, local payments, South African business practices. Finally, software for us.", href: "/pricing", cta: "View pricing plans" }
              ].map((pillar, index) => (
                <StaggerItem key={index}>
                  <div className={`${cardBase} flex h-full flex-col p-8 text-center`}>
                    <div className={`${iconChip} mx-auto mb-5 h-14 w-14 bg-gradient-to-br ${pillar.accent}`}>
                      <pillar.icon className="h-7 w-7 text-white" />
                    </div>
                    <h3 className="mb-3 text-2xl font-bold tracking-tight text-slate-900">{pillar.title}</h3>
                    <p className="mb-5 flex-1 text-slate-600">{pillar.body}</p>
                    <Link href={pillar.href} className="group inline-flex items-center justify-center gap-1.5 text-sm font-medium text-violet-600 transition-colors duration-150 hover:text-violet-700">
                      {pillar.cta}
                      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </Link>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* ===================== FINAL CTA ===================== */}
        <section className="px-4 py-20 md:py-24">
          <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-500 px-6 py-16 text-center shadow-2xl shadow-violet-600/20 sm:px-12 md:py-20">
            <div className="pointer-events-none absolute inset-0 [background-image:linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(70%_70%_at_50%_50%,black,transparent)]" />
            <div className="relative mx-auto max-w-3xl">
              <h2 className="text-balance text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl">
                Stop losing money. Start growing today.
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-violet-50 sm:text-xl">
                Join forward-thinking catering businesses across South Africa who are finally running
                profitable, scalable operations without being trapped in their business.
              </p>

              <div className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
                <Link href="/company-signup" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    className={`h-12 w-full rounded-full bg-white px-9 text-base font-semibold text-violet-700 shadow-xl hover:bg-violet-50 sm:w-auto ${btnPress}`}
                  >
                    Start Your Free Trial
                    <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Button>
                </Link>
                <Link href="/pricing" className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    variant="outline"
                    className={`h-12 w-full rounded-full border-white/60 bg-transparent px-9 text-base font-semibold text-white hover:border-white hover:bg-white/10 sm:w-auto ${btnPress}`}
                  >
                    View Pricing Plans
                  </Button>
                </Link>
              </div>

              <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm text-violet-100">
                {["No credit card required", "Cancel anytime", "Setup in under 3 hours", "Dedicated support included"].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </section>

        <Footer />
      </div>
    </>
  );
}
