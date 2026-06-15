import { useRef, useEffect } from "react";
import Link from "next/link";
import Head from "next/head";
import {
  motion,
  animate,
  useScroll,
  useTransform,
  useMotionValue,
  useInView,
  useReducedMotion,
} from "framer-motion";
import {
  Star, ArrowRight, Phone, CheckCircle, Check, Zap, Users, Clock, Sparkles,
  Heart, Building2, PartyPopper, Crown, ChefHat, FileText, Calendar, Truck,
  RefreshCw, Leaf, Shield, Award, Quote, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { ProductPreview } from "@/components/landing/ProductPreview";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Reveal";
import { EASE, btnPress } from "@/components/motion/marketing";

// Phone number (mirrors the JSON-LD contactPoint) - wired for click-to-call.
const PHONE_DISPLAY = "+27 83 652 5755";
const PHONE_TEL = "+27836525755";

// Warm-luxury surface language for this page. Kept local (not in the shared
// marketing tokens) because the rest of the site stays on the cooler
// violet/slate palette - only the landing page wears the warm catering skin.
const warmCard = `group relative h-full overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm transition-[transform,box-shadow,border-color] duration-300 ${EASE} hover:-translate-y-1 hover:border-amber-200/80 hover:shadow-[0_24px_60px_-24px_rgba(120,53,15,0.30)]`;
const amberBtn = `h-12 rounded-full bg-gradient-to-b from-amber-500 to-amber-600 px-8 text-base font-semibold text-white shadow-lg shadow-amber-700/25 hover:from-amber-500 hover:to-amber-700 hover:shadow-xl hover:shadow-amber-700/30 ${btnPress}`;
const chip = `inline-flex items-center justify-center rounded-xl shadow-sm transition-transform duration-300 ${EASE} group-hover:scale-105`;

// Authentic, hand-picked Unsplash catering photography (validated to resolve).
// `u()` builds an optimised, CDN-resized URL. Swap any id for your own shoot
// later - or drop a local file and point src at /images/... instead.
const u = (id: string, w: number, extra = "") =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&q=70&w=${w}${extra}`;

const IMG = {
  hero: u("1511795409834-ef04bbd61622", 2000),
  cta: u("1463183547458-6a2c760d0912", 1800),
  services: {
    weddings: u("1606660023296-81d67734170a", 800),
    corporate: u("1671612451404-f4f8fc5fe25e", 800),
    private: u("1660120447916-123439b05c40", 800),
    gala: u("1525441273400-056e9c7517b3", 800),
  },
  menu: {
    beef: u("1600891964092-4316c288032e", 800),
    arancini: u("1780134758247-f780bcb9dca5", 800),
    linefish: u("1467003909585-2f8a72700288", 800),
    grazing: u("1773517906154-f98ddb122263", 800),
    malva: u("1527751171053-6ac5ec50000b", 800),
    potjie: u("1594041680534-e8c8cdebd659", 800),
  },
  gallery: [
    u("1576842546422-60562b9242ae", 900),
    u("1663530761401-15eefb544889", 600),
    u("1774921676955-b54c02fe4fb0", 600),
    u("1767500536243-bf6807a331e4", 600),
    u("1414235077428-338989a2e8c0", 600),
  ],
  people: {
    sarah: u("1494790108377-be9c29b29330", 240, "&h=240&crop=faces"),
    michael: u("1507003211169-0a1dd7228f2d", 240, "&h=240&crop=faces"),
    linda: u("1573497491765-dccce02b29df", 240, "&h=240&crop=faces"),
  },
};

/**
 * Graceful image slot. Renders a warm gradient immediately and layers the
 * real photo on top via CSS background - so a missing file simply shows the
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

/**
 * Count-up number for the social-proof stats. Animates only when scrolled into
 * view, exactly once, and snaps straight to the value under reduced-motion.
 * `prefix`/`suffix` keep the honest range + unit (e.g. "10-" … "%").
 */
function CountUp({
  to,
  prefix = "",
  suffix = "",
  className = "",
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => `${prefix}${Math.round(v)}${suffix}`);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      mv.set(to);
      return;
    }
    const controls = animate(mv, to, { duration: 1.1, ease: [0.23, 1, 0.32, 1] });
    return () => controls.stop();
  }, [inView, reduce, to, mv]);

  return (
    <motion.span ref={ref} className={className}>
      {text}
    </motion.span>
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
      img: IMG.services.weddings,
      gradient: "from-rose-200 to-amber-200",
      body: "From the proposal to the last dance - itemised quotes, dietary tracking, minute-perfect kitchen timing and on-the-day coordination.",
    },
    {
      icon: Building2,
      title: "Corporate Events",
      img: IMG.services.corporate,
      gradient: "from-amber-200 to-stone-300",
      body: "Recurring orders, PO-friendly invoicing, multi-site delivery and last-minute headcount changes - handled without the email chaos.",
    },
    {
      icon: PartyPopper,
      title: "Private Parties",
      img: IMG.services.private,
      gradient: "from-orange-200 to-rose-200",
      body: "Fast quotes, deposit links and a branded client portal that makes booking a birthday or celebration feel effortless.",
    },
    {
      icon: Crown,
      title: "Galas & Special Events",
      img: IMG.services.gala,
      gradient: "from-amber-300 to-yellow-200",
      body: "Large-scale logistics: hire-in equipment, staffing rosters, allergen sheets and live tracking for your flagship functions.",
    },
  ];

  const dishes = [
    { name: "Seared Beef Fillet", tag: "Signature Mains", img: IMG.menu.beef, gradient: "from-rose-300 to-amber-300", popular: true },
    { name: "Truffle Arancini", tag: "Canapés", img: IMG.menu.arancini, gradient: "from-amber-200 to-yellow-300" },
    { name: "Pan-Seared Linefish", tag: "Mains", img: IMG.menu.linefish, gradient: "from-orange-300 to-amber-400" },
    { name: "Grazing Table", tag: "Sharing", img: IMG.menu.grazing, gradient: "from-stone-300 to-amber-200", popular: true },
    { name: "Malva Pudding", tag: "Desserts", img: IMG.menu.malva, gradient: "from-amber-300 to-orange-200" },
    { name: "Lamb Potjie", tag: "Mains", img: IMG.menu.potjie, gradient: "from-stone-400 to-amber-300" },
  ];

  const reasons = [
    {
      icon: Zap,
      title: "Quote in minutes, not days",
      body: "Itemised, branded quotes your clients can accept online - so you win the booking while you're still top of mind.",
    },
    {
      icon: Users,
      title: "Your whole team, in sync",
      body: "Kitchen, drivers, shopping and cleaning all work from one live plan. No more forty coordination calls a day.",
    },
    {
      icon: Clock,
      title: "On-time, every single event",
      body: "Live GPS, prep schedules and delivery sheets keep every function running to the minute - and clients in the loop.",
    },
    {
      icon: Sparkles,
      title: "Custom menus & branded portals",
      body: "Tailor menus per client and hand them a portal that carries your brand, your colours, your logo - not ours.",
    },
  ];

  // prefix/suffix preserve the honest range; CountUp animates the headline figure.
  const stats = [
    { prefix: "", to: 12, suffix: "+", label: "Hours saved every week" },
    { prefix: "50-", to: 55, suffix: "%", label: "Fewer admin calls" },
    { prefix: "10-", to: 16, suffix: "%", label: "Higher profit margins" },
    { prefix: "1.5-", to: 2, suffix: "×", label: "More repeat bookings" },
  ];

  const integrations = ["PayFast", "Stripe", "Xero", "QuickBooks", "Sage", "Paystack"];

  const workflow = [
    { icon: FileText, step: "Enquiry & Quote", description: "Capture every lead and build itemised, menu-based quotes in minutes. Send a branded quote your client can accept online." },
    { icon: Calendar, step: "Confirm & Deposit", description: "Clients accept via a secure magic-link portal and pay a deposit through PayFast. The function locks into your calendar automatically." },
    { icon: ChefHat, step: "Plan & Prep", description: "Auto-generate the BEO, kitchen prep lists, shopping lists and allergen sheets - with own stock and hire-in equipment reconciled." },
    { icon: Truck, step: "Deliver & Serve", description: "Drivers get optimised routes and live GPS tracking. Clients watch their order arrive while equipment is checked out and back in." },
    { icon: RefreshCw, step: "Invoice & Rebook", description: "Settle the balance with final guest-count adjustments, then trigger automated thank-yous and rebooking nurture for next season." },
  ];

  const testimonials = [
    {
      quote: "We went from barely breaking even to 18% profit margins. The automation alone saved us enough to hire two full-time staff members.",
      author: "Sarah Johnson",
      role: "Owner, Cape Town Catering Co.",
      event: "Weddings & functions",
      img: IMG.people.sarah,
      rating: 5,
    },
    {
      quote: "Finally, I can take a vacation. The system runs everything. My team knows exactly what to do without calling me every hour.",
      author: "Michael Peters",
      role: "Director, Durban Events & Catering",
      event: "Corporate catering",
      img: IMG.people.michael,
      rating: 5,
    },
    {
      quote: "The GPS tracking feature alone improved our customer satisfaction significantly. Clients love seeing their food on the way in real-time.",
      author: "Linda Ndlovu",
      role: "Founder, Johannesburg Function Foods",
      event: "Private & special events",
      img: IMG.people.linda,
      rating: 5,
    },
  ];

  const gallery = [
    { img: IMG.gallery[0], alt: "A table laid with a variety of catered dishes", gradient: "from-rose-200 to-amber-200", span: "md:col-span-2 md:row-span-2" },
    { img: IMG.gallery[1], alt: "Chef finishing a plated main course with sauce", gradient: "from-amber-200 to-orange-300", span: "" },
    { img: IMG.gallery[2], alt: "Gourmet canapés arranged on a serving tray", gradient: "from-stone-300 to-amber-200", span: "" },
    { img: IMG.gallery[3], alt: "Grazing board with cheeses, fruit and bread", gradient: "from-orange-200 to-rose-200", span: "" },
    { img: IMG.gallery[4], alt: "Elegant fine-dining plated dish", gradient: "from-amber-300 to-yellow-200", span: "" },
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

      <div className="font-body min-h-screen bg-stone-50 text-stone-900">
        <LandingHeader />
        {/* ===================== HERO ===================== */}
        <section ref={heroRef} className="relative isolate overflow-hidden bg-stone-950 text-white">
          {/* Parallax food photography (graceful gradient until a real photo is dropped in) */}
          <motion.div style={{ y: heroY }} className="absolute inset-0 -z-20 scale-[1.18]">
            <Photo
              src={IMG.hero}
              alt="An elegant catering spread of plated dishes and canapés"
              gradient="from-stone-700 via-stone-900 to-stone-950"
              className="h-full w-full"
            />
          </motion.div>
          {/* Scrims for legible text over any photo */}
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-stone-950 via-stone-950/90 to-stone-950/75" />
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(75%_55%_at_50%_0%,rgba(245,158,11,0.20),transparent)]" />

          <div className="relative mx-auto max-w-7xl px-4 pb-24 pt-14 md:pb-32 md:pt-20">
            <Stagger className="mx-auto max-w-3xl text-center" gap={0.08}>
              <StaggerItem>
                <h1 className="text-balance font-display text-5xl font-medium leading-[1.04] tracking-tight text-white sm:text-6xl lg:text-[clamp(3.5rem,6vw,5.25rem)]">
                  Run a catering business your{" "}
                  <em className="font-semibold not-italic text-amber-300">clients rave about</em>
                </h1>
              </StaggerItem>

              <StaggerItem>
                <p className="mx-auto mt-6 max-w-2xl text-balance text-lg leading-relaxed text-stone-200 sm:text-xl">
                  The complete operating system for weddings, corporate functions and
                  private events. Quote, plan, deliver and get paid - beautifully -
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
                    className={`h-12 w-full rounded-full border-white/40 bg-white/10 px-8 text-base font-semibold text-white hover:border-white/60 hover:bg-white/15 sm:w-auto ${btnPress}`}
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

            {/* Product showcase - the "this is serious software" centrepiece */}
            <Reveal className="mt-14 md:mt-20" y={28}>
              <ProductPreview />
            </Reveal>
          </div>

        </section>

        {/* ===================== SOCIAL PROOF ===================== */}
        <section className="border-b border-stone-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-16 md:py-20">
            {/* Editorial figures row - hairline-divided, no icon chips. The
                numbers carry the weight; the labels sit quiet beside them. */}
            <Stagger
              className="grid grid-cols-2 divide-stone-200 sm:grid-cols-4 sm:divide-x"
              gap={0.06}
            >
              {stats.map((stat, index) => (
                <StaggerItem
                  key={index}
                  className="border-b border-stone-200 px-2 py-6 sm:border-b-0 sm:px-8 sm:py-2 sm:first:pl-0 sm:last:pr-0"
                >
                  <CountUp
                    to={stat.to}
                    prefix={stat.prefix}
                    suffix={stat.suffix}
                    className="block font-display text-4xl font-medium tracking-tight text-stone-900 md:text-5xl"
                  />
                  <div className="mt-2 text-sm leading-snug text-stone-600">{stat.label}</div>
                </StaggerItem>
              ))}
            </Stagger>

            <Reveal className="mt-14">
              <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
                Payments &amp; accounting that just work
              </p>
              {/* Slow, seamless logo marquee (linear, pauses on hover, off under
                  reduced motion). Track is duplicated so -50% loops forever. */}
              <div className="group mt-6 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]">
                <div className="flex w-max animate-[marquee_26s_linear_infinite] items-center gap-12 group-hover:[animation-play-state:paused] motion-reduce:animate-none motion-reduce:justify-center">
                  {[...integrations, ...integrations].map((name, i) => (
                    <span
                      key={`${name}-${i}`}
                      className="shrink-0 text-lg font-semibold tracking-tight text-stone-500 transition-colors duration-200 hover:text-stone-700"
                      aria-hidden={i >= integrations.length}
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ===================== FEATURED SERVICES ===================== */}
        <section id="services" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-20 md:py-28">
          <Reveal className="mx-auto mb-14 max-w-3xl text-center">
            <h2 className="text-balance font-display text-3xl font-medium tracking-tight text-stone-900 md:text-5xl">
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
                    <div className={`${chip} absolute left-4 top-4 h-11 w-11 bg-white`}>
                      <service.icon className="h-5 w-5 text-amber-700" />
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
        <section id="menu" className="scroll-mt-24 bg-stone-100 py-20 md:py-28">
          <div className="mx-auto max-w-7xl px-4">
            <Reveal className="mx-auto mb-14 max-w-3xl text-center">
              <h2 className="text-balance font-display text-3xl font-medium tracking-tight text-stone-900 md:text-5xl">
                Menus worth showing off
              </h2>
              <p className="mt-4 text-balance text-lg text-stone-600">
                Build, cost and send beautiful menus in minutes. Your clients see this -
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
            <h2 className="text-balance font-display text-3xl font-medium tracking-tight text-stone-900 md:text-5xl">
              The difference is in the details
            </h2>
            <p className="mt-4 text-balance text-lg text-stone-600">
              The unseen work that makes your service look effortless - finally handled.
            </p>
          </Reveal>

          {/* Hairline-divided editorial pairs, not cloned tiles: a solid ink
              icon leads each reason; hierarchy comes from the heading weight. */}
          <Stagger className="mx-auto grid max-w-5xl gap-x-12 gap-y-10 sm:grid-cols-2">
            {reasons.map((reason, index) => (
              <StaggerItem key={index}>
                <div className="flex gap-4 border-t border-stone-200 pt-6">
                  <reason.icon className="mt-1 h-6 w-6 shrink-0 text-amber-700" strokeWidth={1.75} />
                  <div>
                    <h3 className="text-lg font-semibold text-stone-900">{reason.title}</h3>
                    <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-stone-600">{reason.body}</p>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>

          <Stagger className="mt-14 flex flex-wrap justify-center gap-3" gap={0.05}>
            {trustChips.map((t, index) => (
              <StaggerItem key={index}>
                <div className="flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 shadow-sm">
                  <t.icon className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-medium text-stone-700">{t.text}</span>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </section>

        {/* ===================== TESTIMONIALS ===================== */}
        <section id="reviews" className="scroll-mt-24 bg-stone-950 py-20 text-white md:py-28">
          <div className="mx-auto max-w-6xl px-4">
            <Reveal className="mb-14 text-center">
              <h2 className="text-balance font-display text-3xl font-medium tracking-tight text-white md:text-5xl">
                Real results from real businesses
              </h2>
              <p className="mt-4 text-lg text-stone-300">
                South African catering teams running calmer, more profitable operations.
              </p>
            </Reveal>

            <Stagger className="grid gap-6 md:grid-cols-3">
              {testimonials.map((testimonial, index) => (
                <StaggerItem key={index}>
                  <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-stone-900 p-7">
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
        <section id="gallery" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-20 md:py-28">
          <Reveal className="mx-auto mb-14 max-w-3xl text-center">
            <h2 className="text-balance font-display text-3xl font-medium tracking-tight text-stone-900 md:text-5xl">
              Beautiful events, flawlessly run
            </h2>
            <p className="mt-4 text-balance text-lg text-stone-600">
              The setups, the plating, the moments - powered behind the scenes by CateringMS.
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
              <h2 className="text-balance font-display text-3xl font-medium tracking-tight text-stone-900 md:text-5xl">
                From first enquiry to repeat booking
              </h2>
              <p className="mt-4 text-balance text-lg text-stone-600">
                Every function follows the same path. CateringMS runs each stage for you,
                so nothing slips between the quote and the invoice.
              </p>
            </Reveal>

            {/* A genuine ordered sequence (the numbers carry the order, which the
                reader needs). Solid ink icons, no gradient chips; the hairline
                top rule ties the five steps into one timeline. */}
            <Stagger className="grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-5" gap={0.06}>
              {workflow.map((stage, index) => (
                <StaggerItem key={index}>
                  <div className="flex h-full flex-col border-t-2 border-amber-700/70 pt-5">
                    <div className="mb-4 flex items-baseline justify-between">
                      <span className="font-display text-2xl font-medium tabular-nums text-amber-700">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <stage.icon className="h-5 w-5 text-stone-400" strokeWidth={1.75} />
                    </div>
                    <h3 className="mb-2 text-base font-semibold text-stone-900">{stage.step}</h3>
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
            <h2 className="text-balance font-display text-3xl font-medium tracking-tight text-stone-900 md:text-5xl">
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
                    <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
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
              src={IMG.cta}
              alt=""
              gradient="from-amber-700 via-stone-900 to-stone-950"
              className="absolute inset-0"
            />
            <div className="absolute inset-0 bg-stone-950/70" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,rgba(245,158,11,0.28),transparent)]" />

            <div className="relative mx-auto max-w-3xl">
              <h2 className="text-balance font-display text-3xl font-medium tracking-tight text-white sm:text-4xl md:text-5xl">
                Let&apos;s make your next event effortless
              </h2>
              <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-stone-200 sm:text-xl">
                Join forward-thinking catering businesses across South Africa running
                profitable, scalable operations - without being trapped in the day-to-day.
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
                    className={`h-12 w-full rounded-full border-white/40 bg-white/10 px-9 text-base font-semibold text-white hover:border-white/60 hover:bg-white/15 sm:w-auto ${btnPress}`}
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

        <LandingFooter />
      </div>
    </>
  );
}
