
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  FileText, 
  Calendar,
  DollarSign,
  ChefHat,
  Package,
  Truck,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  ShoppingCart,
  Sparkles,
  Shield,
  Mail,
  Settings,
  Zap,
  Target,
  Heart,
  ArrowRight,
  BarChart3,
  Globe,
  Smartphone,
  Lock,
  RefreshCw,
  PieChart,
  MapPin,
  Bell,
  MousePointer
} from "lucide-react";
import { Footer } from "@/components/Footer";

export default function HomePage() {
  const problems = [
    {
      icon: DollarSign,
      title: "Razor-Thin Profit Margins",
      description: "Food costs are high, margins are small. Every inefficiency eats into your bottom line, making it nearly impossible to scale profitably.",
      color: "from-red-500 to-rose-600"
    },
    {
      icon: Clock,
      title: "Manual Admin Overload",
      description: "Hours wasted on spreadsheets, phone calls, and paperwork. Your admin costs are killing your profits and keeping you trapped in the business.",
      color: "from-orange-500 to-amber-600"
    },
    {
      icon: Users,
      title: "Disconnected Teams",
      description: "Kitchen doesn't know what drivers are doing. Clients can't track orders. Everyone calls you for updates. It's chaos.",
      color: "from-purple-500 to-indigo-600"
    },
    {
      icon: Package,
      title: "Equipment & Stock Nightmares",
      description: "Missing cutlery, dirty plates, unknown stock levels. You're constantly scrambling and over-ordering just to be safe.",
      color: "from-blue-500 to-cyan-600"
    },
    {
      icon: AlertCircle,
      title: "Owner-Dependent Operations",
      description: "Can't take a day off. Can't hire someone to run it. The business only works when you're there, limiting growth and burning you out.",
      color: "from-pink-500 to-rose-600"
    },
    {
      icon: FileText,
      title: "Lost Leads & Follow-ups",
      description: "Quotes get forgotten, follow-ups missed, repeat customers lost. No system means money slipping through the cracks every day.",
      color: "from-green-500 to-emerald-600"
    }
  ];

  const solutions = [
    {
      icon: Zap,
      title: "Complete Automation",
      description: "From lead capture to post-event follow-ups, automate every touchpoint. Free your time to focus on growth, not admin.",
      benefit: "Save 20+ hours per week"
    },
    {
      icon: MapPin,
      title: "Real-Time GPS Tracking",
      description: "Clients see exactly where their food is. Drivers navigate efficiently. You monitor everything from one dashboard.",
      benefit: "Reduce customer calls by 80%"
    },
    {
      icon: BarChart3,
      title: "Smart Inventory Management",
      description: "Track every plate, fork, and ingredient. Know what's clean, what's available, and what needs ordering before you run out.",
      benefit: "Cut equipment losses by 60%"
    },
    {
      icon: PieChart,
      title: "Profitability Insights",
      description: "See which suppliers are cheaper, which events are profitable, and where costs are creeping up. Make data-driven decisions.",
      benefit: "Increase margins by 15-25%"
    },
    {
      icon: Bell,
      title: "Connected Ecosystem",
      description: "Kitchen, drivers, cleaning, shopping, and clients all on one platform. Everyone knows exactly what to do, when.",
      benefit: "Eliminate 90% of coordination calls"
    },
    {
      icon: RefreshCw,
      title: "Intelligent Follow-Up",
      description: "Automated emails that nurture relationships, request reviews, and bring customers back year after year.",
      benefit: "3x repeat booking rate"
    }
  ];

  const features = [
    {
      title: "Lead Management",
      description: "Capture leads automatically, never miss a quote request",
      icon: Users
    },
    {
      title: "Smart Quoting",
      description: "Generate professional quotes in minutes with auto-pricing",
      icon: FileText
    },
    {
      title: "Dynamic Calendar",
      description: "Visual booking calendar with availability management",
      icon: Calendar
    },
    {
      title: "Payment Processing",
      description: "Automatic payment tracking and reconciliation",
      icon: DollarSign
    },
    {
      title: "Kitchen Orders",
      description: "Auto-generated prep lists and shopping requirements",
      icon: ChefHat
    },
    {
      title: "Stock Control",
      description: "Real-time inventory with automatic deductions",
      icon: Package
    },
    {
      title: "Equipment Tracking",
      description: "Track cutlery, plates, and cleaning schedules",
      icon: Sparkles
    },
    {
      title: "Driver Portal",
      description: "Job booking, GPS tracking, and automatic earnings",
      icon: Truck
    },
    {
      title: "Client Portal",
      description: "Order tracking, live delivery updates, and feedback",
      icon: Shield
    },
    {
      title: "Email Automation",
      description: "Smart follow-ups, reminders, and relationship nurturing",
      icon: Mail
    },
    {
      title: "Shopping Lists",
      description: "Auto-generated with supplier price comparisons",
      icon: ShoppingCart
    },
    {
      title: "Analytics Dashboard",
      description: "Profitability insights and business intelligence",
      icon: TrendingUp
    }
  ];

  const stats = [
    { value: "20+", label: "Hours Saved Weekly", icon: Clock },
    { value: "80%", label: "Fewer Admin Calls", icon: Bell },
    { value: "15-25%", label: "Margin Increase", icon: TrendingUp },
    { value: "3x", label: "Repeat Bookings", icon: RefreshCw }
  ];

  return (
    <div className="min-h-screen bg-white">
      <div className="relative overflow-hidden bg-gradient-to-br from-purple-50 via-white to-pink-50">
        <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] bg-[size:40px_40px]" />
        
        <div className="relative container mx-auto px-4 py-20 max-w-7xl">
          <div className="text-center max-w-4xl mx-auto mb-16">
            <Badge className="mb-6 px-4 py-2 bg-purple-100 text-purple-700 border-purple-200 text-sm">
              Built by caterers, for caterers
            </Badge>
            <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 bg-clip-text text-transparent leading-tight">
              The Operating System for Modern Catering Businesses
            </h1>
            <p className="text-xl text-slate-600 mb-8 leading-relaxed">
              Stop losing money to manual processes, disconnected teams, and inefficient operations. 
              Finally, a complete platform that connects everyone and automates everything.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link href="/auth/register">
                <Button size="lg" className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-8 py-6 text-lg hover:shadow-xl transition-all">
                  Start Free Trial
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link href="/blog">
                <Button size="lg" variant="outline" className="px-8 py-6 text-lg border-2 border-purple-200 hover:border-purple-400">
                  Learn More
                </Button>
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto mb-16">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="flex justify-center mb-3">
                  <div className="p-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl shadow-lg">
                    <stat.icon className="w-6 h-6 text-white" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-slate-900 mb-1">{stat.value}</div>
                <div className="text-sm text-slate-600">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-20 max-w-7xl">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">
            The Problems Every Catering Business Faces
          </h2>
          <p className="text-xl text-slate-600">
            We know these pains intimately because we lived them every single day
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-20">
          {problems.map((problem, index) => (
            <Card key={index} className="border-0 shadow-lg hover:shadow-2xl transition-all duration-300 group">
              <CardContent className="pt-8 pb-8">
                <div className={`inline-flex p-4 bg-gradient-to-br ${problem.color} rounded-2xl shadow-lg mb-6 group-hover:scale-110 transition-transform`}>
                  <problem.icon className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{problem.title}</h3>
                <p className="text-slate-600 leading-relaxed">{problem.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="relative py-20 px-8 bg-gradient-to-br from-slate-900 to-purple-900 rounded-3xl shadow-2xl mb-20 overflow-hidden">
          <div className="absolute inset-0 bg-grid-white/5 [mask-image:linear-gradient(0deg,rgba(255,255,255,0.1),rgba(255,255,255,0.05))] bg-[size:40px_40px]" />
          
          <div className="relative max-w-4xl mx-auto text-center">
            <Badge className="mb-6 px-4 py-2 bg-purple-500/20 text-purple-300 border-purple-400/30 text-sm">
              Our Story
            </Badge>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-8">
              Born from Real Pain, Built for Real Results
            </h2>
            <div className="space-y-6 text-lg text-slate-300 leading-relaxed text-left">
              <p>
                I ran Spit Braai Delivery in South Africa. We were busy, really busy. Functions every weekend, 
                quotes flying in, drivers on the road, kitchen teams prepping around the clock.
              </p>
              <p>
                But here's the brutal truth: <span className="text-white font-semibold">we were barely profitable</span>. 
                The cost of food kept climbing. Admin consumed every spare hour. Equipment went missing. 
                Drivers needed constant coordination. Clients called asking "Where's my food?"
              </p>
              <p>
                I was trapped. The business only worked when I was there managing every detail. 
                <span className="text-white font-semibold"> I couldn't hire someone to run it because there was no system</span>. 
                Just spreadsheets, phone calls, and constant firefighting.
              </p>
              <p>
                One day, after losing money on what should have been a profitable event because of 
                coordination failures and missing equipment, I realized something: <span className="text-white font-semibold">
                The technology doesn't exist for our industry</span>.
              </p>
              <p>
                Every other industry has modern software. Restaurants have Toast and Square. 
                Delivery has Uber and DoorDash. But catering? We're stuck with Excel and hope.
              </p>
              <p className="text-xl font-semibold text-white pt-4">
                So I built the tool I desperately needed. The complete operating system that connects 
                everyone, automates everything, and finally makes catering businesses actually profitable and scalable.
              </p>
            </div>
            <div className="mt-10 flex justify-center">
              <Link href="/auth/register">
                <Button size="lg" className="bg-white text-purple-900 hover:bg-purple-50 px-8 py-6 text-lg">
                  Join the Movement
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">
            How We Solve Every Problem
          </h2>
          <p className="text-xl text-slate-600">
            A complete platform that transforms chaos into profit
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-20">
          {solutions.map((solution, index) => (
            <Card key={index} className="border-2 border-purple-100 shadow-lg hover:shadow-2xl hover:border-purple-300 transition-all duration-300 group">
              <CardContent className="pt-8 pb-8">
                <div className="inline-flex p-4 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl shadow-lg mb-6 group-hover:scale-110 transition-transform">
                  <solution.icon className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{solution.title}</h3>
                <p className="text-slate-600 mb-4 leading-relaxed">{solution.description}</p>
                <Badge className="bg-green-100 text-green-700 border-green-200 px-3 py-1">
                  <CheckCircle className="w-4 h-4 mr-1" />
                  {solution.benefit}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-3xl p-12 mb-20">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6">
              Everything You Need in One Platform
            </h2>
            <p className="text-xl text-slate-600">
              No more juggling 10 different tools. One system that does it all.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <div key={index} className="bg-white rounded-2xl p-6 shadow-md hover:shadow-xl transition-all group">
                <div className="inline-flex p-3 bg-gradient-to-br from-purple-100 to-pink-100 rounded-xl mb-4 group-hover:scale-110 transition-transform">
                  <feature.icon className="w-6 h-6 text-purple-600" />
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">{feature.title}</h3>
                <p className="text-sm text-slate-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-20">
          <Card className="border-0 shadow-xl bg-gradient-to-br from-blue-500 to-cyan-500 text-white">
            <CardContent className="pt-8 pb-8 text-center">
              <Smartphone className="w-12 h-12 mx-auto mb-4" />
              <h3 className="text-2xl font-bold mb-3">Mobile-First Design</h3>
              <p className="text-blue-100">
                Drivers, kitchen staff, and clients access everything from their phones. 
                Beautiful, intuitive interfaces that anyone can use.
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-xl bg-gradient-to-br from-green-500 to-emerald-500 text-white">
            <CardContent className="pt-8 pb-8 text-center">
              <Lock className="w-12 h-12 mx-auto mb-4" />
              <h3 className="text-2xl font-bold mb-3">Secure & Reliable</h3>
              <p className="text-green-100">
                Bank-level security. Daily backups. 99.9% uptime. Your business data 
                is protected and always accessible.
              </p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-xl bg-gradient-to-br from-purple-500 to-pink-500 text-white">
            <CardContent className="pt-8 pb-8 text-center">
              <Globe className="w-12 h-12 mx-auto mb-4" />
              <h3 className="text-2xl font-bold mb-3">Built for South Africa</h3>
              <p className="text-purple-100">
                Rand pricing, local payment methods, South African business practices. 
                Finally, software that understands our market.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-0 shadow-2xl bg-gradient-to-r from-purple-600 to-pink-600 text-white overflow-hidden">
          <CardContent className="py-16 px-8">
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-4xl md:text-5xl font-bold mb-6">
                Stop Losing Money. Start Growing.
              </h2>
              <p className="text-xl text-purple-100 mb-8 leading-relaxed">
                Join forward-thinking catering businesses across South Africa who are finally running 
                profitable, scalable operations without being trapped in the business.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/auth/register">
                  <Button size="lg" className="bg-white text-purple-600 hover:bg-purple-50 px-8 py-6 text-lg shadow-xl">
                    Start Your Free Trial
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                <Link href="/blog">
                  <Button size="lg" variant="outline" className="border-2 border-white text-white hover:bg-white/10 px-8 py-6 text-lg">
                    Read Success Stories
                  </Button>
                </Link>
              </div>
              <p className="text-purple-200 mt-6 text-sm">
                No credit card required. Cancel anytime. Support included.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Footer />
    </div>
  );
}
