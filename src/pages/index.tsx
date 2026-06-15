import { useRef } from "react";
import Link from "next/link";
import Head from "next/head";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
} from "framer-motion";
import {
  Star, ArrowRight, Phone, CheckCircle, Check, Zap, Users, Clock, Sparkles,
  Heart, Building2, PartyPopper, Crown, ChefHat, FileText, Calendar, Truck,
  RefreshCw, TrendingUp, Bell, Leaf, Shield, Award, Quote, MapPin, Utensils,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { EASE, btnPress, Eyebrow } from "@/components/motion/marketing";

// Phone number (mirrors the JSON-LD contactPoint) — wired for click-to-call.
const PHONE_DISPLAY = "+27 83 652 5755";
const PHONE_TEL = "+27836525755";

// Warm-luxury surface language for this page. Kept local (not in the shared
// marketing tokens) because the rest of the site stays on the cooler
// violet/slate palette — only the landing page wears the warm catering skin.
const warmCard = `group relative h-full overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm transition-[transform,box-shadow,border-color] duration-300 ${EASE} hover:-translate-y-1 hover:border-amber-200/80 hover:shadow-[0_24px_60px_-24px_rgba(120,53,15,0.30)]`;
const amberBtn = `h-12 rounded-full bg-gradient-to-b from-amber-500 to-amber-600 px-8 text-base font-semibold text-white shadow-lg shadow-amber-700/25 hover:from-amber-500 hover:to-amber-700 hover:shadow-xl hover:shadow-amber-700/30 ${btnPress}`;
const chip = `inline-flex items-center justify-center rounded-xl shadow-sm transition-transform duration-300 ${EASE} group-hover:scale-105`;

/**
 * Graceful image slot. Renders a warm gradient immediately and layers the
 * real photo on top via CSS background — so a missing file simply shows the
 * gradient (no broken-image icons, no runtime 404s). Drop real photos into
 * /public/images/... and they appear with zero code changes.
 */
function Photo({
  src,
  alt,
  gradient = "from-stone-200 via-stone-300 to-stone-400",
  className = "",
  zoom = false,
  children,
}: {
  src: string;
  alt: string;
  gradient?: string;
  className?: string;
  zoom?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br ${gradient} ${className}`}>
      <div
        role="img"
        aria-label={alt}
        className={`absolute inset-0 bg-cover bg-center bg-no-repeat ${
          zoom ? `transition-transform duration-[1.2s] ${EASE} group-hover:scale-[1.06]` : ""
        }`}
        style={{ backgroundImage: `url('${src}')` }}
      />
      {children}
    </div>
  );
}

export default function HomePage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  // Subtle hero parallax: the photo drifts slower than the page. Disabled
  // entirely under prefers-reduced-motion.
  const heroY = useTransform(scrollYProgress, [0, 1], ["0%", reduce ? "0%" : "18%"]);

  const services = [
    {
      icon: Heart,
      title: "Weddings",
      img: "/images/services/weddings.jpg",
      gradient: "from-rose-200 to-amber-200",
      body: "From the proposal to the last dance — itemised quotes, dietary tracking, minute-perfect kitchen timing and on-the-day coordination.",
    },
    {
      icon: Building2,
      title: "Corporate Events",
      img: "/images/services/corporate.jpg",
      gradient: "from-amber-200 to-stone-300",
      body: "Recurring orders, PO-friendly invoicing, multi-site delivery and last-minute headcount changes — handled without the email chaos.",
    },
    {
      icon: PartyPopper,
      title: "Private Parties",
      img: "/images/services/private.jpg",
      gradient: "from-orange-200 to-rose-200",
      body: "Fast quotes, deposit links and a branded client portal that makes booking a birthday or celebration feel effortless.",
    },
    {
      icon: Crown,
      title: "Galas & Special Events",
      img: "/images/services/gala.jpg",
      gradient: "from-amber-300 to-yellow-200",
      body: "Large-scale logistics: hire-in equipment, staffing rosters, allergen sheets and live tracking for your flagship functions.",
    },
  ];

  const dishes = [
    { name: "Seared Beef Fillet", tag: "Signature Mains", img: "/images/menu/beef-fillet.jpg", gradient: "from-rose-300 to-amber-300", popular: true },
    { name: "Truffle Arancini", tag: "Canapés", img: "/images/menu/arancini.jpg", gradient: "from-amber-200 to-yellow-300" },
    { name: "Cape Malay Curry", tag: "Mains", img: "/images/menu/curry.jpg", gradient: "from-orange-300 to-amber-400" },
    { name: "Grazing Table", tag: "Sharing", img: "/images/menu/grazing.jpg", gradient: "from-stone-300 to-amber-200", popular: true },
    { name: "Malva Pudding", tag: "Desserts", img: "/images/menu/malva.jpg", gradient: "from-amber-300 to-orange-200" },
    { name: "Lamb Potjie", tag: "Mains", img: "/images/menu/potjie.jpg", gradient: "from-stone-400 to-amber-300" },
  ];

  const reasons = [
    {
      icon: Zap,
      title: "Quote in minutes, not days",
      body: "Itemised, branded quotes your clients can accept online — so you win the booking while you're still top of mind.",
    },
    {
      icon: Users,
      title: "Your whole team, in sync",
      body: "Kitchen, drivers, shopping and cleaning all work from one live plan. No more forty coordination calls a day.",
    },
    {
      icon: Clock,
      title: "On-time, every single event",
      body: "Live GPS, prep schedules and delivery sheets keep every function running to the minute — and clients in the loop.",
    },
    {
      icon: Sparkles,
      title: "Custom menus & branded portals",
      body: "Tailor menus per client and hand them a portal that carries your brand, your colours, your logo — not ours.",
    },
  ];

  const stats = [
    { value: "12+", label: "Hours saved every week", icon: Clock },
    { value: "50–55%", label: "Fewer admin calls", icon: Bell },
    { value: "10–16%", label: "Higher profit margins", icon: TrendingUp },
    { value: "1.5–2×", label: "More repeat bookings", icon: RefreshCw },
  ];

  const integrations = ["PayFast", "Stripe", "Xero", "QuickBooks", "Sage", "Paystack"];

  const workflow = [
    { icon: FileText, step: "Enquiry & Quote", description: "Capture every lead and build itemised, menu-based quotes in minutes. Send a branded quote your client can accept online." },
    { icon: Calendar, step: "Confirm & Deposit", description: "Clients accept via a secure magic-link portal and pay a deposit through PayFast. The function locks into your calendar automatically." },
    { icon: ChefHat, step: "Plan & Prep", description: "Auto-generate the BEO, kitchen prep lists, shopping lists and allergen sheets — with own stock and hire-in equipment reconciled." },
    { icon: Truck, step: "Deliver & Serve", description: "Drivers get optimised routes and live GPS tracking. Clients watch their order arrive while equipment is checked out and back in." },
    { icon: RefreshCw, step: "Invoice & Rebook", description: "Settle the balance with final guest-count adjustments, then trigger automated thank-yous and rebooking nurture for next season." },
  ];

  const testimonials = [
    {
      quote: "We went from barely breaking even to 18% profit margins. The automation alone saved us enough to hire two full-time staff members.",
      author: "Sarah Johnson",
      role: "Owner, Cape Town Catering Co.",
      event: "Weddings & functions",
      img: "/images/testimonials/sarah.jpg",
      rating: 5,
    },
    {
      quote: "Finally, I can take a vacation. The system runs everything. My team knows exactly what to do without calling me every hour.",
      author: "Michael Peters",
      role: "Director, Durban Events & Catering",
      event: "Corporate catering",
      img: "/images/testimonials/michael.jpg",
      rating: 5,
    },
    {
      quote: "The GPS tracking feature alone improved our customer satisfaction significantly. Clients love seeing their food on the way in real-time.",
      author: "Linda Ndlovu",
      role: "Founder, Johannesburg Function Foods",
      event: "Private & special events",
      img: "/images/testimonials/linda.jpg",
      rating: 5,
    },
  ];

  const gallery = [
    { img: "/images/gallery/1.jpg", alt: "Elegant wedding banquet table setting", gradient: "from-rose-200 to-amber-200", span: "md:col-span-2 md:row-span-2" },
    { img: "/images/gallery/2.jpg", alt: "Plated fine-dining main course", gradient: "from-amber-200 to-orange-300", span: "" },
    { img: "/images/gallery/3.jpg", alt: "Canapés on a serving platter", gradient: "from-stone-300 to-amber-200", span: "" },
    { img: "/images/gallery/4.jpg", alt: "Grazing table with cheeses and fruit", gradient: "from-orange-200 to-rose-200", span: "" },
    { img: "/images/gallery/5.jpg", alt: "Chef plating a dessert at a live event", gradient: "from-amber-300 to-yellow-200", span: "" },
  ];

  const faqs = [
    { question: "How long does it take to set up?", answer: "Most businesses are fully operational within 2-3 hours. We provide guided onboarding, video tutorials, and dedicated support to get you started quickly." },
    { question: "Do I need technical skills to use this?", answer: "Not at all. The platform is designed for caterers, not tech experts. If you can use WhatsApp, you can use our system. We've made everything intuitive and simple." },
    { question: "What if my team isn't tech-savvy?", answer: "Our mobile apps are incredibly simple. Drivers tap a button to start jobs, kitchen staff see clear prep lists, clients track orders visually. Everyone picks it up in minutes." },
    { question: "Can I scale to multiple locations?", answer: "Absolutely. Our multi-region feature lets you launch new kitchens, teams, and operations across South Africa with one-click setup. Head office manages sales, regions handle fulfillment." },
    { question: "What payment methods do you support?", answer: "We integrate with PayFast, Stripe, Paystack, and Flutterwave. Accept card payments, EFTs, and instant payments. All reconciled automatically." },
    { question: "Is my data secure?", answer: "Bank-level encryption, daily backups, 99.9% uptime. Your business data is protected, secure, and always accessible when you need it." },
    { question: "Can I try it before committing?", answer: "Yes! Start with a free trial. No credit card required. Test everything, invite your team, run a real event. Only pay if you love it." },
    { question: "What kind of support do you provide?", answer: "Email support, video tutorials, detailed documentation, and a growing community of South African caterers. We're invested in your success." },
  ];

  const trustChips = [
    { icon: Leaf, text: "Built for fresh, fast service" },
    { icon: Shield, text: "Bank-level security" },
    { icon: Award, text: "99.9% uptime" },
    { icon: Heart, text: "Founded by caterers" },
  ];

  // ---- Structured data (rendered below; richer than the previous single block) ----
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "CateringMS",
    legalName: "CateringMS (A product of Skylight Digital)",
    url: "https://cateringms.com",
    logo: "https://cateringms.com/logo.png",
    description: "The ultimate catering management solution for profitable, scalable catering businesses in South Africa",
    address: { "@type": "PostalAddress", streetAddress: "17 Swalle Street", addressLocality: "Golden Acre", addressCountry: "ZA" },
    contactPoint: { "@type": "ContactPoint", telephone: "+27-83-652-5755", contactType: "customer support", areaServed: "ZA", availableLanguage: ["English", "Afrikaans"] },
    sameAs: ["https://www.facebook.com/cateringms", "https://www.linkedin.com/company/cateringms"],
  };

  const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": "https://cateringms.com",
    name: "CateringMS",
    image: "https://cateringms.com/logo.png",
    telephone: "+27-83-652-5755",
    address: { "@type": "PostalAddress", streetAddress: "17 Swalle Street", addressLocality: "Golden Acre", addressCountry: "ZA" },
    geo: { "@type": "GeoCoordinates", latitude: "-33.9249", longitude: "18.4241" },
    url: "https://cateringms.com",
    priceRange: "R899-R4999",
    openingHoursSpecification: { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "08:00", closes: "17:00" },
  };

  const softwareSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "CateringMS",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, iOS, Android",
    offers: { "@type": "Offer", price: "899", priceCurrency: "ZAR", priceValidUntil: "2025-12-31" },
    aggregateRating: { "@type": "AggregateRating", ratingValue: "4.9", ratingCount: "127" },
    description: "Complete catering management platform with lead management, GPS tracking, inventory control, and automated email follow-ups",
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })),
  };

  return (
    <>
      <Head>
        <title>CateringMS - The Ultimate Catering Management Solution for South Africa</title>
        <meta name="description" content="Transform your South African catering business with CateringMS. Streamline operations, boost profits, and delight clients with our all-in-one management platform." />
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
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      </Head>

      <Header />

      <div className="min-h-screen bg-stone-50 text-stone-900">
        {/* ===================== HERO ===================== */}
        <section ref={heroRef} className="relative isolate overflow-hidden bg-stone-950 text-white">
          {/* Parallax food photography (graceful gradient until a real photo is dropped in) */}
          <motion.div style={{ y: heroY }} className="absolute inset-0 -z-20 scale-[1.18]">
            <Photo
              src="/images/hero.jpg"
              alt="An elegant catering spread of plated dishes and canapés"
              gradient="from-stone-700 via-stone-900 to-stone-950"
              className="h-full w-full"
            />
          </motion.div>
          {/* Scrims for legible text over any photo */}
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-stone-950 via-stone-950/80 to-stone-950/50" />
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(75%_55%_at_50%_0%,rgba(245,158,11,0.20),transparent)]" />

          <div className="relative mx-auto max-w-7xl px-4 pb-24 pt-14 md:pb-32 md:pt-20">
            <Stagger className="mx-auto max-w-3xl text-center" gap={0.08}>
              <StaggerItem className="mb-6 flex justify-center">
                <Eyebrow icon={Sparkles} className="border-amber-300/30 bg-white/10 text-amber-100 backdrop-blur-md">
                  Trusted by catering teams across South Africa
                </Eyebrow>
              </StaggerItem>

              <StaggerItem>
                <h1 className="text-balance font-display text-5xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl lg:text-7xl">
                  Run a catering business your{" "}
                  <span className="bg-gradient-to-r from-amber-300 via-amber-200 to-orange-300 bg-clip-text text-transparent">
                    clients rave about
                  </span>
                </h1>
              </StaggerItem>

              <StaggerItem>
                <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-stone-200 sm:text-xl">
                  The complete operating system for weddings, corporate functions and
                  private events. Quote, plan, deliver and get paid — beautifully —
                  from one platform built for South African caterers.
                </p>
              </StaggerItem>

              <StaggerItem className="mx-auto mt-9 flex max-w-md flex-col items-stretch justify-center gap-3 sm:max-w-none sm:flex-row sm:items-center">
                <Link href="/company-signup" className="w-full sm:w-auto">
                  <Button size="lg" className={`group w-full px-8 sm:w-auto ${amberBtn}`}>
                    Get Your Free Quote
                    <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Button>
                </Link>
                <a href={`tel:${PHONE_TEL}`} className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    variant="outline"
                    className={`h-12 w-full rounded-full border-white/30 bg-white/10 px-8 text-base font-semibold text-white backdrop-blur-md hover:border-white/50 hover:bg-white/15 sm:w-auto ${btnPress}`}
                  >
                    <Phone className="h-5 w-5" />
                    {PHONE_DISPLAY}
                  </Button>
                </a>
              </StaggerItem>

              {/* Above-the-fold trust indicators */}
              <StaggerItem className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-stone-300">
                <span className="inline-flex items-center gap-1.5">
                  <span className="flex">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                    ))}
                  </span>
                  <span className="font-medium text-white">4.9/5</span> from 127 reviews
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 text-amber-400" /> No credit card required
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 text-amber-400" /> Set up in under 3 hours
                </span>
              </StaggerItem>
            </Stagger>
          </div>
        </section>

        {/* ===================== SOCIAL PROOF ===================== */}
        <section className="border-b border-stone-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-14 md:py-16">
            <Stagger className="grid grid-cols-2 gap-6 md:grid-cols-4" gap={0.06}>
              {stats.map((stat, index) => (
                <StaggerItem key={index} className="text-center">
                  <div className="flex flex-col items-center">
                    <stat.icon className="mb-2 h-5 w-5 text-amber-500" />
                    <div className="font-display text-4xl font-semibold tracking-tight text-stone-900 md:text-5xl">
                      {stat.value}
                    </div>
                    <div className="mt-1 text-sm text-stone-500">{stat.label}</div>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>

            <Reveal className="mt-12">
              <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-stone-400">
                Payments &amp; accounting that just work
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
                {integrations.map((name) => (
                  <span key={name} className="text-lg font-semibold tracking-tight text-stone-400">
                    {name}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* ===================== FEATURED SERVICES ===================== */}
        <section className="mx-auto max-w-7xl px-4 py-20 md:py-28">
          <Reveal className="mx-auto mb-14 max-w-3xl text-center">
            <Eyebrow icon={Utensils} className="border-amber-200 bg-amber-50 text-amber-700">
              Every kind of event
            </Eyebrow>
            <h2 className="mt-5 text-balance font-display text-3xl font-semibold tracking-tight text-stone-900 md:text-5xl">
              Built for the way you actually cater
            </h2>
            <p className="mt-4 text-balance text-lg text-stone-600">
              Whatever you're plating up this weekend, CateringMS runs the operation behind it.
            </p>
          </Reveal>

          <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {services.map((service, index) => (
              <StaggerItem key={index}>
                <div className={`${warmCard} flex flex-col`}>
                  <Photo src={service.img} alt={`${service.title} catering`} gradient={service.gradient} className="aspect-[4/3] w-full" zoom>
                    <div className="absolute inset-0 bg-gradient-to-t from-stone-900/50 to-transparent" />
                    <div className={`${chip} absolute left-4 top-4 h-11 w-11 bg-white/90 backdrop-blur`}>
                      <service.icon className="h-5 w-5 text-amber-600" />
                    </div>
                  </Photo>
                  <div className="flex flex-1 flex-col p-6">
                    <h3 className="mb-2 text-xl font-semibold text-stone-900">{service.title}</h3>
                    <p className="text-sm leading-relaxed text-stone-600">{service.body}</p>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </section>

        {/* ===================== SIGNATURE MENU SHOWCASE ===================== */}
        <section className="bg-stone-100 py-20 md:py-28">
          <div className="mx-auto max-w-7xl px-4">
            <Reveal className="mx-auto mb-14 max-w-3xl text-center">
              <Eyebrow icon={ChefHat} className="border-amber-200 bg-amber-50 text-amber-700">
                Signature menus
              </Eyebrow>
              <h2 className="mt-5 text-balance font-display text-3xl font-semibold tracking-tight text-stone-900 md:text-5xl">
                Menus worth showing off
              </h2>
              <p className="mt-4 text-balance text-lg text-stone-600">
                Build, cost and send beautiful menus in minutes. Your clients see this —
                you keep the margins.
              </p>
            </Reveal>

            <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {dishes.map((dish, index) => (
                <StaggerItem key={index}>
                  <div className={`${warmCard}`}>
                    <Photo src={dish.img} alt={dish.name} gradient={dish.gradient} className="aspect-[5/4] w-full" zoom>
                      <div className="absolute inset-0 bg-gradient-to-t from-stone-900/70 via-stone-900/10 to-transparent" />
                      {dish.popular && (
                        <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-white shadow-md">
                          <Star className="h-3 w-3 fill-white" /> Popular
                        </span>
                      )}
                      <div className="absolute inset-x-0 bottom-0 p-5">
                        <p className="text-xs font-medium uppercase tracking-wider text-amber-200">{dish.tag}</p>
                        <h3 className="mt-0.5 font-display text-2xl font-semibold text-white">{dish.name}</h3>
                      </div>
                    </Photo>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>

            <Reveal className="mt-12 text-center">
              <Link href="/features/kitchen-management" className="group inline-flex items-center gap-2 font-medium text-amber-700 transition-colors duration-150 hover:text-amber-800">
                See how the menu &amp; costing builder works
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            </Reveal>
          </div>
        </section>

        {/* ===================== WHY CHOOSE US ===================== */}
        <section className="mx-auto max-w-7xl px-4 py-20 md:py-28">
          <Reveal className="mx-auto mb-14 max-w-3xl text-center">
            <Eyebrow icon={Award} className="border-amber-200 bg-amber-50 text-amber-700">
              Why caterers choose us
            </Eyebrow>
            <h2 className="mt-5 text-balance font-display text-3xl font-semibold tracking-tight text-stone-900 md:text-5xl">
              The difference is in the details
            </h2>
            <p className="mt-4 text-balance text-lg text-stone-600">
              The unseen work that makes your service look effortless — finally handled.
            </p>
          </Reveal>

          <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {reasons.map((reason, index) => (
              <StaggerItem key={index}>
                <div className={`${warmCard} flex h-full flex-col p-7`}>
                  <div className={`${chip} mb-5 h-14 w-14 bg-gradient-to-br from-amber-400 to-orange-500`}>
                    <reason.icon className="h-7 w-7 text-white" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-stone-900">{reason.title}</h3>
                  <p className="text-sm leading-relaxed text-stone-600">{reason.body}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>

          <Stagger className="mt-12 flex flex-wrap justify-center gap-3" gap={0.05}>
            {trustChips.map((t, index) => (
              <StaggerItem key={index}>
                <div className="flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 shadow-sm">
                  <t.icon className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-medium text-stone-700">{t.text}</span>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </section>

        {/* ===================== TESTIMONIALS ===================== */}
        <section className="bg-stone-950 py-20 text-white md:py-28">
          <div className="mx-auto max-w-6xl px-4">
            <Reveal className="mb-14 text-center">
              <Eyebrow icon={Star} className="border-amber-300/30 bg-white/10 text-amber-100 backdrop-blur-md">
                Loved by caterers
              </Eyebrow>
              <h2 className="mt-5 text-balance font-display text-3xl font-semibold tracking-tight text-white md:text-5xl">
                Real results from real businesses
              </h2>
              <p className="mt-4 text-lg text-stone-300">
                South African catering teams running calmer, more profitable operations.
              </p>
            </Reveal>

            <Stagger className="grid gap-6 md:grid-cols-3">
              {testimonials.map((testimonial, index) => (
                <StaggerItem key={index}>
                  <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.05] p-7 backdrop-blur-md">
                    <div className="mb-4 flex gap-1">
                      {[...Array(testimonial.rating)].map((_, i) => (
                        <Star key={i} className="h-5 w-5 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                    <Quote className="mb-4 h-8 w-8 text-amber-400/40" />
                    <p className="mb-6 flex-1 leading-relaxed text-stone-200">&ldquo;{testimonial.quote}&rdquo;</p>
                    <div className="flex items-center gap-3 border-t border-white/10 pt-5">
                      <Photo
                        src={testimonial.img}
                        alt={testimonial.author}
                        gradient="from-amber-300 to-orange-400"
                        className="h-12 w-12 shrink-0 rounded-full"
                      />
                      <div>
                        <p className="font-semibold text-white">{testimonial.author}</p>
                        <p className="text-sm text-stone-400">{testimonial.role}</p>
                        <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-amber-300">
                          <MapPin className="h-3 w-3" /> {testimonial.event}
                        </p>
                      </div>
                    </div>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* ===================== EVENT GALLERY ===================== */}
        <section className="mx-auto max-w-7xl px-4 py-20 md:py-28">
          <Reveal className="mx-auto mb-14 max-w-3xl text-center">
            <Eyebrow icon={Sparkles} className="border-amber-200 bg-amber-50 text-amber-700">
              From our caterers&apos; events
            </Eyebrow>
            <h2 className="mt-5 text-balance font-display text-3xl font-semibold tracking-tight text-stone-900 md:text-5xl">
              Beautiful events, flawlessly run
            </h2>
            <p className="mt-4 text-balance text-lg text-stone-600">
              The setups, the plating, the moments — powered behind the scenes by CateringMS.
            </p>
          </Reveal>

          <Stagger className="grid auto-rows-[200px] grid-cols-2 gap-4 md:grid-cols-4">
            {gallery.map((g, index) => (
              <StaggerItem key={index} className={g.span}>
                <div className="group relative h-full w-full overflow-hidden rounded-2xl shadow-sm">
                  <Photo src={g.img} alt={g.alt} gradient={g.gradient} className="h-full w-full" zoom>
                    <div className="absolute inset-0 bg-gradient-to-t from-stone-900/40 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  </Photo>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </section>

        {/* ===================== PROCESS / HOW IT WORKS ===================== */}
        <section className="bg-stone-100 py-20 md:py-28">
          <div className="mx-auto max-w-7xl px-4">
            <Reveal className="mx-auto mb-14 max-w-3xl text-center">
              <Eyebrow icon={FileText} className="border-amber-200 bg-amber-50 text-amber-700">
                How it works
              </Eyebrow>
              <h2 className="mt-5 text-balance font-display text-3xl font-semibold tracking-tight text-stone-900 md:text-5xl">
                From first enquiry to repeat booking
              </h2>
              <p className="mt-4 text-balance text-lg text-stone-600">
                Every function follows the same path. CateringMS runs each stage for you,
                so nothing slips between the quote and the invoice.
              </p>
            </Reveal>

            <Stagger className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5" gap={0.06}>
              {workflow.map((stage, index) => (
                <StaggerItem key={index}>
                  <div className={`${warmCard} flex h-full flex-col p-6`}>
                    <div className="mb-5 flex items-center justify-between">
                      <div className={`${chip} h-12 w-12 bg-gradient-to-br from-amber-400 to-orange-500`}>
                        <stage.icon className="h-6 w-6 text-white" />
                      </div>
                      <span className="font-display text-3xl font-semibold tabular-nums text-stone-200">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <h3 className="mb-2 text-lg font-semibold text-stone-900">{stage.step}</h3>
                    <p className="text-sm leading-relaxed text-stone-600">{stage.description}</p>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </section>

        {/* ===================== FAQ ===================== */}
        <section className="mx-auto max-w-4xl px-4 py-20 md:py-28">
          <Reveal className="mb-14 text-center">
            <Eyebrow icon={Sparkles} className="border-amber-200 bg-amber-50 text-amber-700">
              Common questions
            </Eyebrow>
            <h2 className="mt-5 text-balance font-display text-3xl font-semibold tracking-tight text-stone-900 md:text-5xl">
              Everything you need to know
            </h2>
            <p className="mt-4 text-base text-stone-600">
              More questions? Explore the{" "}
              <Link href="/features" className="font-medium text-amber-700 underline-offset-2 hover:underline">feature overview</Link>{" "}
              or <Link href="/contact" className="font-medium text-amber-700 underline-offset-2 hover:underline">talk to our team</Link>.
            </p>
          </Reveal>

          <Stagger className="space-y-4" gap={0.05}>
            {faqs.map((faq, index) => (
              <StaggerItem key={index}>
                <div className={`rounded-2xl border border-stone-200 bg-white p-6 transition-[border-color,box-shadow] duration-300 ${EASE} hover:border-amber-200 hover:shadow-sm`}>
                  <h3 className="mb-3 flex items-start gap-3 text-lg font-semibold text-stone-900">
                    <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                    {faq.question}
                  </h3>
                  <p className="pl-8 text-stone-600">{faq.answer}</p>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </section>

        {/* ===================== FINAL CTA ===================== */}
        <section className="px-4 pb-20 md:pb-24">
          <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-stone-950 px-6 py-16 text-center shadow-2xl sm:px-12 md:py-20">
            {/* Warm food photo wash behind the banner */}
            <Photo
              src="/images/cta.jpg"
              alt=""
              gradient="from-amber-700 via-stone-900 to-stone-950"
              className="absolute inset-0"
            />
            <div className="absolute inset-0 bg-stone-950/70" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(245,158,11,0.28),transparent)]" />

            <div className="relative mx-auto max-w-3xl">
              <h2 className="text-balance font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl md:text-5xl">
                Let&apos;s make your next event effortless
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-stone-200 sm:text-xl">
                Join forward-thinking catering businesses across South Africa running
                profitable, scalable operations — without being trapped in the day-to-day.
              </p>

              <div className="mx-auto mt-9 flex max-w-md flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
                <Link href="/company-signup" className="w-full sm:w-auto">
                  <Button size="lg" className={`group w-full px-9 sm:w-auto ${amberBtn}`}>
                    Get Your Free Quote
                    <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Button>
                </Link>
                <a href={`tel:${PHONE_TEL}`} className="w-full sm:w-auto">
                  <Button
                    size="lg"
                    variant="outline"
                    className={`h-12 w-full rounded-full border-white/30 bg-white/10 px-9 text-base font-semibold text-white backdrop-blur-md hover:border-white/50 hover:bg-white/15 sm:w-auto ${btnPress}`}
                  >
                    <Phone className="h-5 w-5" />
                    Call {PHONE_DISPLAY}
                  </Button>
                </a>
              </div>

              <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm text-stone-300">
                {["No credit card required", "Cancel anytime", "Setup in under 3 hours", "Dedicated support included"].map((item) => (
                  <div key={item} className="flex items-center gap-2">
                    <Check className="h-4 w-4 flex-shrink-0 text-amber-400" />
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
