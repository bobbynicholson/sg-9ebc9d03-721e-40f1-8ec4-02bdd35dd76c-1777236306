import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  ArrowRight, 
  CheckCircle, 
  TrendingUp,
  FileText,
  Clock,
  Target,
  Zap
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import Head from "next/head";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

export default function LeadManagementPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  });

  // Parallax transforms for different layers
  const heroY = useTransform(scrollYProgress, [0, 0.3], [0, 100]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.3], [1, 0]);
  const contentY = useTransform(scrollYProgress, [0.1, 0.4], [50, 0]);
  const statsY = useTransform(scrollYProgress, [0.3, 0.6], [100, 0]);

  return (
    <>
      <Head>
        <title>Lead Management & Quote Generation - CateringMS</title>
        <meta name="description" content="Capture leads automatically, generate professional quotes in 60 seconds, and track conversion rates in real-time. Increase your quote-to-booking conversion by 2x with CateringMS." />
        <meta name="keywords" content="catering lead management, quote generation, lead tracking, sales pipeline, catering CRM" />
        <link rel="canonical" href="https://cateringms.com/features/lead-management" />
      </Head>

      <Header />

      <div className="min-h-screen bg-white" ref={containerRef}>
        <motion.div 
          className="relative overflow-hidden bg-gradient-to-br from-blue-50 via-white to-cyan-50"
          style={{ y: heroY, opacity: heroOpacity }}
        >
          <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.5))] bg-[size:40px_40px]" />
          
          <div className="relative container mx-auto px-4 py-16 md:py-24 max-w-6xl">
            <motion.div 
              className="text-center max-w-4xl mx-auto mb-12"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <Badge className="mb-6 px-4 py-2 bg-blue-100 text-blue-700 border-blue-200">
                <Users className="w-4 h-4 mr-2 inline" />
                Lead Management
              </Badge>
              <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                Turn More Leads Into Paying Clients
              </h1>
              <p className="text-xl md:text-2xl text-slate-700 mb-8">
                Capture leads automatically, generate quotes in 60 seconds, and increase conversions with smart follow-ups
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/company-signup">
                  <Button size="lg" className="bg-gradient-to-r from-blue-600 to-cyan-600 text-white px-8 py-6 text-lg">
                    Start Free Trial
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                <Link href="/contact">
                  <Button size="lg" variant="outline" className="px-8 py-6 text-lg border-2">
                    Schedule Demo
                  </Button>
                </Link>
              </div>
            </motion.div>
          </div>
        </motion.div>

        <div className="container mx-auto px-4 py-16 max-w-6xl">
          <motion.div 
            className="grid md:grid-cols-2 gap-12 mb-16"
            style={{ y: contentY }}
          >
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="text-3xl font-bold text-slate-900 mb-6">
                Never Lose a Lead Again
              </h2>
              <p className="text-lg text-slate-600 mb-6">
                Every inquiry matters. CateringMS captures leads from your website, phone calls, and manual entry, then automatically guides them through your sales pipeline.
              </p>
              <ul className="space-y-4">
                {[
                  "Automatic lead capture from website forms",
                  "Generate professional quotes in under 60 seconds",
                  "Automated follow-up email sequences",
                  "Real-time conversion tracking",
                  "Smart lead scoring and prioritization",
                  "Complete lead history and communication log"
                ].map((feature, i) => (
                  <motion.li 
                    key={i} 
                    className="flex items-start gap-3"
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <CheckCircle className="w-6 h-6 text-blue-600 shrink-0 mt-1" />
                    <span className="text-slate-700">{feature}</span>
                  </motion.li>
                ))}
              </ul>
            </motion.div>
            <motion.div 
              className="bg-gradient-to-br from-blue-100 to-cyan-100 rounded-2xl p-8 flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="text-center">
                <motion.div 
                  className="text-6xl font-bold text-blue-600 mb-4"
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ type: "spring", duration: 0.8 }}
                >
                  2-2.5x
                </motion.div>
                <p className="text-xl text-slate-700">Higher Conversion Rate</p>
                <p className="text-sm text-slate-600 mt-2">Industry data shows automated follow-ups double conversions</p>
              </div>
            </motion.div>
          </motion.div>

          <motion.div 
            className="grid md:grid-cols-3 gap-6 mb-16"
            style={{ y: statsY }}
          >
            {[
              {
                icon: Clock,
                title: "60 Second Quotes",
                description: "Generate professional, itemized quotes faster than your competitors can answer the phone"
              },
              {
                icon: Target,
                title: "Smart Follow-Ups",
                description: "Automated sequences at day 3, 7, and 14 with personalized messaging"
              },
              {
                icon: TrendingUp,
                title: "Real-Time Analytics",
                description: "See exactly where leads drop off and optimize your conversion funnel"
              }
            ].map((benefit, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.2 }}
                whileHover={{ y: -10, transition: { duration: 0.2 } }}
              >
                <Card className="border-2 hover:border-blue-300 hover:shadow-xl transition-all h-full">
                  <CardContent className="pt-6">
                    <div className="p-3 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl w-fit mb-4">
                      <benefit.icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-2">{benefit.title}</h3>
                    <p className="text-slate-600">{benefit.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>

          <motion.div 
            className="bg-gradient-to-br from-blue-600 to-cyan-600 rounded-3xl p-12 text-center text-white mb-16"
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Stop Losing Leads to Slow Responses
            </h2>
            <p className="text-xl mb-8 max-w-2xl mx-auto opacity-95">
              The faster you respond, the higher your conversion rate. CateringMS helps you respond to every lead within minutes, not hours.
            </p>
            <Link href="/company-signup">
              <Button size="lg" className="bg-white text-blue-600 hover:bg-blue-50 px-10 py-6 text-lg">
                Start Converting More Leads Today
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </motion.div>

          <div className="text-center">
            <p className="text-slate-600 mb-4">
              See how other catering businesses are <Link href="/blog/improve-quote-conversion-rates" className="text-blue-600 underline">improving their quote conversion rates</Link>
            </p>
          </div>
        </div>

        <Footer />
      </div>
    </>
  );
}
