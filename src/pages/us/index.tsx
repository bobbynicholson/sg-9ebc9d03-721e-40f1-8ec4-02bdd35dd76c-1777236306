import Head from "next/head";
import { LandingHomeContent } from "@/components/landing/LandingHomeContent";

const title = "CateringMS | Catering Management Software for US Teams";
const description = "Manage catering enquiries, quotes, payments, kitchen preparation and deliveries in one clear workflow.";

export default function USHomePage() {
  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href="https://cateringms.com/us" />
        <link rel="alternate" hrefLang="en-US" href="https://cateringms.com/us" />
        <link rel="alternate" hrefLang="en-GB" href="https://cateringms.com/uk" />
        <link rel="alternate" hrefLang="en-ZA" href="https://cateringms.com" />
        <link rel="alternate" hrefLang="x-default" href="https://cateringms.com" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://cateringms.com/us" />
      </Head>
      <LandingHomeContent includeLocalProof={false} regionPrefix="us" />
    </>
  );
}