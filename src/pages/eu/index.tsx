import Head from "next/head";
import { LandingHomeContent } from "@/components/landing/LandingHomeContent";

const title = "CateringMS | Catering Management Software for Europe";
const description = "Manage catering enquiries, quotes, payments, kitchen preparation and deliveries in one clear workflow.";

export default function EUHomePage() {
  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href="https://cateringms.com/eu" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://cateringms.com/eu" />
      </Head>
      <LandingHomeContent includeLocalProof={false} regionPrefix="eu" />
    </>
  );
}