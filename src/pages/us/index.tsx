import { useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowRight, 
  TrendingUp, 
  Users, 
  Clock, 
  DollarSign,
  CheckCircle2,
  Calendar,
  MapPin
} from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";

export default function USHomePage() {
  const router = useRouter();

  return (
    <>
      <Head>
        <title>CateringMS - The Ultimate Catering Management Software for US Caterers</title>
        <meta 
          name="description" 
          content="Transform your American catering business with CateringMS. Streamline operations, boost profits, and delight clients with our all-in-one management platform. Trusted by US caterers nationwide."
        />
        <meta name="keywords" content="catering software USA, catering management system, US catering business, American catering software, event catering management" />
        
        {/* Hreflang tags for international SEO */}
        <link rel="alternate" hrefLang="en-US" href="https://cateringms.com/us" />
        <link rel="alternate" hrefLang="en-GB" href="https://cateringms.com/uk" />
        <link rel="alternate" hrefLang="en-ZA" href="https://cateringms.com" />
        <link rel="alternate" hrefLang="x-default" href="https://cateringms.com" />

        {/* Open Graph */}
        <meta property="og:title" content="CateringMS - US Catering Management Software" />
        <meta property="og:description" content="The ultimate catering management platform for American caterers" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://cateringms.com/us" />
        
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
                "price": "69",
                "priceCurrency": "USD"
              },
              "operatingSystem": "Web",
              "description": "Complete catering management software for US businesses"
            })
          }}
        />
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-purple-50 via-white to-gray-50">
        <Header />

        <main>
          {/* Hero Section - US Market */}
          <section className="relative overflow-hidden bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800 text-white py-20 md:py-32">
            <div className="absolute inset-0 bg-grid-white/10"></div>
            
            <div className="container mx-auto px-4 relative z-10">
              <div className="max-w-4xl mx-auto text-center">
                <Badge className="mb-6 bg-white/20 text-white border-white/30 backdrop-blur-sm">
                  🇺🇸 Built for American Caterers
                </Badge>
                
                <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
                  The Ultimate Catering Management Solution
                </h1>
                
                <p className="text-xl md:text-2xl mb-8 text-purple-100">
                  Transform your US catering business with automated workflows, real-time tracking, and intelligent operations management
                </p>

                <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
                  <Button 
                    size="lg" 
                    className="bg-white text-purple-600 hover:bg-gray-100 text-lg px-8 py-6"
                    asChild
                  >
                    <Link href="/auth/register">
                      Start Free 14-Day Trial
                      <ArrowRight className="ml-2 w-5 h-5" />
                    </Link>
                  </Button>
                  
                  <Button 
                    size="lg" 
                    variant="outline" 
                    className="border-white text-white hover:bg-white/10 text-lg px-8 py-6"
                    asChild
                  >
                    <Link href="/us/pricing">
                      View US Pricing
                    </Link>
                  </Button>
                </div>

                <p className="text-sm text-purple-200">
                  No credit card required • Cancel anytime • Trusted by US caterers nationwide
                </p>
              </div>
            </div>
          </section>

          {/* Stats Section */}
          <section className="py-16 bg-white">
            <div className="container mx-auto px-4">
              <div className="grid md:grid-cols-4 gap-8 max-w-5xl mx-auto">
                {[
                  { icon: TrendingUp, value: "35%", label: "Average Profit Increase" },
                  { icon: Clock, value: "20hrs", label: "Saved Per Week" },
                  { icon: Users, value: "500+", label: "US Caterers" },
                  { icon: DollarSign, value: "$127K", label: "Avg Annual Revenue Boost" }
                ].map((stat, index) => (
                  <Card key={index} className="text-center border-2 hover:border-purple-600 transition-colors">
                    <CardContent className="pt-6">
                      <stat.icon className="w-12 h-12 mx-auto mb-4 text-purple-600" />
                      <div className="text-3xl font-bold text-gray-900 mb-2">{stat.value}</div>
                      <div className="text-sm text-gray-600">{stat.label}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </section>

          {/* Problems We Solve - US Context */}
          <section className="py-20 bg-gray-50">
            <div className="container mx-auto px-4">
              <div className="max-w-4xl mx-auto text-center mb-16">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  We Understand US Catering Challenges
                </h2>
                <p className="text-xl text-gray-600">
                  Running a catering business in America is tough. High labor costs, tight margins, and manual processes eat into your profits.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
                {[
                  {
                    problem: "Manual quote follow-ups waste hours daily",
                    solution: "Automated email sequences boost conversion by 40%"
                  },
                  {
                    problem: "Paper-based inventory leads to $15K+ yearly waste",
                    solution: "Real-time tracking prevents spoilage and overstocking"
                  },
                  {
                    problem: "Disorganized equipment causes $8K+ replacement costs",
                    solution: "Automated tracking and shortage alerts save thousands"
                  },
                  {
                    problem: "Poor communication delays deliveries and frustrates clients",
                    solution: "GPS tracking and client portals ensure transparency"
                  }
                ].map((item, index) => (
                  <Card key={index} className="hover:shadow-lg transition-shadow">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-4 mb-4">
                        <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-red-600 font-bold">✗</span>
                        </div>
                        <p className="text-gray-700 font-medium">{item.problem}</p>
                      </div>
                      <div className="flex items-start gap-4 pl-12">
                        <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
                        <p className="text-green-700 font-semibold">{item.solution}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <section className="py-20 bg-purple-600 text-white">
            <div className="container mx-auto px-4 text-center">
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Join America's Top Caterers
              </h2>
              <p className="text-xl mb-8 max-w-2xl mx-auto text-purple-100">
                Start your 14-day free trial today. No credit card required. Cancel anytime.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button 
                  size="lg" 
                  className="bg-white text-purple-600 hover:bg-gray-100"
                  asChild
                >
                  <Link href="/auth/register">
                    Start Free Trial
                    <ArrowRight className="ml-2 w-5 h-5" />
                  </Link>
                </Button>
                <Button 
                  size="lg" 
                  variant="outline"
                  className="border-white text-white hover:bg-white/10"
                  asChild
                >
                  <Link href="/contact">
                    Schedule Demo
                  </Link>
                </Button>
              </div>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
}
