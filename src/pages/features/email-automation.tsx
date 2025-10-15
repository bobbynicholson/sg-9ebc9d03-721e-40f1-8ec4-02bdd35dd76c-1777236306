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
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import Head from "next/head";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

export default function EmailAutomationPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"]
  });

  const heroY = useTransform(scrollYProgress, [0, 0.3], [0, 100]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.3], [1, 0]);
  const contentY = useTransform(scrollYProgress, [0.1, 0.4], [50, 0]);
  const statsY = useTransform(scrollYProgress, [0.3, 0.6], [100, 0]);

  return (
    <>
      <Head>
        <title>Email Automation & Follow-Ups - CateringMS</title>
        <meta name="description" content="Automated email sequences for quote follow-ups, post-event reviews, and 12-month after-sales campaigns. Increase repeat bookings by 2x with smart email automation." />
        <meta name="keywords" content="email automation, quote follow-ups, after sales, email marketing, catering automation, client nurture" />
        <link rel="canonical" href="https://cateringms.com/features/email-automation" />
      </Head>

      <Header />

      <div className="min-h-screen bg-white" ref={containerRef}>
        <motion.div 
          className="relative overflow-hidden bg-gradient-to-br from-orange-50 via-white to-red-50"
          style={{ y: heroY, opacity: heroOpacity }}
        >
          <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.5))] bg-[size:40px_40px]" />
          
          <div className="relative container mx-auto px-4 py-12 md:py-16 lg:py-24 max-w-6xl">
            <motion.div 
              className="text-center max-w-4xl mx-auto mb-8 md:mb-12"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <Badge className="mb-4 md:mb-6 px-3 md:px-4 py-1.5 md:py-2 bg-orange-100 text-orange-700 border-orange-200 text-xs md:text-sm">
                <Mail className="w-3 h-3 md:w-4 md:h-4 mr-1.5 md:mr-2 inline" />
                Email Automation
              </Badge>
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 md:mb-6 bg-gradient-to-r from-orange-600 to-red-600 bg-clip-text text-transparent leading-tight">
                Never Miss a Follow-Up Again
              </h1>
              <p className="text-lg sm:text-xl md:text-2xl text-slate-700 mb-6 md:mb-8 px-2">
                Automated email sequences that nurture leads, convert quotes, and bring clients back for more bookings
              </p>
              <div className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-center px-4 sm:px-0">
                <Link href="/auth/register" className="w-full sm:w-auto">
                  <Button size="lg" className="w-full sm:w-auto bg-gradient-to-r from-orange-600 to-red-600 text-white px-6 md:px-8 py-4 md:py-6 text-base md:text-lg">
                    Start Free Trial
                    <ArrowRight className="w-4 h-4 md:w-5 md:h-5 ml-2" />
                  </Button>
                </Link>
                <Link href="/contact" className="w-full sm:w-auto">
                  <Button size="lg" variant="outline" className="w-full sm:w-auto px-6 md:px-8 py-4 md:py-6 text-base md:text-lg border-2">
                    See Examples
                  </Button>
                </Link>
              </div>
            </motion.div>
          </div>
        </motion.div>

        <div className="container mx-auto px-4 py-12 md:py-16 max-w-6xl">
          <motion.div 
            className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 mb-12 md:mb-16"
            style={{ y: contentY }}
          >
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4 md:mb-6">
                Set It and Forget It Marketing
              </h2>
              <p className="text-base md:text-lg text-slate-600 mb-4 md:mb-6">
                Automated emails go out at the perfect time without you lifting a finger. Quote follow-ups, event reminders, review requests, and long-term nurture campaigns all run automatically.
              </p>
              <ul className="space-y-3 md:space-y-4">
                {[
                  "Quote follow-ups at day 3, 7, and 14",
                  "Post-event review requests",
                  "12-month after-sales nurture campaign",
                  "Event reminder emails (14, 7, 3, 1 day before)",
                  "Fully customizable email templates",
                  "Track open rates and conversions"
                ].map((feature, i) => (
                  <motion.li 
                    key={i} 
                    className="flex items-start gap-3"
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <CheckCircle className="w-5 h-5 md:w-6 md:h-6 text-orange-600 shrink-0 mt-0.5 md:mt-1" />
                    <span className="text-sm md:text-base text-slate-700">{feature}</span>
                  </motion.li>
                ))}
              </ul>
            </motion.div>
            <motion.div 
              className="bg-gradient-to-br from-orange-100 to-red-100 rounded-2xl p-6 md:p-8 flex items-center justify-center min-h-[200px] md:min-h-0"
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="text-center">
                <motion.div 
                  className="text-4xl md:text-6xl font-bold text-orange-600 mb-3 md:mb-4"
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ type: "spring", duration: 0.8 }}
                >
                  2-2.5x
                </motion.div>
                <p className="text-lg md:text-xl text-slate-700 mb-1 md:mb-2">More Repeat Bookings</p>
                <p className="text-xs md:text-sm text-slate-600">Automated nurture campaigns bring clients back</p>
              </div>
            </motion.div>
          </motion.div>

          <motion.div 
            className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 mb-12 md:mb-16"
            style={{ y: statsY }}
          >
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
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.2 }}
                whileHover={{ y: -10, transition: { duration: 0.2 } }}
              >
                <Card className="border-2 hover:border-orange-300 hover:shadow-xl transition-all">
                  <CardContent className="pt-5 md:pt-6 px-4 md:px-6">
                    <div className="p-2.5 md:p-3 bg-gradient-to-br from-orange-500 to-red-500 rounded-xl w-fit mb-3 md:mb-4">
                      <benefit.icon className="w-5 h-5 md:w-6 md:h-6 text-white" />
                    </div>
                    <h3 className="text-lg md:text-xl font-bold text-slate-900 mb-2">{benefit.title}</h3>
                    <p className="text-sm md:text-base text-slate-600">{benefit.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>

          <motion.div 
            className="bg-gradient-to-br from-orange-600 to-red-600 rounded-2xl md:rounded-3xl p-6 md:p-12 text-center text-white mb-12 md:mb-16"
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 md:mb-6 px-2">
              Stop Losing Clients to Manual Follow-Ups
            </h2>
            <p className="text-base sm:text-lg md:text-xl mb-6 md:mb-8 max-w-2xl mx-auto opacity-95 px-2">
              Most quotes need 3-5 follow-ups to convert. Manual follow-ups are inconsistent and time-consuming. Automation does it perfectly, every time.
            </p>
            <Link href="/auth/register" className="inline-block w-full sm:w-auto px-4 sm:px-0">
              <Button size="lg" className="w-full sm:w-auto bg-white text-orange-600 hover:bg-orange-50 px-6 md:px-10 py-4 md:py-6 text-base md:text-lg">
                Automate Your Follow-Ups Today
                <ArrowRight className="w-4 h-4 md:w-5 md:h-5 ml-2" />
              </Button>
            </Link>
          </motion.div>

          <div className="text-center px-4">
            <p className="text-sm md:text-base text-slate-600 mb-4">
              Read about <Link href="/blog/email-automation-for-catering" className="text-orange-600 underline">email automation strategies</Link>
            </p>
          </div>
        </div>

        <Footer />
      </div>
    </>
  );
}
