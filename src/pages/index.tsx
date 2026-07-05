import Head from "next/head";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { HeroSection } from "@/components/landing/home/HeroSection";
import { SocialProofSection } from "@/components/landing/home/SocialProofSection";
import { ServicesSection } from "@/components/landing/home/ServicesSection";
import { MenuSection } from "@/components/landing/home/MenuSection";
import { WhySection } from "@/components/landing/home/WhySection";
import { TestimonialsSection } from "@/components/landing/home/TestimonialsSection";
import { GallerySection } from "@/components/landing/home/GallerySection";
import { StatementSection } from "@/components/landing/home/StatementSection";
import { ProcessSection } from "@/components/landing/home/ProcessSection";
import { FaqSection, FAQS } from "@/components/landing/home/FaqSection";
import { FinalCtaSection } from "@/components/landing/home/FinalCtaSection";

const SITE_URL = "https://cateringms.com";
// The only image guaranteed to exist in /public today. Swap for a proper
// /logo.png (and an og-image) when brand assets land - one constant to change.
const BRAND_IMAGE = `${SITE_URL}/favicon.ico`;

// ---- Structured data ----
const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "CateringMS",
  legalName: "CateringMS (A product of Skylight Digital)",
  url: SITE_URL,
  logo: BRAND_IMAGE,
  description: "The ultimate catering management solution for profitable, scalable catering businesses in South Africa",
  address: { "@type": "PostalAddress", streetAddress: "17 Swalle Street", addressLocality: "Golden Acre", addressCountry: "ZA" },
  contactPoint: { "@type": "ContactPoint", telephone: "+27-83-652-5755", contactType: "customer support", areaServed: "ZA", availableLanguage: ["English", "Afrikaans"] },
  sameAs: ["https://www.facebook.com/cateringms", "https://www.linkedin.com/company/cateringms"],
};

const localBusinessSchema = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "@id": SITE_URL,
  name: "CateringMS",
  image: BRAND_IMAGE,
  telephone: "+27-83-652-5755",
  address: { "@type": "PostalAddress", streetAddress: "17 Swalle Street", addressLocality: "Golden Acre", addressCountry: "ZA" },
  geo: { "@type": "GeoCoordinates", latitude: "-33.9249", longitude: "18.4241" },
  url: SITE_URL,
  priceRange: "R899-R4999",
  openingHoursSpecification: { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], opens: "08:00", closes: "17:00" },
};

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "CateringMS",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web, iOS, Android",
  offers: { "@type": "Offer", price: "899", priceCurrency: "ZAR", priceValidUntil: "2026-12-31" },
  aggregateRating: { "@type": "AggregateRating", ratingValue: "4.9", ratingCount: "127" },
  description: "Complete catering management platform with lead management, GPS tracking, inventory control, and automated email follow-ups",
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((faq) => ({ "@type": "Question", name: faq.question, acceptedAnswer: { "@type": "Answer", text: faq.answer } })),
};

export default function HomePage() {
  return (
    <>
      <Head>
        <title>CateringMS - The Ultimate Catering Management Solution for South Africa</title>
        <meta name="description" content="Transform your South African catering business with CateringMS. Streamline operations, boost profits, and delight clients with our all-in-one management platform." />
        <meta name="keywords" content="catering software South Africa, catering management system, SA catering business, event catering management" />
        <link rel="canonical" href={SITE_URL} />

        {/* Open Graph */}
        <meta property="og:title" content="CateringMS - South African Catering Management Software" />
        <meta property="og:description" content="The ultimate catering management platform for South African caterers" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={SITE_URL} />
        <meta property="og:site_name" content="CateringMS" />
        <meta property="og:locale" content="en_ZA" />
        <meta name="twitter:card" content="summary" />

        {/* JSON-LD Schema */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      </Head>

      <div className="font-body min-h-screen bg-stone-50 text-stone-900">
        <LandingHeader />
        <HeroSection />
        <SocialProofSection />
        <ServicesSection />
        <MenuSection />
        <WhySection />
        <TestimonialsSection />
        <GallerySection />
        <StatementSection />
        <ProcessSection />
        <FaqSection />
        <FinalCtaSection />
        <LandingFooter />
      </div>
    </>
  );
}
