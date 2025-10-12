import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Mail, 
  ArrowRight, 
  CheckCircle, 
  Zap,
  RefreshCw,
  TrendingUp
} from "lucide-react";
import { Footer } from "@/components/Footer";
import Head from "next/head";

export default function EmailAutomationPage() {
  return (
    <>
      <Head>
        <title>Email Automation & Follow-Ups - CaterOS</title>
        <meta name="description" content="Automated email sequences for quote follow-ups, post-event reviews, and 12-month after-sales campaigns. Increase repeat bookings by 2x with smart email automation." />
        <meta name="keywords" content="email automation, quote follow-ups, after sales, email marketing, catering automation, client nurture" />
        <link rel="canonical" href="https://cateros.co.za/features/email-automation" />
      </Head>

      <div className="min-h-screen bg-white">
        <div className="relative overflow-hidden bg-gradient-to-br from-orange-50 via-white to-red-50">
          <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.5))] bg-[size:40px_40px]" />
          
          <div className="relative container mx-auto px-4 py-16 md:py-24 max-w-6xl">
            <div className="text-center max-w-4xl mx-auto mb-12">
              <Badge className="mb-6 px-4 py-2 bg-orange-100 text-orange-700 border-orange-200">
                <Mail className="w-4 h-4 mr-2 inline" />
                Email Automation
              </Badge>
              <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent">
                Never Miss a Follow-Up Again
              </h1>
              <p className="text-xl md:text-2xl text-slate-700 mb-8">
                Automated email sequences that nurture leads, convert quotes, and bring clients back for more bookings
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/auth/register">
                  <Button size="lg" className="bg-gradient-to-r from-orange-600 to-red-600 text-white px-8 py-6 text-lg">
                    Start Free Trial
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                <Link href="/contact">
                  <Button size="lg" variant="outline" className="px-8 py-6 text-lg border-2">
                    See Examples
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
                Set It and Forget It Marketing
              </h2>
              <p className="text-lg text-slate-600 mb-6">
                Automated emails go out at the perfect time without you lifting a finger. Quote follow-ups, event reminders, review requests, and long-term nurture campaigns all run automatically.
              </p>
              <ul className="space-y-4">
                {[
                  "Quote follow-ups at day 3, 7, and 14",
                  "Post-event review requests",
                  "12-month after-sales nurture campaign",
                  "Event reminder emails (14, 7, 3, 1 day before)",
                  "Fully customizable email templates",
                  "Track open rates and conversions"
                ].map((feature, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle className="w-6 h-6 text-orange-600 shrink-0 mt-1" />
                    <span className="text-slate-700">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-gradient-to-br from-orange-100 to-red-100 rounded-2xl p-8 flex items-center justify-center">
              <div className="text-center">
                <div className="text-6xl font-bold text-orange-600 mb-4">2-2.5x</div>
                <p className="text-xl text-slate-700">More Repeat Bookings</p>
                <p className="text-sm text-slate-600 mt-2">Automated nurture campaigns bring clients back</p>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-16">
            {[
              {
                icon: Zap,
                title: "Instant Follow-Ups",
                description: "Quote sent? Follow-up emails go out automatically at day 3, 7, and 14"
              },
              {
                icon: RefreshCw,
                title: "12-Month Nurture",
                description: "Keep clients engaged for a full year after their event with smart campaigns"
              },
              {
                icon: TrendingUp,
                title: "Higher Conversions",
                description: "Automated follow-ups convert 2x more quotes than manual processes"
              }
            ].map((benefit, i) => (
              <Card key={i} className="border-2 hover:border-orange-300 hover:shadow-xl transition-all">
                <CardContent className="pt-6">
                  <div className="p-3 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl w-fit mb-4">
                    <benefit.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">{benefit.title}</h3>
                  <p className="text-slate-600">{benefit.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="bg-gradient-to-br from-orange-600 to-red-600 rounded-3xl p-12 text-center text-white mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Stop Losing Clients to Manual Follow-Ups
            </h2>
            <p className="text-xl mb-8 max-w-2xl mx-auto opacity-95">
              Most quotes need 3-5 follow-ups to convert. Manual follow-ups are inconsistent and time-consuming. Automation does it perfectly, every time.
            </p>
            <Link href="/auth/register">
              <Button size="lg" className="bg-white text-orange-600 hover:bg-orange-50 px-10 py-6 text-lg">
                Automate Your Follow-Ups Today
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>

          <div className="text-center">
            <p className="text-slate-600 mb-4">
              Read about <Link href="/blog/email-automation-for-catering" className="text-orange-600 underline">email automation strategies</Link>
            </p>
          </div>
        </div>

        <Footer />
      </div>
    </>
  );
}