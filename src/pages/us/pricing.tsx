import { useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import dynamic from "next/dynamic";

const PricingPage = dynamic(() => import("../pricing"), { ssr: false });

export default function USPricingPage() {
  const router = useRouter();

  useEffect(() => {
    // Ensure we're on the US pricing path
    if (typeof window !== "undefined") {
      localStorage.setItem("market_region", "us");
    }
  }, []);

  return (
    <>
      <Head>
        <title>US Pricing - CateringMS Catering Management Software</title>
        <meta 
          name="description" 
          content="Affordable pricing for US caterers. Start at $69/month. 14-day free trial. No credit card required."
        />
        
        {/* Hreflang tags */}
        <link rel="alternate" hrefLang="en-US" href="https://cateringms.com/us/pricing" />
        <link rel="alternate" hrefLang="en-GB" href="https://cateringms.com/uk/pricing" />
        <link rel="alternate" hrefLang="en-ZA" href="https://cateringms.com/pricing" />
        <link rel="alternate" hrefLang="x-default" href="https://cateringms.com/pricing" />
      </Head>
      
      <PricingPage />
    </>
  );
}
