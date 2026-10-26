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
import { FaqSection } from "@/components/landing/home/FaqSection";
import { FinalCtaSection } from "@/components/landing/home/FinalCtaSection";

/** Shared marketing page composition for the default and regional URLs. */
export function LandingHomeContent({ includeLocalProof = true, regionPrefix = "" }: {
  includeLocalProof?: boolean;
  regionPrefix?: "" | "us" | "uk" | "eu";
}) {
  return (
    <div className="font-body min-h-screen bg-stone-50 text-stone-900">
      <LandingHeader />
      <HeroSection />
      {includeLocalProof && <SocialProofSection />}
      <ServicesSection />
      <MenuSection />
      <WhySection />
      {includeLocalProof && <TestimonialsSection />}
      <GallerySection />
      <StatementSection />
      <ProcessSection />
      <FaqSection />
      <FinalCtaSection />
      <LandingFooter regionPrefix={regionPrefix} />
    </div>
  );
}
