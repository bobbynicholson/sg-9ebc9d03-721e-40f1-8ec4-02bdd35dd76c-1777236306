import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  CheckCircle,
  ArrowRight,
  Zap,
  DollarSign,
  MessageCircle,
  MapPin,
  CreditCard,
  Mail,
  Calendar,
  Globe,
  Settings,
  ExternalLink,
  Star,
  TrendingUp,
  Shield,
  Clock
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import Head from "next/head";
import { useAuth } from "@/contexts/AuthContext";

interface IntegrationsPageProps {
  companySlug?: string;
  portal?: string;
  currentRoute?: string;
}

export default function IntegrationsPage({ companySlug: propCompanySlug }: IntegrationsPageProps = {}) {
  const { user } = useAuth();
  const companySlug = propCompanySlug || user?.company_slug;

  const integrations = [
    {
      name: "Xero Accounting",
      description: "Sync invoices, expenses, and financial data automatically with Xero. Perfect for seamless accounting and tax compliance.",
      icon: DollarSign,
      category: "Accounting",
      status: "available",
      features: [
        "Automatic invoice sync",
        "Expense tracking",
        "Real-time financial data",
        "Tax compliance reports",
        "Bank reconciliation"
      ],
      benefits: "Save 10+ hours monthly on accounting",
      gradient: "from-blue-500 to-cyan-500",
      setupTime: "5 minutes",
      pricing: "Included in Pro plan"
    },
    {
      name: "WhatsApp Business",
      description: "Send automated order updates, delivery notifications, and customer communications via WhatsApp. Customers love the convenience.",
      icon: MessageCircle,
      category: "Communication",
      status: "available",
      features: [
        "Order confirmation messages",
        "Delivery status updates",
        "Payment reminders",
        "Review requests",
        "Custom message templates"
      ],
      benefits: "90% open rate vs 20% email",
      gradient: "from-green-500 to-emerald-500",
      setupTime: "10 minutes",
      pricing: "Included in all plans"
    },
    {
      name: "Google Maps",
      description: "Intelligent route optimization, live GPS tracking, and accurate address validation. Get drivers to venues faster with optimized routes.",
      icon: MapPin,
      category: "Logistics",
      status: "available",
      features: [
        "Route optimization",
        "Live GPS tracking",
        "Address autocomplete",
        "Distance calculations",
        "Traffic updates"
      ],
      benefits: "Save 20-25% on fuel costs",
      gradient: "from-red-500 to-orange-500",
      setupTime: "Instant",
      pricing: "Included in all plans"
    },
    {
      name: "PayFast",
      description: "Accept payments from South African customers with ease. Instant EFT, cards, and more payment methods.",
      icon: CreditCard,
      category: "Payments",
      status: "available",
      features: [
        "Instant EFT",
        "Card payments",
        "Recurring billing",
        "Payment links",
        "Automatic reconciliation"
      ],
      benefits: "Get paid 3x faster",
      gradient: "from-purple-500 to-pink-500",
      setupTime: "5 minutes",
      pricing: "Standard PayFast fees apply"
    },
    {
      name: "Stripe",
      description: "Accept international payments with the world's leading payment platform. Perfect for expanding globally.",
      icon: CreditCard,
      category: "Payments",
      status: "available",
      features: [
        "Global card acceptance",
        "Multi-currency support",
        "Apple Pay & Google Pay",
        "Subscription billing",
        "Fraud protection"
      ],
      benefits: "Expand to 135+ countries",
      gradient: "from-indigo-500 to-purple-500",
      setupTime: "5 minutes",
      pricing: "Standard Stripe fees apply"
    },
    {
      name: "Google Calendar",
      description: "Sync all your events and bookings to Google Calendar. Never miss a function again.",
      icon: Calendar,
      category: "Productivity",
      status: "coming-soon",
      features: [
        "Two-way calendar sync",
        "Automatic event updates",
        "Team calendar sharing",
        "Reminder notifications",
        "Conflict detection"
      ],
      benefits: "Perfect schedule visibility",
      gradient: "from-yellow-500 to-amber-500",
      setupTime: "2 minutes",
      pricing: "Coming soon"
    },
    {
      name: "Resend Email",
      description: "Reliable transactional email delivery for quotes, invoices, and automated follow-ups.",
      icon: Mail,
      category: "Communication",
      status: "available",
      features: [
        "Email templates",
        "Delivery tracking",
        "Open rate analytics",
        "Bounce management",
        "Custom domains"
      ],
      benefits: "99.9% delivery rate",
      gradient: "from-cyan-500 to-blue-500",
      setupTime: "Instant",
      pricing: "Included in all plans"
    },
    {
      name: "Zapier",
      description: "Connect CateringMS to 5,000+ apps. Automate workflows between your favorite tools.",
      icon: Zap,
      category: "Automation",
      status: "coming-soon",
      features: [
        "5,000+ app connections",
        "Custom workflows",
        "Trigger-based automation",
        "Multi-step workflows",
        "Real-time sync"
      ],
      benefits: "Unlimited automation possibilities",
      gradient: "from-orange-500 to-red-500",
      setupTime: "Varies",
      pricing: "Coming soon"
    }
  ];

  const categories = ["All", "Accounting", "Communication", "Logistics", "Payments", "Productivity", "Automation"];

  const benefits = [
    {
      icon: Clock,
      title: "Save Time",
      description: "Automated data sync eliminates manual data entry"
    },
    {
      icon: Shield,
      title: "Secure & Reliable",
      description: "Enterprise-grade security for all integrations"
    },
    {
      icon: TrendingUp,
      title: "Scale Easily",
      description: "Add new tools as your business grows"
    },
    {
      icon: Zap,
      title: "Easy Setup",
      description: "Most integrations ready in under 5 minutes"
    }
  ];

  return (
    <>
      <Head>
        <title>Integrations - Connect Your Favorite Tools | CateringMS</title>
        <meta name="description" content="Connect CateringMS with Xero, WhatsApp Business, Google Maps, PayFast, Stripe, and more. Automate workflows and scale your catering business seamlessly." />
        <meta name="keywords" content="catering software integrations, xero accounting, whatsapp business, google maps, payfast, stripe, payment integrations" />
        <link rel="canonical" href="https://cateringms.com/integrations" />
      </Head>

      <Header />

      <div className="min-h-screen bg-white">
        <div className="relative overflow-hidden bg-gradient-to-br from-purple-50 via-white to-pink-50">
          <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.5))] bg-[size:40px_40px]" />
        
          <div className="relative container mx-auto px-4 py-16 md:py-24 max-w-7xl">
            <div className="text-center max-w-4xl mx-auto">
              <Badge className="mb-6 px-4 py-2 bg-purple-100 text-purple-700 border-purple-200 text-sm shadow-sm">
                <Zap className="w-4 h-4 mr-2 inline" />
                Integrations Marketplace
              </Badge>
              <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold mb-6 bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 bg-clip-text text-transparent leading-tight">
                Connect Your Favorite Tools
              </h1>
              <p className="text-xl md:text-2xl text-slate-700 mb-8 leading-relaxed">
                Seamlessly integrate with the apps you already use. Automate workflows and scale your business effortlessly.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/auth/register">
                  <Button size="lg" className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-8 py-6 text-lg hover:shadow-2xl transition-all hover:scale-105">
                    Get Started Free
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-16 md:py-24 max-w-7xl">
          <div className="grid md:grid-cols-4 gap-6 mb-16">
            {benefits.map((benefit, index) => (
              <Card key={index} className="border-0 shadow-lg text-center hover:shadow-xl transition-all">
                <CardContent className="pt-8 pb-8">
                  <div className="flex justify-center mb-4">
                    <div className="p-3 bg-gradient-to-br from-purple-100 to-pink-100 rounded-2xl">
                      <benefit.icon className="w-6 h-6 text-purple-600" />
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">{benefit.title}</h3>
                  <p className="text-sm text-slate-600">{benefit.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4 text-center">
              Available Integrations
            </h2>
            <p className="text-lg text-slate-600 text-center mb-8">
              Connect the tools you love in minutes
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {integrations.map((integration, index) => (
              <Card key={index} className="border-2 border-slate-200 hover:border-purple-300 hover:shadow-xl transition-all group relative overflow-hidden">
                {integration.status === "coming-soon" && (
                  <div className="absolute top-4 right-4 z-10">
                    <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">
                      Coming Soon
                    </Badge>
                  </div>
                )}
                <CardContent className="pt-8 pb-8">
                  <div className="flex items-start gap-4 mb-6">
                    <div className={`p-4 bg-gradient-to-br ${integration.gradient} rounded-2xl shadow-lg group-hover:scale-110 transition-transform`}>
                      <integration.icon className="w-8 h-8 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-slate-900 mb-1">{integration.name}</h3>
                      <Badge className="bg-slate-100 text-slate-700 text-xs">
                        {integration.category}
                      </Badge>
                    </div>
                  </div>

                  <p className="text-slate-600 mb-4 leading-relaxed">
                    {integration.description}
                  </p>

                  <div className="space-y-2 mb-6">
                    {integration.features.slice(0, 3).map((feature, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                        <span className="text-sm text-slate-700">{feature}</span>
                      </div>
                    ))}
                    {integration.features.length > 3 && (
                      <p className="text-sm text-slate-500 pl-6">
                        +{integration.features.length - 3} more features
                      </p>
                    )}
                  </div>

                  <div className="space-y-3 mb-6">
                    <Badge className={`bg-gradient-to-r ${integration.gradient} text-white border-0 w-full justify-start`}>
                      <Star className="w-4 h-4 mr-2" />
                      {integration.benefits}
                    </Badge>
                    <div className="flex gap-2">
                      <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-xs">
                        <Clock className="w-3 h-3 mr-1" />
                        {integration.setupTime}
                      </Badge>
                      <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-xs">
                        {integration.pricing}
                      </Badge>
                    </div>
                  </div>

                  {integration.status === "available" ? (
                    <Link href="/client/settings">
                      <Button className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:shadow-lg">
                        Connect Now
                        <ExternalLink className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                  ) : (
                    <Button disabled className="w-full bg-slate-100 text-slate-400">
                      Coming Soon
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="relative py-16 md:py-24 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900" />
          <div className="absolute inset-0 bg-grid-white/5 [mask-image:linear-gradient(0deg,rgba(255,255,255,0.1),rgba(255,255,255,0.05))] bg-[size:40px_40px]" />
        
          <div className="relative container mx-auto px-4 max-w-4xl text-center">
            <Badge className="mb-6 px-4 py-2 bg-purple-500/20 text-purple-200 border-purple-400/30 text-sm">
              <Settings className="w-4 h-4 mr-2 inline" />
              Need a Custom Integration?
            </Badge>
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
              We'll Build It For You
            </h2>
            <p className="text-xl text-slate-300 mb-8 leading-relaxed">
              Have a specific tool you need to connect? Our team can build custom integrations 
              tailored to your business needs. Contact us to discuss your requirements.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/contact">
                <Button size="lg" className="bg-white text-purple-600 hover:bg-purple-50 px-10 py-6 text-lg shadow-2xl hover:scale-105 transition-all">
                  Request Custom Integration
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link href="/support">
                <Button size="lg" variant="outline" className="border-2 border-white text-white hover:bg-white/10 px-10 py-6 text-lg">
                  Contact Support
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 py-16 md:py-24">
          <div className="container mx-auto px-4 max-w-6xl">
            <Card className="border-0 shadow-2xl bg-gradient-to-r from-purple-600 to-pink-600 text-white">
              <CardContent className="py-12 px-8 text-center">
                <h3 className="text-3xl md:text-4xl font-bold mb-6">
                  Ready to Connect Your Tools?
                </h3>
                <p className="text-xl text-purple-100 mb-8 max-w-2xl mx-auto">
                  Start your free trial and connect all your favorite apps in minutes. No credit card required.
                </p>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link href={companySlug ? `/${companySlug}/auth/register` : "/auth/register"}>
                    <Button size="lg" className="bg-white text-purple-600 hover:bg-purple-50 px-10 py-6 text-lg shadow-2xl hover:scale-105 transition-all">
                      Start Free Trial
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </Button>
                  </Link>
                  <Link href="/pricing">
                    <Button size="lg" variant="outline" className="border-2 border-white text-white hover:bg-white/10 px-10 py-6 text-lg">
                      View Pricing
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Footer />
      </div>
    </>
  );
}
