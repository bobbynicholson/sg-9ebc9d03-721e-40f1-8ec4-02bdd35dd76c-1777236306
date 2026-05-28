import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  MapPin, 
  ArrowRight, 
  CheckCircle, 
  Bell,
  Navigation,
  Clock
} from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import Head from "next/head";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

export default function GPSTrackingPage() {
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
        <title>GPS tracking for real-time delivery - CateringMS</title>
        <meta name="description" content="Live GPS tracking for catering deliveries. Clients track their order in real-time, drivers share location automatically, and admin monitors all deliveries from one dashboard. Reduce tracking calls by 65%." />
        <meta name="keywords" content="GPS tracking catering, delivery tracking, real-time location, driver tracking, catering delivery management" />
        <link rel="canonical" href="https://cateringms.com/features/gps-tracking" />
      </Head>

      <Header />

      <div className="min-h-screen bg-white" ref={containerRef}>
        <motion.div 
          className="relative overflow-hidden bg-gradient-to-br from-red-50 via-white to-orange-50"
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
              <Badge className="mb-6 px-4 py-2 bg-red-100 text-red-700 border-red-200">
                <MapPin className="w-4 h-4 mr-2 inline" />
                GPS Tracking
              </Badge>
              <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-transparent">
                Track Every Delivery in Real-Time
              </h1>
              <p className="text-xl md:text-2xl text-slate-700 mb-8">
                Give your clients peace of mind with live GPS tracking. Reduce tracking calls by 65% with automatic notifications
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/company-signup">
                  <Button size="lg" className="bg-gradient-to-r from-red-600 to-orange-600 text-white px-8 py-6 text-lg">
                    Start Free Trial
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                <Link href="/contact">
                  <Button size="lg" variant="outline" className="px-8 py-6 text-lg border-2">
                    See It In Action
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
                Complete Delivery Visibility
              </h2>
              <p className="text-lg text-slate-600 mb-6">
                From kitchen to venue, track every step of the delivery journey. Clients see live updates, drivers get optimized routes, and admin monitors everything from one dashboard.
              </p>
              <ul className="space-y-4">
                {[
                  "Live GPS tracking for all active deliveries",
                  "Client-facing tracking portal with ETA",
                  "Automatic notifications at each stage",
                  "Driver route optimization",
                  "Delivery proof of arrival with photos",
                  "Complete delivery history and analytics"
                ].map((feature, i) => (
                  <motion.li 
                    key={i} 
                    className="flex items-start gap-3"
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <CheckCircle className="w-6 h-6 text-red-600 shrink-0 mt-1" />
                    <span className="text-slate-700">{feature}</span>
                  </motion.li>
                ))}
              </ul>
            </motion.div>
            <motion.div 
              className="bg-gradient-to-br from-red-100 to-orange-100 rounded-2xl p-8 flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="text-center">
                <motion.div 
                  className="text-6xl font-bold text-red-600 mb-4"
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ type: "spring", duration: 0.8 }}
                >
                  65%
                </motion.div>
                <p className="text-xl text-slate-700">Fewer Tracking Calls</p>
                <p className="text-sm text-slate-600 mt-2">Clients can see exactly where their delivery is without calling</p>
              </div>
            </motion.div>
          </motion.div>

          <motion.div 
            className="grid md:grid-cols-3 gap-6 mb-16"
            style={{ y: statsY }}
          >
            {[
              {
                icon: Navigation,
                title: "Live Location Sharing",
                description: "Drivers share GPS location automatically. No manual updates needed."
              },
              {
                icon: Bell,
                title: "Smart Notifications",
                description: "Automatic alerts when driver departs, arrives, and completes delivery"
              },
              {
                icon: Clock,
                title: "Accurate ETAs",
                description: "Real-time arrival estimates based on traffic and route conditions"
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
                <Card className="border-2 hover:border-red-300 hover:shadow-xl transition-all">
                  <CardContent className="pt-6">
                    <div className="p-3 bg-gradient-to-br from-red-500 to-orange-500 rounded-xl w-fit mb-4">
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
            className="bg-gradient-to-br from-red-600 to-orange-600 rounded-3xl p-12 text-center text-white mb-16"
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Your Clients Deserve Delivery Peace of Mind
            </h2>
            <p className="text-xl mb-8 max-w-2xl mx-auto opacity-95">
              Stop fielding tracking calls. Give clients the Uber-style experience they expect with real-time GPS tracking.
            </p>
            <Link href="/company-signup">
              <Button size="lg" className="bg-white text-red-600 hover:bg-red-50 px-10 py-6 text-lg">
                Enable GPS Tracking Today
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </motion.div>

          <div className="text-center">
            <p className="text-slate-600 mb-4">
              Read about <Link href="/blog/gps-tracking-catering-delivery" className="text-red-600 underline">GPS tracking benefits for catering businesses</Link>
            </p>
          </div>
        </div>

        <Footer />
      </div>
    </>
  );
}
