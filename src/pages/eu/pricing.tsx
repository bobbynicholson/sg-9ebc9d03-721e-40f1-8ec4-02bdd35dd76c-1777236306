import { useEffect } from "react";
import Head from "next/head";
import dynamic from "next/dynamic";

const PricingPage = dynamic(() => import("../pricing"), { ssr: false });

export default function EUPricingPage() {
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("market_region", "eu");
    }
  }, []);

  return (
    <>
      <Head>
        <title>European Pricing - CateringMS Catering Management Software</title>
        <meta
          name="description"
          content="Affordable pricing for European caterers. EUR billing. 14-day free trial. No credit card required."
        />

        {/* Hreflang tags */}
        <link rel="alternate" hrefLang="en-EU" href="https://cateringms.com/eu/pricing" />
        <link rel="alternate" hrefLang="en-GB" href="https://cateringms.com/uk/pricing" />
        <link rel="alternate" hrefLang="en-US" href="https://cateringms.com/us/pricing" />
        <link rel="alternate" hrefLang="en-ZA" href="https://cateringms.com/pricing" />
        <link rel="alternate" hrefLang="x-default" href="https://cateringms.com/pricing" />
      </Head>

      <PricingPage />
    </>
  );
}
