import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Package, 
  ArrowRight, 
  CheckCircle, 
  AlertCircle,
  TrendingDown,
  RefreshCw
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import Head from "next/head";

export default function InventoryManagementPage() {
  return (
    <>
      <Head>
        <title>Inventory & Equipment Tracking - CateringMS</title>
        <meta name="description" content="Complete inventory management with automatic expiry alerts, equipment availability tracking, and waste reduction. Cut food waste by 45% with smart inventory control." />
        <meta name="keywords" content="catering inventory management, food tracking, equipment management, expiry alerts, waste reduction, stock control" />
        <link rel="canonical" href="https://cateringms.com/features/inventory-management" />
      </Head>

      <Header />

      <div className="min-h-screen bg-white">
        <div className="relative overflow-hidden bg-gradient-to-br from-green-50 via-white to-emerald-50">
          <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.5))] bg-[size:40px_40px]" />
          
          <div className="relative container mx-auto px-4 py-16 md:py-24 max-w-6xl">
            <div className="text-center max-w-4xl mx-auto mb-12">
              <Badge className="mb-6 px-4 py-2 bg-green-100 text-green-700 border-green-200">
                <Package className="w-4 h-4 mr-2 inline" />
                Inventory Management
              </Badge>
              <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
                Never Run Out or Throw Away Food Again
              </h1>
              <p className="text-xl md:text-2xl text-slate-700 mb-8">
                Track every ingredient and piece of equipment with automatic expiry alerts and availability monitoring
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/auth/register">
                  <Button size="lg" className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-8 py-6 text-lg">
                    Start Free Trial
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                <Link href="/contact">
                  <Button size="lg" variant="outline" className="px-8 py-6 text-lg border-2">
                    See Demo
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-16 max-w-6xl">
          <div className="grid md:grid-cols-2 gap-12 mb-16">
            <div>
              <h2 className="text-3xl font-bold text-slate-900 mb-6">
                Know Exactly What You Have, When You Have It
              </h2>
              <p className="text-lg text-slate-600 mb-6">
                Stop guessing what's in stock. Track ingredients, equipment, and supplies in real-time with automatic alerts before anything expires or runs out.
              </p>
              <ul className="space-y-4">
                {[
                  "Real-time stock level tracking",
                  "Automatic expiry date alerts",
                  "Equipment availability calendar",
                  "Cleaning schedule integration",
                  "Purchase history and supplier tracking",
                  "Waste reduction analytics"
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle className="w-6 h-6 text-green-600 shrink-0 mt-1" />
                    <span className="text-slate-700">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-gradient-to-br from-green-100 to-emerald-100 rounded-2xl p-8 flex items-center justify-center">
              <div className="text-center">
                <div className="text-6xl font-bold text-green-600 mb-4">45-50%</div>
                <p className="text-xl text-slate-700">Less Food Waste</p>
                <p className="text-sm text-slate-600 mt-2">Reduce waste with expiry tracking and smart ordering</p>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-16">
            {[
              {
                icon: AlertCircle,
                title: "Expiry Alerts",
                description: "Get notified 7, 3, and 1 day before items expire so you can use them in time"
              },
              {
                icon: RefreshCw,
                title: "Equipment Tracking",
                description: "See what's available, in use, or being cleaned at any time"
              },
              {
                icon: TrendingDown,
                title: "Waste Reduction",
                description: "Analytics show what's being wasted so you can order smarter"
              }
            ].map((benefit, i) => (
              <Card key={i} className="border-2 hover:border-green-300 hover:shadow-xl transition-all">
                <CardContent className="pt-6">
                  <div className="p-3 bg-gradient-to-br from-green-500 to-emerald-500 rounded-xl w-fit mb-4">
                    <benefit.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">{benefit.title}</h3>
                  <p className="text-slate-600">{benefit.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="bg-gradient-to-br from-green-600 to-emerald-600 rounded-3xl p-12 text-center text-white mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Stop Throwing Money in the Bin
            </h2>
            <p className="text-xl mb-8 max-w-2xl mx-auto opacity-95">
              Food waste kills your margins. CateringMS tracks expiry dates and helps you use ingredients before they go bad.
            </p>
            <Link href="/auth/register">
              <Button size="lg" className="bg-white text-green-600 hover:bg-green-50 px-10 py-6 text-lg">
                Start Saving Money Today
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>

          <div className="text-center">
            <p className="text-slate-600 mb-4">
              Learn more about <Link href="/blog/inventory-management-catering" className="text-green-600 underline">inventory management best practices</Link>
            </p>
          </div>
        </div>

        <Footer />
      </div>
    </>
  );
}
