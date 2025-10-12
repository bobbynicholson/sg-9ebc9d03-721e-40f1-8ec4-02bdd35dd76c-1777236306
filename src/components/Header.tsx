import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DemoModeToggle } from "@/components/DemoModeToggle";
import {
  Menu,
  X,
  ChevronDown,
  Sparkles,
  Users,
  FileText,
  Package,
  Truck,
  ChefHat,
  ShoppingCart,
  MapPin,
  Mail,
  DollarSign,
  Shield,
  Globe,
  BarChart3,
  Calendar,
  Clock,
  Settings,
  BookOpen,
  Phone,
  ArrowRight,
  Zap,
  Target,
  AlertTriangle
} from "lucide-react";
import { useBranding } from "@/contexts/BrandingContext";

export function Header() {
  const router = useRouter();
  const { branding, isWhiteLabeled } = useBranding();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);

  const displayName = branding?.organizationName || "CateringMS";
  const displayLogo = branding?.logoUrl;

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
    setActiveDropdown(null);
  }, [router.pathname]);

  const platformAdminMenu = [
    { name: "Platform Dashboard", href: "/platform/dashboard", description: "CateringMS business analytics and metrics" },
    { name: "Customer Management", href: "/platform/subscription-management", description: "Manage all customer subscriptions" },
    { name: "Currency Monitoring", href: "/platform/currency-monitoring", description: "Track ZAR/USD rates and pricing" }
  ];

  const featuresMegaMenu = [
    {
      category: "Core Operations",
      icon: Settings,
      items: [
        { name: "Lead Management", href: "/features/lead-management", icon: Users, description: "Capture and convert leads automatically" },
        { name: "Quote Generation", href: "/features#quote-generation", icon: FileText, description: "Create professional quotes in seconds" },
        { name: "Calendar & Booking", href: "/features#calendar", icon: Calendar, description: "Visual scheduling with conflict detection" },
        { name: "Order Processing", href: "/features#orders", icon: Package, description: "Streamlined order management" },
        { name: "Equipment Tracking", href: "/admin/equipment-shortages", icon: AlertTriangle, description: "Monitor and resolve equipment shortages" }
      ]
    },
    {
      category: "Team Portals",
      icon: Users,
      items: [
        { name: "Driver Portal", href: "/features#driver-portal", icon: Truck, description: "GPS tracking and earnings management" },
        { name: "Kitchen Management", href: "/features/kitchen-management", icon: ChefHat, description: "Prep schedules and production tracking" },
        { name: "Shopping Portal", href: "/features#shopping-portal", icon: ShoppingCart, description: "Inventory and purchasing management" },
        { name: "Client Portal", href: "/features#client-portal", icon: Shield, description: "Self-service booking and tracking" }
      ]
    },
    {
      category: "Advanced Features",
      icon: Zap,
      items: [
        { name: "GPS Tracking", href: "/features/gps-tracking", icon: MapPin, description: "Real-time delivery location tracking" },
        { name: "Email Automation", href: "/features/email-automation", icon: Mail, description: "Smart follow-ups and nurture campaigns" },
        { name: "Payment Processing", href: "/features#payments", icon: DollarSign, description: "Secure online payment collection" },
        { name: "Multi-Region Support", href: "/features#multi-region", icon: Globe, description: "Scale across multiple locations" }
      ]
    },
    {
      category: "Analytics & Insights",
      icon: BarChart3,
      items: [
        { name: "Business Analytics", href: "/features#analytics", icon: BarChart3, description: "Real-time performance metrics" },
        { name: "Profit Optimization", href: "/features#profit", icon: Target, description: "Maximize margins and profitability" },
        { name: "Inventory Management", href: "/features/inventory-management", icon: Package, description: "Stock levels and expiry alerts" },
        { name: "Time Management", href: "/features#time", icon: Clock, description: "Optimize scheduling and workflows" }
      ]
    }
  ];

  const resourcesMegaMenu = [
    {
      category: "Learn",
      icon: BookOpen,
      items: [
        { name: "Blog", href: "/blog", icon: BookOpen, description: "Industry insights and best practices" },
        { name: "Success Stories", href: "/blog#success", icon: Users, description: "Real results from catering businesses" },
        { name: "Guides & Tutorials", href: "/blog#guides", icon: FileText, description: "Step-by-step implementation guides" },
        { name: "Video Tutorials", href: "/blog#videos", icon: Sparkles, description: "Visual walkthroughs and demos" }
      ]
    },
    {
      category: "Support",
      icon: Phone,
      items: [
        { name: "Help Center", href: "/contact", icon: Phone, description: "Get answers to common questions" },
        { name: "Contact Support", href: "/contact", icon: Mail, description: "24-hour response guarantee" },
        { name: "Documentation", href: "/blog", icon: FileText, description: "Complete platform documentation" },
        { name: "Community", href: "/blog", icon: Users, description: "Connect with other caterers" }
      ]
    }
  ];

  const isActive = (path: string) => router.pathname === path;
  const isPlatformRoute = router.pathname.startsWith('/platform');

  const handleDropdownToggle = (dropdown: string) => {
    setActiveDropdown(activeDropdown === dropdown ? null : dropdown);
  };

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/95 backdrop-blur-lg shadow-lg border-b border-slate-200"
          : "bg-white border-b border-slate-100"
      }`}
    >
      <nav className="container mx-auto px-4 max-w-7xl">
        <div className="flex items-center justify-between h-16 lg:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            {displayLogo ? (
              <img
                src={displayLogo}
                alt={displayName}
                className="h-8 lg:h-10 object-contain"
              />
            ) : (
              <>
                <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl group-hover:scale-110 transition-transform">
                  <Sparkles className="w-5 h-5 lg:w-6 lg:h-6 text-white" />
                </div>
                <span className="text-xl lg:text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                  {displayName}
                </span>
              </>
            )}
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-1">
            {/* Platform Admin Dropdown (Internal Only) */}
            <div
              className="relative"
              onMouseEnter={() => setActiveDropdown("platform")}
              onMouseLeave={() => setActiveDropdown(null)}
            >
              <button
                className={`flex items-center gap-1 px-4 py-2 rounded-lg transition-colors ${
                  isPlatformRoute || activeDropdown === "platform"
                    ? "bg-orange-50 text-orange-700 border border-orange-200"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                <span className="font-medium">CateringMS Admin</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${activeDropdown === "platform" ? "rotate-180" : ""}`} />
              </button>

              {activeDropdown === "platform" && (
                <div className="absolute left-0 top-full mt-2 w-80">
                  <div className="bg-white rounded-xl shadow-2xl border border-orange-200 p-4">
                    <div className="mb-3 pb-3 border-b border-orange-100">
                      <p className="text-xs font-semibold text-orange-600 uppercase tracking-wider">
                        Internal Platform Management
                      </p>
                    </div>
                    <ul className="space-y-2">
                      {platformAdminMenu.map((item) => (
                        <li key={item.name}>
                          <Link href={item.href}>
                            <div className="p-3 rounded-lg hover:bg-orange-50 transition-colors group cursor-pointer">
                              <p className="font-medium text-slate-900 text-sm group-hover:text-orange-700">
                                {item.name}
                              </p>
                              <p className="text-xs text-slate-600 mt-0.5">{item.description}</p>
                            </div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {/* Features Mega Menu */}
            <div
              className="relative"
              onMouseEnter={() => setActiveDropdown("features")}
              onMouseLeave={() => setActiveDropdown(null)}
            >
              <button
                className={`flex items-center gap-1 px-4 py-2 rounded-lg transition-colors ${
                  isActive("/features") || activeDropdown === "features"
                    ? "bg-purple-50 text-purple-700"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="font-medium">Features</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${activeDropdown === "features" ? "rotate-180" : ""}`} />
              </button>

              {activeDropdown === "features" && (
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-screen max-w-5xl">
                  <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-8">
                    <div className="grid grid-cols-4 gap-8">
                      {featuresMegaMenu.map((section, idx) => (
                        <div key={idx}>
                          <div className="flex items-center gap-2 mb-4">
                            <section.icon className="w-5 h-5 text-purple-600" />
                            <h3 className="font-bold text-slate-900">{section.category}</h3>
                          </div>
                          <ul className="space-y-3">
                            {section.items.map((item, itemIdx) => (
                              <li key={itemIdx}>
                                <Link href={item.href}>
                                  <div className="flex items-start gap-3 p-2 rounded-lg hover:bg-purple-50 transition-colors group cursor-pointer">
                                    <item.icon className="w-5 h-5 text-purple-500 mt-0.5 group-hover:scale-110 transition-transform" />
                                    <div>
                                      <p className="font-medium text-slate-900 text-sm group-hover:text-purple-700">
                                        {item.name}
                                      </p>
                                      <p className="text-xs text-slate-600 mt-0.5">{item.description}</p>
                                    </div>
                                  </div>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                    <div className="mt-6 pt-6 border-t border-slate-200 flex items-center justify-between">
                      <p className="text-sm text-slate-600">
                        Explore all 15+ integrated systems working together
                      </p>
                      <Link href="/features">
                        <Button className="bg-gradient-to-r from-purple-600 to-pink-600">
                          View All Features
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Link href="/pricing">
              <button
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  isActive("/pricing")
                    ? "bg-purple-50 text-purple-700"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                Pricing
              </button>
            </Link>

            {/* Resources Mega Menu */}
            <div
              className="relative"
              onMouseEnter={() => setActiveDropdown("resources")}
              onMouseLeave={() => setActiveDropdown(null)}
            >
              <button
                className={`flex items-center gap-1 px-4 py-2 rounded-lg transition-colors ${
                  isActive("/blog") || activeDropdown === "resources"
                    ? "bg-purple-50 text-purple-700"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="font-medium">Resources</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${activeDropdown === "resources" ? "rotate-180" : ""}`} />
              </button>

              {activeDropdown === "resources" && (
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-screen max-w-3xl">
                  <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-8">
                    <div className="grid grid-cols-2 gap-8">
                      {resourcesMegaMenu.map((section, idx) => (
                        <div key={idx}>
                          <div className="flex items-center gap-2 mb-4">
                            <section.icon className="w-5 h-5 text-purple-600" />
                            <h3 className="font-bold text-slate-900">{section.category}</h3>
                          </div>
                          <ul className="space-y-3">
                            {section.items.map((item, itemIdx) => (
                              <li key={itemIdx}>
                                <Link href={item.href}>
                                  <div className="flex items-start gap-3 p-2 rounded-lg hover:bg-purple-50 transition-colors group cursor-pointer">
                                    <item.icon className="w-5 h-5 text-purple-500 mt-0.5 group-hover:scale-110 transition-transform" />
                                    <div>
                                      <p className="font-medium text-slate-900 text-sm group-hover:text-purple-700">
                                        {item.name}
                                      </p>
                                      <p className="text-xs text-slate-600 mt-0.5">{item.description}</p>
                                    </div>
                                  </div>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Link href="/contact">
              <button
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  isActive("/contact")
                    ? "bg-purple-50 text-purple-700"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                Contact
              </button>
            </Link>
          </div>

          {/* CTA Buttons */}
          <div className="hidden lg:flex items-center gap-3">
            <DemoModeToggle />
            <Link href="/auth/login">
              <Button variant="ghost" className="text-slate-700 hover:bg-slate-100">
                Sign In
              </Button>
            </Link>
            <Link href="/auth/register">
              <Button className="bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 shadow-lg">
                Start Free Trial
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6 text-slate-700" />
            ) : (
              <Menu className="w-6 h-6 text-slate-700" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden absolute left-0 right-0 top-full bg-white border-b border-slate-200 shadow-2xl max-h-[calc(100vh-4rem)] overflow-y-auto">
            <div className="p-4 space-y-2">
              {/* Mobile Platform Admin */}
              <div className="space-y-2 border-b border-orange-200 pb-4 mb-4">
                <div className="flex items-center gap-2 px-3 py-2 bg-orange-50 rounded-lg">
                  <BarChart3 className="w-5 h-5 text-orange-600" />
                  <span className="text-sm font-semibold text-orange-700 uppercase tracking-wider">
                    CateringMS Internal Admin
                  </span>
                </div>
                {platformAdminMenu.map((item) => (
                  <Link key={item.name} href={item.href}>
                    <div className="p-3 rounded-lg hover:bg-orange-50 ml-2">
                      <p className="font-medium text-slate-900 text-sm">{item.name}</p>
                      <p className="text-xs text-slate-600">{item.description}</p>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Mobile Features */}
              <div className="space-y-2">
                <button
                  onClick={() => handleDropdownToggle("mobile-features")}
                  className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-900">Features</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${activeDropdown === "mobile-features" ? "rotate-180" : ""}`} />
                </button>
                {activeDropdown === "mobile-features" && (
                  <div className="pl-4 space-y-2">
                    {featuresMegaMenu.map((section, idx) => (
                      <div key={idx} className="space-y-2">
                        <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider px-3 py-2">
                          {section.category}
                        </p>
                        {section.items.map((item, itemIdx) => (
                          <Link key={itemIdx} href={item.href}>
                            <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-purple-50">
                              <item.icon className="w-5 h-5 text-purple-500" />
                              <div>
                                <p className="font-medium text-slate-900 text-sm">{item.name}</p>
                                <p className="text-xs text-slate-600">{item.description}</p>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Link href="/pricing">
                <div className="p-3 rounded-lg hover:bg-slate-50 font-medium text-slate-900">
                  Pricing
                </div>
              </Link>

              {/* Mobile Resources */}
              <div className="space-y-2">
                <button
                  onClick={() => handleDropdownToggle("mobile-resources")}
                  className="w-full flex items-center justify-between p-3 rounded-lg hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-900">Resources</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${activeDropdown === "mobile-resources" ? "rotate-180" : ""}`} />
                </button>
                {activeDropdown === "mobile-resources" && (
                  <div className="pl-4 space-y-2">
                    {resourcesMegaMenu.map((section, idx) => (
                      <div key={idx} className="space-y-2">
                        <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider px-3 py-2">
                          {section.category}
                        </p>
                        {section.items.map((item, itemIdx) => (
                          <Link key={itemIdx} href={item.href}>
                            <div className="flex items-center gap-3 p-3 rounded-lg hover:bg-purple-50">
                              <item.icon className="w-5 h-5 text-purple-500" />
                              <div>
                                <p className="font-medium text-slate-900 text-sm">{item.name}</p>
                                <p className="text-xs text-slate-600">{item.description}</p>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Link href="/contact">
                <div className="p-3 rounded-lg hover:bg-slate-50 font-medium text-slate-900">
                  Contact
                </div>
              </Link>

              {/* Mobile CTA */}
              <div className="pt-4 border-t border-slate-200 space-y-3">
                <DemoModeToggle />
                <Link href="/auth/login">
                  <Button variant="outline" className="w-full border-2 border-slate-200">
                    Sign In
                  </Button>
                </Link>
                <Link href="/auth/register">
                  <Button className="w-full bg-gradient-to-r from-purple-600 to-pink-600">
                    Start Free Trial
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
                <div className="text-center">
                  <Badge className="bg-green-100 text-green-700 border-green-200">
                    <Clock className="w-3 h-3 mr-1" />
                    14-Day Free Trial
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
