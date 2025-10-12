import { useEffect, useState } from "react";
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
  X,
  Sparkles,
  Calendar,
  Rocket,
  Bell
} from "lucide-react";

export default function UKHomePage() {
  const router = useRouter();
  const [showPopup, setShowPopup] = useState(false);
  const [cateringCount, setCateringCount] = useState(10);
  const [daysUntilLaunch, setDaysUntilLaunch] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowPopup(true);
    }, 2000);

    const launchDate = new Date("2026-02-01");
    const today = new Date();
    const diffTime = Math.abs(launchDate.getTime() - today.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    setDaysUntilLaunch(diffDays);

    const countInterval = setInterval(() => {
      setCateringCount(prev => {
        const newCount = prev + Math.floor(Math.random() * 2);
        return newCount > 50 ? 50 : newCount;
      });
    }, 30000);

    return () => {
      clearTimeout(timer);
      clearInterval(countInterval);
    };
  }, []);

  return (
    <>
      <Head>
        <title>CateringMS - The Ultimate Catering Management Software for UK Caterers | Beta Launch Feb 2026</title>
        <meta 
          name="description" 
          content="Transform your British catering business with CateringMS. Join our beta programme launching February 1, 2026. Perfect timing for your new financial year planning. £24k average revenue boost."
        />
        <meta name="keywords" content="catering software UK, catering management system, British catering business, UK catering software, event catering management, beta launch 2026" />
        
        <link rel="alternate" hrefLang="en-GB" href="https://cateringms.com/uk" />
        <link rel="alternate" hrefLang="en-US" href="https://cateringms.com/us" />
        <link rel="alternate" hrefLang="en-ZA" href="https://cateringms.com" />
        <link rel="alternate" hrefLang="x-default" href="https://cateringms.com" />

        <meta property="og:title" content="CateringMS - UK Catering Management Software | Beta Launch Feb 2026" />
        <meta property="og:description" content="Join Britain's most anticipated catering management platform. Beta launching February 1, 2026." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://cateringms.com/uk" />
        
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
                "price": "54",
                "priceCurrency": "GBP"
              },
              "operatingSystem": "Web",
              "description": "Complete catering management software for UK businesses launching February 2026"
            })
          }}
        />
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-purple-50 via-white to-gray-50">
        <Header />

        <main>
          <section className="relative overflow-hidden bg-gradient-to-br from-purple-600 via-purple-700 to-indigo-800 text-white py-20 md:py-32">
            <div className="absolute inset-0 bg-grid-white/10"></div>
            
            <div className="container mx-auto px-4 relative z-10">
              <div className="max-w-4xl mx-auto text-center">
                <div className="inline-flex items-center gap-3 mb-6 bg-white/20 text-white border border-white/30 backdrop-blur-sm px-6 py-3 rounded-full">
                  <span className="text-2xl">🇬🇧</span>
                  <span className="font-semibold">Launching in the UK</span>
                  <Badge className="bg-green-500 text-white border-0 animate-pulse">
                    Beta Now Open
                  </Badge>
                </div>
                
                <h1 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
                  The Ultimate Catering Management Solution
                </h1>
                
                <p className="text-xl md:text-2xl mb-8 text-purple-100">
                  Transform your UK catering business with automated workflows, real-time tracking, and intelligent operations management
                </p>

                <div className="inline-flex items-center gap-2 mb-8 bg-green-500/20 border border-green-400 rounded-full px-6 py-3 backdrop-blur-sm">
                  <Rocket className="w-5 h-5 text-green-300" />
                  <span className="font-semibold text-green-100">
                    Official Launch: February 1, 2026 | {daysUntilLaunch} days to go
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
                  <Button 
                    size="lg" 
                    className="bg-white text-purple-600 hover:bg-gray-100 text-lg px-8 py-6 shadow-2xl hover:shadow-purple-500/50 transition-all"
                    asChild
                  >
                    <Link href="/auth/register">
                      Join Beta Programme
                      <Sparkles className="ml-2 w-5 h-5" />
                    </Link>
                  </Button>
                  
                  <Button 
                    size="lg" 
                    variant="outline" 
                    className="border-white text-white hover:bg-white/10 text-lg px-8 py-6"
                    asChild
                  >
                    <Link href="/uk/pricing">
                      View UK Pricing
                    </Link>
                  </Button>
                </div>

                <p className="text-sm text-purple-200">
                  No credit card required • Cancel anytime • Perfect for your 2026/27 financial year
                </p>
              </div>
            </div>
          </section>

          <section className="py-16 bg-white">
            <div className="container mx-auto px-4">
              <div className="grid md:grid-cols-4 gap-8 max-w-5xl mx-auto">
                {[
                  { icon: TrendingUp, value: "35%", label: "Average Profit Increase" },
                  { icon: Clock, value: "20hrs", label: "Saved Per Week" },
                  { 
                    icon: Users, 
                    value: `${cateringCount}+`, 
                    label: "Beta Caterers",
                    badge: "Live Counter"
                  },
                  { icon: DollarSign, value: "£24K", label: "Avg Annual Revenue Boost" }
                ].map((stat, index) => (
                  <Card key={index} className="text-center border-2 hover:border-purple-600 transition-colors relative overflow-hidden">
                    <CardContent className="pt-6">
                      {stat.badge && (
                        <Badge className="absolute top-2 right-2 bg-green-500 text-white text-xs animate-pulse">
                          {stat.badge}
                        </Badge>
                      )}
                      <stat.icon className="w-12 h-12 mx-auto mb-4 text-purple-600" />
                      <div className="text-3xl font-bold text-gray-900 mb-2">{stat.value}</div>
                      <div className="text-sm text-gray-600">{stat.label}</div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </section>

          <section className="py-20 bg-gradient-to-br from-green-50 to-emerald-50">
            <div className="container mx-auto px-4">
              <div className="max-w-4xl mx-auto">
                <div className="text-center mb-12">
                  <Badge className="mb-4 bg-green-100 text-green-700 border-green-200 px-4 py-2">
                    <Calendar className="w-4 h-4 mr-2 inline" />
                    Perfect Timing for Your Financial Year
                  </Badge>
                  <h2 className="text-3xl md:text-4xl font-bold mb-4">
                    Why Launch After the December Rush?
                  </h2>
                  <p className="text-xl text-gray-600">
                    We know December is your busiest time. That's why we're launching February 1st, giving you the perfect start to your 2026/27 financial year.
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {[
                    {
                      title: "Avoid the Christmas Chaos",
                      description: "No system changes during your peak season. Focus on your December bookings while we perfect the platform."
                    },
                    {
                      title: "Fresh Start for New Financial Year",
                      description: "Launch with clean books and new processes. Perfect timing for tax planning and business improvements."
                    },
                    {
                      title: "Beta Test with Real Events",
                      description: "Join our beta programme now. Test the system with real bookings before the official launch."
                    },
                    {
                      title: "Lock in Founding Prices",
                      description: "Beta members get lifetime founding member rates. Never pay increased prices as we scale."
                    }
                  ].map((item, index) => (
                    <Card key={index} className="border-2 border-green-200 bg-white hover:shadow-lg transition-shadow">
                      <CardContent className="pt-6">
                        <div className="flex items-start gap-4">
                          <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-1" />
                          <div>
                            <h3 className="font-bold text-lg mb-2 text-gray-900">{item.title}</h3>
                            <p className="text-gray-600">{item.description}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="py-20 bg-gray-50">
            <div className="container mx-auto px-4">
              <div className="max-w-4xl mx-auto text-center mb-16">
                <h2 className="text-3xl md:text-4xl font-bold mb-4">
                  We Understand UK Catering Challenges
                </h2>
                <p className="text-xl text-gray-600">
                  Running a catering business in Britain is demanding. High labour costs, tight margins, and manual processes eat into your profits.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-8 max-w-6xl mx-auto">
                {[
                  {
                    problem: "Manual quote follow-ups waste hours daily",
                    solution: "Automated email sequences boost conversion by 40%"
                  },
                  {
                    problem: "Paper-based inventory leads to £11K+ yearly waste",
                    solution: "Real-time tracking prevents spoilage and overstocking"
                  },
                  {
                    problem: "Disorganised equipment causes £6K+ replacement costs",
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

          <section className="py-20 bg-purple-600 text-white pb-0">
            <div className="container mx-auto px-4 text-center pb-20">
              <h2 className="text-3xl md:text-4xl font-bold mb-6">
                Join Britain's Beta Caterers
              </h2>
              <p className="text-xl mb-8 max-w-2xl mx-auto text-purple-100">
                Be among the first {cateringCount} UK catering businesses to test CateringMS. Lock in founding member rates before our February launch.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button 
                  size="lg" 
                  className="bg-white text-purple-600 hover:bg-gray-100 shadow-2xl"
                  asChild
                >
                  <Link href="/auth/register">
                    Apply for Beta Access
                    <Sparkles className="ml-2 w-5 h-5" />
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

        {showPopup && (
          <div 
            className="fixed bottom-6 right-6 w-96 max-w-[calc(100vw-3rem)] z-50 animate-slide-up"
            style={{
              animation: "slideUp 0.5s ease-out"
            }}
          >
            <Card className="border-4 border-purple-500 shadow-2xl bg-gradient-to-br from-purple-600 to-pink-600 text-white overflow-hidden">
              <CardContent className="pt-6 pb-6 relative">
                <button
                  onClick={() => setShowPopup(false)}
                  className="absolute top-3 right-3 text-white/80 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-yellow-400 via-pink-400 to-purple-400 animate-pulse"></div>

                <div className="flex items-start gap-4 mb-4">
                  <div className="p-3 bg-white/20 rounded-full backdrop-blur-sm">
                    <Bell className="w-6 h-6 text-white animate-bounce" />
                  </div>
                  <div>
                    <h3 className="font-bold text-xl mb-2">🇬🇧 UK Launch Announcement!</h3>
                    <p className="text-white/90 text-sm mb-3">
                      We're launching February 1, 2026! Perfect timing after the December rush for your new financial year.
                    </p>
                  </div>
                </div>

                <div className="bg-white/20 rounded-lg p-4 mb-4 backdrop-blur-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold">Beta Members:</span>
                    <Badge className="bg-green-500 text-white border-0">
                      {cateringCount} Caterers
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Launch Countdown:</span>
                    <span className="text-sm font-bold">{daysUntilLaunch} Days</span>
                  </div>
                </div>

                <div className="space-y-2 mb-4 text-sm">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    <span>£24K average annual revenue boost</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    <span>Lock in founding member rates forever</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    <span>Full access during beta testing</span>
                  </div>
                </div>

                <Button 
                  className="w-full bg-white text-purple-600 hover:bg-gray-100 font-bold shadow-lg"
                  asChild
                >
                  <Link href="/auth/register">
                    Join Beta Now
                    <Rocket className="ml-2 w-4 h-4" />
                  </Link>
                </Button>

                <p className="text-xs text-white/70 text-center mt-3">
                  Limited to first 50 UK caterers
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        <style jsx>{`
          @keyframes slideUp {
            from {
              transform: translateY(100%);
              opacity: 0;
            }
            to {
              transform: translateY(0);
              opacity: 1;
            }
          }
          .animate-slide-up {
            animation: slideUp 0.5s ease-out;
          }
        `}</style>
      </div>
    </>
  );
}
